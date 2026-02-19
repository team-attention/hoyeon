#!/bin/bash
# rph-cleanup.sh - SessionEnd hook for Ralph Loop state cleanup
#
# Fires on normal session end (logout, /clear, exit).
# Also cleans orphan state files older than 1 hour from crashed sessions.

STATE_DIR="$HOME/.claude/.hook-state"

# Read JSON from stdin
input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    session_id="unknown"
fi

# Clean up this session's state files
rm -f "$STATE_DIR/rph-$session_id.json"
rm -f "$STATE_DIR/rph-$session_id-dod.md"
rm -f "$STATE_DIR/rph-$session_id-verify"

# Clean up rv state for this session too
rm -f "$STATE_DIR/rv-mode-$session_id"

# Clean orphan state files older than 1 hour (from crashed sessions)
find "$STATE_DIR" -name "rph-*" -type f -mmin +60 -delete 2>/dev/null
find "$STATE_DIR" -name "rv-mode-*" -type f -mmin +60 -delete 2>/dev/null

exit 0
