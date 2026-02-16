#!/usr/bin/env bash
# ddgs-search.sh - DuckDuckGo search wrapper for dev-scan skill.
#
# Usage:
#   ddgs-search.sh <query> [options]
#   ddgs-search.sh --check
#
# Options:
#   --site DOMAIN    site: filter (e.g. news.ycombinator.com)
#   --time PERIOD    d/w/m/y (default: m)
#   --count N        Max results (default: 10)
#   --json           Output raw JSON (default: compact text for LLM)
#   --check          Verify uvx ddgs is available

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────
SITE=""
TIME="m"
COUNT=10
JSON_MODE=false
CHECK_MODE=false
QUERY=""

# ── Parse arguments ───────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      CHECK_MODE=true
      shift
      ;;
    --site)
      SITE="$2"
      shift 2
      ;;
    --time)
      TIME="$2"
      shift 2
      ;;
    --count)
      COUNT="$2"
      shift 2
      ;;
    --json)
      JSON_MODE=true
      shift
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$QUERY" ]]; then
        QUERY="$1"
      else
        QUERY="$QUERY $1"
      fi
      shift
      ;;
  esac
done

# ── Check mode ────────────────────────────────────────────────
if $CHECK_MODE; then
  if command -v uvx &>/dev/null; then
    # Verify ddgs is actually runnable
    if uvx ddgs --version &>/dev/null 2>&1; then
      echo "available: true"
      echo "tool: uvx ddgs ($(uvx ddgs --version 2>/dev/null || echo 'unknown'))"
    else
      echo "available: true (uvx found, ddgs should work)"
    fi
  else
    echo "available: false"
    echo "reason: uvx not found. Install with: pip install uv"
    exit 1
  fi
  exit 0
fi

# ── Validate query ────────────────────────────────────────────
if [[ -z "$QUERY" ]]; then
  echo "Error: query is required" >&2
  echo "Usage: ddgs-search.sh <query> [--site DOMAIN] [--time d/w/m/y] [--count N] [--json]" >&2
  exit 1
fi

# ── Build search query ────────────────────────────────────────
SEARCH_QUERY="$QUERY"
if [[ -n "$SITE" ]]; then
  SEARCH_QUERY="$QUERY site:$SITE"
fi

# ── Run ddgs via uvx ──────────────────────────────────────────
TMPFILE="/tmp/ddgs-$$.json"
trap 'rm -f "$TMPFILE"' EXIT

if ! uvx ddgs text -q "$SEARCH_QUERY" -t "$TIME" -m "$COUNT" -o "$TMPFILE" 2>/dev/null; then
  echo "Error: ddgs search failed" >&2
  echo "Query: $SEARCH_QUERY" >&2
  exit 1
fi

if [[ ! -s "$TMPFILE" ]]; then
  echo "No results found for: $SEARCH_QUERY" >&2
  exit 0
fi

# ── Output ────────────────────────────────────────────────────
if $JSON_MODE; then
  cat "$TMPFILE"
  exit 0
fi

# Compact text format (LLM-optimized)
python3 -c "
import json, sys

with open('$TMPFILE') as f:
    results = json.load(f)

site = '$SITE'
time_period = '$TIME'
query = '''$QUERY'''

header = f'=== DuckDuckGo Search: {query}'
if site:
    header += f' (site:{site}, time:{time_period})'
else:
    header += f' (time:{time_period})'
header += ' ==='

print(header)
print(f'Found: {len(results)} results')
print()

for i, r in enumerate(results, 1):
    title = r.get('title', 'No title')
    href = r.get('href', '')
    body = r.get('body', '')
    # Truncate body to 300 chars
    if len(body) > 300:
        body = body[:297] + '...'
    print(f'[{i}] {title}')
    print(f'    URL: {href}')
    if body:
        print(f'    {body}')
    print()
"
