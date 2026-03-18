#!/bin/bash
# PostToolUse hook: truncate large tool outputs to prevent context bloat
# Per-tool char limits: Grep/Glob/Bash=50000, WebFetch=10000
# Preserves stderr content (Error lines, Tracebacks, stack traces)

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only handle relevant tools
case "$TOOL_NAME" in
  Grep|Glob|Bash)
    CHAR_LIMIT=50000
    ;;
  WebFetch)
    CHAR_LIMIT=10000
    ;;
  *)
    exit 0
    ;;
esac

TOOL_OUTPUT=$(echo "$INPUT" | jq -r '.tool_response // empty')

if [[ -z "$TOOL_OUTPUT" ]]; then
  exit 0
fi

OUTPUT_LEN=${#TOOL_OUTPUT}

# If within limit, pass through unchanged
if [[ $OUTPUT_LEN -le $CHAR_LIMIT ]]; then
  exit 0
fi

# Extract stderr-like lines (errors, tracebacks, stack traces)
STDERR_LINES=$(echo "$TOOL_OUTPUT" | grep -E "(Error|error|Traceback|traceback|Exception|exception|WARN|WARNING|at [a-zA-Z])" 2>/dev/null | head -200 || true)

# Build truncated output: first 15000 + truncation marker + last 5000
KEEP_HEAD=15000
KEEP_TAIL=5000
REMOVED=$(( OUTPUT_LEN - KEEP_HEAD - KEEP_TAIL ))

HEAD_PART="${TOOL_OUTPUT:0:$KEEP_HEAD}"
TAIL_PART="${TOOL_OUTPUT: -$KEEP_TAIL}"

TRUNCATION_MARKER="

... [TRUNCATED: $REMOVED chars removed] ...

"

TRUNCATED_OUTPUT="${HEAD_PART}${TRUNCATION_MARKER}${TAIL_PART}"

# Append preserved stderr lines if any and not already present
if [[ -n "$STDERR_LINES" ]]; then
  # Check if stderr content is already in head or tail
  FIRST_STDERR_LINE=$(echo "$STDERR_LINES" | head -1)
  if ! echo "$HEAD_PART$TAIL_PART" | grep -qF "$FIRST_STDERR_LINE" 2>/dev/null; then
    TRUNCATED_OUTPUT="${TRUNCATED_OUTPUT}

--- [PRESERVED STDERR/ERROR LINES] ---
${STDERR_LINES}"
  fi
fi

# Output JSON with modified tool_response
jq -n --arg output "$TRUNCATED_OUTPUT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("Tool output was truncated from '"$OUTPUT_LEN"' chars to fit context limits.\n\nTruncated output:\n" + $output)
  }
}'
