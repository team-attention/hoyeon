#!/bin/bash
# skill-session-stop.sh — Unified stop hook
#
# Reads: ~/.hoyeon/{session_id}/state.json
# Behavior per skill:
#   - execute: block if spec.json has incomplete tasks
#   - specify: allow (cleanup only)
#
# Uses: cli spec status (exit 0=done, 1=incomplete)
# Circuit breaker: max 30 iterations to prevent infinite loops

set -euo pipefail

HOOK_INPUT=$(cat)

SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# ── Read session state ──

STATE_FILE="$HOME/.hoyeon/$SESSION_ID/state.json"
[[ ! -f "$STATE_FILE" ]] && exit 0

SKILL=$(jq -r '.skill // empty' "$STATE_FILE")
SPEC_REL=$(jq -r '.spec // empty' "$STATE_FILE")

[[ -z "$SKILL" ]] && exit 0

# ── Specify skills: cleanup and allow exit ──

case "$SKILL" in
  specify)
    rm -f "$STATE_FILE"
    exit 0
    ;;
  execute)
    ;; # fall through to execute logic below
  *)
    # Other skills (dev-scan, bugfix, etc.): allow exit, preserve state for SessionEnd cleanup
    exit 0
    ;;
esac

# ── Execute: check spec.json via cli ──

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

# Check task completion — direct jq parse (no CLI dependency on critical path)
if [[ ! -f "$SPEC_PATH" ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

TOTAL=$(jq '[.tasks // [] | length] | .[0]' "$SPEC_PATH" 2>/dev/null || echo 0)
DONE_COUNT=$(jq '[.tasks // [] | map(select(.status == "done")) | length] | .[0]' "$SPEC_PATH" 2>/dev/null || echo 0)

if [[ "$TOTAL" -eq 0 ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# Build status JSON locally
STATUS_JSON=$(jq -n \
  --argjson done "$DONE_COUNT" \
  --argjson total "$TOTAL" \
  --argjson complete "$([ "$DONE_COUNT" -eq "$TOTAL" ] && echo true || echo false)" \
  --argjson remaining "$(jq '[.tasks // [] | map(select(.status != "done")) | .[] | {id, action, status}]' "$SPEC_PATH" 2>/dev/null || echo '[]')" \
  '{done: $done, total: $total, complete: $complete, remaining: $remaining}'
)

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
