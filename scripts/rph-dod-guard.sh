#!/bin/bash
# rph-dod-guard.sh - PreToolUse[Edit|Write] hook for !rph Ralph Loop
#
# Purpose: Block DoD file modifications during work phase.
#          Only allow edits during:
#            1. Initial creation (DoD file doesn't exist yet)
#            2. Verification phase (verify flag set by Stop hook)
#
# Hook Input Fields (PreToolUse):
#   - tool_input: object (file_path, content, etc.)
#   - session_id: current session

# Read JSON input from stdin
INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$SESSION_ID" ]; then
    SESSION_ID="unknown"
fi

SESSION_DIR="$HOME/.hoyeon/$SESSION_ID"
STATE_FILE="$SESSION_DIR/state.json"
VERIFY_FLAG="$SESSION_DIR/files/rph-verify"
DOD_FILE="$SESSION_DIR/files/rph-dod.md"

# Only guard DoD files (*/files/rph-dod.md pattern)
case "$FILE_PATH" in
    */files/rph-dod.md) ;;
    *) exit 0 ;;
esac

# Not in rph mode -> allow
if [[ ! -f "$STATE_FILE" ]] || ! jq -e '.rph' "$STATE_FILE" >/dev/null 2>&1; then
    exit 0
fi

# DoD file doesn't exist yet -> allow initial creation
if [ ! -f "$DOD_FILE" ]; then
    exit 0
fi

# Verify flag exists -> allow (Stop hook authorized verification)
if [ -f "$VERIFY_FLAG" ]; then
    exit 0
fi

# Work phase: block DoD edits
cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny"
  },
  "systemMessage": "RPH GUARD: You cannot modify the DoD file during work. The system will prompt you to verify items when you finish. Continue with the actual task."
}
EOF

exit 0
