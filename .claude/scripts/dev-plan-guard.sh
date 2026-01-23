#!/bin/bash
# dev-plan-guard.sh - PreToolUse[Edit|Write] hook for /dev.specify skill
#
# Purpose: Block file modifications outside .dev/ directory during planning
# Activation: Session exists in state.local.json without execute field (specify mode)
#
# Hook Input Fields (PreToolUse):
#   - tool_name: string (Edit, Write, etc.)
#   - tool_input: object (file_path, content, etc.)
#   - session_id: current session
#   - cwd: string (current working directory)

set -euo pipefail

# Read JSON input from stdin
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

# Check if this session exists
SESSION_DATA=$(jq -r --arg sid "$SESSION_ID" '.[$sid] // empty' "$STATE_FILE")

if [[ -z "$SESSION_DATA" ]] || [[ "$SESSION_DATA" == "null" ]]; then
  # Session not found - allow all operations
  exit 0
fi

# Check if this is specify mode (no execute field)
HAS_EXECUTE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute // empty' "$STATE_FILE")

if [[ -n "$HAS_EXECUTE" ]] && [[ "$HAS_EXECUTE" != "null" ]]; then
  # Has execute field - not specify mode, let orchestrator-guard handle it
  exit 0
fi

# Specify mode active - enforce path restrictions
if [[ "$FILE_PATH" == *".dev/"* ]]; then
  # Allow modifications inside .dev/ (drafts/, specs/, etc.)
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
EOF
else
  # Block modifications outside .dev/
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny"
  },
  "systemMessage": "PLAN MODE: Code modification not allowed! During /dev.specify phase, you cannot write implementation code. Allowed paths: .dev/specs/. Implementation should be delegated after plan approval."
}
EOF
fi
