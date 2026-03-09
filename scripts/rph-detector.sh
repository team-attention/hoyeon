#!/bin/bash
# !rph keyword detection -> activate Ralph Loop (DoD-based iterative verification)
# Also handles auto-cleanup when user submits a non-!rph prompt while rph is active

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
DOD_FILE="$SESSION_DIR/files/rph-dod.md"
VERIFY_FLAG="$SESSION_DIR/files/rph-verify"

# Detect !rph keyword
if [[ "$prompt" == *"!rph"* ]]; then
    # Strip !rph from the prompt
    stripped_prompt=$(printf '%s' "$prompt" | sed 's/!rph//g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    # Ensure directories exist
    mkdir -p "$SESSION_DIR/files" "$SESSION_DIR/tmp"

    # Merge .rph namespace into state.json (atomic write)
    if [[ -f "$STATE_FILE" ]]; then
        jq --arg prompt "$stripped_prompt" --arg dod_file "$DOD_FILE" --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          '. + {rph: {prompt: $prompt, iteration: 0, max_iterations: 10, dod_file: $dod_file, created_at: $created_at}}' \
          "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
    else
        jq -n --arg prompt "$stripped_prompt" --arg dod_file "$DOD_FILE" --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
          '{rph: {prompt: $prompt, iteration: 0, max_iterations: 10, dod_file: $dod_file, created_at: $created_at}}' \
          > "$STATE_FILE"
    fi

    # Return minimal additionalContext - just strip keyword and ask for DoD
    # The Stop hook will handle all verification logic
    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Note: Ignore the '!rph' keyword in the prompt - it's a meta-command for the system, not part of the actual request. Before starting the task, ask the user for their Definition of Done criteria using AskUserQuestion, then write them as a '- [ ]' markdown checklist to: $DOD_FILE. IMPORTANT: After creating the DoD file, do NOT read or modify it again during your work. The system will automatically verify the checklist when you finish and prompt you to confirm each item independently."
  }
}
EOF
    exit 0
fi

# No !rph in prompt — check if rph state exists (zombie cleanup)
if [[ -f "$STATE_FILE" ]] && jq -e '.rph' "$STATE_FILE" >/dev/null 2>&1; then
    jq 'del(.rph)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
    rm -f "$DOD_FILE" "$VERIFY_FLAG"
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

exit 0
