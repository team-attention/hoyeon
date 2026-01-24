#!/bin/bash
# dev-subagent-stop.sh - SubagentStop hook for dev workflow agents
#
# Purpose: Validate dev agent outputs using claude -p
# Uses validation_prompt from agent frontmatter for LLM-based validation
#
# Hook Input Fields (SubagentStop):
#   - agent_id: subagent unique ID
#   - agent_transcript_path: path to agent's conversation log
#   - session_id: current session
#   - cwd: current working directory
#
# Requires: claude CLI installed

set -euo pipefail

INPUT=$(cat)

# Extract fields
CWD=$(echo "$INPUT" | jq -r '.cwd')
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

# State file path
STATE_FILE="$CWD/.dev/state.local.json"

if [[ ! -f "$STATE_FILE" ]]; then
  # No state file - nothing to do
  exit 0
fi

# Get agent type from state file
AGENT_TYPE=$(jq -r --arg sid "$SESSION_ID" --arg aid "$AGENT_ID" \
  '.[$sid].agents[$aid] // empty' "$STATE_FILE")

if [[ -z "$AGENT_TYPE" ]]; then
  # Not a tracked dev agent
  exit 0
fi

# Parse validation_prompt from agent frontmatter (pure bash, no yq)
extract_validation_prompt() {
  local agent_file="$1"

  if [[ ! -f "$agent_file" ]]; then
    return 1
  fi

  local in_frontmatter=false
  local in_validation=false
  local prompt=""

  while IFS= read -r line; do
    if [[ "$line" == "---" ]]; then
      if [[ "$in_frontmatter" == "true" ]]; then
        break
      else
        in_frontmatter=true
        continue
      fi
    fi

    if [[ "$in_frontmatter" != "true" ]]; then
      continue
    fi

    if [[ "$line" =~ ^validation_prompt: ]]; then
      in_validation=true
      local inline_value="${line#validation_prompt:}"
      inline_value="${inline_value# }"
      if [[ -n "$inline_value" && "$inline_value" != "|" ]]; then
        echo "$inline_value"
        return 0
      fi
      continue
    fi

    if [[ "$in_validation" == "true" ]]; then
      if [[ "$line" =~ ^[a-zA-Z_-]+: && ! "$line" =~ ^[[:space:]] ]]; then
        break
      fi
      local content="${line#  }"
      prompt+="$content"$'\n'
    fi
  done < "$agent_file"

  if [[ -n "$prompt" ]]; then
    echo "$prompt"
    return 0
  fi

  return 1
}

# Extract last assistant message from transcript
extract_agent_output() {
  local transcript="$1"
  local max_chars=8000

  local output
  output=$(jq -rs '[.[] | select(.type == "assistant")] | last | .message.content[]? | select(.type == "text") | .text' "$transcript" 2>/dev/null)

  if [[ ${#output} -gt $max_chars ]]; then
    output="${output:0:$max_chars}... [truncated]"
  fi

  echo "$output"
}

# Validate with Claude CLI
validate_with_claude() {
  local agent_type="$1"
  local validation_prompt="$2"
  local agent_output="$3"

  if ! command -v claude &> /dev/null; then
    echo "{}"
    return 0
  fi

  local result
  result=$(claude -p --model sonnet << EOF
You are validating a "${agent_type}" agent's output.

## Validation Criteria
${validation_prompt}

## Agent Output
${agent_output}

## Instructions
Check if the agent's output meets the validation criteria.

Return ONLY a JSON object (no markdown, no code fence):
- If criteria met: {}
- If criteria NOT met: {"decision": "block", "reason": "what's missing"}
EOF
  ) 2>/dev/null || echo "{}"

  echo "$result"
}

# Main validation logic
validate_agent() {
  local agent_type="$1"
  local transcript="$2"

  local agent_file="$CWD/.claude/agents/${agent_type}.md"

  if [[ ! -f "$agent_file" ]]; then
    echo "{}"
    return 0
  fi

  local validation_prompt
  validation_prompt=$(extract_validation_prompt "$agent_file")

  if [[ -z "$validation_prompt" ]]; then
    echo "{}"
    return 0
  fi

  local agent_output
  agent_output=$(extract_agent_output "$transcript")

  if [[ -z "$agent_output" ]]; then
    echo "{}"
    return 0
  fi

  validate_with_claude "$agent_type" "$validation_prompt" "$agent_output"
}

# Run validation if transcript exists
if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
  validate_agent "$AGENT_TYPE" "$TRANSCRIPT_PATH"
fi

# Remove agent from session's agents map (atomic write)
TEMP_FILE="${STATE_FILE}.tmp.$$"

jq --arg sid "$SESSION_ID" --arg aid "$AGENT_ID" \
  'if .[$sid].agents then del(.[$sid].agents[$aid]) else . end' \
  "$STATE_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$STATE_FILE"

echo "📋 Dev agent stopped: $AGENT_TYPE ($AGENT_ID)" >&2

exit 0
