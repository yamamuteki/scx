import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const cliPath = join(__dirname, "..", "bin", "scx.js");

function buildEnv(env) {
  const baseEnv = { ...process.env };
  delete baseEnv.SCX_RATE;
  delete baseEnv.SCX_CURRENCY;
  delete baseEnv.SCX_LOCALE;
  delete baseEnv.SCX_CONFIG;
  baseEnv.XDG_CONFIG_HOME = "/__scx_test_default_xdg_should_not_exist__";
  return env ? { ...baseEnv, ...env } : baseEnv;
}

export function runScx(args = [], stdin = "", { env } = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    input: stdin,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: buildEnv(env),
  });
}

export function runScxAsync(args = [], stdin = "", { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: buildEnv(env),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout, stderr });
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}
