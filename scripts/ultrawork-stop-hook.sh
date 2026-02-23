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

# ============================================================
# RESOLVE FEATURE NAME AND SPEC DIRECTORY
# ============================================================
# Strategy: read stored name from state first, fall back to filesystem scan

SPECS_ROOT="$CWD/.dev/specs"
SESSIONS_ROOT="$CWD/.dev/.sessions"
SPEC_DIR=""
DRAFT_DIR=""
FEATURE_NAME=""

# --- Method 1: Read name from state (reliable) ---
STORED_NAME=$(jq -r --arg sid "$SESSION_ID" '.[$sid].ultrawork.name // empty' "$STATE_FILE")

if [[ -n "$STORED_NAME" ]] && [[ "$STORED_NAME" != "null" ]]; then
  FEATURE_NAME="$STORED_NAME"
  SPEC_DIR="$SPECS_ROOT/$FEATURE_NAME"

  # Resolve DRAFT_DIR via session.ref
  if [[ -f "$SPEC_DIR/session.ref" ]]; then
    REF_SID=$(cat "$SPEC_DIR/session.ref" 2>/dev/null | tr -d '[:space:]')
    if [[ -n "$REF_SID" ]] && [[ -d "$SESSIONS_ROOT/$REF_SID" ]]; then
      DRAFT_DIR="$SESSIONS_ROOT/$REF_SID"
    else
      DRAFT_DIR="$SPEC_DIR"
    fi
  else
    DRAFT_DIR="$SPEC_DIR"  # Legacy: DRAFT.md colocated with spec
  fi
fi

# --- Method 2: Filesystem scan (fallback for backward compat) ---
if [[ -z "$FEATURE_NAME" ]]; then
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
      if [[ "$CANDIDATE_DIR" == "$SESSIONS_ROOT"* ]]; then
        RESOLVED_SESSION_ID=$(basename "$CANDIDATE_DIR")
        DRAFT_DIR="$CANDIDATE_DIR"
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
      else
        SPEC_DIR="$CANDIDATE_DIR"
        DRAFT_DIR="$CANDIDATE_DIR"
        FEATURE_NAME=$(basename "$SPEC_DIR")
      fi
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
  local tmp="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" \
     --arg phase "$new_phase" \
     --argjson iter "$next_iter" \
     '.[$sid].ultrawork.phase = $phase | .[$sid].ultrawork.iteration = $iter' \
     "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

