#!/bin/bash
# ultrawork-prompt-hook.sh - UserPromptSubmit hook
#
# Purpose: Initialize ultrawork state when /ultrawork or "ultrawork" keyword is typed
# Activation: UserPromptSubmit event + prompt matches /ultrawork or contains "ultrawork"

set -euo pipefail

HOOK_INPUT=$(cat)

PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // empty')

# Process /ultrawork command or "ultrawork" keyword (case-insensitive)
if [[ ! "$PROMPT" =~ ^[[:space:]]*/ultrawork ]] && [[ ! "$PROMPT" =~ [Uu]ltrawork ]]; then
  exit 0
fi

CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# Extract feature name from prompt
# For /ultrawork: take args after command
# For keyword: try to extract from context
if [[ "$PROMPT" =~ ^[[:space:]]*/ultrawork ]]; then
  ARGS=$(echo "$PROMPT" | sed -E 's|^[[:space:]]*/ultrawork[[:space:]]*||')
else
  # For keyword match, extract words after "ultrawork"
  ARGS=$(echo "$PROMPT" | sed -E 's|.*[Uu]ltrawork[[:space:]]*||')
fi

FEATURE_NAME=""
if [[ -n "$ARGS" ]]; then
  FEATURE_NAME=$(echo "$ARGS" | sed 's/^[[:space:]"]*//;s/[[:space:]"]*$//' | awk '{print $1}')
fi
if [[ -z "$FEATURE_NAME" ]]; then
  FEATURE_NAME="unnamed-feature"
fi
FEATURE_NAME=$(echo "$FEATURE_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')

# State file
STATE_FILE="$CWD/.dev/state.local.json"
mkdir -p "$CWD/.dev"
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{}' > "$STATE_FILE"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)

# Initialize ultrawork state
TEMP_FILE="${STATE_FILE}.tmp.$$"
jq --arg sid "$SESSION_ID" \
   --arg ts "$TIMESTAMP" \
   --arg name "$FEATURE_NAME" \
   '
   .[$sid] = {
     "created_at": $ts,
     "agents": {},
     "ultrawork": {
       "name": $name,
       "phase": "specify_interview",
       "iteration": 0,
       "max_iterations": 10
     }
   }
   ' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

echo "🚀 Ultrawork: Initialized for '$FEATURE_NAME' (session: ${SESSION_ID:0:8}...)" >&2

exit 0
