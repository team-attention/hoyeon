#!/bin/bash
# skill-session-cleanup.sh — SessionEnd cleanup
#
# Reads ~/.claude/.hook-state/{session_id}.json:
#   - Deletes all paths in .cleanup[] array (safety: /tmp/* only)
#   - Removes the state file itself
#
# Any skill can register temp paths during execution:
#   STATE_FILE="$HOME/.claude/.hook-state/$SESSION_ID.json"
#   jq --arg p "/tmp/my-dir" '.cleanup += [$p]' "$STATE_FILE" > tmp && mv tmp "$STATE_FILE"

set -euo pipefail

HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

STATE_FILE="$HOME/.claude/.hook-state/$SESSION_ID.json"

if [[ -f "$STATE_FILE" ]]; then
  # Clean up registered temp paths
  jq -r '.cleanup[]? // empty' "$STATE_FILE" 2>/dev/null | while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    # Safety: only allow /tmp/ paths, resolve symlinks to prevent traversal
    resolved=$(realpath -m "$path" 2>/dev/null || echo "$path")
    if [[ "$resolved" == /tmp/* ]]; then
      rm -rf "$resolved" 2>/dev/null || true
    fi
  done

  rm -f "$STATE_FILE"
fi

exit 0
