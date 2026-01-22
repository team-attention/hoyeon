#!/bin/bash

# Execute Init Hook (PreToolUse)
# Automatically creates execute-state.local.md when /dev.execute is called
# This ensures the Stop hook can track orchestration state

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract skill name from tool_input
SKILL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // empty')

# Only process execute skill
if [[ "$SKILL_NAME" != "execute" ]]; then
  exit 0
fi

# Extract args and cwd
ARGS=$(echo "$HOOK_INPUT" | jq -r '.tool_input.args // empty')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# Determine plan name from args or git branch
if [[ -n "$ARGS" ]]; then
  PLAN_NAME="$ARGS"
else
  # Try to get from git branch name
  PLAN_NAME=$(cd "$CWD" && git branch --show-current 2>/dev/null | sed 's|.*/||' || echo "default")
  if [[ -z "$PLAN_NAME" ]]; then
    PLAN_NAME="default"
  fi
fi

# Define state file path
STATE_DIR="$CWD/.dev/specs/$PLAN_NAME"
STATE_FILE="$STATE_DIR/execute-state.local.md"

# Only create if doesn't exist (don't overwrite existing state)
if [[ ! -f "$STATE_FILE" ]]; then
  mkdir -p "$STATE_DIR/context"

  TIMESTAMP=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)

  cat > "$STATE_FILE" << EOF
---
iteration: 0
max_iterations: 30
plan_path: .dev/specs/$PLAN_NAME/PLAN.md
mode: local
started_at: $TIMESTAMP
---

# Execute State

This file tracks the orchestration state for the execute skill.
It is automatically created and managed by hooks.

## Status
- Created by: execute-init-hook.sh
- Plan: $PLAN_NAME
EOF

  echo "📋 Execute init: Created state file for plan '$PLAN_NAME'" >&2
fi

exit 0
