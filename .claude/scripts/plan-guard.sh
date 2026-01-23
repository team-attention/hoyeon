#!/bin/bash
# plan-guard.sh - PreToolUse[Edit|Write] hook for /dev.specify skill
#
# Purpose: Block file modifications outside .dev/ directory during planning
# Activation: Only when .claude/specify-active.lock exists (set by specify-init-hook.sh)
#
# Hook Input Fields (PreToolUse):
#   - tool_name: string (Edit, Write, etc.)
#   - tool_input: object (file_path, content, etc.)
#   - cwd: string (current working directory)

set -euo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Extract cwd and file path
CWD=$(echo "$INPUT" | jq -r '.cwd')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Check if specify mode is active (state file exists)
STATE_FILE="$CWD/.claude/specify-active.lock"

if [[ ! -f "$STATE_FILE" ]]; then
  # No active specify session - allow all operations
  exit 0
fi

# Validate session_id to handle stale locks from crashed sessions
CURRENT_SESSION=$(echo "$INPUT" | jq -r '.session_id')
LOCK_SESSION=$(grep 'session_id:' "$STATE_FILE" 2>/dev/null | sed 's/session_id: *//' || echo "")

if [[ -n "$LOCK_SESSION" ]] && [[ "$LOCK_SESSION" != "$CURRENT_SESSION" ]]; then
  # Stale lock from different session - remove and allow
  rm "$STATE_FILE"
  echo "📋 Specify mode: Removed stale lock (session mismatch)" >&2
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
