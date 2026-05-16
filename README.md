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
| `-r, --rate <number>` | Exchange rate from USD to the target currency. **Required.** | — |
| `-l, --locale <locale>` | BCP 47 locale used by `Intl.NumberFormat` (e.g. `en-US`, `ja-JP`, `de-DE`, `vi-VN`) | `en-US` |
| `-h, --help` | Show help | — |
| `-V, --version` | Show version | — |

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

Because matching requires a literal `$` prefix, inputs without one — for example `ccusage --json`, whose costs appear as bare numbers like `"totalCost": 19.18` — pass through unchanged.

## Requirements

- Node.js >= 18

## License

MIT
