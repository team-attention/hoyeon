#!/bin/bash
# ultrawork-init-hook.sh - UserPromptSubmit hook
#
# Purpose: Initialize ultrawork state with correct session_id
# Activation: UserPromptSubmit when user types "/ultrawork"
#
# Hook Input Fields (UserPromptSubmit):
#   - session_id: actual Claude Code session ID
#   - cwd: current working directory
#   - prompt: user's input text

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract fields
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // ""')

# Check if this is an ultrawork command
if ! echo "$PROMPT" | grep -qiE "^/ultrawork|^ultrawork"; then
  exit 0
fi

# Initialize state file
STATE_FILE="$CWD/.dev/state.local.json"
mkdir -p "$CWD/.dev"

if [[ ! -f "$STATE_FILE" ]]; then
  echo '{}' > "$STATE_FILE"
fi

# Check if session already has ultrawork state
EXISTING=$(jq -r --arg sid "$SESSION_ID" '.[$sid].ultrawork // empty' "$STATE_FILE" 2>/dev/null || echo "")

if [[ -n "$EXISTING" ]] && [[ "$EXISTING" != "null" ]]; then
  # Already initialized
  exit 0
fi

# Initialize ultrawork state with actual session_id
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TEMP_FILE="${STATE_FILE}.tmp.$$"

jq --arg sid "$SESSION_ID" \
   --arg ts "$TIMESTAMP" \
   '.[$sid] = {
     "created_at": $ts,
     "agents": {},
     "ultrawork": {
       "phase": "specify_interview",
       "iteration": 0,
       "max_iterations": 10
     }
   }' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

echo "🚀 Ultrawork initialized (session: ${SESSION_ID:0:8}...)" >&2

exit 0
