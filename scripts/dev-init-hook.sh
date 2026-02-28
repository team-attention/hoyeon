#!/bin/bash
# dev-init-hook.sh - Unified init hook (UserPromptSubmit + PreToolUse[Skill])
#
# Purpose: Initialize session state for /specify, /execute
# Idempotent: safe to call multiple times per session
#
# Supported events:
#   - UserPromptSubmit: user types /specify, /execute
#   - PreToolUse[Skill]: code calls Skill("specify"), Skill("execute")

set -euo pipefail

HOOK_INPUT=$(cat)

CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# Detect which skill to init from either prompt text or tool_input
PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // ""')
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // ""')
SKILL_ARGS=$(echo "$HOOK_INPUT" | jq -r '.tool_input.args // ""')

# Determine mode from prompt or skill name
MODE=""
FEATURE_NAME=""

if echo "$PROMPT" | grep -qiE "^/specify|^specify"; then
  MODE="specify"
elif echo "$PROMPT" | grep -qiE "^/execute|^execute"; then
  MODE="execute"
  # Strip command prefix, then remove --* flags, trim, convert spaces to hyphens
  FEATURE_NAME=$(echo "$PROMPT" | sed -E 's/^\/?(execute|EXECUTE)[[:space:]]+//i' | sed -E 's/--[a-zA-Z][-a-zA-Z]*//g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 50)
elif [[ "$SKILL_NAME" == "specify" || "$SKILL_NAME" == "dev.specify" ]]; then
  MODE="specify"
elif [[ "$SKILL_NAME" == "execute" || "$SKILL_NAME" == "dev.execute" ]]; then
  MODE="execute"
  FEATURE_NAME="$SKILL_ARGS"
fi

# No matching mode → exit
if [[ -z "$MODE" ]]; then
  exit 0
fi

# --- State file setup ---
STATE_FILE="$CWD/.dev/state.local.json"
mkdir -p "$CWD/.dev"

if [[ ! -f "$STATE_FILE" ]]; then
  echo '{}' > "$STATE_FILE"
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TEMP_FILE="${STATE_FILE}.tmp.$$"

# --- Idempotency check ---
EXISTING_SESSION=$(jq -r --arg sid "$SESSION_ID" '.[$sid] // empty' "$STATE_FILE" 2>/dev/null || echo "")

case "$MODE" in
  specify)
    # Skip if session already exists
    if [[ -n "$EXISTING_SESSION" && "$EXISTING_SESSION" != "null" ]]; then
      exit 0
    fi
    jq --arg sid "$SESSION_ID" \
       --arg ts "$TIMESTAMP" \
       '.[$sid] = {
         "created_at": $ts,
         "agents": {}
       }' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
    echo "📋 Specify mode: Activated (plan-guard enabled)" >&2
    ;;

  execute)
    # Skip if execute already initialized
    EXISTING_EX=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute // empty' "$STATE_FILE" 2>/dev/null || echo "")
    if [[ -n "$EXISTING_EX" && "$EXISTING_EX" != "null" ]]; then
      exit 0
    fi
    # Determine plan name
    if [[ -z "$FEATURE_NAME" ]]; then
      FEATURE_NAME=$(cd "$CWD" && git branch --show-current 2>/dev/null | sed 's|.*/||' || echo "default")
      [[ -z "$FEATURE_NAME" ]] && FEATURE_NAME="default"
    fi
    PLAN_PATH=".dev/specs/$FEATURE_NAME/PLAN.md"

    # Clean stale sessions (>24h)
    CUTOFF=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
    if [[ -n "$CUTOFF" ]]; then
      jq --arg cutoff "$CUTOFF" '
        to_entries | map(select(.value.created_at > $cutoff or .value.created_at == null)) | from_entries
      ' "$STATE_FILE" > "$TEMP_FILE" 2>/dev/null && mv "$TEMP_FILE" "$STATE_FILE" || true
    fi

    TEMP_FILE="${STATE_FILE}.tmp.$$"
    jq --arg sid "$SESSION_ID" \
       --arg ts "$TIMESTAMP" \
       --arg plan_path "$PLAN_PATH" \
       --argjson max_iter 30 \
       '.[$sid] = ((.[$sid] // {}) + {
         "created_at": ((.[$sid].created_at) // $ts),
         "execute": {
           "iteration": ((.[$sid].execute.iteration) // 0),
           "max_iterations": $max_iter,
           "plan_path": $plan_path
         },
         "agents": ((.[$sid].agents) // {})
       })' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
    echo "📋 Execute init: Registered session for plan '$FEATURE_NAME'" >&2
    ;;
esac

exit 0
