#!/bin/bash
# specify-init-hook.sh - PreToolUse[Skill] hook
#
# Purpose: Create state file when /dev.specify skill starts
# Activation: tool_name="Skill" && tool_input.skill="specify"
#
# Hook Input Fields (PreToolUse):
#   - tool_name: "Skill"
#   - tool_input.skill: skill name (e.g., "specify")
#   - cwd: current working directory

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract skill name from tool_input
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty')

# Only process specify skill
if [[ "$SKILL_NAME" != "dev.specify" ]]; then
  exit 0
fi

# Extract cwd
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# Create state file to indicate specify mode is active
STATE_DIR="$CWD/.claude"
STATE_FILE="$STATE_DIR/specify-active.lock"

mkdir -p "$STATE_DIR"

TIMESTAMP=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

cat > "$STATE_FILE" << EOF
---
started_at: $TIMESTAMP
session_id: $SESSION_ID
---
Specify mode active. Code modifications outside .dev/ are blocked.
EOF

echo "📋 Specify mode: Activated (plan-guard enabled)" >&2

exit 0
