#!/bin/bash
# dev-orchestrator-guard.sh - PreToolUse[Edit|Write] hook for /dev.execute skill
#
# Purpose: Warn when Orchestrator tries to modify files directly
# Detection: Reads skill from state.json (via active-spec + session.ref resolution)
#
# Orchestrator should DELEGATE implementation to SubAgents, not write code directly.
# This hook allows the action but warns the user to use Task() instead.
#
# Hook Input Fields (PreToolUse):
#   - tool_input: { file_path, ... }
#   - session_id: current session
#   - cwd: current working directory

set -euo pipefail

INPUT=$(cat)

# Extract fields
CWD=$(echo "$INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# ============================================================
# DETECTION: Resolve state.json via active-spec + session.ref
# ============================================================

ACTIVE_SPEC_FILE="$CWD/.dev/active-spec"
if [[ ! -f "$ACTIVE_SPEC_FILE" ]]; then
  exit 0
fi
SPEC_NAME=$(cat "$ACTIVE_SPEC_FILE")

# Resolve state.json via session.ref
SESSION_REF="$CWD/.dev/specs/$SPEC_NAME/session.ref"
if [[ -f "$SESSION_REF" ]]; then
  SID=$(cat "$SESSION_REF")
  STATE_JSON="$CWD/.dev/.sessions/$SID/state.json"
else
  STATE_JSON="$CWD/.dev/specs/$SPEC_NAME/state.json"
fi

if [[ ! -f "$STATE_JSON" ]]; then
  exit 0
fi

SKILL=$(jq -r '.skill // empty' "$STATE_JSON")
if [[ "$SKILL" != "execute" ]]; then
  exit 0
fi

# Execute mode active - enforce orchestrator rules
# Allow .dev/ internal files (Plan checkbox updates, notepad, etc.)
if [[ "$FILE_PATH" == *".dev/"* ]]; then
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
EOF
else
  # For other files, warn (allow + message, don't block)
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  },
  "systemMessage": "⚠️ ORCHESTRATOR WARNING: Orchestrator is the conductor. Do not modify code directly. Instead, delegate to worker agent using Task()."
}
EOF
fi
