#!/bin/bash
# browser-extract.sh — Extract text content from a URL using chromux (real Chrome browser)
# Useful for JS-heavy pages, dynamic content, or sites that block simple HTTP fetches.
# Usage: browser-extract.sh <url> <output-file> [chromux-path] [timeout-seconds]
set -euo pipefail

URL="${1:?Usage: browser-extract.sh <url> <output-file> [chromux-path] [timeout-seconds]}"
OUTPUT_FILE="${2:?Usage: browser-extract.sh <url> <output-file> [chromux-path] [timeout-seconds]}"
CHROMUX_ARG="${3:-}"
TIMEOUT="${4:-30}"

# Auto-detect chromux if not provided
if [ -n "$CHROMUX_ARG" ]; then
  CHROMUX="$CHROMUX_ARG"
else
  CHROMUX="$(command -v chromux 2>/dev/null || echo "")"
fi

# Graceful skip if chromux not found
if [ -z "$CHROMUX" ]; then
  echo "SKIP: chromux not found — install via npm i -g @team-attention/chromux"
  exit 0
fi

SESSION_ID="ext-$(openssl rand -hex 2)"

cleanup() {
  "$CHROMUX" close "$SESSION_ID" 2>/dev/null || true
}
trap 'cleanup' EXIT

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Launch Chrome headless (skip if already running)
"$CHROMUX" launch default --headless 2>/dev/null || true

# Open URL in new session
if ! "$CHROMUX" open "$SESSION_ID" "$URL" 2>/dev/null; then
  echo "ERROR: Failed to open URL: $URL"
  cat > "$OUTPUT_FILE" <<ERROR_NOTE
# Browser Extraction Failed

> URL: $URL
> Extracted: $(date '+%Y-%m-%d %H:%M')
> Status: ERROR — could not open URL

## Note

chromux failed to open the URL. The page may be unavailable or require authentication.
ERROR_NOTE
  exit 0
fi

# Wait for page load (milliseconds)
WAIT_MS=$(( TIMEOUT * 100 ))
"$CHROMUX" wait "$SESSION_ID" "$WAIT_MS" 2>/dev/null || true

# Extract page title
TITLE=$("$CHROMUX" eval "$SESSION_ID" "document.title" 2>/dev/null || echo "")

# Extract meta description
DESC=$("$CHROMUX" eval "$SESSION_ID" "document.querySelector('meta[name=\"description\"]')?.content || ''" 2>/dev/null || echo "")

# Extract body text
BODY=$("$CHROMUX" eval "$SESSION_ID" "document.body.innerText" 2>/dev/null || echo "")

if [ -z "$BODY" ]; then
  cat > "$OUTPUT_FILE" <<EMPTY_NOTE
# ${TITLE:-Untitled}

> URL: $URL
> Extracted: $(date '+%Y-%m-%d %H:%M')
> Description: $DESC
> Status: WARNING — body text was empty

## Note

chromux opened the page but extracted no body text. The page may require JavaScript execution
time, authentication, or may be a single-page app that did not fully render.
EMPTY_NOTE
  echo "WARN: Empty body extracted from $URL — written note to $OUTPUT_FILE"
  exit 0
fi

cat > "$OUTPUT_FILE" <<CONTENT
# ${TITLE:-Untitled}

> URL: $URL
> Extracted: $(date '+%Y-%m-%d %H:%M')
> Description: $DESC

## Content

$BODY
CONTENT

echo "OK: Content extracted to $OUTPUT_FILE"
