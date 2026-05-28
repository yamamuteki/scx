#!/bin/bash
# Captures doc/demo.html and renders doc/demo.gif end-to-end.
#
# Playwright is installed into a $TMPDIR cache (not into the scx package)
# so it never lands in devDependencies. ffmpeg and the system Google Chrome
# must already be available.
#
# Usage:
#   bash doc/record-demo.sh
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PW_CACHE="${TMPDIR:-/tmp}/scx-playwright"

if [ ! -d "$PW_CACHE/node_modules/playwright" ]; then
  echo "Installing playwright (~30MB) into $PW_CACHE..."
  mkdir -p "$PW_CACHE"
  ( cd "$PW_CACHE" && npm init -y >/dev/null && npm install playwright >/dev/null )
fi

# ESM resolves imports relative to the script's directory, so the recorder
# needs to live next to its node_modules during execution.
cp "$SCRIPT_DIR/record-demo.js" "$PW_CACHE/record.mjs"
node "$PW_CACHE/record.mjs" "$SCRIPT_DIR/demo.html"
