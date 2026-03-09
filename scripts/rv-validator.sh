#!/bin/bash
# If re-validate mode is active, block and force re-validation
# Decrements remaining count each time; removes state when 0

# Read JSON from stdin
input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

# Fallback if session_id missing
if [ -z "$session_id" ]; then
    session_id="unknown"
fi

SESSION_DIR="$HOME/.hoyeon/$session_id"
STATE_FILE="$SESSION_DIR/state.json"

if [[ -f "$STATE_FILE" ]] && jq -e '.rv' "$STATE_FILE" >/dev/null 2>&1; then
    remaining=$(jq -r '.rv.remaining // 0' "$STATE_FILE")

    # Decrement
    remaining=$((remaining - 1))

    if [ "$remaining" -le 0 ]; then
        # Last round - remove rv namespace from state
        jq 'del(.rv)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
    else
        # More rounds remaining - update count
        jq --argjson r "$remaining" '.rv.remaining = $r' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
    fi

    # Block and demand re-verification
    cat << EOF
{
  "decision": "block",
  "reason": "WAIT! You are lying or hallucinating! Go back and verify EVERYTHING you just said. Check the actual code, re-read the files, and make sure you're not making things up. I don't trust you yet! (Re-validation remaining: $remaining)"
}
EOF
    exit 0
fi

# Normal exit if not in rv mode
exit 0
