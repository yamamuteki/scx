#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
const VALID_SET_CONFIG_KEYS = ["currency", "rate", "locale"];
const RATE_FETCH_BASE = "https://api.frankfurter.dev";
const RATE_FETCH_TIMEOUT_MS = 5000;

function envOr(name) {
  const v = process.env[name];
  return v == null || v === "" ? undefined : v;
}

function defaultConfigPath() {
  const xdgHome = envOr("XDG_CONFIG_HOME") ?? join(homedir(), ".config");
  return join(xdgHome, "scx", "config.json");
}

function configPathForRead() {
  const explicit = envOr("SCX_CONFIG");
  if (explicit !== undefined) {
    if (!existsSync(explicit)) {
      process.stderr.write(`scx: config file not found: ${explicit}\n`);
      process.exit(1);
    }
    return explicit;
  }
  const xdgPath = defaultConfigPath();
  return existsSync(xdgPath) ? xdgPath : null;
}

function configPathForWrite() {
  return envOr("SCX_CONFIG") ?? defaultConfigPath();
}

function loadConfig() {
  const path = configPathForRead();
  if (!path) return null;
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`scx: cannot read config (${path}): ${err.message}\n`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`scx: invalid JSON in config (${path}): ${err.message}\n`);
    process.exit(1);
  }
}

