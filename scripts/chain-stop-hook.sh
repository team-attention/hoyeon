#!/bin/bash
# chain-stop-hook.sh — Stop hook
# Drives chain execution step-by-step (same pattern as rph-loop.sh).
#
# On each stop:
#   1. Find active chain for session
#   2. If next step pending → block + inject step instruction
#   3. If all steps completed → auto chain-complete → allow stop
#   4. No chain → allow stop
#
# Registration in settings.json:
#   { "type": "command", "command": ".claude/scripts/chain-stop-hook.sh" }

set -euo pipefail

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$session_id" ]; then
  exit 0
fi

# Query active chain for this session
status_exit=0
status=$(node dev-cli/bin/dev-cli.js chain-status --session "$session_id" 2>/dev/null) || status_exit=$?
if [ "$status_exit" -ne 0 ]; then
  exit 0  # No chain → allow stop
fi

chain_status=$(echo "$status" | jq -r '.status')
remaining=$(echo "$status" | jq -r '.remainingSteps')
chain_id=$(echo "$status" | jq -r '.chainId')
source_kw=$(echo "$status" | jq -r '.source')

# Chain not running → allow stop
if [ "$chain_status" != "running" ]; then
  exit 0
fi

# All steps completed → auto chain-complete → allow stop
if [ "$remaining" -eq 0 ]; then
  node dev-cli/bin/dev-cli.js chain-complete "$chain_id" >/dev/null 2>&1 || true
  exit 0
fi

# ── Next step pending → block + inject instruction ──
next_step=$(echo "$status" | jq -c '.executionPlan[0]')
step_id=$(echo "$next_step" | jq -r '.stepId')
step_num=$(echo "$next_step" | jq -r '.stepNumber')
total=$(echo "$status" | jq -r '.steps | length')
completed=$((total - remaining))

jq -n \
  --arg cid "$chain_id" \
  --arg sid "$step_id" \
  --arg num "$step_num" \
  --arg tot "$total" \
  --arg done "$completed" \
  --arg rem "$remaining" \
  --arg src "$source_kw" \
  --argjson step "$next_step" \
  '{
    decision: "block",
    reason: (
      "ACTION CHAIN (" + $src + "): Step " + $done + "/" + $tot + " completed. " + $rem + " remaining.\n\n" +
      "Execute ONLY this next step:\n" + ($step | tostring) + "\n\n" +
      "Step type instructions:\n" +
      "- agent: Call Task(subagent_type=agentType) with the original user prompt as context\n" +
      "- builtin: Execute the command directly (commit = git commit, push = git push)\n" +
      "- skill: Call Skill(skillName)\n\n" +
      "After completion, persist the result:\n" +
      "  echo \u0027{\"result\": \"brief summary\"}\u0027 | node dev-cli/bin/dev-cli.js chain-persist " + $cid + " " + $sid + "\n\n" +
      "Then STOP. The system will give you the next step (or finish the chain)."
    )
  }'
