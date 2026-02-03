#!/usr/bin/env bash
# hy-session-hook.sh - UserPromptSubmit hook
#
# Purpose: Track Claude sessions in state.local.json with 24h TTL
# Activation: UserPromptSubmit event
#
# Hook Input Fields:
#   - cwd: current working directory
#   - session_id: current session ID
#
# Output: Updates .dev/state.local.json with session metadata

set -euo pipefail

main() {
  # Read hook input from stdin
  HOOK_INPUT=$(cat)

  # Extract fields using jq
  CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd // empty')
  SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

  # Exit early if required fields missing
  if [[ -z "$CWD" ]] || [[ -z "$SESSION_ID" ]]; then
    exit 0
  fi

  # Generate timestamp
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)

  # Detect worktree context
  WORKTREE_NAME="main"
  if [[ -f "$CWD/.dev/local.json" ]]; then
    WORKTREE_NAME=$(jq -r '.name // "main"' "$CWD/.dev/local.json" 2>/dev/null || echo "main")
  fi

  # Ensure .dev directory exists
  mkdir -p "$CWD/.dev"

  # Initialize state.local.json if not exists
  STATE_FILE="$CWD/.dev/state.local.json"
  if [[ ! -f "$STATE_FILE" ]]; then
    echo '{}' > "$STATE_FILE"
  fi

  # Calculate cutoff time for 24h TTL
  CUTOFF=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")

  # Update state.local.json with session info (atomic write)
  TEMP_FILE="${STATE_FILE}.tmp.$$"

  if [[ -n "$CUTOFF" ]]; then
    # Add new session and cleanup old sessions (24h TTL)
    jq --arg sid "$SESSION_ID" \
       --arg ts "$TIMESTAMP" \
       --arg wt "$WORKTREE_NAME" \
       --arg cutoff "$CUTOFF" \
       '
       # Add new session
       .sessions = ((.sessions // {}) + {
         ($sid): {
           "created_at": $ts,
           "worktree": $wt
         }
       })
       # Cleanup old sessions (24h TTL)
       | .sessions = (.sessions | to_entries | map(select(.value.created_at > $cutoff)) | from_entries)
       ' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
  else
    # Fallback: add session without cleanup if date calculation fails
    jq --arg sid "$SESSION_ID" \
       --arg ts "$TIMESTAMP" \
       --arg wt "$WORKTREE_NAME" \
       '
       .sessions = ((.sessions // {}) + {
         ($sid): {
           "created_at": $ts,
           "worktree": $wt
         }
       })
       ' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
  fi
}

# Execute with silent failure (session tracking is best-effort)
main || true

exit 0
