#!/bin/bash
# orchestrator-guard.sh - PreToolUse[Edit|Write] hook for /dev.execute skill
#
# Purpose: Warn when Orchestrator tries to modify files directly
# Activation: execute-state.local.md exists + session_id matches
#
# Orchestrator should DELEGATE implementation to SubAgents, not write code directly.
# This hook allows the action but warns the user to use Task() instead.
#
# Hook Input Fields (PreToolUse):
#   - tool_input: { file_path, ... }
#   - session_id: current session
#   - cwd: current working directory

set -euo pipefail

INPUT=$(cat)

# Extract fields
CWD=$(echo "$INPUT" | jq -r '.cwd')
CURRENT_SESSION=$(echo "$INPUT" | jq -r '.session_id')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Check if execute mode is active (reuse execute state file)
STATE_FILE=$(find "$CWD/.dev/specs" -name "execute-state.local.md" 2>/dev/null | head -1 || echo "")

if [[ -z "$STATE_FILE" ]] || [[ ! -f "$STATE_FILE" ]]; then
  # No active execute session - allow all operations
  exit 0
fi

# Validate session_id
LOCK_SESSION=$(grep 'session_id:' "$STATE_FILE" 2>/dev/null | sed 's/session_id: *//' || echo "")

if [[ -n "$LOCK_SESSION" ]] && [[ "$LOCK_SESSION" != "$CURRENT_SESSION" ]]; then
  # Different session - not our execute, allow
  exit 0
fi

# Execute mode active - enforce orchestrator rules
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
