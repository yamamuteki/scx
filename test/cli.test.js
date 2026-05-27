import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
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

  test("--help includes an Examples section", () => {
    const { stdout, status } = runScx(["--help"]);
    assert.equal(status, 0);
    assert.match(stdout, /Examples:/);
    assert.match(stdout, /ccusage \| scx/);
  });

  test("-h is an alias for --help", () => {
    const { stdout, status } = runScx(["-h"]);
    assert.equal(status, 0);
    assert.match(stdout, /Usage: scx/);
  });
});

describe("argument validation", () => {
  test("exits 1 when rate is not provided anywhere", () => {
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { SCX_RATE: "" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /rate is required/);
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
    assert.match(stdout, /¥155/);
  });
});

describe("TTY stdin guard", () => {
  test("exits 1 with guidance when stdin is a TTY", () => {
    const { status, stderr, stdout } = runScx(["-r", "155"], "", {
      env: { SCX_FORCE_TTY: "1" },
    });
    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /stdin is a terminal/i);
    assert.match(stderr, /scx config update/);
    assert.match(stderr, /-c EUR/);
    assert.match(stderr, /ccusage \| scx/);
    assert.match(stderr, /scx --help/);
  });

  test("does not trigger when stdin is piped (empty input is fine)", () => {
    const { status, stderr } = runScx(["-r", "155"], "");
    assert.equal(status, 0);
    assert.equal(stderr, "");
  });

  test("does not trigger when stdin is piped (with content)", () => {
    const { status, stdout } = runScx(["-r", "155"], "Total: $1.00");
    assert.equal(status, 0);
    assert.match(stdout, /¥155/);
  });
});

describe("unknown command handling", () => {
  test("an unknown root token shows a helpful error, not 'too many arguments'", () => {
    const { status, stderr } = runScx(["conf"]);
    assert.equal(status, 1);
    assert.doesNotMatch(stderr, /too many arguments/i);
    assert.match(stderr, /unknown command 'conf'/);
    assert.match(stderr, /Did you mean 'config'/);
    assert.match(stderr, /Available commands:/);
    assert.match(stderr, /config/);
  });

  test("a root token with no close match still lists available commands", () => {
    const { status, stderr } = runScx(["bogus"]);
    assert.equal(status, 1);
    assert.doesNotMatch(stderr, /too many arguments/i);
    assert.match(stderr, /unknown command 'bogus'/);
    assert.match(stderr, /Available commands:/);
    assert.match(stderr, /config/);
  });
});
