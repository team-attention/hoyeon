#!/bin/bash
# combo-detector.sh — UserPromptSubmit hook
# Detects !action patterns and injects execution plan via additionalContext.
#
# Registration in settings.json:
#   { "type": "command", "command": ".claude/scripts/combo-detector.sh" }
#
# Placement: before rv-detector.sh (rv/rph patterns are passed through)

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
      plan_json=$(echo "$active" | jq -c '.executionPlan')
      # Build context using jq --argjson to safely embed JSON
      jq -n \
        --arg cid "$chain_id" \
        --arg rem "$remaining" \
        --argjson plan "$plan_json" \
        '{
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: (
              "ACTION CHAIN RESUME (chainId: " + $cid + "). " + $rem + " steps remaining.\n\n" +
              "Continue executing the remaining steps from where you left off.\n\n" +
              "Execution Plan:\n" + ($plan | tostring) + "\n\n" +
              "After each step, persist result:\n" +
              "  echo \u0027{\"result\": \"summary\"}\u0027 | node dev-cli/bin/dev-cli.js chain-persist " + $cid + " step-{N}\n\n" +
              "When all steps complete:\n" +
              "  node dev-cli/bin/dev-cli.js chain-complete " + $cid
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
  error_msg=$(echo "$chain_result" | tail -1)
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
plan_json=$(echo "$chain_result" | jq -c '.executionPlan')

# ── Inject execution plan via additionalContext ──
jq -n \
  --arg cid "$chain_id" \
  --arg kw "$keyword" \
  --argjson plan "$plan_json" \
  '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: (
        "ACTION CHAIN ACTIVATED (chainId: " + $cid + ").\n\n" +
        "Ignore the \u0027!" + $kw + "\u0027 keyword in the prompt - it is a system command.\n\n" +
        "Execute the following steps sequentially. The user\u0027s prompt provides context for the actions.\n\n" +
        "Execution Plan:\n" + ($plan | tostring) + "\n\n" +
        "IMPORTANT INSTRUCTIONS:\n" +
        "1. For \u0027agent\u0027 steps: Call Task(subagent_type=agentType) with the user\u0027s prompt as context.\n" +
        "2. For \u0027builtin\u0027 steps: Execute the command directly (commit = create git commit, push = git push).\n" +
        "3. For \u0027skill\u0027 steps: Call Skill(skillName).\n" +
        "4. After EACH step completes, persist the result:\n" +
        "   echo \u0027{\"result\": \"summary of what happened\"}\u0027 | node dev-cli/bin/dev-cli.js chain-persist " + $cid + " step-{N}\n" +
        "5. When ALL steps complete:\n" +
        "   node dev-cli/bin/dev-cli.js chain-complete " + $cid + "\n" +
        "6. If a step fails, report the error and stop the chain:\n" +
        "   echo \u0027{\"error\": \"description\"}\u0027 | node dev-cli/bin/dev-cli.js chain-persist " + $cid + " step-{N}\n" +
        "   (do NOT continue to the next step)"
      )
    }
  }'
