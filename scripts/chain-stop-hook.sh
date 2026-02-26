#!/bin/bash
# chain-stop-hook.sh — Stop hook
# Blocks session end if active chain has uncompleted steps.
#
# Registration in settings.json:
#   { "type": "command", "command": ".claude/scripts/chain-stop-hook.sh" }
#
# Conflict avoidance:
#   - Only activates when chain-status returns a running chain
#   - Does not interfere with dev-execute-stop, rv-validator, rph-loop
#   - Those hooks check for their own state files, not chain state

set -euo pipefail

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
  exit 0
fi

# Query active chain for this session
status_exit=0
status=$(node dev-cli/bin/dev-cli.js chain-status --session "$session_id" 2>/dev/null) || status_exit=$?
if [ "$status_exit" -ne 0 ]; then
  exit 0  # No chain → allow stop
fi

chain_status=$(echo "$status" | jq -r '.status')
remaining=$(echo "$status" | jq -r '.remainingSteps')
chain_id=$(echo "$status" | jq -r '.chainId')

if [ "$chain_status" = "running" ] && [ "$remaining" -gt 0 ]; then
  jq -n \
    --arg reason "ACTION CHAIN IN PROGRESS (chainId: $chain_id): $remaining steps remaining.\n\nComplete the remaining steps or abandon the chain:\n  node dev-cli/bin/dev-cli.js chain-complete $chain_id --force" \
    '{ decision: "block", reason: $reason }'
  exit 0
fi

# Chain completed/failed/abandoned → allow stop
exit 0
