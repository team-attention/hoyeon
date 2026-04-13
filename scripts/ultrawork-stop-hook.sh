#!/bin/bash
# ultrawork-stop-hook.sh - Stop hook (spec-v2)
#
# Purpose: Manage ultrawork pipeline transitions when Claude stops
# Activation: Stop event + session has ultrawork state
#
# Flow (spec-v2):
#   phase: specify  + spec.json has meta.approved_by → inject /execute <spec-path>
#   phase: executing + plan.json all tasks done       → cleanup
#
# Hook Input Fields (Stop):
#   - session_id: current session
#   - transcript_path: conversation log path
#   - cwd: current working directory

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract fields
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')

# CWD-scoped: ultrawork state lives with the spec files, not the session dir.
STATE_FILE="$CWD/.hoyeon/state.local.json"

# Exit if no state file
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

# Check if this session has ultrawork state
ULTRAWORK_STATE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].ultrawork // empty' "$STATE_FILE")

if [[ -z "$ULTRAWORK_STATE" ]] || [[ "$ULTRAWORK_STATE" == "null" ]]; then
  exit 0
fi

# Extract ultrawork fields
PHASE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].ultrawork.phase // "specify"' "$STATE_FILE")
ITERATION=$(jq -r --arg sid "$SESSION_ID" '.[$sid].ultrawork.iteration // 0' "$STATE_FILE")
MAX_ITERATIONS=$(jq -r --arg sid "$SESSION_ID" '.[$sid].ultrawork.max_iterations // 10' "$STATE_FILE")

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  ITERATION=0
fi
if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  MAX_ITERATIONS=10
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "Ultrawork: Max iterations ($MAX_ITERATIONS) reached." >&2
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
  exit 0
fi

# Locate the most recently modified spec.json under .hoyeon/specs/
SPECS_ROOT="$CWD/.hoyeon/specs"
SPEC_JSON=""
SPEC_DIR=""
FEATURE_NAME=""
if [[ -d "$SPECS_ROOT" ]]; then
  # Portable mtime sort: GNU stat uses -c, BSD/macOS stat uses -f.
  if stat --version >/dev/null 2>&1; then
    STAT_FMT=(-c '%Y %n')
  else
    STAT_FMT=(-f '%m %N')
  fi
  SPEC_JSON=$(find "$SPECS_ROOT" -maxdepth 2 -name "spec.json" -exec stat "${STAT_FMT[@]}" {} \; 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-)
  if [[ -n "$SPEC_JSON" ]]; then
    SPEC_DIR=$(dirname "$SPEC_JSON")
    FEATURE_NAME=$(basename "$SPEC_DIR")
  fi
fi

if [[ -z "$SPEC_JSON" ]]; then
  # No spec.json yet → specify is still running; allow stop.
  exit 0
fi

# ============================================================
# HELPER FUNCTIONS
# ============================================================

update_phase() {
  local new_phase="$1"
  local next_iter=$((ITERATION + 1))
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" \
     --arg phase "$new_phase" \
     --argjson iter "$next_iter" \
     '.[$sid].ultrawork.phase = $phase | .[$sid].ultrawork.iteration = $iter' \
     "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
}

cleanup_session() {
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
}

# ============================================================
# PHASE TRANSITION LOGIC (spec-v2)
# ============================================================

case "$PHASE" in
  # --------------------------------------------------------
  # Phase: specify
  # Check: spec.json has meta.approved_by populated → inject /execute
  # --------------------------------------------------------
  "specify")
    APPROVED=$(jq -r '.meta.approved_by // empty' "$SPEC_JSON" 2>/dev/null || echo "")

    if [[ -n "$APPROVED" ]]; then
      update_phase "executing"
      echo "Ultrawork: Spec approved → /execute $SPEC_JSON" >&2

      jq -n \
        --arg spec "$SPEC_JSON" \
        --arg reason "Spec approved! Start implementation.

Execute: /execute $spec" \
        '{"decision": "block", "reason": $reason}'
      exit 0
    fi

    # Not approved yet — specify still in progress, allow stop.
    exit 0
    ;;

  # --------------------------------------------------------
  # Phase: executing
  # Check: plan.json tasks all done → cleanup
  # --------------------------------------------------------
  "executing")
    PLAN_JSON="$SPEC_DIR/plan.json"

    if [[ -f "$PLAN_JSON" ]]; then
      # Count pending (non-done) tasks via hoyeon-cli plan list
      # hoyeon-cli plan list emits a bare JSON array of tasks.
      PENDING=$(hoyeon-cli plan list "$PLAN_JSON" --json 2>/dev/null \
        | jq '[.[]? | select(.status != "done")] | length' 2>/dev/null || echo "0")

      if [[ ! "$PENDING" =~ ^[0-9]+$ ]]; then
        PENDING=0
      fi

      if [[ "$PENDING" -eq 0 ]]; then
        cleanup_session
        echo "Ultrawork: Complete!" >&2
        exit 0
      fi
    fi

    # plan.json not yet created or tasks pending — let /execute drive.
    exit 0
    ;;

  "done")
    cleanup_session
    exit 0
    ;;

  *)
    echo "Ultrawork: Unknown phase '$PHASE'" >&2
    cleanup_session
    exit 0
    ;;
esac

exit 0
