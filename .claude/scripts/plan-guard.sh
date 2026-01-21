#!/bin/bash
# plan-guard.sh - PreToolUse[Edit|Write] hook for /spec skill
#
# Purpose: Block file modifications outside .dev/ directory during planning
# Called when: Edit or Write tool is used while /spec skill is active

set -euo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Check if path is within .dev/ directory
if [[ "$FILE_PATH" == *".dev/"* ]]; then
  # Allow modifications inside .dev/ (drafts/, plans/, etc.)
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
  "systemMessage": "PLAN MODE: Code modification not allowed! During /spec phase, you cannot write implementation code. Allowed paths: .dev/drafts/, .dev/specs/. Implementation should be delegated after plan approval."
}
EOF
fi
