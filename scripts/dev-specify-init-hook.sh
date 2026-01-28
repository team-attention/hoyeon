#!/bin/bash
# dev-specify-init-hook.sh - PreToolUse[Skill] hook
#
# Purpose: Register session in .dev/state.local.json when /dev.specify starts
# Activation: tool_name="Skill" && tool_input.skill="dev.specify"
#
# Hook Input Fields (PreToolUse):
#   - tool_name: "Skill"
#   - tool_input.skill: skill name (e.g., "specify")
#   - session_id: current session
#   - cwd: current working directory

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract skill name from tool_input
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty')

# Only process specify skill (accepts both "specify" and "dev.specify")
if [[ "$SKILL_NAME" != "specify" && "$SKILL_NAME" != "dev.specify" ]]; then
  exit 0
fi

# Extract fields
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# State file path
STATE_FILE="$CWD/.dev/state.local.json"

# Ensure .dev directory exists
mkdir -p "$CWD/.dev"

# Initialize state file if not exists
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{}' > "$STATE_FILE"
fi

# Timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)

# Add session entry (no execute field = specify mode)
TEMP_FILE="${STATE_FILE}.tmp.$$"

jq --arg sid "$SESSION_ID" \
   --arg ts "$TIMESTAMP" \
   '
   if .[$sid] then
     # Session exists, keep it
     .
   else
     # Create new session entry
     .[$sid] = {
       "created_at": $ts,
       "agents": {}
     }
   end
   ' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

echo "📋 Specify mode: Activated (plan-guard enabled)" >&2

exit 0
