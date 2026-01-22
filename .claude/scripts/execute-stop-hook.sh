#!/bin/bash

# Execute Stop Hook
# Prevents session exit when orchestration is incomplete
# Verifies: TODOs, Acceptance Criteria, Git commits, Final Report

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract paths from hook input
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# State file pattern: .dev/specs/{name}/execute-state.local.md
# Find active state file
STATE_FILE=$(find "$CWD/.dev/specs" -name "execute-state.local.md" 2>/dev/null | head -1 || echo "")

if [[ -z "$STATE_FILE" ]] || [[ ! -f "$STATE_FILE" ]]; then
  # No active execution - allow exit
  exit 0
fi

# Parse YAML frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//' || echo "0")
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//' || echo "20")
PLAN_PATH=$(echo "$FRONTMATTER" | grep '^plan_path:' | sed 's/plan_path: *//' || echo "")
MODE=$(echo "$FRONTMATTER" | grep '^mode:' | sed 's/mode: *//' || echo "local")

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Execute hook: State file corrupted (invalid iteration: '$ITERATION')" >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Execute hook: State file corrupted (invalid max_iterations: '$MAX_ITERATIONS')" >&2
  rm "$STATE_FILE"
  exit 0
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Execute hook: Max iterations ($MAX_ITERATIONS) reached." >&2
  echo "   Forcing stop to prevent infinite loop." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Validate plan path (convert to absolute)
PLAN_PATH_ABS="$CWD/$PLAN_PATH"
if [[ -z "$PLAN_PATH" ]] || [[ ! -f "$PLAN_PATH_ABS" ]]; then
  echo "⚠️  Execute hook: Plan file not found (path: '$PLAN_PATH_ABS')" >&2
  rm "$STATE_FILE"
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
# Only count unchecked items that are indented (inside TODO sections)
UNCHECKED_AC=$(grep -cE '^\s+- \[ \]' "$PLAN_PATH_ABS" 2>/dev/null) || UNCHECKED_AC=0
if [[ "$UNCHECKED_AC" -gt 0 ]]; then
  ERRORS+=("Unchecked Acceptance Criteria: $UNCHECKED_AC items")
fi

# 3. Check for Final Report in transcript
if [[ -f "$TRANSCRIPT_PATH" ]]; then
  # Look for the Final Report marker in assistant messages
  FINAL_REPORT_FOUND=$(grep -l "ORCHESTRATION COMPLETE" "$TRANSCRIPT_PATH" 2>/dev/null || echo "")
  if [[ -z "$FINAL_REPORT_FOUND" ]]; then
    ERRORS+=("Final Report not output yet")
  fi
else
  ERRORS+=("Transcript file not found")
fi

# 4. Check for uncommitted changes (git commits should be done)
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
  rm "$STATE_FILE"
  exit 0
fi

# Not complete - continue execution
NEXT_ITERATION=$((ITERATION + 1))

# Update iteration in state file
TEMP_FILE="${STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

# Build error summary
ERROR_SUMMARY=$(printf '%s\n' "${ERRORS[@]}" | sed 's/^/- /')

# Build continuation prompt
CONTINUE_PROMPT="## Orchestration Incomplete

The following items need attention before stopping:

$ERROR_SUMMARY

**Current Progress:**
- Iteration: $NEXT_ITERATION / $MAX_ITERATIONS
- Plan: $PLAN_PATH
- Mode: $MODE

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
