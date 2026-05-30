import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runScx } from "./helpers.js";

function makeXdgConfigHome(config) {
  const dir = mkdtempSync(join(tmpdir(), "scx-test-xdg-"));
  if (config !== undefined) {
    const scxDir = join(dir, "scx");
    mkdirSync(scxDir);
    writeFileSync(join(scxDir, "config.json"), JSON.stringify(config));
  }
  return dir;
}

function makeEmptyXdg() {
  return mkdtempSync(join(tmpdir(), "scx-test-empty-xdg-"));
}

function readXdgConfig(xdgHome) {
  const path = join(xdgHome, "scx", "config.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("scx config path", () => {
  test("prints the existing XDG config path", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status, stdout } = runScx(["config", "path"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /scx[/\\]config\.json/);
    assert.ok(stdout.includes(xdg), `expected ${xdg} in stdout: ${stdout}`);
  });

  test("prints the default-target XDG path when no config exists", () => {
    const xdg = makeEmptyXdg();
    const { status, stdout } = runScx(["config", "path"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.ok(stdout.includes(xdg), `expected ${xdg} in stdout: ${stdout}`);
  });

  test("prints the SCX_CONFIG path when set", () => {
    const { status, stdout } = runScx(["config", "path"], "", {
      env: { SCX_CONFIG: "/custom/path.json" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /\/custom\/path\.json/);
  });

  test("does not read stdin", () => {
    const xdg = makeEmptyXdg();
    const { status } = runScx(["config", "path"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
  });
});

describe("scx config show", () => {
  test("shows config values with their sources", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      locale: "en-US",
      rate: { value: 155, currency: "JPY", updatedAt: "2026-05-26T00:00:00Z" },
    });
    const { status, stdout } = runScx(["config", "show"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /currency.*JPY.*config/);
    assert.match(stdout, /locale.*en-US.*config/);
    assert.match(stdout, /rate.*155.*config/);
  });

  test("shows defaults when no config", () => {
    const xdg = makeEmptyXdg();
    const { status, stdout } = runScx(["config", "show"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /currency.*USD.*default/);
    assert.match(stdout, /locale.*en-US.*default/);
    assert.match(stdout, /rate.*1.*default/i);
  });

  test("reflects env overrides", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status, stdout } = runScx(["config", "show"], "", {
      env: { XDG_CONFIG_HOME: xdg, SCX_CURRENCY: "EUR" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /currency.*EUR.*env/);
  });

  test("does not read stdin", () => {
    const xdg = makeEmptyXdg();
    const { status } = runScx(["config", "show"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
  });
});

describe("scx config set", () => {
  test("set currency writes to config", () => {
    const xdg = makeEmptyXdg();
    const { status } = runScx(["config", "set", "currency", "EUR"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.currency, "EUR");
  });

  test("set locale writes to config", () => {
    const xdg = makeEmptyXdg();
    const { status } = runScx(["config", "set", "locale", "de-DE"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.locale, "de-DE");
  });

  test("set currency normalizes to uppercase", () => {
    const xdg = makeEmptyXdg();
    runScx(["config", "set", "currency", "jpy"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.currency, "JPY");
  });

  test("set currency rejects invalid code", () => {
    const xdg = makeEmptyXdg();
    const { status, stderr } = runScx(["config", "set", "currency", "XYZ"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 1);
    assert.match(stderr, /invalid currency/i);
  });

  test("set rate stores object with currency from config and a timestamp", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status } = runScx(["config", "set", "rate", "155"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.rate.value, 155);
    assert.equal(cfg.rate.currency, "JPY");
    assert.match(cfg.rate.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test("set rate auto-sets currency to default when none is configured", () => {
    const xdg = makeEmptyXdg();
    const { status } = runScx(["config", "set", "rate", "155"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.currency, "USD");
    assert.equal(cfg.rate.value, 155);
    assert.equal(cfg.rate.currency, "USD");
  });

  test("set rate rejects non-positive value", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status, stderr } = runScx(["config", "set", "rate", "-5"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 1);
    assert.match(stderr, /invalid rate/i);
  });

  test("set rate rejects non-numeric value", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status, stderr } = runScx(["config", "set", "rate", "abc"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 1);
    assert.match(stderr, /invalid rate/i);
  });

  test("set unknown key errors", () => {
    const xdg = makeEmptyXdg();
    const { status, stderr } = runScx(["config", "set", "foo", "bar"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 1);
    assert.match(stderr, /unknown.*key/i);
  });

  test("preserves other keys when setting one", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      locale: "en-US",
      rate: { value: 155, currency: "JPY", updatedAt: "2026-05-26T00:00:00Z" },
    });
    runScx(["config", "set", "locale", "de-DE"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.currency, "JPY");
    assert.equal(cfg.locale, "de-DE");
    assert.equal(cfg.rate.value, 155);
  });

  test("does not read stdin", () => {
    const xdg = makeEmptyXdg();
    const { status } = runScx(["config", "set", "currency", "JPY"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
  });
});

describe("scx config unset", () => {
  test("removes a key", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY", locale: "de-DE" });
    runScx(["config", "unset", "locale"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.locale, undefined);
    assert.equal(cfg.currency, "JPY");
  });

  test("removes rate", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    runScx(["config", "unset", "rate"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    const cfg = readXdgConfig(xdg);
    assert.equal(cfg.rate, undefined);
  });

  test("succeeds silently when key doesn't exist", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status } = runScx(["config", "unset", "locale"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
  });

  test("unset unknown key errors", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status, stderr } = runScx(["config", "unset", "foo"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 1);
    assert.match(stderr, /unknown.*key/i);
  });

  test("does not read stdin", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status } = runScx(["config", "unset", "locale"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
  });
});

describe("scx config delete", () => {
  test("removes the existing XDG config file", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY", locale: "en-US" });
    const path = join(xdg, "scx", "config.json");
    assert.ok(existsSync(path));
    const { status } = runScx(["config", "delete"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.equal(existsSync(path), false);
  });

  test("is idempotent: no error when config does not exist", () => {
    const xdg = makeEmptyXdg();
    const { status, stderr } = runScx(["config", "delete"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.doesNotMatch(stderr, /error/i);
  });

  test("prints 'deleted <path>' to stderr when a file was deleted", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const path = join(xdg, "scx", "config.json");
    const { status, stderr } = runScx(["config", "delete"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stderr, /deleted/);
    assert.ok(stderr.includes(path), `expected ${path} in stderr: ${stderr}`);
  });

  test("stays silent when nothing was deleted", () => {
    const xdg = makeEmptyXdg();
    const { stderr } = runScx(["config", "delete"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.doesNotMatch(stderr, /deleted/);
  });

  test("respects $SCX_CONFIG", () => {
    const dir = mkdtempSync(join(tmpdir(), "scx-test-cfg-"));
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ currency: "JPY" }));
    const { status } = runScx(["config", "delete"], "", {
      env: { SCX_CONFIG: path },
    });
    assert.equal(status, 0);
    assert.equal(existsSync(path), false);
  });

  test("after delete, show falls back to defaults", () => {
    const xdg = makeXdgConfigHome({ currency: "EUR", locale: "de-DE" });
    runScx(["config", "delete"], "", { env: { XDG_CONFIG_HOME: xdg } });
    const { stdout } = runScx(["config", "show"], "", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.match(stdout, /currency.*USD.*default/);
    assert.match(stdout, /locale.*en-US.*default/);
  });

  test("does not read stdin", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY" });
    const { status } = runScx(["config", "delete"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
  });
});

describe("default conversion still works (no subcommand)", () => {
  test("scx -r 155 still converts stdin", () => {
    const xdg = makeEmptyXdg();
    const { status, stdout } = runScx(["-r", "155"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /\$155\.00/);
  });
});

describe("config unknown subcommand handling", () => {
  test("an unknown config subcommand shows a helpful error, not 'too many arguments'", () => {
    const { status, stderr } = runScx(["config", "up"]);
    assert.equal(status, 1);
    assert.doesNotMatch(stderr, /too many arguments/i);
    assert.match(stderr, /unknown command 'up'/);
    assert.match(stderr, /Did you mean 'update'/);
    assert.match(stderr, /Available commands:/);
    assert.match(stderr, /show/);
    assert.match(stderr, /delete/);
  });

  test("bare 'config' still shows help", () => {
    const { status, stdout } = runScx(["config"]);
    assert.equal(status, 1);
    assert.match(stdout, /Usage: scx config/);
    assert.match(stdout, /Commands:/);
  });
});
