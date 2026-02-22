#!/bin/bash
# dev-execute-stop-hook.sh - Stop hook
#
# Purpose: Prevents session exit when orchestration is incomplete
# Detection: Reads engine state from state.json (via session.ref resolution)
# Verifies: Engine finalize status, uncommitted changes
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

# ============================================================
# DETECTION: Resolve state.json via active-spec + session.ref
# ============================================================

ACTIVE_SPEC_FILE="$CWD/.dev/active-spec"
if [[ ! -f "$ACTIVE_SPEC_FILE" ]]; then
  exit 0
fi
SPEC_NAME=$(cat "$ACTIVE_SPEC_FILE")

# Resolve state.json via session.ref
SESSION_REF="$CWD/.dev/specs/$SPEC_NAME/session.ref"
if [[ -f "$SESSION_REF" ]]; then
  SID=$(cat "$SESSION_REF")
  STATE_JSON="$CWD/.dev/.sessions/$SID/state.json"
else
  STATE_JSON="$CWD/.dev/specs/$SPEC_NAME/state.json"
fi

if [[ ! -f "$STATE_JSON" ]]; then
  exit 0
fi

SKILL=$(jq -r '.skill // empty' "$STATE_JSON")
if [[ "$SKILL" != "execute" ]]; then
  exit 0
fi

# ============================================================
# ITERATION SAFETY
# ============================================================

ITERATION=$(jq -r '.engine.iteration // 0' "$STATE_JSON")
MAX_ITERATIONS=30

# Validate numeric
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  ITERATION=0
fi

if [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Execute hook: Max iterations ($MAX_ITERATIONS) reached." >&2
  echo "   Forcing stop to prevent infinite loop." >&2
  exit 0
fi

# ============================================================
# COMPLETION CHECK: Engine finalize status
# ============================================================

ENGINE_DONE=$(jq -r '.engine.finalize.status // empty' "$STATE_JSON")
if [[ "$ENGINE_DONE" == "done" ]]; then
  # Engine reports complete — allow exit
  echo "✅ Execute hook: Engine finalize complete." >&2
  exit 0
fi

# ============================================================
# VERIFICATION CHECKS
# ============================================================

ERRORS=()

# 1. Check engine finalize status
FINALIZE_STEP=$(jq -r '.engine.finalize.step // empty' "$STATE_JSON")
if [[ "$ENGINE_DONE" != "done" ]]; then
  ERRORS+=("Engine not finalized (current step: ${FINALIZE_STEP:-none})")
fi

# 2. Check for failed TODOs
FAILED_TODOS=$(jq -r '[.engine.todos // {} | to_entries[] | select(.value.status == "failed") | .key] | join(", ")' "$STATE_JSON")
if [[ -n "$FAILED_TODOS" ]]; then
  ERRORS+=("Failed TODOs: $FAILED_TODOS")
fi

# 3. Check for uncommitted changes
if command -v git &> /dev/null && [[ -d "$CWD/.git" ]]; then
  UNCOMMITTED=$(cd "$CWD" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo "0")
  if [[ "$UNCOMMITTED" -gt 0 ]]; then
    ERRORS+=("Uncommitted changes: $UNCOMMITTED files")
  fi
fi

# 4. Check for Final Report in transcript
if [[ -f "$TRANSCRIPT_PATH" ]]; then
  FINAL_REPORT_FOUND=$(grep -l "ORCHESTRATION COMPLETE" "$TRANSCRIPT_PATH" 2>/dev/null || echo "")
  if [[ -z "$FINAL_REPORT_FOUND" ]]; then
    ERRORS+=("Final Report not output yet")
  fi
fi

# ============================================================
# DECISION
# ============================================================

if [[ ${#ERRORS[@]} -eq 0 ]]; then
  echo "✅ Execute hook: All verifications passed." >&2
  exit 0
fi

# Not complete - increment iteration and persist to state.json
NEXT_ITERATION=$((ITERATION + 1))

# Write iteration back to state.json (atomic write)
TEMP_FILE="${STATE_JSON}.tmp.$$"
jq --argjson iter "$NEXT_ITERATION" '.engine.iteration = $iter' "$STATE_JSON" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_JSON"

# Build error summary
ERROR_SUMMARY=$(printf '%s\n' "${ERRORS[@]}" | sed 's/^/- /')

# Build continuation prompt
CONTINUE_PROMPT="## Orchestration Incomplete

The following items need attention before stopping:

$ERROR_SUMMARY

**Current Progress:**
- Iteration: $NEXT_ITERATION / $MAX_ITERATIONS

**Next Actions:**
Continue calling \`node dev-cli/bin/dev-cli.js next {name}\` until the engine returns \`{ done: true }\`.

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
