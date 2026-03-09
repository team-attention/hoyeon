#!/bin/bash
# rulph-stop.sh - Stop hook
#
# Purpose: Block Claude from stopping mid-loop in rulph skill
# State is session-scoped (unified ~/.hoyeon/{session_id}/state.json, .rulph namespace).
#
# Decision logic:
#   Allow stop when:
#     - No state file or no .rulph namespace (not in rulph)
#     - status == "completed" (Phase 4 finished)
#     - score >= threshold (target met)
#     - round > max_rounds (circuit breaker)
#     - iteration > max_iterations (safety net — prevents infinite hook blocking)
#   Block otherwise (loop still active)

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

# Fallback session id
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="unknown"
fi

SESSION_DIR="$HOME/.hoyeon/$SESSION_ID"
STATE_FILE="$SESSION_DIR/state.json"

# No state file or no .rulph namespace = not in rulph, allow exit
if [[ ! -f "$STATE_FILE" ]] || ! jq -e '.rulph' "$STATE_FILE" >/dev/null 2>&1; then
  exit 0
fi

# Read state
STATUS=$(jq -r '.rulph.status // "active"' "$STATE_FILE")

# Completed — remove rulph namespace and allow exit
if [[ "$STATUS" == "completed" ]]; then
  jq 'del(.rulph)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
  exit 0
fi

# Safety iteration counter (prevents infinite hook blocking)
iteration=$(jq -r '.rulph.iteration // 0' "$STATE_FILE")
max_iterations=$(jq -r '.rulph.max_iterations // 15' "$STATE_FILE")
iteration=$((iteration + 1))

# Update iteration counter
jq --argjson iter "$iteration" '.rulph.iteration = $iter' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" \
  && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"

if [[ "$iteration" -gt "$max_iterations" ]]; then
  jq 'del(.rulph)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
  exit 0
fi

# Score-based checks (only available after SKILL.md writes full state)
score=$(jq -r '.rulph.score // 0' "$STATE_FILE")
threshold=$(jq -r '.rulph.threshold // 100' "$STATE_FILE")
round=$(jq -r '.rulph.round // 0' "$STATE_FILE")
max_rounds=$(jq -r '.rulph.max_rounds // 5' "$STATE_FILE")

# Threshold met — remove rulph namespace and allow exit
if [[ "$score" -ge "$threshold" ]] && [[ "$threshold" -gt 0 ]]; then
  jq 'del(.rulph)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
  exit 0
fi

# Circuit breaker — remove rulph namespace and allow exit
if [[ "$round" -gt "$max_rounds" ]] && [[ "$max_rounds" -gt 0 ]]; then
  jq 'del(.rulph)' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
  exit 0
fi

# Not complete — block stop and continue
REASON="RULPH (hook iteration ${iteration}/${max_iterations}): Score ${score}/${threshold}, Round ${round}/${max_rounds}. Loop is still active — continue the rulph workflow. Do NOT stop until Phase 4 (Final Report) is output."

jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'

exit 0