cleanup_session() {
  local tmp="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

# Check if plan is approved (reusable across phases)
check_plan_approved() {
  local plan_file="$1"
  local plan_content="$2"
  local draft_file="$3"
  # Method 1: APPROVED marker in file
  if grep -qi "APPROVED\|Status:.*Approved" "$plan_file" 2>/dev/null; then
    return 0
  fi
  # Method 2: plan-content.json exists + DRAFT deleted
  if [[ -f "$plan_content" ]] && [[ ! -f "$draft_file" ]]; then
    return 0
  fi
  # Method 3: plan-content.json exists = generated through specify pipeline
  if [[ -f "$plan_content" ]]; then
    return 0
  fi
  return 1
}

# ============================================================
# PHASE TRANSITION LOGIC (filesystem-based)
# ============================================================
# Instead of relying on stored phase, detect current state from
# the filesystem each time. This eliminates phase persistence bugs.

PLAN_FILE="$SPEC_DIR/PLAN.md"
PLAN_CONTENT="$SPEC_DIR/plan-content.json"
DRAFT_FILE="${DRAFT_DIR:-$SPEC_DIR}/DRAFT.md"

# --- Detection: work backwards from most-advanced state ---

# 1. Check if ALL TODOs are done → pipeline complete
if [[ -f "$PLAN_FILE" ]]; then
  UNCHECKED=$(grep -c '### \[ \] TODO' "$PLAN_FILE" 2>/dev/null) || UNCHECKED=0
  TOTAL_TODOS=$(grep -c '### \[.\] TODO' "$PLAN_FILE" 2>/dev/null) || TOTAL_TODOS=0

  if [[ "$TOTAL_TODOS" -gt 0 ]] && [[ "$UNCHECKED" -eq 0 ]]; then
    cleanup_session
    echo "🎉 Ultrawork: Complete!" >&2
    exit 0
  fi
fi

# 2. Check if PR/branch exists → executing or opening phase
PR_NUMBER=""
PR_EXISTS=false

if [[ -n "$FEATURE_NAME" ]]; then
  if command -v gh &> /dev/null; then
    PR_NUMBER=$(cd "$CWD" && gh pr list --head "feat/$FEATURE_NAME" --json number -q '.[0].number' 2>/dev/null || echo "")
    if [[ -n "$PR_NUMBER" ]]; then
      PR_EXISTS=true
    fi
  fi
  if [[ "$PR_EXISTS" != "true" ]] && command -v git &> /dev/null; then
    if git -C "$CWD" rev-parse --verify "feat/$FEATURE_NAME" &>/dev/null; then
      PR_EXISTS=true
    fi
  fi
fi

if [[ "$PR_EXISTS" == "true" ]]; then
  # PR/branch exists — are we executing?
  # Check if execute has started (active-spec file exists and state.json has skill=execute)
  ACTIVE_SPEC="$CWD/.dev/active-spec"
  if [[ -f "$ACTIVE_SPEC" ]]; then
    # Execute is running — let dev-execute-stop-hook handle it
    update_phase "executing"
    exit 0
  fi

  # PR exists but execute not started yet → start execute
  if [[ "$PHASE" == "executing" ]]; then
    # Already issued /execute instruction. Allow stop to prevent loop.
    echo "⏳ Ultrawork: /execute already requested. Allowing stop." >&2
    exit 0
  fi
  update_phase "executing"
  echo "🔀 Ultrawork: PR exists → /execute" >&2
  jq -n \
    --arg name "$FEATURE_NAME" \
    --arg reason "Draft PR exists. Start implementation.

Execute: Skill(\"execute\", args=\"$FEATURE_NAME\")" \
    '{"decision": "block", "reason": $reason}'
  exit 0
fi

# 3. Check if plan is approved → trigger /open
if [[ -f "$PLAN_FILE" ]] && [[ -f "$PLAN_CONTENT" ]]; then
  if [[ "$PHASE" == "opening" ]]; then
    # Already issued /open instruction. Allow stop to prevent loop.
    echo "⏳ Ultrawork: /open already requested. Allowing stop." >&2
    exit 0
  fi
  # plan-content.json exists = plan was generated through specify pipeline
  update_phase "opening"
  echo "✅ Ultrawork: Plan ready → /open" >&2
  jq -n \
    --arg name "$FEATURE_NAME" \
    --arg reason "Plan is ready. Create the Draft PR.

Execute: Skill(\"open\", args=\"$FEATURE_NAME\")" \
    '{"decision": "block", "reason": $reason}'
  exit 0
fi

# 4. Check if PLAN.md exists but no plan-content.json → needs approval
if [[ -f "$PLAN_FILE" ]]; then
  if [[ "$PHASE" == "specify_plan" ]]; then
    echo "⏳ Ultrawork: Plan review already requested. Allowing stop." >&2
    exit 0
  fi
  update_phase "specify_plan"
  echo "📋 Ultrawork: Plan needs approval." >&2
  jq -n \
    --arg reason "Plan exists but plan-content.json missing. Run plan-reviewer: Task(subagent_type=\"plan-reviewer\")." \
    '{"decision": "block", "reason": $reason}'
  exit 0
fi

# 5. Check if DRAFT.md exists → trigger plan generation
if [[ -f "$DRAFT_FILE" ]]; then
  if [[ "$PHASE" == "specify_plan" ]]; then
    echo "⏳ Ultrawork: Plan generation already requested. Allowing stop." >&2
    exit 0
  fi
  update_phase "specify_plan"
  echo "📝 Ultrawork: Draft ready. Generate the plan." >&2
  jq -n \
    --arg reason "Draft is complete. Now generate the plan.

Say: \"Let me generate the plan now.\"

Follow specify skill's plan generation:
1. Validate draft completeness
2. Run analysis agents
3. Create PLAN.md + plan-content.json
4. Call plan-reviewer for approval" \
    '{"decision": "block", "reason": $reason}'
  exit 0
fi

# 6. Nothing found — interview still in progress, allow stop
exit 0
