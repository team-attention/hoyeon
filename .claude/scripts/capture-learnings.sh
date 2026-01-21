#!/bin/bash
# capture-learnings.sh - SubagentStop Hook for /execute skill
#
# Purpose: Automatically extract and accumulate learnings from worker agent output
# Called when: Any subagent (especially worker) stops during /execute skill
#
# Parses worker output sections and appends to notepad files:
#   - ## LEARNINGS → learnings.md
#   - ## ISSUES → issues.md
#   - ## VERIFICATION → verification.md

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract transcript path from hook input
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  # No transcript available, silently exit
  exit 0
fi

# Read boulder.json to get active plan name
BOULDER_PATH=".dev/boulder.json"
if [ ! -f "$BOULDER_PATH" ]; then
  # No active plan, silently exit
  exit 0
fi

PLAN_NAME=$(jq -r '.plan_name // empty' "$BOULDER_PATH")
if [ -z "$PLAN_NAME" ]; then
  exit 0
fi

# Create notepad directory if not exists
NOTEPAD_DIR=".dev/notepads/${PLAN_NAME}"
mkdir -p "$NOTEPAD_DIR"

# Extract the last assistant message from transcript (JSONL format)
# The transcript contains conversation history, we want the last agent output
# Note: content can be a string or an array of text blocks
AGENT_OUTPUT=$(tac "$TRANSCRIPT_PATH" 2>/dev/null | \
  while IFS= read -r line; do
    role=$(echo "$line" | jq -r '.role // empty' 2>/dev/null)
    if [ "$role" = "assistant" ]; then
      # Handle both string content and array of text blocks
      echo "$line" | jq -r '
        if .content | type == "array" then
          [.content[] | select(.type == "text") | .text] | join("")
        else
          .content // empty
        end
      ' 2>/dev/null
      break
    fi
  done)

if [ -z "$AGENT_OUTPUT" ]; then
  exit 0
fi

# Get current timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Function to extract section content
extract_section() {
  local content="$1"
  local section_name="$2"

  # Extract content between ## SECTION_NAME and the next ## or end
  echo "$content" | awk -v section="$section_name" '
    BEGIN { found=0; output="" }
    /^## / {
      if (found) exit
      if ($0 ~ "^## " section) { found=1; next }
    }
    found { print }
  '
}

# Extract task description from COMPLETED section's first item
# Format: "- [x] Task description here" → "Task description here"
TASK_DESC=$(echo "$AGENT_OUTPUT" | \
  awk '/^## COMPLETED/,/^## / { if (/^- \[x\]/) { sub(/^- \[x\] */, ""); print; exit } }' | \
  head -1)

if [ -z "$TASK_DESC" ]; then
  TASK_DESC="Worker Task"
fi

# Extract and save LEARNINGS section
LEARNINGS=$(extract_section "$AGENT_OUTPUT" "LEARNINGS")
if [ -n "$LEARNINGS" ] && [ "$(echo "$LEARNINGS" | tr -d '[:space:]')" != "" ]; then
  {
    echo ""
    echo "## [${TIMESTAMP}] ${TASK_DESC}"
    echo "$LEARNINGS"
  } >> "${NOTEPAD_DIR}/learnings.md"
fi

# Extract and save ISSUES section
ISSUES=$(extract_section "$AGENT_OUTPUT" "ISSUES")
if [ -n "$ISSUES" ] && [ "$(echo "$ISSUES" | tr -d '[:space:]')" != "" ]; then
  {
    echo ""
    echo "## [${TIMESTAMP}] ${TASK_DESC}"
    echo "$ISSUES"
  } >> "${NOTEPAD_DIR}/issues.md"
fi

# Extract and save VERIFICATION section
VERIFICATION=$(extract_section "$AGENT_OUTPUT" "VERIFICATION")
if [ -n "$VERIFICATION" ] && [ "$(echo "$VERIFICATION" | tr -d '[:space:]')" != "" ]; then
  {
    echo ""
    echo "## [${TIMESTAMP}] ${TASK_DESC}"
    echo "$VERIFICATION"
  } >> "${NOTEPAD_DIR}/verification.md"
fi

# Success - allow subagent to stop normally
exit 0
