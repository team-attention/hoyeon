#!/bin/bash
# dev-specify-stop-hook.sh - Stop hook
#
# Purpose: Remove session from .dev/state.local.json when specify session ends
# Activation: Stop event + session has no execute field (specify mode)
#
# Hook Input Fields (Stop):
#   - session_id: current session
#   - cwd: current working directory

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract fields
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# State file path
STATE_FILE="$CWD/.dev/state.local.json"

if [[ ! -f "$STATE_FILE" ]]; then
  # No state file
  exit 0
fi

# Clean up stale sessions (older than 24 hours)
CUTOFF=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '24 hours ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
if [[ -n "$CUTOFF" ]]; then
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg cutoff "$CUTOFF" '
    to_entries | map(select(.value.created_at > $cutoff or .value.created_at == null)) | from_entries
  ' "$STATE_FILE" > "$TEMP_FILE" 2>/dev/null && mv "$TEMP_FILE" "$STATE_FILE" || true
fi

# Check if this session exists and is in specify mode (no execute field)
SESSION_DATA=$(jq -r --arg sid "$SESSION_ID" '.[$sid] // empty' "$STATE_FILE")

if [[ -z "$SESSION_DATA" ]] || [[ "$SESSION_DATA" == "null" ]]; then
  # Session not found
  exit 0
fi

# Check if this is specify mode (no execute field)
HAS_EXECUTE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute // empty' "$STATE_FILE")

if [[ -n "$HAS_EXECUTE" ]] && [[ "$HAS_EXECUTE" != "null" ]]; then
  # Has execute field - let execute-stop-hook handle it
  exit 0
fi

# Specify mode - remove session
TEMP_FILE="${STATE_FILE}.tmp.$$"
jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

echo "📋 Specify mode: Deactivated (plan-guard disabled)" >&2

exit 0
