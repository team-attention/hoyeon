#!/bin/bash
# dev-worker-verify.sh - PostToolUse hook for worker agent verification
#
# Purpose: Re-execute acceptance_criteria commands to verify Worker output
# Replaces SubagentStop hook with Orchestrator-level verification
#
# Hook Input Fields (PostToolUse for Task):
#   - tool_name: "Task"
#   - tool_input.subagent_type: "worker"
#   - tool_response.content[].text: Worker's output (contains JSON)
#   - cwd: current working directory
#
# Output: Verification results that Orchestrator receives

set -euo pipefail

INPUT=$(cat)

# Extract fields
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Only process Task tool with worker subagent
if [[ "$TOOL_NAME" != "Task" ]] || [[ "$SUBAGENT_TYPE" != "worker" ]]; then
  exit 0
fi

# Extract Worker output text from tool_response
WORKER_OUTPUT=$(echo "$INPUT" | jq -r '.tool_response.content[]? | select(.type == "text") | .text' 2>/dev/null)

if [[ -z "$WORKER_OUTPUT" ]]; then
  echo "⚠️ No Worker output found" >&2
  exit 0
fi

# Extract JSON from Worker output (find ```json ... ``` block)
extract_json() {
  local text="$1"

  # Try to extract JSON from code block
  local json
  json=$(echo "$text" | sed -n '/```json/,/```/p' | sed '1d;$d' 2>/dev/null)

  if [[ -n "$json" ]] && echo "$json" | jq . >/dev/null 2>&1; then
    echo "$json"
    return 0
  fi

  # Try to parse the whole text as JSON
  if echo "$text" | jq . >/dev/null 2>&1; then
    echo "$text"
    return 0
  fi

  return 1
}

WORKER_JSON=$(extract_json "$WORKER_OUTPUT")

if [[ -z "$WORKER_JSON" ]]; then
  echo "⚠️ Could not parse Worker JSON output" >&2
  echo "=== VERIFICATION FAILED ==="
  echo "reason: JSON parsing failed"
  echo "==========================="
  exit 0
fi

# Extract acceptance_criteria array
AC_ITEMS=$(echo "$WORKER_JSON" | jq -c '.acceptance_criteria // []')
AC_COUNT=$(echo "$AC_ITEMS" | jq 'length')

if [[ "$AC_COUNT" == "0" ]]; then
  echo "⚠️ No acceptance_criteria found in Worker output" >&2
  exit 0
fi

echo "=== WORKER VERIFICATION ===" >&2
echo "Verifying $AC_COUNT acceptance criteria..." >&2

# Track results
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
FAILED_ITEMS=""

# Iterate through acceptance_criteria and re-execute commands
for i in $(seq 0 $((AC_COUNT - 1))); do
  ITEM=$(echo "$AC_ITEMS" | jq -c ".[$i]")

  ID=$(echo "$ITEM" | jq -r '.id // "unknown"')
  CATEGORY=$(echo "$ITEM" | jq -r '.category // "unknown"')
  DESCRIPTION=$(echo "$ITEM" | jq -r '.description // ""')
  COMMAND=$(echo "$ITEM" | jq -r '.command // empty')
  WORKER_STATUS=$(echo "$ITEM" | jq -r '.status // "UNKNOWN"')

  # Skip if no command
  if [[ -z "$COMMAND" ]] || [[ "$COMMAND" == "null" ]]; then
    echo "  [$CATEGORY] $ID: SKIP (no command)" >&2
    (( ++SKIP_COUNT ))
    continue
  fi

  # Skip if worker reported SKIP
  if [[ "$WORKER_STATUS" == "SKIP" ]]; then
    echo "  [$CATEGORY] $ID: SKIP (worker reported)" >&2
    (( ++SKIP_COUNT ))
    continue
  fi

  # Execute command in CWD
  cd "$CWD"

  if eval "$COMMAND" >/dev/null 2>&1; then
    ACTUAL_STATUS="PASS"
  else
    ACTUAL_STATUS="FAIL"
  fi

  # Compare Worker report vs actual
  if [[ "$ACTUAL_STATUS" == "PASS" ]]; then
    echo "  [$CATEGORY] $ID: VERIFIED ✅" >&2
    (( ++PASS_COUNT ))
  else
    if [[ "$WORKER_STATUS" == "PASS" ]]; then
      echo "  [$CATEGORY] $ID: MISMATCH ❌ (Worker said PASS, actual FAIL)" >&2
    else
      echo "  [$CATEGORY] $ID: FAIL ❌" >&2
    fi
    (( ++FAIL_COUNT ))
    FAILED_ITEMS="${FAILED_ITEMS}${ID}:${CATEGORY}:${COMMAND}\n"
  fi
done

echo "===========================" >&2
echo "Results: PASS=$PASS_COUNT, FAIL=$FAIL_COUNT, SKIP=$SKIP_COUNT" >&2

# Output structured result for Orchestrator
echo ""
echo "=== VERIFICATION RESULT ==="
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo "status: VERIFIED"
  echo "pass: $PASS_COUNT"
  echo "skip: $SKIP_COUNT"
else
  echo "status: FAILED"
  echo "pass: $PASS_COUNT"
  echo "fail: $FAIL_COUNT"
  echo "skip: $SKIP_COUNT"
  echo "failed_items:"
  echo -e "$FAILED_ITEMS" | while read -r line; do
    if [[ -n "$line" ]]; then
      echo "  - $line"
    fi
  done
fi
echo "==========================="

exit 0
