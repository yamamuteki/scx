#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const DEFAULT_CURRENCY = "JPY";
const DEFAULT_LOCALE = "en-US";
const DEFAULT_JSON_COST_KEYS = ["totalCost", "costUSD", "cost", "costPerHour"];

function envOr(name) {
  const v = process.env[name];
  return v == null || v === "" ? undefined : v;
}

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
  .option(
    "-c, --currency <code>",
    `target currency code (default: ${DEFAULT_CURRENCY}, env: SCX_CURRENCY)`,
  )
  .option("-r, --rate <number>", "exchange rate from USD to target currency (env: SCX_RATE)")
  .option(
    "-l, --locale <locale>",
    `locale for currency formatting (default: ${DEFAULT_LOCALE}, env: SCX_LOCALE)`,
  )
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

const rawRate = options.rate ?? envOr("SCX_RATE");
const rawCurrency = options.currency ?? envOr("SCX_CURRENCY") ?? DEFAULT_CURRENCY;
const rawLocale = options.locale ?? envOr("SCX_LOCALE") ?? DEFAULT_LOCALE;

if (rawRate === undefined) {
  process.stderr.write("scx: rate is required. Pass -r <number> or set SCX_RATE.\n");
  process.exit(1);
}

const rate = Number(rawRate);
if (!Number.isFinite(rate) || rate <= 0) {
  process.stderr.write(`scx: invalid rate: ${rawRate}\n`);
  process.exit(1);
}

const currency = String(rawCurrency).toUpperCase();
if (
  typeof Intl.supportedValuesOf === "function" &&
  !Intl.supportedValuesOf("currency").includes(currency)
) {
  process.stderr.write(`scx: invalid currency code: ${rawCurrency}\n`);
  process.exit(1);
}

let formatter;
try {
  formatter = new Intl.NumberFormat(rawLocale, {
    style: "currency",
    currency,
  });
} catch (err) {
  process.stderr.write(
    `scx: invalid currency or locale (${rawCurrency}, ${rawLocale}): ${err.message}\n`,
  );
  process.exit(1);
}

function roundCost(value) {
  let digits = "";
  for (const part of formatter.formatToParts(value)) {
    if (part.type === "minusSign") digits += "-";
    else if (part.type === "integer" || part.type === "fraction") digits += part.value;
    else if (part.type === "decimal") digits += ".";
  }
  return Number(digits);
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

// SCX_FORCE_TTY is a test-only escape hatch; not part of the public CLI.
if (process.stdin.isTTY || process.env.SCX_FORCE_TTY === "1") {
  process.stderr.write(
    "scx: stdin is a terminal; pipe input from another command, e.g.\n  $ ccusage | scx -c JPY -r 155\nRun 'scx --help' for all options.\n",
  );
  process.exit(1);
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
