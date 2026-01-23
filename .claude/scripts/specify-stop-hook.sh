#!/bin/bash
# specify-stop-hook.sh - Stop hook
#
# Purpose: Remove state file when session ends (cleanup specify mode)
# Activation: Stop event + .claude/specify-active.lock exists
#
# Hook Input Fields (Stop):
#   - session_id: current session
#   - cwd: current working directory
#   - stop_hook_active: boolean

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract cwd and session_id
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
CURRENT_SESSION=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# Check for state file
STATE_FILE="$CWD/.claude/specify-active.lock"

if [[ ! -f "$STATE_FILE" ]]; then
  # No active specify session
  exit 0
fi

# Validate session_id matches
LOCK_SESSION=$(grep 'session_id:' "$STATE_FILE" 2>/dev/null | sed 's/session_id: *//' || echo "")

if [[ -n "$LOCK_SESSION" ]] && [[ "$LOCK_SESSION" != "$CURRENT_SESSION" ]]; then
  # Different session - don't touch
  exit 0
fi

# Same session - cleanup
rm "$STATE_FILE"
echo "📋 Specify mode: Deactivated (plan-guard disabled)" >&2

exit 0
