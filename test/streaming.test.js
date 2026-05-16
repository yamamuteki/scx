import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runScx } from "./helpers.js";

describe("large input handling", () => {
  test("converts every amount in a 5,000-line input", () => {
    const lines = [];
    for (let i = 0; i < 5000; i++) {
      lines.push(`Row ${i}: $${(i * 0.01).toFixed(2)}`);
    }
    const input = lines.join("\n");

    const { stdout, status } = runScx(["-c", "JPY", "-r", "155"], input);
    assert.equal(status, 0);

    const outLines = stdout.split("\n");
    assert.equal(outLines.length, 5000);
    for (const line of outLines) {
      assert.match(line, /^Row \d+: ￥[\d,]+$/);
    }
  });

  test("handles a multi-megabyte input without truncation", () => {
    const block = "Price: $10\n".repeat(200_000);
    const { stdout, status } = runScx(["-c", "JPY", "-r", "155"], block);
    assert.equal(status, 0);

    const matches = stdout.match(/￥1,550/g);
    assert.equal(matches?.length ?? 0, 200_000);
  });
});
