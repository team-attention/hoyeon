#!/bin/bash
# skill-session-stop.sh — Unified stop hook
#
# Reads: ~/.claude/.hook-state/{session_id}.json
# Behavior per skill:
#   - execute / simple-execute: block if spec.json has incomplete tasks
#   - specify / simple-specify: allow (cleanup only)
#
# Uses: dev-cli spec status (exit 0=done, 1=incomplete)
# Circuit breaker: max 30 iterations to prevent infinite loops

set -euo pipefail

HOOK_INPUT=$(cat)

SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# ── Read session state ──

STATE_FILE="$HOME/.claude/.hook-state/$SESSION_ID.json"
[[ ! -f "$STATE_FILE" ]] && exit 0

SKILL=$(jq -r '.skill // empty' "$STATE_FILE")
SPEC_REL=$(jq -r '.spec // empty' "$STATE_FILE")

[[ -z "$SKILL" ]] && exit 0

# ── Specify skills: cleanup and allow exit ──

case "$SKILL" in
  specify|simple-specify)
    rm -f "$STATE_FILE"
    exit 0
    ;;
esac

# ── Execute skills: check spec.json via dev-cli ──

SPEC_PATH="$CWD/$SPEC_REL"

if [[ -z "$SPEC_REL" || ! -f "$SPEC_PATH" ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# Circuit breaker
ITERATION=$(jq -r '.iteration // 0' "$STATE_FILE")
MAX_ITER=30

if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  ITERATION=0
fi

if [[ "$ITERATION" -ge "$MAX_ITER" ]]; then
  echo "🛑 Circuit breaker: $MAX_ITER iterations reached. Forcing stop." >&2
  rm -f "$STATE_FILE"
  exit 0
fi

# Check task completion via dev-cli
STATUS_JSON=$(node "$CWD/dev-cli/bin/dev-cli.js" spec status "$SPEC_PATH" 2>/dev/null) || true

if [[ -z "$STATUS_JSON" ]]; then
  # dev-cli failed — allow exit to avoid blocking
  rm -f "$STATE_FILE"
  exit 0
fi

COMPLETE=$(echo "$STATUS_JSON" | jq -r '.complete')

if [[ "$COMPLETE" == "true" ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# ── Block: work remains ──

NEXT_ITER=$((ITERATION + 1))
TEMP_FILE="${STATE_FILE}.tmp.$$"
jq --argjson iter "$NEXT_ITER" '.iteration = $iter' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

DONE=$(echo "$STATUS_JSON" | jq -r '.done')
TOTAL=$(echo "$STATUS_JSON" | jq -r '.total')
REMAINING=$(echo "$STATUS_JSON" | jq -r '.remaining[] | "  \(.id): \(.action) [\(.status)]"')

jq -n \
  --arg reason "## Execute In Progress ($DONE/$TOTAL tasks done, iteration $NEXT_ITER/$MAX_ITER)

Remaining:
$REMAINING

Continue the execute loop." \
  '{"decision": "block", "reason": $reason}'

exit 0
