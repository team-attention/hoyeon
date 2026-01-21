#!/bin/bash
# check-boulder-state.sh - SessionStart Hook
#
# Purpose: Check for incomplete work when a session starts
# Called when: Claude Code session starts or resumes
#
# If there's an active plan with incomplete TODOs, notifies the user
# to continue or abandon the work.

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract source field (startup, resume, clear, compact)
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')

# Only check on startup and resume
if [[ "$SOURCE" != "startup" && "$SOURCE" != "resume" ]]; then
  exit 0
fi

# Check for boulder.json
BOULDER_PATH=".dev/boulder.json"
if [ ! -f "$BOULDER_PATH" ]; then
  # No active plan, nothing to report
  exit 0
fi

# Read boulder.json
ACTIVE_PLAN=$(jq -r '.active_plan // empty' "$BOULDER_PATH")
PLAN_NAME=$(jq -r '.plan_name // empty' "$BOULDER_PATH")
STARTED_AT=$(jq -r '.started_at // empty' "$BOULDER_PATH")

if [ -z "$ACTIVE_PLAN" ] || [ ! -f "$ACTIVE_PLAN" ]; then
  # No active plan file
  exit 0
fi

# Count checkboxes in the plan file
TOTAL=$(grep -cE '^\s*-\s*\[[ xX]\]' "$ACTIVE_PLAN" 2>/dev/null || echo "0")
COMPLETED=$(grep -cE '^\s*-\s*\[[xX]\]' "$ACTIVE_PLAN" 2>/dev/null || echo "0")
REMAINING=$((TOTAL - COMPLETED))

if [ "$REMAINING" -eq 0 ]; then
  # All tasks completed, no need to notify
  exit 0
fi

# Get the first few incomplete tasks for preview
INCOMPLETE_TASKS=$(grep -E '^\s*-\s*\[ \]' "$ACTIVE_PLAN" 2>/dev/null | head -3 | sed 's/^/  /')

# Build the notification message
MESSAGE="📋 **미완료 작업 발견**

**Plan**: ${PLAN_NAME} (${ACTIVE_PLAN})
**시작일**: ${STARTED_AT}
**진행률**: ${COMPLETED}/${TOTAL} (${REMAINING}개 남음)

**다음 작업**:
${INCOMPLETE_TASKS}

➡️ 작업을 계속하려면 \`/execute\`를 실행하세요.
➡️ 작업을 포기하려면 \`.dev/boulder.json\`을 삭제하세요."

# Escape for JSON (newlines, quotes)
ESCAPED_MESSAGE=$(echo "$MESSAGE" | jq -Rs '.')

# Return context to inject into Claude's knowledge
cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": ${ESCAPED_MESSAGE}
  }
}
EOF

exit 0
