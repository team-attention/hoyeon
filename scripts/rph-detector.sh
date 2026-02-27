#!/bin/bash
# !rph keyword detection -> activate Ralph Loop via dev-cli loop-init
# Thin wrapper: detect keyword, delegate state to dev-cli

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    session_id="unknown"
fi

# Detect !rph keyword
if [[ "$prompt" == *"!rph"* ]]; then
    # Create loop via dev-cli
    result=$(node dev-cli/bin/dev-cli.js loop-init --type rph --session "$session_id" 2>/dev/null)
    if [ $? -ne 0 ]; then
        exit 0
    fi

    dod_path=$(printf '%s' "$result" | jq -r '.dodPath // empty')

    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Note: Ignore the '!rph' keyword in the prompt - it's a meta-command for the system, not part of the actual request. Before starting the task, ask the user for their Definition of Done criteria using AskUserQuestion, then write them as a '- [ ]' markdown checklist to: $dod_path. IMPORTANT: After creating the DoD file, do NOT read or modify it again during your work. The system will automatically verify the checklist when you finish and prompt you to confirm each item independently."
  }
}
EOF
    exit 0
fi

# No !rph in prompt — check if loop is active (zombie cleanup)
status=$(node dev-cli/bin/dev-cli.js loop-status --session "$session_id" 2>/dev/null) || true
if [ -n "$status" ]; then
    loop_type=$(printf '%s' "$status" | jq -r '.type // empty')
    if [ "$loop_type" = "rph" ]; then
        node dev-cli/bin/dev-cli.js loop-complete --session "$session_id" --force >/dev/null 2>&1 || true
        cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Note: A previous !rph loop was active but has been cancelled since this prompt does not contain !rph. State cleaned up. Proceed with the current request normally."
  }
}
EOF
        exit 0
    fi
fi

exit 0
