import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runScx } from "./helpers.js";

const BASE = ["-c", "JPY", "-r", "155", "-l", "ja-JP"];

describe("JSON auto-detection", () => {
  test("object input starting with { is detected as JSON", () => {
    const { stdout, status } = runScx(BASE, JSON.stringify({ totalCost: 19.18 }));
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.totalCost, 2973);
  });

  test("array input starting with [ is detected as JSON", () => {
    const { stdout, status } = runScx(BASE, JSON.stringify([{ totalCost: 1 }]));
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.equal(out[0].totalCost, 155);
  });

  test("leading whitespace before { is skipped", () => {
    const { stdout, status } = runScx(BASE, `\n  \t${JSON.stringify({ cost: 1 })}\n`);
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.cost, 155);
  });

  test("UTF-8 BOM before { is skipped", () => {
    const { stdout, status } = runScx(BASE, `﻿${JSON.stringify({ cost: 1 })}`);
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.cost, 155);
  });

  test("plain text with $ amounts is processed in text mode", () => {
    const { stdout, status } = runScx(BASE, "Total: $12.34");
    assert.equal(status, 0);
    assert.equal(stdout, "Total: ￥1,913");
  });

  test("text starting with a letter is not auto-detected as JSON", () => {
    const { stdout, status } = runScx(BASE, "Today: $1.23 Total: $45.67");
    assert.equal(status, 0);
    assert.equal(stdout, "Today: ￥191 Total: ￥7,079");
  });

  test("broken JSON falls back silently to text mode", () => {
    const { stdout, status, stderr } = runScx(BASE, '{"totalCost": 1');
    assert.equal(status, 0);
    assert.equal(stderr, "");
    assert.equal(stdout, '{"totalCost": 1');
  });

  test("text starting with { but containing $ amounts works after fallback", () => {
    const { stdout, status } = runScx(BASE, "{ free-form text with $10 inside");
    assert.equal(status, 0);
    assert.equal(stdout, "{ free-form text with ￥1,550 inside");
  });

  test("ANSI-colored input is treated as text (not JSON)", () => {
    const input = "[36mTotal: $12.34[39m";
    const { stdout, status } = runScx(BASE, input);
    assert.equal(status, 0);
    assert.equal(stdout, "[36mTotal: ￥1,913[39m");
  });

  test("empty input stays empty", () => {
    const { stdout, status } = runScx(BASE, "");
    assert.equal(status, 0);
    assert.equal(stdout, "");
  });

  test("whitespace-only input stays as-is", () => {
    const { stdout, status } = runScx(BASE, "   \n");
    assert.equal(status, 0);
    assert.equal(stdout, "   \n");
  });
});

describe("--no-auto-json (opt-out)", () => {
  test("disables auto-detection so JSON is treated as text", () => {
    const input = JSON.stringify({ totalCost: 19.18 });
    const { stdout, status } = runScx([...BASE, "--no-auto-json"], input);
    assert.equal(status, 0);
    assert.equal(stdout, input);
  });

  test("text mode still processes $ amounts", () => {
    const { stdout, status } = runScx([...BASE, "--no-auto-json"], "Total: $12");
    assert.equal(status, 0);
    assert.equal(stdout, "Total: ￥1,860");
  });
});

describe("--json explicit still works under auto-detection", () => {
  test("--json forces JSON mode and reports parse errors", () => {
    const { status, stderr } = runScx([...BASE, "--json"], "not json at all");
    assert.equal(status, 1);
    assert.match(stderr, /json/i);
  });

  test("--json + --no-auto-json: explicit flag still wins", () => {
    const { stdout, status } = runScx(
      [...BASE, "--json", "--no-auto-json"],
      JSON.stringify({ totalCost: 1 }),
    );
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.totalCost, 155);
  });
});
