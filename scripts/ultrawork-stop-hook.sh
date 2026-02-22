#!/bin/bash
# ultrawork-stop-hook.sh - Stop hook
#
# Purpose: Manage ultrawork pipeline transitions when Claude stops
# Activation: Stop event + session has ultrawork state
#
# Flow:
#   phase: specify_interview + DRAFT exists → trigger plan generation
#   phase: specify_plan + PLAN approved     → trigger /open
#   phase: opening + PR created             → trigger /execute
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

# State file path
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

# Find spec directory: scan both .dev/specs/ (PLAN.md deliverables) and
# .dev/.sessions/ (DRAFT.md work artifacts, post-refactor) for the most
# recently modified relevant file.
# Dual scan provides backward compatibility: pre-refactor specs keep DRAFT.md
# in the spec dir; post-refactor specs store DRAFT.md in the session dir.
SPECS_ROOT="$CWD/.dev/specs"
SESSIONS_ROOT="$CWD/.dev/.sessions"
SPEC_DIR=""
DRAFT_DIR=""   # Directory containing DRAFT.md (may differ from SPEC_DIR post-refactor)
FEATURE_NAME=""

# Collect candidate files from both locations
CANDIDATE=""

# Scan specs dir for PLAN.md or DRAFT.md (legacy location for DRAFT.md)
if [[ -d "$SPECS_ROOT" ]]; then
  SPEC_CANDIDATE=$(find "$SPECS_ROOT" -maxdepth 2 \( -name "DRAFT.md" -o -name "PLAN.md" \) -exec stat -f '%m %N' {} \; 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2- || echo "")
  CANDIDATE="$SPEC_CANDIDATE"
fi

# Scan sessions dir for DRAFT.md (new location post-refactor)
SESSION_CANDIDATE=""
if [[ -d "$SESSIONS_ROOT" ]]; then
  SESSION_CANDIDATE=$(find "$SESSIONS_ROOT" -maxdepth 2 -name "DRAFT.md" -exec stat -f '%m %N' {} \; 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2- || echo "")
fi

# Pick the more recently modified candidate
if [[ -n "$SESSION_CANDIDATE" ]] && [[ -n "$CANDIDATE" ]]; then
  # Compare modification timestamps numerically; take the newer one
  SESSION_TS=$(find "$SESSIONS_ROOT" -maxdepth 2 -name "DRAFT.md" -exec stat -f '%m' {} \; 2>/dev/null | sort -rn | head -1 || echo "0")
  SPEC_TS=$(find "$SPECS_ROOT" -maxdepth 2 \( -name "DRAFT.md" -o -name "PLAN.md" \) -exec stat -f '%m' {} \; 2>/dev/null | sort -rn | head -1 || echo "0")
  if [[ "$SESSION_TS" -gt "$SPEC_TS" ]]; then
    CANDIDATE="$SESSION_CANDIDATE"
  fi
elif [[ -n "$SESSION_CANDIDATE" ]]; then
  CANDIDATE="$SESSION_CANDIDATE"
fi

# Resolve SPEC_DIR and DRAFT_DIR from the winning candidate
if [[ -n "$CANDIDATE" ]]; then
  CANDIDATE_DIR=$(echo "$CANDIDATE" | xargs dirname 2>/dev/null || echo "")
  if [[ -n "$CANDIDATE_DIR" ]]; then
    # If candidate came from .sessions/, resolve the feature name via session.ref
    # by searching for a spec whose session.ref points to this session dir
    if [[ "$CANDIDATE_DIR" == "$SESSIONS_ROOT"* ]]; then
      RESOLVED_SESSION_ID=$(basename "$CANDIDATE_DIR")
      DRAFT_DIR="$CANDIDATE_DIR"
      # Find the spec dir whose session.ref contains this RESOLVED_SESSION_ID
      if [[ -d "$SPECS_ROOT" ]]; then
        for REF_FILE in "$SPECS_ROOT"/*/session.ref; do
          [[ -f "$REF_FILE" ]] || continue
          REF_CONTENT=$(cat "$REF_FILE" 2>/dev/null | tr -d '[:space:]')
          if [[ "$REF_CONTENT" == "$RESOLVED_SESSION_ID" ]]; then
            SPEC_DIR=$(dirname "$REF_FILE")
            FEATURE_NAME=$(basename "$SPEC_DIR")
            break
          fi
        done
      fi
      # If no session.ref match found, skip (cannot resolve feature name)
    else
      SPEC_DIR="$CANDIDATE_DIR"
      DRAFT_DIR="$CANDIDATE_DIR"   # Legacy: DRAFT.md colocated with spec deliverables
      FEATURE_NAME=$(basename "$SPEC_DIR")
    fi
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
    DRAFT_FILE="${DRAFT_DIR:-$SPEC_DIR}/DRAFT.md"
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
  # Check: PLAN.md approved → trigger /open
  # --------------------------------------------------------
  "specify_plan")
    PLAN_FILE="$SPEC_DIR/PLAN.md"
    DRAFT_FILE="${DRAFT_DIR:-$SPEC_DIR}/DRAFT.md"

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
      update_phase "opening"
      echo "✅ Ultrawork: Plan approved → /open" >&2

      jq -n \
        --arg name "$FEATURE_NAME" \
        --arg reason "Plan approved! Create the Draft PR.

Execute: Skill(\"open\", args=\"$FEATURE_NAME\")" \
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
  # Phase: opening
  # Check: PR created → trigger /execute
  # --------------------------------------------------------
  "opening")
    # Check if PR/branch exists
    PR_EXISTS=false

    if command -v git &> /dev/null && git -C "$CWD" rev-parse --is-inside-work-tree &>/dev/null; then
      if git -C "$CWD" branch -a 2>/dev/null | grep -qE "feat/$FEATURE_NAME"; then
        PR_EXISTS=true
      fi
    fi

    if command -v gh &> /dev/null; then
      PR_NUMBER=$(cd "$CWD" && gh pr list --head "feat/$FEATURE_NAME" --json number -q '.[0].number' 2>/dev/null || echo "")
      if [[ -n "$PR_NUMBER" ]]; then
        PR_EXISTS=true
      fi
    fi

    if [[ "$PR_EXISTS" == "true" ]]; then
      update_phase "executing"
      echo "🔀 Ultrawork: PR #$PR_NUMBER created → /execute" >&2

      jq -n \
        --arg pr "$PR_NUMBER" \
        --arg reason "Draft PR #$PR_NUMBER created! Start implementation.

Execute: Skill(\"execute\", args=\"$PR_NUMBER\")" \
        '{"decision": "block", "reason": $reason}'
      exit 0
    fi

    # PR not created yet
    jq -n \
      --arg name "$FEATURE_NAME" \
      --arg reason "Continue creating the PR. Run Skill(\"open\", args=\"$FEATURE_NAME\")." \
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
