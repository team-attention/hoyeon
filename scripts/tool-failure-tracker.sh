#!/bin/bash
# PostToolUseFailure hook: track repeated failures and escalate guidance
# Registered for: * (all tools) matcher under PostToolUseFailure
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# Skip if no session ID
if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

# State file for failure tracking
STATE_DIR="$HOME/.hoyeon/$SESSION_ID"
FAILURE_FILE="$STATE_DIR/failure-counts.json"

# Ensure state directory exists
mkdir -p "$STATE_DIR"

# Current timestamp (seconds since epoch)
NOW=$(date +%s)
WINDOW=60  # 60-second sliding window

# Initialize or read existing failure counts
if [[ -f "$FAILURE_FILE" ]]; then
  STATE=$(cat "$FAILURE_FILE")
else
  STATE='{"failures":[]}'
fi

# Add current failure
STATE=$(echo "$STATE" | jq --arg tool "$TOOL_NAME" --argjson ts "$NOW" \
  '.failures += [{"tool": $tool, "ts": $ts}]')

# Prune old entries (outside window)
CUTOFF=$((NOW - WINDOW))
STATE=$(echo "$STATE" | jq --argjson cutoff "$CUTOFF" \
  '.failures = [.failures[] | select(.ts >= $cutoff)]')

# Count failures for this tool in the window
COUNT=$(echo "$STATE" | jq --arg tool "$TOOL_NAME" \
  '[.failures[] | select(.tool == $tool)] | length')

# Save state
echo "$STATE" > "$FAILURE_FILE"

# Escalation logic
GUIDANCE=""

if [[ "$COUNT" -ge 5 ]]; then
  GUIDANCE="STAGNATION DETECTED: The ${TOOL_NAME} tool has failed ${COUNT} times in the last 60 seconds. You are likely repeating the same failing approach. STOP and take a completely different strategy: (1) Re-read the relevant files to understand current state, (2) Consider an alternative approach entirely, (3) If the task seems blocked, report the blocker rather than retrying."

elif [[ "$COUNT" -ge 3 ]]; then
  GUIDANCE="REPEATED FAILURE: ${TOOL_NAME} has failed ${COUNT} times recently. Consider a different approach — the current strategy may not work. Try reading the file/state again before retrying."
fi

if [[ -n "$GUIDANCE" ]]; then
  jq -n --arg ctx "$GUIDANCE" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUseFailure",
      additionalContext: $ctx
    }
  }'
fi
