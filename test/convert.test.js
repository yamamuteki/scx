import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runScx } from "./helpers.js";

function convertJPY(input, rate = "155") {
  const { stdout, status } = runScx(["-c", "JPY", "-r", rate, "-l", "ja-JP"], input);
  assert.equal(status, 0);
  return stdout;
}

describe("USD pattern detection", () => {
  test("converts $<int>", () => {
    assert.equal(convertJPY("Total: $12"), "Total: ￥1,860");
  });

  test("converts $<float>", () => {
    assert.equal(convertJPY("Total: $12.34"), "Total: ￥1,913");
  });

  test("converts $<int with comma separators>", () => {
    assert.equal(convertJPY("Total: $1,234.56"), "Total: ￥191,357");
  });

  test("converts small amounts and rounds per locale", () => {
    assert.equal(convertJPY("Total: $0.0012"), "Total: ￥0");
  });

  test("rewrites every occurrence in a single line", () => {
    assert.equal(
      convertJPY("Today: $1.23 Total: $45.67"),
      "Today: ￥191 Total: ￥7,079",
    );
  });

  test("preserves non-matching surrounding text and line breaks", () => {
    const input = "Line A\nPrice: $10\n\n[footer]\n";
    const expected = "Line A\nPrice: ￥1,550\n\n[footer]\n";
    assert.equal(convertJPY(input), expected);
  });

  test("passes input through unchanged when no $ amounts are present", () => {
    const input = "no dollar amounts here\n";
    assert.equal(convertJPY(input), input);
  });

  test("ignores bare $ without digits", () => {
    assert.equal(convertJPY("price tag: $abc"), "price tag: $abc");
  });

  test("handles empty stdin", () => {
    assert.equal(convertJPY(""), "");
  });
});

describe("boundary patterns", () => {
  test("$0 converts to zero in the target currency", () => {
    assert.equal(convertJPY("Total: $0"), "Total: ￥0");
  });

  test("$.5 (no leading digit) is not matched", () => {
    assert.equal(convertJPY("Tip: $.5"), "Tip: $.5");
  });

  test("a bare $ at end of input is left unchanged", () => {
    assert.equal(convertJPY("price tag $"), "price tag $");
  });

  test("$ followed by a space and digit is not matched", () => {
    assert.equal(convertJPY("Total: $ 10"), "Total: $ 10");
  });

  test("consecutive $$10 keeps the first $ and converts the second amount", () => {
    assert.equal(convertJPY("$$10"), "$￥1,550");
  });

  test("a hyphen prefix is preserved (no negative-amount handling)", () => {
    assert.equal(convertJPY("Refund: -$10"), "Refund: -￥1,550");
  });
});

describe("ANSI-colored input (ccusage compatibility)", () => {
  test("preserves ANSI escape sequences around converted amounts", () => {
    const input = "[36mTotal: $12.34[39m";
    const expected = "[36mTotal: ￥1,913[39m";
    assert.equal(convertJPY(input), expected);
  });

  test("converts amounts inside a multi-segment colored table cell", () => {
    const input = "[90m│[39m   $19.18 [90m│[39m";
    const expected = "[90m│[39m   ￥2,973 [90m│[39m";
    assert.equal(convertJPY(input), expected);
  });
});

describe("locale and currency variations", () => {
  test("EUR + de-DE formats with comma decimal separator", () => {
    const { stdout, status } = runScx(
      ["-c", "EUR", "-r", "0.92", "-l", "de-DE"],
      "Total: $12.34",
    );
    assert.equal(status, 0);
    assert.match(stdout, /^Total: 11,35\s€$/u);
  });

  test("VND + vi-VN formats with dot thousands separator and dong sign", () => {
    const { stdout, status } = runScx(
      ["-c", "VND", "-r", "25400", "-l", "vi-VN"],
      "Total: $12.34",
    );
    assert.equal(status, 0);
    assert.match(stdout, /313\.436/);
    assert.match(stdout, /₫/);
  });

  test("USD + en-US passes through with locale-appropriate formatting", () => {
    const { stdout, status } = runScx(
      ["-c", "USD", "-r", "1", "-l", "en-US"],
      "Total: $1234.56",
    );
    assert.equal(status, 0);
    assert.equal(stdout, "Total: $1,234.56");
  });
});

describe("currency-specific decimal places", () => {
  test("JPY rounds to 0 decimal places", () => {
    const { stdout } = runScx(["-c", "JPY", "-r", "1", "-l", "ja-JP"], "$10.49");
    assert.match(stdout, /^￥10$/);
  });

  test("USD keeps 2 decimal places", () => {
    const { stdout } = runScx(["-c", "USD", "-r", "1", "-l", "en-US"], "$10.49");
    assert.equal(stdout, "$10.49");
  });

  test("KWD keeps 3 decimal places", () => {
    const { stdout } = runScx(["-c", "KWD", "-r", "0.3", "-l", "en-US"], "$1");
    assert.match(stdout, /0\.300/);
  });
});

describe("rate edge cases", () => {
  test("very small rate works", () => {
    const { stdout, status } = runScx(
      ["-c", "USD", "-r", "0.0001", "-l", "en-US"],
      "$10000",
    );
    assert.equal(status, 0);
    assert.equal(stdout, "$1.00");
  });

  test("very large rate works", () => {
    const { stdout, status } = runScx(
      ["-c", "JPY", "-r", "1000000", "-l", "ja-JP"],
      "$1",
    );
    assert.equal(status, 0);
    assert.equal(stdout, "￥1,000,000");
  });
});
