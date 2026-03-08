#!/bin/bash
# execute-compact-hook.sh - SessionStart[compact] hook
#
# Purpose: After compaction, re-inject execute context so the orchestrator
#          knows where it left off without relying on memory.
# Activation: SessionStart with matcher "compact"
#
# Output (stdout → injected into Claude's context):
#   - Active spec path and goal
#   - Task progress summary (done/in_progress/pending counts + per-task status)
#   - Context directory path

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# Find the most recently modified spec.json (space-safe, empty-safe)
SPEC_PATH=$(find "$CWD/.dev/specs" -name "spec.json" -maxdepth 2 -print0 2>/dev/null \
  | xargs -0 stat -f '%m %N' 2>/dev/null \
  | sort -rn | head -1 | cut -d' ' -f2-)

if [[ -z "$SPEC_PATH" ]]; then
  exit 0
fi

# Validate it's parseable
if ! jq empty "$SPEC_PATH" 2>/dev/null; then
  exit 0
fi

SPEC_NAME=$(jq -r '.meta.name // "unknown"' "$SPEC_PATH")
SPEC_GOAL=$(jq -r '.meta.goal // "unknown"' "$SPEC_PATH")
CONTEXT_DIR="$(dirname "$SPEC_PATH")/context"

DONE_COUNT=$(jq '[.tasks[] | select(.status == "done")] | length' "$SPEC_PATH")
TOTAL_COUNT=$(jq '.tasks | length' "$SPEC_PATH")

# Per-task one-liner
TASK_LIST=$(jq -r '.tasks[] | "  \(.id): \(.action) [\(.status)]"' "$SPEC_PATH")

# Output context for Claude (stdout is injected into conversation)
cat <<EOF

[execute recovery] Compaction detected — restoring orchestrator context.

spec_path: $SPEC_PATH
goal: $SPEC_GOAL
progress: $DONE_COUNT/$TOTAL_COUNT tasks done
context_dir: $CONTEXT_DIR

Task status:
$TASK_LIST

Use \`dev-cli spec task <id> --get $SPEC_PATH\` to fetch individual task details.
Continue the execute loop from where you left off.
EOF

exit 0
