#!/bin/bash
# rubric-loop-init.sh - PreToolUse[Skill] hook
#
# Purpose: Create rubric-loop state marker when skill is invoked
# Activation: tool_name="Skill" && tool_input.skill contains "rubric-loop"
#
# The SKILL.md itself writes the full state (score, threshold, round).
# This hook just creates the initial marker + safety iteration counter.
# State is session-scoped to prevent cross-session interference.

set -euo pipefail

STATE_DIR="$HOME/.claude/.hook-state"

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract skill name and session id
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

# Only process rubric-loop skill
if [[ "$SKILL_NAME" != *"rubric-loop"* ]]; then
  exit 0
fi

# Fallback session id
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="unknown"
fi

STATE_FILE="$STATE_DIR/rubric-loop-$SESSION_ID.json"

mkdir -p "$STATE_DIR"

# Don't overwrite if already active (resume case)
if [[ -f "$STATE_FILE" ]]; then
  exit 0
fi

# Create initial state marker
# SKILL.md will overwrite this with full state (score, threshold, round) after Phase 1
jq -n --arg sid "$SESSION_ID" '{
  status: "init",
  session_id: $sid,
  iteration: 0,
  max_iterations: 15
}' > "$STATE_FILE"

exit 0
