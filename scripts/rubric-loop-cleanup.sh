#!/bin/bash
# rubric-loop-cleanup.sh - SessionEnd hook
#
# Purpose: Clean up rubric-loop state file when session ends
# Prevents orphan state from blocking future sessions

STATE_DIR="$HOME/.claude/.hook-state"

# Read hook input from stdin
input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
  session_id="unknown"
fi

# Remove session-scoped state file if it exists
rm -f "$STATE_DIR/rubric-loop-$session_id.json"

exit 0
