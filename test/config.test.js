import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

function makeConfigFile(content) {
  const dir = mkdtempSync(join(tmpdir(), "scx-test-cfg-"));
  const path = join(dir, "config.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

describe("XDG config file loading", () => {
  test("reads rate from XDG config", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "2026-05-26T00:00:00Z" },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /¥155/);
  });

  test("reads currency from XDG config", () => {
    const xdg = makeXdgConfigHome({
      currency: "EUR",
      rate: { value: 0.92, currency: "EUR", updatedAt: "2026-05-26T00:00:00Z" },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /€0\.92/);
  });

  test("reads locale from XDG config", () => {
    const xdg = makeXdgConfigHome({
      currency: "EUR",
      locale: "de-DE",
      rate: { value: 0.92, currency: "EUR", updatedAt: "2026-05-26T00:00:00Z" },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /0,92/);
  });

  test("works without a config file (silent passthrough)", () => {
    const xdg = makeXdgConfigHome(undefined);
    const { status, stdout } = runScx(["-r", "155"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /\$155\.00/);
  });
});

describe("precedence: CLI > env > config", () => {
  test("CLI -r overrides config rate", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    const { status, stdout } = runScx(["-r", "200"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /¥200/);
  });

  test("SCX_RATE overrides config rate", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg, SCX_RATE: "200" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /¥200/);
  });

  test("CLI -c overrides config currency", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    const { status, stdout } = runScx(["-c", "EUR", "-r", "0.92"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /€0\.92/);
  });

  test("SCX_LOCALE overrides config locale", () => {
    const xdg = makeXdgConfigHome({
      currency: "EUR",
      locale: "en-US",
      rate: { value: 0.92, currency: "EUR", updatedAt: "..." },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg, SCX_LOCALE: "de-DE" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /0,92/);
  });
});

describe("$SCX_CONFIG explicit path", () => {
  test("reads from $SCX_CONFIG file path", () => {
    const path = makeConfigFile({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { SCX_CONFIG: path },
    });
    assert.equal(status, 0);
    assert.match(stdout, /¥155/);
  });

  test("$SCX_CONFIG nonexistent path exits 1", () => {
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { SCX_CONFIG: "/nonexistent/scx-test/config.json" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /config/i);
    assert.match(stderr, /nonexistent/);
  });

  test("$SCX_CONFIG with invalid JSON exits 1 with file path", () => {
    const path = makeConfigFile("{ not valid json }");
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { SCX_CONFIG: path },
    });
    assert.equal(status, 1);
    assert.match(stderr, /invalid JSON/i);
    assert.ok(stderr.includes(path), `expected ${path} in stderr: ${stderr}`);
  });

  test("$SCX_CONFIG takes precedence over XDG_CONFIG_HOME", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 100, currency: "JPY", updatedAt: "..." },
    });
    const path = makeConfigFile({
      currency: "JPY",
      rate: { value: 200, currency: "JPY", updatedAt: "..." },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { SCX_CONFIG: path, XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /¥200/);
  });
});

describe("rate.currency consistency", () => {
  test("explicit -c requires -r even when config has a rate for another currency", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    const { status, stderr } = runScx(["-c", "EUR"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 1);
    assert.match(stderr, /requires -r/);
  });

  test("rate-missing message hints at the currency mismatch", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg, SCX_CURRENCY: "EUR" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /JPY/);
    assert.match(stderr, /EUR/);
  });

  test("config rate is used when SCX_CURRENCY matches rate.currency", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 0.92, currency: "EUR", updatedAt: "..." },
    });
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg, SCX_CURRENCY: "EUR" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /€0\.92/);
  });

  test("currency mismatch + CLI -r works", () => {
    const xdg = makeXdgConfigHome({
      currency: "JPY",
      rate: { value: 155, currency: "JPY", updatedAt: "..." },
    });
    const { status, stdout } = runScx(["-c", "EUR", "-r", "0.92"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /€0\.92/);
  });

  test("config without rate is fine when CLI provides one", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY", locale: "en-US" });
    const { status, stdout } = runScx(["-r", "155"], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 0);
    assert.match(stdout, /¥155/);
  });

  test("malformed config.rate (not an object) is ignored", () => {
    const xdg = makeXdgConfigHome({ currency: "JPY", rate: 155 });
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg },
    });
    assert.equal(status, 1);
    assert.match(stderr, /rate is required/);
  });
});

describe("rate-missing message", () => {
  test("mentions the config option", () => {
    const xdg = makeXdgConfigHome(undefined);
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { XDG_CONFIG_HOME: xdg, SCX_CURRENCY: "JPY" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /rate is required/);
    assert.match(stderr, /config/i);
  });
});
