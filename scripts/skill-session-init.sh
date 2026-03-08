#!/bin/bash
# skill-session-init.sh — Unified session registration hook
#
# Registered for BOTH:
#   - UserPromptSubmit (user types "/execute", "/specify", etc.)
#   - PreToolUse[Skill] (code calls Skill("execute"), Skill("specify"), etc.)
#
# Writes: ~/.claude/.hook-state/{session_id}.json
# Read by: skill-session-stop.sh, guard hooks
#
# Idempotent: later calls overwrite (PreToolUse has more accurate args than prompt parsing)

set -euo pipefail

HOOK_INPUT=$(cat)

SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // ""')
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // ""')
SKILL_ARGS=$(echo "$HOOK_INPUT" | jq -r '.tool_input.args // ""')

# ── Detect skill + args from either path ──

DETECTED_SKILL=""
DETECTED_ARGS=""

# Path 1: PreToolUse[Skill] — tool_input is authoritative
if [[ -n "$SKILL_NAME" ]]; then
  case "$SKILL_NAME" in
    execute|dev.execute)  DETECTED_SKILL="execute" ;;
    specify|dev.specify)  DETECTED_SKILL="specify" ;;
    simple-execute)                  DETECTED_SKILL="simple-execute" ;;
    simple-specify)                  DETECTED_SKILL="simple-specify" ;;
    *)                               exit 0 ;;
  esac
  DETECTED_ARGS="$SKILL_ARGS"
fi

# Path 2: UserPromptSubmit — prompt text parsing (less precise)
if [[ -z "$DETECTED_SKILL" && -n "$PROMPT" ]]; then
  if echo "$PROMPT" | grep -qiE "^/execute"; then
    DETECTED_SKILL="execute"
    DETECTED_ARGS=$(echo "$PROMPT" | sed -E 's|^/[^ ]+[[:space:]]*||' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 50)
  elif echo "$PROMPT" | grep -qiE "^/specify"; then
    DETECTED_SKILL="specify"
    DETECTED_ARGS=$(echo "$PROMPT" | sed -E 's|^/[^ ]+[[:space:]]*||' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 50)
  elif echo "$PROMPT" | grep -qiE "^/simple-execute"; then
    DETECTED_SKILL="simple-execute"
    DETECTED_ARGS=$(echo "$PROMPT" | sed -E 's|^/[^ ]+[[:space:]]*||' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 50)
  elif echo "$PROMPT" | grep -qiE "^/simple-specify"; then
    DETECTED_SKILL="simple-specify"
    DETECTED_ARGS=$(echo "$PROMPT" | sed -E 's|^/[^ ]+[[:space:]]*||' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 50)
  fi
fi

# Nothing detected → exit
[[ -z "$DETECTED_SKILL" ]] && exit 0

# ── Resolve spec path ──

SPEC_PATH=""
if [[ -n "$DETECTED_ARGS" ]]; then
  CANDIDATE="$CWD/.dev/specs/$DETECTED_ARGS/spec.json"
  if [[ -f "$CANDIDATE" ]]; then
    SPEC_PATH=".dev/specs/$DETECTED_ARGS/spec.json"
  fi
fi

# Fallback: most recently modified spec.json
if [[ -z "$SPEC_PATH" ]]; then
  ABS_SPEC=$(find "$CWD/.dev/specs" -name "spec.json" -maxdepth 2 -print0 2>/dev/null \
    | xargs -0 stat -f '%m %N' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)
  if [[ -n "$ABS_SPEC" ]]; then
    SPEC_PATH="${ABS_SPEC#$CWD/}"
  fi
fi

# ── Write session state ──

STATE_DIR="$HOME/.claude/.hook-state"
mkdir -p "$STATE_DIR"

STATE_FILE="$STATE_DIR/$SESSION_ID.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

jq -n \
  --arg skill "$DETECTED_SKILL" \
  --arg spec "$SPEC_PATH" \
  --arg started_at "$TIMESTAMP" \
  --arg cwd "$CWD" \
  '{
    skill: $skill,
    spec: $spec,
    started_at: $started_at,
    cwd: $cwd
  }' > "$STATE_FILE"

echo "📋 Session registered: $DETECTED_SKILL (spec: ${SPEC_PATH:-none})" >&2

exit 0
