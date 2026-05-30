import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runScx } from "./helpers.js";

describe("default USD passthrough (rate defaults to 1)", () => {
  test("no currency and no rate: passes USD amounts through unchanged", () => {
    const { status, stdout } = runScx([], "Total: $1.00 and $1,234.56");
    assert.equal(status, 0);
    assert.equal(stdout, "Total: $1.00 and $1,234.56");
  });

  test("explicit -c USD without -r still errors (-c requires -r)", () => {
    const { status, stderr } = runScx(["-c", "USD"], "Total: $1.00");
    assert.equal(status, 1);
    assert.match(stderr, /-c\/--currency requires -r\/--rate/);
  });

  test("-c JPY without -r errors", () => {
    const { status, stderr } = runScx(["-c", "JPY"], "Total: $1.00");
    assert.equal(status, 1);
    assert.match(stderr, /requires -r/);
  });

  test("-c JPY with -r converts as before", () => {
    const { status, stdout } = runScx(["-c", "JPY", "-r", "155", "-l", "ja-JP"], "Total: $1.00");
    assert.equal(status, 0);
    assert.match(stdout, /￥155/);
  });

  test("currency from env without a rate errors (no silent 1:1)", () => {
    const { status, stderr } = runScx([], "Total: $1.00", { env: { SCX_CURRENCY: "JPY" } });
    assert.equal(status, 1);
    assert.match(stderr, /rate is required for JPY/);
  });

  test("-r without -c uses the USD default", () => {
    const { status, stdout } = runScx(["-r", "155"], "Total: $1.00");
    assert.equal(status, 0);
    assert.match(stdout, /\$155\.00/);
  });
});
