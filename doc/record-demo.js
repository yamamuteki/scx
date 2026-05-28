// Captures doc/demo.html via Playwright + CDP Page.startScreencast (PNG
// frames) into doc/frames/. Assemble with ffmpeg afterward.
//
// PNG screencast keeps frame-to-frame pixels stable (no VP8 noise) which is
// what makes diff_mode=rectangle compress the final GIF aggressively. The
// demo.html script triggers explicit cursor toggles during the final hold so
// the screencast keeps sending frames during otherwise-static intervals.
//
// Usage:
//   mkdir -p /tmp/scx-record && cd /tmp/scx-record && \
//     npm init -y >/dev/null && \
//     npm install playwright >/dev/null && \
//     cp /path/to/doc/record-demo.js /tmp/scx-record/record.mjs && \
//     node /tmp/scx-record/record.mjs /path/to/doc/demo.html
//
// Render:
//   ffmpeg -y -framerate 34 -i doc/frames/f%05d.png \
//     -vf "fps=12,split[s0][s1];\
//          [s0]palettegen=stats_mode=full:max_colors=128:reserve_transparent=0[p];\
//          [s1][p]paletteuse=dither=none:diff_mode=rectangle:new=0" \
//     -loop 0 doc/demo.gif

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

const demoArg = process.argv[2];
if (!demoArg) {
  console.error("Usage: node record-demo.js <absolute path to demo.html>");
  process.exit(1);
}
const demoPath = path.resolve(demoArg);
const outDir = path.dirname(demoPath);
const framesDir = path.join(outDir, "frames");

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
let writes = [];
client.on("Page.screencastFrame", async ({ data, sessionId }) => {
  const idx = counter++;
  const filename = path.join(framesDir, `f${String(idx).padStart(5, "0")}.png`);
  writes.push(fs.writeFile(filename, Buffer.from(data, "base64")));
  await client.send("Page.screencastFrameAck", { sessionId });
});

await page.goto("file://" + demoPath);
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

console.log(`Captured ${counter} frames -> ${framesDir}`);
