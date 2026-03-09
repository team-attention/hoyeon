#!/bin/bash
# ralph-dod-guard.sh - PreToolUse[Edit|Write] hook for /ralph skill
#
# Blocks DoD file modifications during work phase.
# Allows edits during:
#   1. Initial creation (DoD file doesn't exist yet)
#   2. Verification phase (verify flag set by Stop hook)

# Read JSON input from stdin
INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$SESSION_ID" ]; then
    exit 0
fi

SESSION_DIR="$HOME/.hoyeon/$SESSION_ID"
STATE_FILE="$SESSION_DIR/state.json"
VERIFY_FLAG="$SESSION_DIR/files/ralph-verify"
DOD_FILE="$SESSION_DIR/files/ralph-dod.md"

# Only guard DoD files (*/files/ralph-dod.md pattern)
case "$FILE_PATH" in
    */files/ralph-dod.md) ;;
    *) exit 0 ;;
esac

# Not in ralph mode -> allow
if [[ ! -f "$STATE_FILE" ]] || ! jq -e '.ralph' "$STATE_FILE" >/dev/null 2>&1; then
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
  "systemMessage": "RALPH GUARD: You cannot modify the DoD file during work. Continue with the actual task. The Stop hook will prompt you to verify items when you finish."
}
EOF

exit 0
