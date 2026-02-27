#!/bin/bash
# !rv keyword detection -> activate re-validate mode via dev-cli loop-init
# Thin wrapper: detect keyword, delegate state to dev-cli

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    session_id="unknown"
fi

# Detect !rv, !rv2, !rv3, etc.
if [[ "$prompt" =~ \!rv([0-9]*) ]]; then
    count="${BASH_REMATCH[1]}"
    if [ -z "$count" ] || [ "$count" -lt 1 ] 2>/dev/null; then
        count=1
    fi

    node dev-cli/bin/dev-cli.js loop-init --type rv --session "$session_id" --count "$count" >/dev/null 2>&1

    cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Note: Ignore the '!rv' keyword in the prompt - it's a meta-command for the system, not part of the actual request."
  }
}
EOF
fi

exit 0
