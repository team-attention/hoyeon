#!/bin/bash
# Ralph Loop Stop hook - delegates to dev-cli loop-tick
# Thin wrapper: call loop-tick, output its decision

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    session_id="unknown"
fi

# Check if there's an active rph loop
status=$(node dev-cli/bin/dev-cli.js loop-status --session "$session_id" 2>/dev/null) || true
if [ -z "$status" ]; then
    exit 0  # No active loop
fi

loop_type=$(printf '%s' "$status" | jq -r '.type // empty')
if [ "$loop_type" != "rph" ]; then
    exit 0  # Not an rph loop
fi

# Tick the loop — dev-cli evaluates DoD and returns decision
result=$(node dev-cli/bin/dev-cli.js loop-tick --session "$session_id" 2>/dev/null)
decision=$(printf '%s' "$result" | jq -r '.decision // "allow"')

if [ "$decision" = "block" ]; then
    reason=$(printf '%s' "$result" | jq -r '.reason // "DoD items remaining"')
    jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
    exit 0
fi

# allow — loop completed, exit normally
exit 0
