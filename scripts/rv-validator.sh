#!/bin/bash
# rv-validator.sh - Stop hook for re-validate mode
# Thin wrapper: delegates to dev-cli loop-tick

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    session_id="unknown"
fi

# Check if there's an active rv loop
status=$(node dev-cli/bin/dev-cli.js loop-status --session "$session_id" 2>/dev/null) || true
if [ -z "$status" ]; then
    exit 0  # No active loop
fi

loop_type=$(printf '%s' "$status" | jq -r '.type // empty')
if [ "$loop_type" != "rv" ]; then
    exit 0  # Not an rv loop
fi

# Tick the loop — dev-cli evaluates counter and returns decision
result=$(node dev-cli/bin/dev-cli.js loop-tick --session "$session_id" 2>/dev/null)
decision=$(printf '%s' "$result" | jq -r '.decision // "allow"')

if [ "$decision" = "block" ]; then
    reason=$(printf '%s' "$result" | jq -r '.reason // "Re-validate required"')
    cat << EOF
{
  "decision": "block",
  "reason": $(printf '%s' "$reason" | jq -Rs .)
}
EOF
    exit 0
fi

# allow — loop completed
exit 0
