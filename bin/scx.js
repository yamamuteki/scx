#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const DEFAULT_JSON_COST_KEYS = ["totalCost", "costUSD", "cost", "costPerHour"];

function collectJsonKeys(value, previous) {
  const additions = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...previous, ...additions];
}

const program = new Command();

program
  .name("scx")
  .description("Simple Currency eXchanger for stdin streams")
  .version(packageJson.version)
  .option("-c, --currency <code>", "target currency code", "JPY")
  .requiredOption("-r, --rate <number>", "exchange rate from USD to target currency")
  .option("-l, --locale <locale>", "locale for currency formatting", "en-US")
  .option("--json", "treat stdin as JSON and convert cost fields recursively", false)
  .option(
    "--json-key <key>",
    "add a cost key to the default set (repeatable, or comma-separated)",
    collectJsonKeys,
    [],
  )
  .option(
    "--json-cost-string",
    "in --json mode, replace cost numbers with formatted currency strings",
    false,
  )
  .option("--no-auto-json", "disable JSON input auto-detection (default: on)")
  .addHelpText(
    "after",
    `
Examples:
  $ echo 'Total: $12.34' | scx -c JPY -r 155
  $ ccusage | scx -c JPY -r 155
  $ ccusage | scx -c EUR -r 0.92 -l de-DE
  $ ccusage daily --json | scx -c JPY -r 155              # JSON auto-detected
  $ ccusage daily --json | scx -c JPY -r 155 --json-cost-string`,
  )
  .parse(process.argv);

const options = program.opts();

const rate = Number(options.rate);
if (!Number.isFinite(rate) || rate <= 0) {
  process.stderr.write(`scx: invalid rate: ${options.rate}\n`);
  process.exit(1);
}

const currency = String(options.currency).toUpperCase();
if (
  typeof Intl.supportedValuesOf === "function" &&
  !Intl.supportedValuesOf("currency").includes(currency)
) {
  process.stderr.write(`scx: invalid currency code: ${options.currency}\n`);
  process.exit(1);
}

let formatter;
try {
  formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency,
  });
} catch (err) {
  process.stderr.write(
    `scx: invalid currency or locale (${options.currency}, ${options.locale}): ${err.message}\n`,
  );
  process.exit(1);
}

const fractionDigits = formatter.resolvedOptions().maximumFractionDigits;
const roundingFactor = 10 ** fractionDigits;

function roundCost(value) {
  return Math.round(value * roundingFactor) / roundingFactor;
}

const usdPattern = /\$(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;

function convertText(input) {
  return input.replace(usdPattern, (_match, amount) => {
    const usd = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(usd)) {
      return _match;
    }
    return formatter.format(usd * rate);
  });
}

function convertJson(input, { strict }) {
  let parsed;
  try {
    const stripped = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    parsed = JSON.parse(stripped);
  } catch (err) {
    if (strict) {
      process.stderr.write(`scx: invalid JSON input: ${err.message}\n`);
      process.exit(1);
    }
    return null;
  }

  const costKeys = new Set([...DEFAULT_JSON_COST_KEYS, ...options.jsonKey]);
  const asString = Boolean(options.jsonCostString);

  function transform(value, keyIsCost) {
    if (Array.isArray(value)) {
      return value.map((v) => transform(v, false));
    }
    if (value !== null && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = transform(v, costKeys.has(k));
      }
      return out;
    }
    if (keyIsCost && typeof value === "number" && Number.isFinite(value)) {
      const converted = value * rate;
      return asString ? formatter.format(converted) : roundCost(converted);
    }
    return value;
  }

  return `${JSON.stringify(transform(parsed, false), null, 2)}\n`;
}

function looksLikeJson(input) {
  let i = 0;
  if (input.charCodeAt(0) === 0xfeff) i = 1;
  while (i < input.length && /\s/.test(input[i])) i++;
  return input[i] === "{" || input[i] === "[";
}

process.stdin.setEncoding("utf8");

let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
});
process.stdin.on("end", () => {
  let output;
  if (options.json) {
    output = convertJson(buffer, { strict: true });
  } else if (options.autoJson && looksLikeJson(buffer)) {
    output = convertJson(buffer, { strict: false }) ?? convertText(buffer);
  } else {
    output = convertText(buffer);
  }
  process.stdout.write(output);
});
process.stdin.on("error", (err) => {
  process.stderr.write(`scx: stdin error: ${err.message}\n`);
  process.exit(1);
});
