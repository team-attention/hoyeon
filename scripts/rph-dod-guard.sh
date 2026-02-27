#!/bin/bash
# rph-dod-guard.sh - PreToolUse[Edit|Write] guard for !rph Ralph Loop
# Thin wrapper: check loop phase via dev-cli loop-status

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$SESSION_ID" ]; then
    SESSION_ID="unknown"
fi

# Only guard dod.md files inside .dev/.loops/
case "$FILE_PATH" in
    */.loops/*/dod.md) ;;
    *) exit 0 ;;
esac

# Check loop status
status=$(node dev-cli/bin/dev-cli.js loop-status --session "$SESSION_ID" 2>/dev/null) || true
if [ -z "$status" ]; then
    exit 0  # No active loop, allow
fi

loop_type=$(printf '%s' "$status" | jq -r '.type // empty')
if [ "$loop_type" != "rph" ]; then
    exit 0  # Not rph, allow
fi

# Check if DoD file exists yet (allow initial creation)
dod_path=$(printf '%s' "$status" | jq -r '.dodPath // empty')
if [ -n "$dod_path" ] && [ ! -f "$dod_path" ]; then
    exit 0  # Allow initial creation
fi

# Check phase: verify phase allows edits
phase=$(printf '%s' "$status" | jq -r '.phase // "work"')
if [ "$phase" = "verify" ]; then
    exit 0  # Verification phase, allow edits
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
