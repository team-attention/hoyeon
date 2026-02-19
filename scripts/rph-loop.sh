#!/bin/bash
# Ralph Loop Stop hook - DoD checklist verification
# Blocks Claude from stopping if unchecked DoD items remain
# Uses verify flag to coordinate with rph-dod-guard.sh

STATE_DIR="$HOME/.claude/.hook-state"

# Read JSON from stdin
input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

# Fallback if session_id missing
if [ -z "$session_id" ]; then
    session_id="unknown"
fi

STATE_FILE="$STATE_DIR/rph-$session_id.json"
DOD_FILE="$STATE_DIR/rph-$session_id-dod.md"
VERIFY_FLAG="$STATE_DIR/rph-$session_id-verify"

# No state file = not in Ralph Loop, exit normally
if [ ! -f "$STATE_FILE" ]; then
    exit 0
fi

# Read and increment iteration
iteration=$(jq -r '.iteration // 0' "$STATE_FILE")
max_iterations=$(jq -r '.max_iterations // 10' "$STATE_FILE")
iteration=$((iteration + 1))

# Update iteration count in state file
jq --argjson iter "$iteration" '.iteration = $iter' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

# Safety: max iterations exceeded -> force cleanup and exit
if [ "$iteration" -gt "$max_iterations" ]; then
    rm -f "$STATE_FILE" "$DOD_FILE" "$VERIFY_FLAG"
    jq -n --arg reason "RALPH LOOP: Max iterations ($max_iterations) exceeded. Force-stopping to prevent infinite loop. State cleaned up. Please review the task manually." \
      '{decision: "block", reason: $reason}'
    exit 0
fi

# Check if DoD file exists
if [ ! -f "$DOD_FILE" ]; then
    jq -n --arg reason "RALPH LOOP (iteration $iteration/$max_iterations): DoD file not found! You must create the Definition of Done checklist first. Ask the user for DoD criteria using AskUserQuestion, then write them as a markdown checklist (- [ ] items) to: $DOD_FILE" \
      '{decision: "block", reason: $reason}'
    exit 0
fi

# Count unchecked and checked items (robust: allow indentation, uppercase X, asterisks)
unchecked=$(grep -c '^[[:space:]]*[-*] \[ \]' "$DOD_FILE" 2>/dev/null || true)
[ -z "$unchecked" ] && unchecked=0
checked=$(grep -c '^[[:space:]]*[-*] \[[xX]\]' "$DOD_FILE" 2>/dev/null || true)
[ -z "$checked" ] && checked=0
total=$((unchecked + checked))

# No checklist items found
if [ "$total" -eq 0 ]; then
    jq -n --arg reason "RALPH LOOP (iteration $iteration/$max_iterations): DoD file exists but contains no checklist items (- [ ] or - [x]). Write proper DoD criteria as a markdown checklist." \
      '{decision: "block", reason: $reason}'
    exit 0
fi

# Unchecked items remain -> set verify flag + block with verification instructions
if [ "$unchecked" -gt 0 ]; then
    # Create verify flag so rph-dod-guard.sh allows DoD edits during verification
    touch "$VERIFY_FLAG"

    remaining=$(grep '^[[:space:]]*[-*] \[ \]' "$DOD_FILE" | sed 's/^[[:space:]]*[-*] \[ \] /  - /')
    # Use jq to safely construct JSON (avoids newline/special char issues in $remaining)
    jq -n \
      --arg reason "RALPH LOOP (iteration $iteration/$max_iterations): STOP! $unchecked of $total DoD items are NOT verified. Go back and INDEPENDENTLY VERIFY each item below. Read the actual files, run the code, check the real state. Do NOT just assume they are done. For each verified item, change '- [ ]' to '- [x]' in $DOD_FILE." \
      --arg items "$remaining" \
      '{decision: "block", reason: ($reason + "\n\nRemaining items:\n" + $items)}'
    exit 0
fi

# All items checked -> cleanup and allow stop
rm -f "$STATE_FILE" "$DOD_FILE" "$VERIFY_FLAG"
exit 0