function writeConfig(config) {
  const path = configPathForWrite();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

function isValidCurrencyCode(code) {
  if (typeof Intl.supportedValuesOf !== "function") return true;
  return Intl.supportedValuesOf("currency").includes(code);
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
    `target currency code (default: ${DEFAULT_CURRENCY}, env: SCX_CURRENCY, config: currency)`,
  )
  .option(
    "-r, --rate <number>",
    "exchange rate from USD to target currency (env: SCX_RATE, config: rate.value)",
  )
  .option(
    "-l, --locale <locale>",
    `locale for currency formatting (default: ${DEFAULT_LOCALE}, env: SCX_LOCALE, config: locale)`,
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
  .option("--no-auto-json", "disable JSON input auto-detection")
  .addHelpText(
    "after",
    `
Examples:
  $ scx config update                              # one-time setup
  $ scx config show                                # see your settings
  $ echo 'Total: $1.00' | scx                      # quick test
  $ ccusage | scx                                  # main use case (uses config)
  $ ccusage | scx -c EUR -r 0.92 -l de-DE          # ad-hoc with all flags
  $ ccusage daily --json | scx                     # JSON mode (auto-detected)
  $ ccusage daily --json | scx --json-cost-string  # JSON, costs as formatted strings`,
  )
  .allowExcessArguments()
  .action(runConvert);

const configCmd = program
  .command("config")
  .description("Manage the scx config file")
  .addHelpText(
    "after",
    `
Examples:
  $ scx config update                # fetch USD->JPY (or your config currency)
  $ scx config update -c EUR         # fetch USD->EUR (makes EUR the default currency)
  $ scx config update list           # list the currencies config update can fetch
  $ scx config show                  # see current settings + source
  $ scx config set currency JPY      # write a key
  $ scx config set rate 155          # write rate manually (no network)
  $ scx config unset rate            # remove a key
  $ scx config delete                # remove the entire config file`,
  )
  .allowExcessArguments()
  .action(runConfigRoot);

const updateCmd = configCmd
  .command("update")
  .description("Fetch the latest USD->target rate from frankfurter.dev")
  // Accept stray tokens (e.g. a typo'd subcommand) so they reach the action and
  // get a helpful error instead of commander's terse "too many arguments".
  // Known subcommands like list are still dispatched before the action runs.
  .allowExcessArguments()
  .action(runConfigUpdate);

updateCmd
  .command("list")
  .description("List the currencies config update can fetch (from frankfurter.dev)")
  .action(runConfigUpdateList);

configCmd
  .command("show")
  .description("Show resolved settings with their source")
  .action(runConfigShow);

configCmd
  .command("path")
  .description("Show the config file path scx would use")
  .action(runConfigPath);

configCmd
  .command("set <key> <value>")
  .description(`Set a config value (keys: ${VALID_SET_CONFIG_KEYS.join(", ")})`)
  .action(runConfigSet);

configCmd
  .command("unset <key>")
  .description(`Remove a config value (keys: ${VALID_SET_CONFIG_KEYS.join(", ")})`)
  .action(runConfigUnset);

configCmd.command("delete").description("Delete the config file entirely").action(runConfigDelete);

await program.parseAsync(process.argv);

// Print a helpful error for an unknown command/subcommand: echo the bad token,
// suggest a close match (by prefix), and list what is actually available.
function rejectUnknownCommand(command, token, footer) {
  const subs = command.commands.filter((c) => c.name() !== "help");
  const names = subs.map((c) => c.name());
  const lower = token.toLowerCase();
  const guesses = names.filter((n) => n.startsWith(lower) || lower.startsWith(n));
  const width = Math.max(...names.map((n) => n.length));
  const lines = [`error: unknown command '${token}'`];
  if (guesses.length > 0) {
    lines.push(`(Did you mean ${guesses.map((g) => `'${g}'`).join(" or ")}?)`);
  }
  lines.push("", "Available commands:");
  for (const c of subs) {
    lines.push(`  ${c.name().padEnd(width)}  ${c.description()}`);
  }
  if (footer) {
    lines.push("", footer);
  }
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exit(1);
}

function runConvert() {
  if (program.args.length > 0) {
    rejectUnknownCommand(program, program.args[0]);
  }
  const options = program.opts();
  const config = loadConfig();

  const rawCurrency =
    options.currency ?? envOr("SCX_CURRENCY") ?? config?.currency ?? DEFAULT_CURRENCY;
  const rawLocale = options.locale ?? envOr("SCX_LOCALE") ?? config?.locale ?? DEFAULT_LOCALE;

  const currency = String(rawCurrency).toUpperCase();
  if (!isValidCurrencyCode(currency)) {
    process.stderr.write(`scx: invalid currency code: ${rawCurrency}\n`);
    process.exit(1);
  }

  let rawRate = options.rate ?? envOr("SCX_RATE");
  let configRateMismatch = null;
  if (rawRate === undefined && config?.rate && typeof config.rate === "object") {
    const configRateCurrency =
      typeof config.rate.currency === "string" ? config.rate.currency.toUpperCase() : null;
    if (configRateCurrency === currency && typeof config.rate.value === "number") {
      rawRate = config.rate.value;
    } else if (configRateCurrency && configRateCurrency !== currency) {
      configRateMismatch = { configRateCurrency, currency };
    }
  }

  if (rawRate === undefined) {
    let msg;
    if (configRateMismatch) {
      msg = `scx: rate is required. Config has a rate for ${configRateMismatch.configRateCurrency} but currency is ${configRateMismatch.currency}. To refresh:\n  $ scx config update -c ${configRateMismatch.currency}\n`;
    } else {
      msg =
        "scx: rate is required. Run one of:\n" +
        "  $ scx config update         # fetch USD->JPY from frankfurter.dev\n" +
        "  $ scx config update -c EUR  # or any other currency\n";
    }
    process.stderr.write(msg);
    process.exit(1);
  }

  const rate = Number(rawRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    process.stderr.write(`scx: invalid rate: ${rawRate}\n`);
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
      [
        "scx: stdin is a terminal. scx reads USD amounts from a pipe and converts them.",
        "",
        "First-time setup (one command):",
        "  $ scx config update         # fetch USD->JPY (default)",
        "  $ scx config update -c EUR  # or any other currency",
        "",
        "Then pipe input:",
        "  $ echo 'Total: $1.00' | scx",
        "  $ ccusage | scx",
        "  $ ccusage | scx -c JPY -r 155        # one-shot (no setup needed)",
        "",
        "Run 'scx --help' for all commands.",
        "",
      ].join("\n"),
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
}

function runConfigRoot(_options, command) {
  if (command.args.length > 0) {
    rejectUnknownCommand(command, command.args[0]);
  }
  command.outputHelp();
  process.exit(1);
}

function runConfigShow() {
  const config = loadConfig() ?? {};

  const envCurrency = envOr("SCX_CURRENCY");
  const currency = envCurrency ?? config.currency ?? DEFAULT_CURRENCY;
  const currencySource = envCurrency ? "env" : config.currency ? "config" : "default";

  const envLocale = envOr("SCX_LOCALE");
  const locale = envLocale ?? config.locale ?? DEFAULT_LOCALE;
  const localeSource = envLocale ? "env" : config.locale ? "config" : "default";

  let rateLine = "rate      (not set)";
  const envRate = envOr("SCX_RATE");
  const effectiveCurrency = String(currency).toUpperCase();
  if (envRate) {
    rateLine = `rate      ${envRate}   (env)`;
  } else if (
    config.rate &&
    typeof config.rate === "object" &&
    typeof config.rate.value === "number" &&
    typeof config.rate.currency === "string" &&
    config.rate.currency.toUpperCase() === effectiveCurrency
  ) {
    const updatedNote = config.rate.updatedAt
      ? `, updated ${new Date(config.rate.updatedAt).toLocaleString()}`
      : "";
    rateLine = `rate      ${config.rate.value}   (config: USD->${config.rate.currency.toUpperCase()}${updatedNote})`;
  } else if (
    config.rate &&
    typeof config.rate === "object" &&
    typeof config.rate.currency === "string" &&
    config.rate.currency.toUpperCase() !== effectiveCurrency
  ) {
    rateLine = `rate      (not set; config has ${config.rate.value} for ${config.rate.currency.toUpperCase()} but currency is ${effectiveCurrency})`;
  }

  const path = configPathForRead() ?? `${configPathForWrite()} (not created yet)`;

  process.stdout.write(`currency  ${currency}   (${currencySource})\n`);
  process.stdout.write(`${rateLine}\n`);
  process.stdout.write(`locale    ${locale}   (${localeSource})\n`);
  process.stdout.write(`config    ${path}\n`);
}

function runConfigPath() {
  const explicit = envOr("SCX_CONFIG");
  const path = explicit ?? defaultConfigPath();
  process.stdout.write(`${path}\n`);
}

function rejectUnknownKey(key) {
  if (!VALID_SET_CONFIG_KEYS.includes(key)) {
    process.stderr.write(
      `scx: unknown config key: ${key}\n  Valid keys: ${VALID_SET_CONFIG_KEYS.join(", ")}\n`,
    );
    process.exit(1);
  }
}

function runConfigSet(key, value) {
  rejectUnknownKey(key);
  const config = loadConfig() ?? {};

  if (key === "currency") {
    const code = String(value).toUpperCase();
    if (!isValidCurrencyCode(code)) {
      process.stderr.write(`scx: invalid currency code: ${value}\n`);
      process.exit(1);
    }
    config.currency = code;
  } else if (key === "locale") {
    try {
      new Intl.NumberFormat(value, { style: "currency", currency: "USD" });
    } catch (err) {
      process.stderr.write(`scx: invalid locale: ${value}: ${err.message}\n`);
      process.exit(1);
    }
    config.locale = value;
  } else if (key === "rate") {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      process.stderr.write(`scx: invalid rate: ${value}\n`);
      process.exit(1);
    }
    if (!config.currency) {
      config.currency = DEFAULT_CURRENCY;
    }
    config.rate = {
      value: num,
      currency: config.currency,
      updatedAt: new Date().toISOString(),
    };
  }

  writeConfig(config);
}

function runConfigUnset(key) {
  rejectUnknownKey(key);
  const config = loadConfig() ?? {};
  delete config[key];
  writeConfig(config);
}

function runConfigDelete() {
  const path = configPathForWrite();
  try {
    unlinkSync(path);
  } catch (err) {
    if (err.code === "ENOENT") return;
    process.stderr.write(`scx: failed to delete config (${path}): ${err.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`scx: deleted ${path}\n`);
}

async function fetchRate(currency) {
  const base = envOr("SCX_RATE_FETCH_URL") ?? RATE_FETCH_BASE;
  const url = `${base}/v2/rate/USD/${encodeURIComponent(currency)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": `scx/${packageJson.version}` },
    });
  } catch (err) {
    process.stderr.write(`scx: rate fetch failed: ${err.message}\n`);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    process.stderr.write(`scx: rate fetch returned HTTP ${response.status}\n`);
    process.exit(1);
  }
  let body;
  try {
    body = await response.json();
  } catch (err) {
    process.stderr.write(`scx: invalid JSON from rate API: ${err.message}\n`);
    process.exit(1);
  }
  const value = body?.rate;
  if (typeof value !== "number") {
    process.stderr.write(`scx: rate for ${currency} missing from response\n`);
    process.exit(1);
  }
  return value;
}

async function runConfigUpdate(_options, command) {
  if (command.args.length > 0) {
    rejectUnknownCommand(
      command,
      command.args[0],
      "Examples:\n" +
        "  $ scx config update                # fetch the rate for your configured currency\n" +
        "  $ scx config update -c EUR         # fetch the rate for another currency\n" +
        "  $ scx config update list           # list the currencies you can fetch",
    );
  }

  const config = loadConfig() ?? {};
  const cliCurrency = program.opts().currency;
  const rawCurrency = cliCurrency ?? envOr("SCX_CURRENCY") ?? config.currency ?? DEFAULT_CURRENCY;
  const currency = String(rawCurrency).toUpperCase();
  if (!isValidCurrencyCode(currency)) {
    process.stderr.write(
      `scx: invalid currency code: ${rawCurrency}\n  Run 'scx config update list' to see the currencies config update can fetch.\n`,
    );
    process.exit(1);
  }
  const value = await fetchRate(currency);
  config.currency = currency;
  config.rate = {
    value,
    currency,
    updatedAt: new Date().toISOString(),
  };
  writeConfig(config);
  process.stdout.write(`${value}\n`);
}

async function fetchCurrencies() {
  const base = envOr("SCX_RATE_FETCH_URL") ?? RATE_FETCH_BASE;
  const url = `${base}/v2/currencies`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": `scx/${packageJson.version}` },
    });
  } catch (err) {
    process.stderr.write(`scx: currencies fetch failed: ${err.message}\n`);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    process.stderr.write(`scx: currencies fetch returned HTTP ${response.status}\n`);
    process.exit(1);
  }
  let body;
  try {
    body = await response.json();
  } catch (err) {
    process.stderr.write(`scx: invalid JSON from currencies API: ${err.message}\n`);
    process.exit(1);
  }
  if (!Array.isArray(body)) {
    process.stderr.write("scx: unexpected currencies response shape\n");
    process.exit(1);
  }
  return body;
}

async function runConfigUpdateList() {
  const currencies = await fetchCurrencies();
  const lines = currencies
    .filter((c) => c && typeof c.iso_code === "string")
    .map((c) => `${c.iso_code}  ${c.name ?? ""}`.trimEnd());
  process.stdout.write(`${lines.join("\n")}\n`);
}
