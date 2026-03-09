#!/bin/bash
# !rv keyword detection -> activate re-validate mode
# Supports !rv (1회), !rv2 (2회), !rv3 (3회) etc.

# Read JSON from stdin
input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

# Fallback if session_id missing
if [ -z "$session_id" ]; then
    session_id="unknown"
fi

SESSION_DIR="$HOME/.hoyeon/$session_id"
STATE_FILE="$SESSION_DIR/state.json"

# Detect !rv, !rv2, !rv3, etc.
if [[ "$prompt" =~ \!rv([0-9]*) ]]; then
    count="${BASH_REMATCH[1]}"
    # Default to 1 if no number specified (!rv alone) or invalid (!rv0)
    if [ -z "$count" ] || [ "$count" -lt 1 ] 2>/dev/null; then
        count=1
    fi

    mkdir -p "$SESSION_DIR/files" "$SESSION_DIR/tmp"
    if [[ -f "$STATE_FILE" ]]; then
        jq --argjson count "$count" '. + {rv: {remaining: $count}}' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
    else
        jq -n --argjson count "$count" '{rv: {remaining: $count}}' > "$STATE_FILE"
    fi

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
