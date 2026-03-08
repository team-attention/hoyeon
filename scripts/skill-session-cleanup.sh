#!/bin/bash
# skill-session-cleanup.sh — SessionEnd cleanup
#
# Removes ~/.claude/.hook-state/{session_id}.json on session end.
# Safety net for sessions that didn't clean up normally.

set -euo pipefail

HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

STATE_FILE="$HOME/.claude/.hook-state/$SESSION_ID.json"
rm -f "$STATE_FILE"

exit 0
