#!/bin/bash
# dev-orchestrator-guard.sh - PreToolUse[Edit|Write] hook for /dev.execute skill
#
# Purpose: Warn when Orchestrator tries to modify files directly
# Activation: Session exists in state.local.json with execute field
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

# State file path
STATE_FILE="$CWD/.dev/state.local.json"

if [[ ! -f "$STATE_FILE" ]]; then
  # No state file - allow all operations
  exit 0
fi

# Check if this session has execute field
HAS_EXECUTE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute // empty' "$STATE_FILE")

if [[ -z "$HAS_EXECUTE" ]] || [[ "$HAS_EXECUTE" == "null" ]]; then
  # No execute field - not execute mode
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
