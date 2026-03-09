#!/bin/bash
# rulph-init.sh - PreToolUse[Skill] hook
#
# Purpose: Merge rulph namespace into unified ~/.hoyeon/{session_id}/state.json
# Activation: tool_name="Skill" && tool_input.skill contains "rulph"
#
# The SKILL.md itself writes the full state (score, threshold, round).
# This hook just creates the initial marker + safety iteration counter.
# State is session-scoped to prevent cross-session interference.

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract skill name and session id
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

# Only process rulph skill
if [[ "$SKILL_NAME" != *"rulph"* ]]; then
  exit 0
fi

# Fallback session id
if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="unknown"
fi

SESSION_DIR="$HOME/.hoyeon/$SESSION_ID"
STATE_FILE="$SESSION_DIR/state.json"

# Don't overwrite if rulph already active (resume case)
if [[ -f "$STATE_FILE" ]] && jq -e '.rulph' "$STATE_FILE" >/dev/null 2>&1; then
  exit 0
fi

# Merge rulph namespace into existing state.json (or create if missing)
if [[ -f "$STATE_FILE" ]]; then
  jq --arg sid "$SESSION_ID" '. + {rulph: {status: "init", session_id: $sid, iteration: 0, max_iterations: 15}}' "$STATE_FILE" > "${STATE_FILE}.tmp.$$" && mv "${STATE_FILE}.tmp.$$" "$STATE_FILE"
else
  mkdir -p "$SESSION_DIR/files" "$SESSION_DIR/tmp"
  jq -n --arg sid "$SESSION_ID" '{rulph: {status: "init", session_id: $sid, iteration: 0, max_iterations: 15}}' > "$STATE_FILE"
fi

exit 0
