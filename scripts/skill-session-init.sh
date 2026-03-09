#!/bin/bash
# skill-session-init.sh — Unified session registration hook
#
# Registered for BOTH:
#   - UserPromptSubmit (user types "/execute", "/specify", etc.)
#   - PreToolUse[Skill] (code calls Skill("execute"), Skill("specify"), etc.)
#
# Writes: ~/.hoyeon/{session_id}/state.json
# Read by: skill-session-stop.sh, skill-session-guard.sh, skill-session-cleanup.sh
#
# Session dir structure:
#   ~/.hoyeon/{session_id}/
#   ├── state.json   # unified state
#   ├── files/       # non-JSON artifacts (dod.md, flag files)
#   └── tmp/         # skill temp files (dev-scan output, etc.)
#
# Idempotent: later calls merge into state.json (preserves existing namespaces like .ralph, .rv, .rulph)

set -euo pipefail

HOOK_INPUT=$(cat)

SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
HOOK_EVENT=$(echo "$HOOK_INPUT" | jq -r '.hook_event_name')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // ""')
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // ""')
SKILL_ARGS=$(echo "$HOOK_INPUT" | jq -r '.tool_input.args // ""')

# ── Always inject session ID on UserPromptSubmit (stdout → Claude context) ──
if [[ "$HOOK_EVENT" == "UserPromptSubmit" ]]; then
  echo "CLAUDE_SESSION_ID=$SESSION_ID"
fi

# ── Detect skill + args from either path ──

DETECTED_SKILL=""
DETECTED_ARGS=""

# Path 1: PreToolUse[Skill] — tool_input is authoritative
if [[ -n "$SKILL_NAME" ]]; then
  case "$SKILL_NAME" in
    execute|dev.execute)  DETECTED_SKILL="execute" ;;
    specify|dev.specify)  DETECTED_SKILL="specify" ;;
    *)                    DETECTED_SKILL="$SKILL_NAME" ;;
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
  elif echo "$PROMPT" | grep -qiE "^/[a-z]"; then
    DETECTED_SKILL=$(echo "$PROMPT" | sed -E 's|^/([^ ]+).*|\1|' | tr '[:upper:]' '[:lower:]' | head -c 50)
    DETECTED_ARGS=$(echo "$PROMPT" | sed -E 's|^/[^ ]+[[:space:]]*||' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 50)
  fi
fi

# Nothing detected → exit
[[ -z "$DETECTED_SKILL" ]] && exit 0

# ── Spec path resolution is handled by each skill's Phase 0 ──
# (execute reads arg → .dev/specs → state.json; specify creates at .dev/specs)
# Hook does NOT write spec — skills register it via cli session set

# ── Write session state ──

SESSION_DIR="$HOME/.hoyeon/$SESSION_ID"
mkdir -p "$SESSION_DIR/files" "$SESSION_DIR/tmp"

STATE_FILE="$SESSION_DIR/state.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Merge into existing state.json (preserves .ralph, .rv, .rulph, .spec)
TEMP_FILE="${STATE_FILE}.tmp.$$"
if [[ -f "$STATE_FILE" ]]; then
  jq \
    --arg skill "$DETECTED_SKILL" \
    --arg started_at "$TIMESTAMP" \
    --arg cwd "$CWD" \
    '. + {skill: $skill, started_at: $started_at, cwd: $cwd}' \
    "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
else
  jq -n \
    --arg skill "$DETECTED_SKILL" \
    --arg started_at "$TIMESTAMP" \
    --arg cwd "$CWD" \
    '{skill: $skill, started_at: $started_at, cwd: $cwd}' \
    > "$STATE_FILE"
fi

echo "📋 Session registered: $DETECTED_SKILL" >&2

exit 0
