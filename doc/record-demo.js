// Captures doc/demo.html via Playwright + CDP Page.startScreencast, then
// renders doc/demo.gif with ffmpeg — all in one shot. Drives the PNG
// pipeline that keeps text crisp (the built-in recordVideo encodes via VP8
// at a low bitrate which blurs the demo).
//
// Run from the repo via the shell wrapper that ensures playwright is
// available:
//
//   bash doc/record-demo.sh
//
// Or, if playwright is already installed alongside this file, call directly:
//
//   node doc/record-demo.js [path/to/demo.html]
//
// Requirements: ffmpeg in PATH, Google Chrome installed (used via
// channel: "chrome" so Chromium download is unnecessary).

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoArg = process.argv[2];
const demoPath = demoArg ? path.resolve(demoArg) : path.join(__dirname, "demo.html");
const outDir = path.dirname(demoPath);
const framesDir = path.join(outDir, "frames");
const gifPath = path.join(outDir, "demo.gif");

await fs.rm(framesDir, { recursive: true, force: true });
await fs.mkdir(framesDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--force-device-scale-factor=2"],
});
const context = await browser.newContext({
  viewport: { width: 800, height: 450 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.setDefaultTimeout(120_000);
const client = await context.newCDPSession(page);

let counter = 0;
const writes = [];
client.on("Page.screencastFrame", async ({ data, sessionId }) => {
  const idx = counter++;
  const filename = path.join(framesDir, `f${String(idx).padStart(5, "0")}.png`);
  writes.push(fs.writeFile(filename, Buffer.from(data, "base64")));
  await client.send("Page.screencastFrameAck", { sessionId });
});

console.log("Capturing frames…");
await page.goto(`file://${demoPath}`);
await page.waitForFunction(() => window.__demoStarted, { timeout: 10_000 });
await client.send("Page.startScreencast", {
  format: "png",
  everyNthFrame: 1,
});
await page.waitForFunction(() => window.__cycleCount >= 1, {
  timeout: 60_000,
});
await client.send("Page.stopScreencast");
await Promise.all(writes);
await context.close();
await browser.close();
console.log(`Captured ${counter} frames → ${framesDir}`);

console.log("Rendering GIF…");
await new Promise((resolve, reject) => {
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "34",
      "-i",
      path.join(framesDir, "f%05d.png"),
      "-vf",
      "fps=12,split[s0][s1];[s0]palettegen=stats_mode=full:max_colors=128:reserve_transparent=0[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle:new=0",
      "-loop",
      "0",
      gifPath,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  ff.on("error", reject);
});

console.log("Cleaning up…");
await fs.rm(framesDir, { recursive: true, force: true });

const { size } = await fs.stat(gifPath);
console.log(`Generated: ${gifPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
