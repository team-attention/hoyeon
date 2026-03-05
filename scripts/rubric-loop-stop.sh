#!/bin/bash
# rubric-loop-stop.sh - Stop hook
#
# Purpose: Block Claude from stopping mid-loop in rubric-loop skill
# State is session-scoped (rubric-loop-$SESSION_ID.json).
#
# Decision logic:
#   Allow stop when:
#     - No state file (not in rubric-loop)
#     - status == "completed" (Phase 4 finished)
#     - score >= threshold (target met)
#     - round > max_rounds (circuit breaker)
#     - iteration > max_iterations (safety net — prevents infinite hook blocking)
#   Block otherwise (loop still active)

set -euo pipefail

STATE_DIR="$HOME/.claude/.hook-state"

# Read hook input from stdin
HOOK_INPUT=$(cat)

SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

# Fallback session id
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="unknown"
fi

STATE_FILE="$STATE_DIR/rubric-loop-$SESSION_ID.json"

# No state file = not in rubric-loop, allow exit
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# Read state
STATUS=$(jq -r '.status // "active"' "$STATE_FILE")

# Completed — cleanup and allow exit
if [[ "$STATUS" == "completed" ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# Safety iteration counter (prevents infinite hook blocking)
iteration=$(jq -r '.iteration // 0' "$STATE_FILE")
max_iterations=$(jq -r '.max_iterations // 15' "$STATE_FILE")
iteration=$((iteration + 1))

# Update iteration counter
jq --argjson iter "$iteration" '.iteration = $iter' "$STATE_FILE" > "$STATE_FILE.tmp" \
  && mv "$STATE_FILE.tmp" "$STATE_FILE"

if [[ "$iteration" -gt "$max_iterations" ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# Score-based checks (only available after SKILL.md writes full state)
score=$(jq -r '.score // 0' "$STATE_FILE")
threshold=$(jq -r '.threshold // 100' "$STATE_FILE")
round=$(jq -r '.round // 0' "$STATE_FILE")
max_rounds=$(jq -r '.max_rounds // 5' "$STATE_FILE")

# Threshold met — cleanup and allow exit
if [[ "$score" -ge "$threshold" ]] && [[ "$threshold" -gt 0 ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# Circuit breaker — cleanup and allow exit
if [[ "$round" -gt "$max_rounds" ]] && [[ "$max_rounds" -gt 0 ]]; then
  rm -f "$STATE_FILE"
  exit 0
fi

# Not complete — block stop and continue
REASON="RUBRIC-LOOP (hook iteration ${iteration}/${max_iterations}): Score ${score}/${threshold}, Round ${round}/${max_rounds}. Loop is still active — continue the rubric-loop workflow. Do NOT stop until Phase 4 (Final Report) is output."

jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'

exit 0
