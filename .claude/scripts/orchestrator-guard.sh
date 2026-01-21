#!/bin/bash
# orchestrator-guard.sh - PreToolUse[Edit|Write] hook for /execute skill
#
# Purpose: Warn when Orchestrator tries to modify files directly
# Called when: Edit or Write tool is used while /execute skill is active
#
# Orchestrator should DELEGATE implementation to SubAgents, not write code directly.
# This hook allows the action but warns the user to use Task() instead.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# .dev/ 내부는 허용 (Plan 체크박스 업데이트, notepad 등)
if [[ "$FILE_PATH" == *".dev/"* ]]; then
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
EOF
else
  # 그 외는 경고 (block하지 않고 allow + message)
  # Orchestrator가 직접 코드를 수정하려 할 때 위임하도록 안내
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  },
  "systemMessage": "⚠️ ORCHESTRATOR WARNING: Orchestrator는 지휘자입니다. 직접 코드를 수정하지 마세요. 대신 Task()로 worker 에이전트에게 위임하세요."
}
EOF
fi
