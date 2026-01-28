#!/bin/bash
# dev-execute-init-hook.sh - PreToolUse[Skill] hook
#
# Purpose: Register session with execute state in .dev/state.local.json
# Activation: tool_name="Skill" && tool_input.skill="dev.execute"
#
# Hook Input Fields (PreToolUse):
#   - tool_input.skill: skill name
#   - tool_input.args: skill arguments (plan name)
#   - session_id: current session
#   - cwd: current working directory

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract skill name from tool_input
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty')

# Only process execute skill (accepts both "execute" and "dev.execute")
if [[ "$SKILL_NAME" != "execute" && "$SKILL_NAME" != "dev.execute" ]]; then
  exit 0
fi

# Extract fields
ARGS=$(echo "$HOOK_INPUT" | jq -r '.tool_input.args // empty')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# Determine plan name from args or git branch
if [[ -n "$ARGS" ]]; then
  PLAN_NAME="$ARGS"
else
  PLAN_NAME=$(cd "$CWD" && git branch --show-current 2>/dev/null | sed 's|.*/||' || echo "default")
  if [[ -z "$PLAN_NAME" ]]; then
    PLAN_NAME="default"
  fi
fi

# Build plan path
PLAN_PATH=".dev/specs/$PLAN_NAME/PLAN.md"

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

# Clean up stale sessions (older than 24 hours)
TEMP_FILE="${STATE_FILE}.tmp.$$"
CUTOFF=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '24 hours ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")

if [[ -n "$CUTOFF" ]]; then
  jq --arg cutoff "$CUTOFF" '
    to_entries | map(select(.value.created_at > $cutoff or .value.created_at == null)) | from_entries
  ' "$STATE_FILE" > "$TEMP_FILE" 2>/dev/null && mv "$TEMP_FILE" "$STATE_FILE" || true
fi

# Add or update session with execute state (atomic write)
TEMP_FILE="${STATE_FILE}.tmp.$$"

jq --arg sid "$SESSION_ID" \
   --arg ts "$TIMESTAMP" \
   --arg plan_path "$PLAN_PATH" \
   --argjson max_iter 30 \
   '
   .[$sid] = ((.[$sid] // {}) + {
     "created_at": (if .[$sid].created_at then .[$sid].created_at else $ts end),
     "execute": {
       "iteration": (if .[$sid].execute.iteration then .[$sid].execute.iteration else 0 end),
       "max_iterations": $max_iter,
       "plan_path": $plan_path
     },
     "agents": (if .[$sid].agents then .[$sid].agents else {} end)
   })
   ' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

echo "📋 Execute init: Registered session for plan '$PLAN_NAME'" >&2

exit 0
