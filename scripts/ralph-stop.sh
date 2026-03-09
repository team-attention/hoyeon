#!/bin/bash
# Ralph Loop Stop hook - DoD verification with prompt re-injection
# Blocks Claude from stopping if unchecked DoD items remain.
# Re-injects original prompt via "reason" field (like official ralph-wiggum).
# Verification status goes in "systemMessage" (separated concerns).

# Read JSON from stdin
input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
    exit 0
fi

SESSION_DIR="$HOME/.hoyeon/$session_id"
STATE_FILE="$SESSION_DIR/state.json"
DOD_FILE="$SESSION_DIR/files/ralph-dod.md"
VERIFY_FLAG="$SESSION_DIR/files/ralph-verify"

# No state file or no .ralph namespace = not in Ralph Loop
if [[ ! -f "$STATE_FILE" ]] || ! jq -e '.ralph' "$STATE_FILE" >/dev/null 2>&1; then
    exit 0
fi

# Read state
iteration=$(jq -r '.ralph.iteration // 0' "$STATE_FILE")
max_iterations=$(jq -r '.ralph.max_iterations // 10' "$STATE_FILE")
original_prompt=$(jq -r '.ralph.prompt // ""' "$STATE_FILE")
iteration=$((iteration + 1))

# Update iteration count (atomic write)
jq --argjson iter "$iteration" '.ralph.iteration = $iter' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"

# Safety: max iterations exceeded -> force cleanup and allow exit
if [ "$iteration" -gt "$max_iterations" ]; then
    jq 'del(.ralph)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
    rm -f "$DOD_FILE" "$VERIFY_FLAG"
    jq -n \
      --argjson iter "$max_iterations" \
      '{decision: "block", reason: ("RALPH LOOP: Circuit breaker fired — max iterations (" + ($iter|tostring) + ") exceeded. Force-stopping. Please review the task manually."), systemMessage: "Ralph loop terminated by circuit breaker. State cleaned up."}'
    exit 0
fi

# Check if DoD file exists
if [ ! -f "$DOD_FILE" ]; then
    jq -n \
      --arg prompt "$original_prompt" \
      --argjson iter "$iteration" \
      --argjson max "$max_iterations" \
      '{decision: "block", reason: $prompt, systemMessage: ("Ralph iteration " + ($iter|tostring) + "/" + ($max|tostring) + ". DoD file not found! Create the Definition of Done checklist first.")}'
    exit 0
fi

# Count unchecked and checked items
unchecked=$(grep -c '^[[:space:]]*[-*] \[ \]' "$DOD_FILE" 2>/dev/null || true)
[ -z "$unchecked" ] && unchecked=0
checked=$(grep -c '^[[:space:]]*[-*] \[[xX]\]' "$DOD_FILE" 2>/dev/null || true)
[ -z "$checked" ] && checked=0
total=$((unchecked + checked))

# No checklist items found
if [ "$total" -eq 0 ]; then
    jq -n \
      --arg prompt "$original_prompt" \
      --argjson iter "$iteration" \
      --argjson max "$max_iterations" \
      '{decision: "block", reason: $prompt, systemMessage: ("Ralph iteration " + ($iter|tostring) + "/" + ($max|tostring) + ". DoD file exists but has no checklist items. Write proper criteria as - [ ] items.")}'
    exit 0
fi

# Unchecked items remain -> set verify flag + block with prompt re-injection
if [ "$unchecked" -gt 0 ]; then
    # Create verify flag so ralph-dod-guard.sh allows DoD edits during verification
    touch "$VERIFY_FLAG"

    remaining=$(grep '^[[:space:]]*[-*] \[ \]' "$DOD_FILE" | sed 's/^[[:space:]]*[-*] \[ \] /  - /')

    jq -n \
      --arg prompt "$original_prompt" \
      --argjson iter "$iteration" \
      --argjson max "$max_iterations" \
      --argjson unchecked "$unchecked" \
      --argjson total "$total" \
      --arg items "$remaining" \
      '{
        decision: "block",
        reason: $prompt,
        systemMessage: ("Ralph iteration " + ($iter|tostring) + "/" + ($max|tostring) + ". " + ($unchecked|tostring) + " of " + ($total|tostring) + " DoD items NOT verified.\n\nINDEPENDENTLY VERIFY each remaining item — read actual files, run code, check real state. Do NOT assume done. Change - [ ] to - [x] for each verified item.\n\nRemaining:\n" + $items)
      }'
    exit 0
fi

# All items checked -> cleanup and allow stop
jq 'del(.ralph)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
rm -f "$DOD_FILE" "$VERIFY_FLAG"
exit 0
