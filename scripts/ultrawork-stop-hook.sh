#!/bin/bash
# ultrawork-stop-hook.sh - Stop hook
#
# Purpose: Manage ultrawork pipeline transitions when Claude stops
# Activation: Stop event + session has ultrawork state
#
# Flow:
#   phase: specify_interview + DRAFT exists → trigger plan generation
#   phase: specify_plan + PLAN approved     → trigger /execute
#   phase: executing + TODOs done           → cleanup
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

# Intentionally CWD-scoped (not ~/.hoyeon/) — ultrawork state persists across sessions
# for the same feature spec, so it lives with the spec files rather than the session directory.
STATE_FILE="$CWD/.dev/state.local.json"

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
PHASE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].ultrawork.phase // "specify_interview"' "$STATE_FILE")
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
  echo "🛑 Ultrawork: Max iterations ($MAX_ITERATIONS) reached." >&2
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
  exit 0
fi

# Find spec directory: scan .dev/specs/ for the most recently modified DRAFT.md or PLAN.md
SPECS_ROOT="$CWD/.dev/specs"
SPEC_DIR=""
FEATURE_NAME=""
if [[ -d "$SPECS_ROOT" ]]; then
  SPEC_DIR=$(find "$SPECS_ROOT" -maxdepth 2 \( -name "DRAFT.md" -o -name "PLAN.md" \) -exec stat -f '%m %N' {} \; 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2- | xargs dirname 2>/dev/null || echo "")
  if [[ -n "$SPEC_DIR" ]]; then
    FEATURE_NAME=$(basename "$SPEC_DIR")
  fi
fi

if [[ -z "$SPEC_DIR" ]]; then
  # No specs found at all
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
# PHASE TRANSITION LOGIC
# ============================================================

case "$PHASE" in
  # --------------------------------------------------------
  # Phase: specify_interview
  # Check: DRAFT.md exists → trigger plan generation
  # --------------------------------------------------------
  "specify_interview")
    DRAFT_FILE="$SPEC_DIR/DRAFT.md"
    PLAN_FILE="$SPEC_DIR/PLAN.md"

    if [[ -f "$PLAN_FILE" ]]; then
      # Plan already exists - move to checking approval
      update_phase "specify_plan"
      echo "📋 Ultrawork: Plan exists. Checking approval..." >&2

      jq -n \
        --arg reason "Plan file exists. Check if plan-reviewer approved it. If not, call Task(subagent_type=\"plan-reviewer\")." \
        '{
          "decision": "block",
          "reason": $reason
        }'
      exit 0
    fi

    if [[ -f "$DRAFT_FILE" ]]; then
      # DRAFT exists - trigger plan generation
      update_phase "specify_plan"
      echo "📝 Ultrawork: Draft ready. Generate the plan." >&2

      jq -n \
        --arg reason "Draft is complete. Now generate the plan.

Say: \"Let me generate the plan now.\"

Follow specify skill's Mode 2: Plan Generation:
1. Validate draft completeness
2. Run gap analysis
3. Create PLAN.md
4. Call plan-reviewer for approval" \
        '{
          "decision": "block",
          "reason": $reason
        }'
      exit 0
    fi

    # No DRAFT yet - interview still in progress, allow stop
    exit 0
    ;;

  # --------------------------------------------------------
  # Phase: specify_plan
  # Check: PLAN.md approved → trigger /execute
  # --------------------------------------------------------
  "specify_plan")
    PLAN_FILE="$SPEC_DIR/PLAN.md"
    DRAFT_FILE="$SPEC_DIR/DRAFT.md"

    if [[ ! -f "$PLAN_FILE" ]]; then
      echo "⏳ Ultrawork: Waiting for plan..." >&2
      jq -n \
        --arg reason "Continue generating the plan. PLAN.md not created yet." \
        '{"decision": "block", "reason": $reason}'
      exit 0
    fi

    # Check if plan is approved
    PLAN_APPROVED=false

    # Method 1: APPROVED marker in file
    if grep -qi "APPROVED\|Status:.*Approved" "$PLAN_FILE" 2>/dev/null; then
      PLAN_APPROVED=true
    fi

    # Method 2: DRAFT deleted = finalized
    if [[ ! -f "$DRAFT_FILE" ]]; then
      PLAN_APPROVED=true
    fi

    if [[ "$PLAN_APPROVED" == "true" ]]; then
      update_phase "executing"
      echo "✅ Ultrawork: Plan approved → /execute" >&2

      jq -n \
        --arg name "$FEATURE_NAME" \
        --arg reason "Plan approved! Start implementation.

Execute: Skill(\"execute\", args=\"$FEATURE_NAME\")" \
        '{"decision": "block", "reason": $reason}'
      exit 0
    fi

    # Plan exists but not approved
    jq -n \
      --arg reason "Plan exists but not approved. Call Task(subagent_type=\"plan-reviewer\") and handle result." \
      '{"decision": "block", "reason": $reason}'
    exit 0
    ;;

  # --------------------------------------------------------
  # Phase: executing
  # Check: All TODOs done → cleanup
  # --------------------------------------------------------
  "executing")
    PLAN_FILE="$SPEC_DIR/PLAN.md"

    if [[ -f "$PLAN_FILE" ]]; then
      UNCHECKED=$(grep -c '### \[ \] TODO' "$PLAN_FILE" 2>/dev/null) || UNCHECKED=0

      if [[ "$UNCHECKED" -eq 0 ]]; then
        cleanup_session
        echo "🎉 Ultrawork: Complete!" >&2
        exit 0
      fi
    fi

    # TODOs remain - let execute-stop-hook handle
    exit 0
    ;;

  "done")
    cleanup_session
    exit 0
    ;;

  *)
    echo "⚠️ Ultrawork: Unknown phase '$PHASE'" >&2
    cleanup_session
    exit 0
    ;;
esac

exit 0
