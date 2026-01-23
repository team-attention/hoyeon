#!/bin/bash
# dev-execute-stop-hook.sh - Stop hook
#
# Purpose: Prevents session exit when orchestration is incomplete
# Verifies: TODOs, Acceptance Criteria, Git commits, Final Report
#
# Hook Input Fields (Stop):
#   - session_id: current session
#   - transcript_path: conversation log path
#   - cwd: current working directory

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract fields
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# State file path
STATE_FILE="$CWD/.dev/state.local.json"

if [[ ! -f "$STATE_FILE" ]]; then
  # No state file - allow exit
  exit 0
fi

# Clean up stale sessions (older than 24 hours)
CUTOFF=$(date -u -v-24H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '24 hours ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
if [[ -n "$CUTOFF" ]]; then
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg cutoff "$CUTOFF" '
    to_entries | map(select(.value.created_at > $cutoff or .value.created_at == null)) | from_entries
  ' "$STATE_FILE" > "$TEMP_FILE" 2>/dev/null && mv "$TEMP_FILE" "$STATE_FILE" || true
fi

# Check if this session has execute state
EXECUTE_STATE=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute // empty' "$STATE_FILE")

if [[ -z "$EXECUTE_STATE" ]] || [[ "$EXECUTE_STATE" == "null" ]]; then
  # No execute state for this session - allow exit
  exit 0
fi

# Extract execute fields
ITERATION=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute.iteration // 0' "$STATE_FILE")
MAX_ITERATIONS=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute.max_iterations // 30' "$STATE_FILE")
PLAN_PATH=$(jq -r --arg sid "$SESSION_ID" '.[$sid].execute.plan_path // empty' "$STATE_FILE")

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  ITERATION=0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  MAX_ITERATIONS=30
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Execute hook: Max iterations ($MAX_ITERATIONS) reached." >&2
  echo "   Forcing stop to prevent infinite loop." >&2
  # Remove session from state file
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
  exit 0
fi

# Validate plan path
PLAN_PATH_ABS="$CWD/$PLAN_PATH"
if [[ -z "$PLAN_PATH" ]] || [[ ! -f "$PLAN_PATH_ABS" ]]; then
  echo "⚠️ Execute hook: Plan file not found (path: '$PLAN_PATH_ABS')" >&2
  # Remove session from state file
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
  exit 0
fi

# ============================================================
# VERIFICATION CHECKS
# ============================================================

ERRORS=()

# 1. Check for unchecked TODOs in plan file
UNCHECKED_TODOS=$(grep -c '### \[ \] TODO' "$PLAN_PATH_ABS" 2>/dev/null) || UNCHECKED_TODOS=0
if [[ "$UNCHECKED_TODOS" -gt 0 ]]; then
  TODO_TITLES=$(grep '### \[ \] TODO' "$PLAN_PATH_ABS" | sed 's/### \[ \] //' | head -3 | tr '\n' ', ' | sed 's/, $//')
  ERRORS+=("Unchecked TODOs ($UNCHECKED_TODOS): $TODO_TITLES")
fi

# 2. Check for unchecked Acceptance Criteria
UNCHECKED_AC=$(grep -cE '^\s+- \[ \]' "$PLAN_PATH_ABS" 2>/dev/null) || UNCHECKED_AC=0
if [[ "$UNCHECKED_AC" -gt 0 ]]; then
  ERRORS+=("Unchecked Acceptance Criteria: $UNCHECKED_AC items")
fi

# 3. Check for Final Report in transcript
if [[ -f "$TRANSCRIPT_PATH" ]]; then
  FINAL_REPORT_FOUND=$(grep -l "ORCHESTRATION COMPLETE" "$TRANSCRIPT_PATH" 2>/dev/null || echo "")
  if [[ -z "$FINAL_REPORT_FOUND" ]]; then
    ERRORS+=("Final Report not output yet")
  fi
else
  ERRORS+=("Transcript file not found")
fi

# 4. Check for uncommitted changes
if command -v git &> /dev/null && [[ -d "$CWD/.git" ]]; then
  UNCOMMITTED=$(cd "$CWD" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo "0")
  if [[ "$UNCOMMITTED" -gt 0 ]]; then
    ERRORS+=("Uncommitted changes: $UNCOMMITTED files (delegate to git-master)")
  fi
fi

# ============================================================
# DECISION
# ============================================================

if [[ ${#ERRORS[@]} -eq 0 ]]; then
  # All checks passed - allow exit and cleanup
  echo "✅ Execute hook: All verifications passed." >&2
  # Remove session from state file
  TEMP_FILE="${STATE_FILE}.tmp.$$"
  jq --arg sid "$SESSION_ID" 'del(.[$sid])' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"
  exit 0
fi

# Not complete - continue execution
NEXT_ITERATION=$((ITERATION + 1))

# Update iteration in state file (atomic write)
TEMP_FILE="${STATE_FILE}.tmp.$$"
jq --arg sid "$SESSION_ID" --argjson iter "$NEXT_ITERATION" \
  '.[$sid].execute.iteration = $iter' "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

# Build error summary
ERROR_SUMMARY=$(printf '%s\n' "${ERRORS[@]}" | sed 's/^/- /')

# Build continuation prompt
CONTINUE_PROMPT="## Orchestration Incomplete

The following items need attention before stopping:

$ERROR_SUMMARY

**Current Progress:**
- Iteration: $NEXT_ITERATION / $MAX_ITERATIONS
- Plan: $PLAN_PATH

**Next Actions:**
1. If TODOs remain: Continue with next unchecked TODO
2. If Acceptance Criteria unchecked: Verify and check them
3. If uncommitted changes: Delegate to git-master
4. If Final Report missing: Output the Final Report

Continue working until all items are complete."

# Build system message
SYSTEM_MSG="🔄 Execute iteration $NEXT_ITERATION/$MAX_ITERATIONS | ${#ERRORS[@]} issue(s) remaining"

# Output JSON to block the stop
jq -n \
  --arg prompt "$CONTINUE_PROMPT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
