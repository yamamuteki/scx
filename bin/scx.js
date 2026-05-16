#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const program = new Command();

program
  .name("scx")
  .description("Simple Currency eXchanger for stdin streams")
  .version(packageJson.version)
  .option("-c, --currency <code>", "target currency code", "JPY")
  .requiredOption("-r, --rate <number>", "exchange rate from USD to target currency")
  .option("-l, --locale <locale>", "locale for currency formatting", "en-US")
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

const usdPattern = /\$(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;

function convert(input) {
  return input.replace(usdPattern, (_match, amount) => {
    const usd = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(usd)) {
      return _match;
    }
    return formatter.format(usd * rate);
  });
}

process.stdin.setEncoding("utf8");

let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
});
process.stdin.on("end", () => {
  process.stdout.write(convert(buffer));
});
process.stdin.on("error", (err) => {
  process.stderr.write(`scx: stdin error: ${err.message}\n`);
  process.exit(1);
});
