import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const cliPath = join(__dirname, "..", "bin", "scx.js");

export function runScx(args = [], stdin = "") {
  return spawnSync(process.execPath, [cliPath, ...args], {
    input: stdin,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
