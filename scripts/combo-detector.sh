#!/bin/bash
# combo-detector.sh — UserPromptSubmit hook
# Detects !action patterns, creates chain, and injects FIRST STEP ONLY.
# Subsequent steps are driven by chain-stop-hook.sh (Stop hook).
#
# Pattern: same as !rph — UserPromptSubmit starts, Stop hook loops.
#
# Registration in settings.json:
#   { "type": "command", "command": ".claude/scripts/combo-detector.sh" }

set -euo pipefail

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

# Guard: empty prompt
if [ -z "$prompt" ]; then
  exit 0
fi

# ── Resume check: active chain without new !keyword ──
if [[ ! "$prompt" =~ \! ]]; then
  active=$(node dev-cli/bin/dev-cli.js chain-status --session "$session_id" 2>/dev/null) || true
  if [ -n "$active" ]; then
    remaining=$(echo "$active" | jq -r '.remainingSteps // 0')
    if [ "$remaining" -gt 0 ]; then
      chain_id=$(echo "$active" | jq -r '.chainId')
      # Get first pending step only
      next_step=$(echo "$active" | jq -c '.executionPlan[0]')
      step_id=$(echo "$next_step" | jq -r '.stepId')
      jq -n \
        --arg cid "$chain_id" \
        --arg sid "$step_id" \
        --arg rem "$remaining" \
        --argjson step "$next_step" \
        '{
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: (
              "ACTION CHAIN RESUME (chainId: " + $cid + "). " + $rem + " steps remaining.\n\n" +
              "Execute ONLY this step:\n" + ($step | tostring) + "\n\n" +
              "After completion, persist the result:\n" +
              "  echo \u0027{\"result\": \"brief summary\"}\u0027 | node dev-cli/bin/dev-cli.js chain-persist " + $cid + " " + $sid + "\n\n" +
              "Then STOP. The system will automatically give you the next step."
            )
          }
        }'
      exit 0
    fi
  fi
  exit 0
fi

# ── !keyword detection ──
if [[ ! "$prompt" =~ \!([a-zA-Z][a-zA-Z0-9\>_-]*) ]]; then
  exit 0
fi

keyword="${BASH_REMATCH[1]}"

# ── Pass-through for existing magic keywords ──
case "$keyword" in
  rv|rv[0-9]*|rph|rph[0-9]*|gst|glog) exit 0 ;;
esac

# ── Resolve action + create chain ──
chain_exit=0
chain_result=$(node dev-cli/bin/dev-cli.js chain-init "$keyword" \
  --session "$session_id" 2>/dev/null) || chain_exit=$?

if [ "$chain_exit" -ne 0 ]; then
  error_msg=$(node dev-cli/bin/dev-cli.js chain-init "$keyword" \
    --session "$session_id" 2>&1 | tail -1) || true
  jq -n \
    --arg kw "$keyword" \
    --arg err "$error_msg" \
    '{
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: (
          "ACTION ERROR: Unknown action \u0027!" + $kw + "\u0027. " + $err + "\n\n" +
          "Ignore the \u0027!" + $kw + "\u0027 keyword and respond to the rest of the user\u0027s prompt normally."
        )
      }
    }'
  exit 0
fi

chain_id=$(echo "$chain_result" | jq -r '.chainId')
total_steps=$(echo "$chain_result" | jq '.executionPlan | length')

# Get FIRST step only
first_step=$(echo "$chain_result" | jq -c '.executionPlan[0]')
step_id=$(echo "$first_step" | jq -r '.stepId')

# ── Inject FIRST STEP ONLY via additionalContext ──
jq -n \
  --arg cid "$chain_id" \
  --arg kw "$keyword" \
  --arg sid "$step_id" \
  --arg total "$total_steps" \
  --argjson step "$first_step" \
  '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: (
        "ACTION CHAIN ACTIVATED (chainId: " + $cid + ", " + $total + " steps total).\n\n" +
        "Ignore the \u0027!" + $kw + "\u0027 keyword in the prompt - it is a system command.\n\n" +
        "Execute ONLY this step (step 1 of " + $total + "):\n" + ($step | tostring) + "\n\n" +
        "Step type instructions:\n" +
        "- agent: Call Task(subagent_type=agentType) with the user\u0027s prompt as context\n" +
        "- builtin: Execute the command directly (commit = git commit, push = git push)\n" +
        "- skill: Call Skill(skillName)\n\n" +
        "After completion, persist the result:\n" +
        "  echo \u0027{\"result\": \"brief summary\"}\u0027 | node dev-cli/bin/dev-cli.js chain-persist " + $cid + " " + $sid + "\n\n" +
        "Then STOP. The system will automatically give you the next step."
      )
    }
  }'
