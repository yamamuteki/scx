import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runScx } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

describe("--version / --help", () => {
  test("--version prints package.json version", () => {
    const { stdout, status } = runScx(["--version"]);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), pkg.version);
  });

  test("-V is an alias for --version", () => {
    const { stdout, status } = runScx(["-V"]);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), pkg.version);
  });

  test("--help mentions all options", () => {
    const { stdout, status } = runScx(["--help"]);
    assert.equal(status, 0);
    assert.match(stdout, /-c, --currency/);
    assert.match(stdout, /-r, --rate/);
    assert.match(stdout, /-l, --locale/);
  });

  test("-h is an alias for --help", () => {
    const { stdout, status } = runScx(["-h"]);
    assert.equal(status, 0);
    assert.match(stdout, /Usage: scx/);
  });
});

describe("argument validation", () => {
  test("exits 1 when --rate is missing", () => {
    const { status, stderr } = runScx([], "Total: $1.00");
    assert.equal(status, 1);
    assert.match(stderr, /--rate/);
  });

  test("exits 1 when --rate is not numeric", () => {
    const { status, stderr } = runScx(["-r", "abc"], "Total: $1.00");
    assert.equal(status, 1);
    assert.match(stderr, /invalid rate/);
  });

  test("exits 1 when --rate is negative", () => {
    const { status, stderr } = runScx(["-r", "-5"], "Total: $1.00");
    assert.equal(status, 1);
    assert.match(stderr, /invalid rate/);
  });

  test("exits 1 when --rate is zero", () => {
    const { status, stderr } = runScx(["-r", "0"], "Total: $1.00");
    assert.equal(status, 1);
    assert.match(stderr, /invalid rate/);
  });

  test("exits 1 when --currency is not a known ISO 4217 code", () => {
    const { status, stderr } = runScx(["-r", "155", "-c", "XYZ"], "Total: $1.00");
    assert.equal(status, 1);
    assert.match(stderr, /invalid currency/i);
  });

  test("accepts lowercase --currency by normalizing to uppercase", () => {
    const { status, stdout } = runScx(["-r", "155", "-c", "jpy"], "Total: $1.00");
    assert.equal(status, 0);
    assert.match(stdout, /￥155/);
  });
});
