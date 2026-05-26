# scx

[![npm version](https://img.shields.io/npm/v/@yamamuteki/scx.svg)](https://www.npmjs.com/package/@yamamuteki/scx)
[![CI](https://github.com/yamamuteki/scx/actions/workflows/ci.yml/badge.svg)](https://github.com/yamamuteki/scx/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@yamamuteki/scx.svg)](https://nodejs.org/)

Simple Currency eXchanger for stdin streams.

`scx` reads text from standard input, detects USD amounts such as `$12.34` or `$1,234.56`, converts them to a target currency at a given exchange rate, and writes the rewritten text to standard output.

It is designed to wrap tools like [`ccusage`](https://www.npmjs.com/package/ccusage) so their dollar figures can be read directly in your local currency.

## Installation

```bash
npm install -g @yamamuteki/scx
```

Or run it on demand with `npx`:

```bash
npx @yamamuteki/scx -c JPY -r 155
```

## Usage

```bash
scx -c <currency> -r <rate> [-l <locale>]
```

`scx` reads from `stdin`, detects USD amounts, and writes the converted text to `stdout`.

## Options

| Option | Description | Default |
|---|---|---|
| `-c, --currency <code>` | ISO 4217 currency code to convert to (e.g. `JPY`, `EUR`, `VND`, `KRW`) | `JPY` |
| `-r, --rate <number>` | Exchange rate from USD to the target currency. Required unless `SCX_RATE` or the config file supplies one. | — |
| `-l, --locale <locale>` | BCP 47 locale used by `Intl.NumberFormat` (e.g. `en-US`, `ja-JP`, `de-DE`, `vi-VN`) | `en-US` |
| `--json` | Treat stdin as a JSON document and convert cost fields in place. Parse errors exit with status 1 | off |
| `--json-key <key>` | Extra key name(s) to treat as USD cost. Repeatable or comma-separated. | — |
| `--json-cost-string` | In JSON mode, replace cost numbers with formatted currency strings (e.g. `"¥2,973"`) instead of plain numbers | off |
| `--no-auto-json` | Disable JSON input auto-detection; always run in text mode | auto on |
| `-h, --help` | Show help | — |
| `-V, --version` | Show version | — |

## Environment variables

The three core options can also be supplied through environment variables. CLI flags take precedence.

| Variable | Equivalent option | Description |
|---|---|---|
| `SCX_CURRENCY` | `-c, --currency` | Target currency code. |
| `SCX_RATE` | `-r, --rate` | Exchange rate from USD to the target currency. |
| `SCX_LOCALE` | `-l, --locale` | BCP 47 locale for number formatting. |
| `SCX_CONFIG` | — | Absolute path to a config file. Overrides the default XDG lookup. |

```bash
export SCX_CURRENCY=JPY SCX_RATE=155
ccusage | scx
```

## Config file

`scx` can read persistent settings from a JSON config file, so you don't have to repeat `-r`, `-c`, etc. on every invocation. Resolution order from highest to lowest precedence is: **CLI flags > environment variables > config file > built-in defaults**.

### Location

The first file that exists in this order is used:

1. `$SCX_CONFIG` (when set)
2. `$XDG_CONFIG_HOME/scx/config.json`
3. `~/.config/scx/config.json`

If `$SCX_CONFIG` points at a missing or unreadable file, `scx` exits with status 1 instead of silently falling back — explicit paths are treated as load-bearing.

If no config file exists at any of the default locations, `scx` simply runs with built-in defaults and any CLI/env values supplied.

### Schema

```json
{
  "currency": "JPY",
  "locale": "en-US",
  "rate": {
    "value": 155.23,
    "currency": "JPY",
    "updatedAt": "2026-05-26T08:00:00Z"
  }
}
```

All fields are optional. `rate.currency` records the target currency the rate corresponds to. If you override the effective currency (via `-c` or `SCX_CURRENCY`) to something other than `rate.currency`, the stored rate is treated as not applicable and you must supply a fresh `-r` / `SCX_RATE` for that currency. The rate-missing error names both currencies so the mismatch is easy to spot.

### Managing the config file

```bash
scx config show                     # show resolved settings with their source
scx config path                     # print the config file path
scx config set currency JPY         # write currency=JPY
scx config set rate 155             # write rate.value=155, rate.currency from config, updatedAt=now
scx config set locale en-US         # write locale=en-US
scx config unset rate               # remove a key
```

`scx config set rate <number>` stores `rate` as the structured `{ value, currency, updatedAt }` object using the already-configured `currency` (or the built-in default `JPY` when none is set). Values are validated before writing — `currency` must be a known ISO 4217 code, `rate` must be a positive number, and `locale` must be a recognized BCP 47 tag.

### Fetching the rate automatically

```bash
scx config update                   # fetch USD->JPY (current currency) from frankfurter.dev
scx config update -c EUR            # fetch USD->EUR; also updates config.currency to EUR
```

The rate comes from [Frankfurter](https://frankfurter.dev/), a free public API that tracks European Central Bank reference rates. No API key needed. The fetched value is written to the config exactly the same shape as `scx config set rate <number>`, with `updatedAt` reflecting when the fetch happened. Network failures, HTTP errors, and timeouts (5 s) exit with status 1; the stale config is left untouched. Override the target currency with `-c <code>` or `SCX_CURRENCY`.

## Examples

Convert a piped string:

```bash
echo 'Today: $1.23 Total: $45.67' | scx -c JPY -r 155
# => Today: ¥191 Total: ¥7,079
```

Show `ccusage` output in Japanese yen:

```bash
npx ccusage | npx @yamamuteki/scx -c JPY -r 155
```

Show it in euros with German formatting:

```bash
npx ccusage | scx -c EUR -r 0.92 -l de-DE
```

Show it in Vietnamese dong:

```bash
npx ccusage | scx -c VND -r 25400 -l vi-VN
```

Convert `ccusage --json` output (JSON is auto-detected; cost values stay as numbers):

```bash
npx ccusage daily --json | scx -c JPY -r 155
```

### Claude Code statusline

`scx` can be wired into the [Claude Code](https://claude.com/claude-code) statusline so the live cost figures from `ccusage statusline` are shown in your local currency. Add the following to `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y ccusage statusline | npx -y @yamamuteki/scx -c JPY -r 155"
  }
}
```

The `-y` on each `npx` is important: the statusline is non-interactive, so any first-run install prompt would hang it.

The resulting status line will look like:

```
🤖 Opus | 💰 N/A session / ¥1,262 today / ¥1,262 block (3h 21m left) | 🔥 ¥1,525/hr | 🧠 N/A
```

For best startup performance, install both tools globally and use the bare names:

```bash
npm install -g ccusage @yamamuteki/scx
```

```json
{
  "statusLine": {
    "type": "command",
    "command": "ccusage statusline | scx -c JPY -r 155"
  }
}
```

## How it works

`scx` matches the pattern `$<digits>` in the input — supporting forms like `$12`, `$12.34`, `$1,234.56`, and `$0.0012` — multiplies each detected amount by the rate, and formats the result with `Intl.NumberFormat(locale, { style: "currency", currency })`. Surrounding text is preserved as-is.

Because matching requires a literal `$` prefix, inputs without one — for example `ccusage --json`, whose costs appear as bare numbers like `"totalCost": 19.18` — pass through unchanged in the default text mode. Use `--json` (described below) to convert them.

## JSON mode

In JSON mode `scx` reads stdin as a single JSON document, walks it recursively, and rewrites the values of known USD cost keys. Other numeric fields (token counts, timestamps, ratios, etc.) are left untouched.

JSON mode is enabled in two ways:

- **Auto-detection (default)**: if the input's first non-whitespace character (after skipping a UTF-8 BOM) is `{` or `[`, `scx` tries to parse it as JSON. If parsing succeeds, JSON mode runs; if it fails, `scx` silently falls back to text mode so well-formed text starting with `{` is never broken. Disable with `--no-auto-json`.
- **Explicit `--json`**: forces JSON mode. Parse errors exit with status 1 instead of falling back. Use this when you want a parse failure to be loud (e.g. in CI).

```bash
ccusage daily --json | scx -c JPY -r 155          # auto-detected
ccusage daily --json | scx -c JPY -r 155 --json   # forced; fails loudly on bad JSON
```

### Default cost keys

The following keys are treated as USD by default — chosen to cover [`ccusage`](https://www.npmjs.com/package/ccusage)'s primary outputs out of the box:

| Key | Source |
|---|---|
| `totalCost` | `daily` / `monthly` / `weekly` / `session` entries, their `totals`, and `blocks[].projection` |
| `costUSD` | `blocks` entries |
| `cost` | `modelBreakdowns` entries |
| `costPerHour` | `blocks[].burnRate` |

Add more keys with `--json-key`:

```bash
ccusage daily --json | scx -c JPY -r 155 --json --json-key myFee,extraCharge
```

### Output: number vs. string

By default the converted value stays a JSON `number`, rounded to the target currency's natural decimal places (JPY → integer, USD → 2 digits, KWD → 3 digits, etc.). This keeps downstream tooling — dashboards, bots, `jq` — happy:

```json
{ "totalCost": 19.18 }     // input  (USD)
{ "totalCost": 2973 }      // output (JPY, --json)
```

Pass `--json-cost-string` to get a human-readable currency-formatted string instead:

```json
{ "totalCost": "¥2,973" }  // output (--json --json-cost-string)
```

This is useful when piping into a viewer that displays the JSON as-is, but note that the value is no longer a `number` — code that expects `typeof x === "number"` will need to be updated.

## Requirements

- Node.js >= 18

## License

MIT
