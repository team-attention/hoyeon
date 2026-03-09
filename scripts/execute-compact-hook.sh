#!/bin/bash
# execute-compact-hook.sh - SessionStart[compact] hook
#
# Purpose: After compaction, re-inject execute context so the orchestrator
#          knows where it left off without relying on memory.
# Activation: SessionStart with matcher "compact"
#
# Reads: ~/.hoyeon/{session_id}/state.json (written by skill-session-init.sh)
# Uses: cli spec status for task progress
#
# Output (stdout → injected into Claude's context):
#   - Active spec path and goal
#   - Task progress summary (done/in_progress/pending counts + per-task status)
#   - Context directory path

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# ── Read session state ──

STATE_FILE="$HOME/.hoyeon/$SESSION_ID/state.json"
[[ ! -f "$STATE_FILE" ]] && exit 0

SKILL=$(jq -r '.skill // empty' "$STATE_FILE")
SPEC_REL=$(jq -r '.spec // empty' "$STATE_FILE")

# Only activate for execute sessions
[[ "$SKILL" != "execute" ]] && exit 0
[[ -z "$SPEC_REL" ]] && exit 0

SPEC_PATH="$CWD/$SPEC_REL"
[[ ! -f "$SPEC_PATH" ]] && exit 0

# ── Get status via cli ──

STATUS_JSON=$(hoyeon-cli spec status "$SPEC_PATH" 2>/dev/null) || true

if [[ -z "$STATUS_JSON" ]]; then
  exit 0
fi

DONE_COUNT=$(echo "$STATUS_JSON" | jq -r '.done')
TOTAL_COUNT=$(echo "$STATUS_JSON" | jq -r '.total')
CONTEXT_DIR="$(dirname "$SPEC_PATH")/context"

# Get meta via cli
META_JSON=$(hoyeon-cli spec meta "$SPEC_PATH" 2>/dev/null) || true
SPEC_NAME=$(echo "${META_JSON:-{}}" | jq -r '.name // "unknown"')
SPEC_GOAL=$(echo "${META_JSON:-{}}" | jq -r '.goal // "unknown"')
NON_GOALS=$(echo "${META_JSON:-{}}" | jq -r '(.non_goals // []) | if length > 0 then map("  - " + .) | join("\n") else "  (none)" end')

# Per-task one-liner from remaining tasks
TASK_LIST=$(echo "$STATUS_JSON" | jq -r '.remaining[] | "  \(.id): \(.action) [\(.status)]"')

# Output context for Claude (stdout is injected into conversation)
cat <<EOF

[execute recovery] Compaction detected — restoring orchestrator context.

spec_path: $SPEC_PATH
name: $SPEC_NAME
goal: $SPEC_GOAL
non_goals:
$NON_GOALS
progress: $DONE_COUNT/$TOTAL_COUNT tasks done
context_dir: $CONTEXT_DIR

Remaining tasks:
$TASK_LIST

Use \`hoyeon-cli spec task <id> --get $SPEC_PATH\` to fetch individual task details.
Continue the execute loop from where you left off.
EOF

exit 0
