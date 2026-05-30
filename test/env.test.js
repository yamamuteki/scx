import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runScx } from "./helpers.js";

describe("environment variables", () => {
  test("SCX_RATE provides rate when -r is not given", () => {
    const { status, stdout } = runScx([], "Total: $1.00", {
      env: { SCX_RATE: "155" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /\$155\.00/);
  });

  test("SCX_CURRENCY provides target currency when -c is not given", () => {
    const { status, stdout } = runScx(["-r", "0.92"], "Total: $1.00", {
      env: { SCX_CURRENCY: "EUR" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /€0\.92/);
  });

  test("SCX_LOCALE provides formatting locale when -l is not given", () => {
    const { status, stdout } = runScx(["-r", "0.92", "-c", "EUR"], "Total: $1.00", {
      env: { SCX_LOCALE: "de-DE" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /0,92/);
  });

  test("CLI -r overrides SCX_RATE", () => {
    const { status, stdout } = runScx(["-r", "100"], "Total: $1.00", {
      env: { SCX_RATE: "999" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /\$100\.00/);
  });

  test("CLI -c overrides SCX_CURRENCY", () => {
    const { status, stdout } = runScx(["-r", "155", "-c", "JPY"], "Total: $1.00", {
      env: { SCX_CURRENCY: "EUR" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /¥155/);
  });

  test("CLI -l overrides SCX_LOCALE", () => {
    const { status, stdout } = runScx(["-r", "0.92", "-c", "EUR", "-l", "en-US"], "Total: $1.00", {
      env: { SCX_LOCALE: "de-DE" },
    });
    assert.equal(status, 0);
    assert.match(stdout, /€0\.92/);
  });

  test("invalid SCX_RATE exits 1 with invalid rate message", () => {
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { SCX_RATE: "abc" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /invalid rate/);
  });

  test("empty SCX_RATE is treated as unset", () => {
    const { status, stderr } = runScx([], "Total: $1.00", {
      env: { SCX_RATE: "", SCX_CURRENCY: "JPY" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /rate is required/);
  });

  test("SCX_CURRENCY with unknown code exits 1", () => {
    const { status, stderr } = runScx(["-r", "155"], "Total: $1.00", {
      env: { SCX_CURRENCY: "XYZ" },
    });
    assert.equal(status, 1);
    assert.match(stderr, /invalid currency/i);
  });
});
