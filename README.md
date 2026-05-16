# scx

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

## How it works

`scx` matches the pattern `$<digits>` in the input — supporting forms like `$12`, `$12.34`, `$1,234.56`, and `$0.0012` — multiplies each detected amount by the rate, and formats the result with `Intl.NumberFormat(locale, { style: "currency", currency })`. Surrounding text is preserved as-is.

## Requirements

- Node.js >= 18

## License

MIT
