#!/bin/bash
# PostToolUse hook: if agent/skill has validate_prompt, output validation guidance
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Ignore if not Task or Skill
if [[ "$TOOL_NAME" != "Task" && "$TOOL_NAME" != "Skill" ]]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')

# Find Agent/Skill file
find_file() {
  local name="$1"
  local type="$2"  # "agent" or "skill"

  if [[ "$type" == "agent" ]]; then
    # Agent file search order: project → plugin → user
    for path in \
      "$CWD/.claude/agents/${name}.md" \
      "${CLAUDE_PLUGIN_ROOT:-}/agents/${name}.md" \
      "$HOME/.claude/agents/${name}.md"; do
      if [[ -f "$path" ]]; then
        echo "$path"
        return 0
      fi
    done

    # Search plugin agents folders
    if [[ -d "$CWD/.claude" ]]; then
      local found=$(find "$CWD/.claude" -path "*/agents/${name}.md" 2>/dev/null | head -1)
      if [[ -n "$found" ]]; then
        echo "$found"
        return 0
      fi
    fi
  else
    # Search Skill files
    for path in \
      "$CWD/.claude/skills/${name}/SKILL.md" \
      "${CLAUDE_PLUGIN_ROOT:-}/skills/${name}/SKILL.md" \
      "$HOME/.claude/skills/${name}/SKILL.md"; do
      if [[ -f "$path" ]]; then
        echo "$path"
        return 0
      fi
    done

    # Search plugin skills folders
    if [[ -d "$CWD/.claude" ]]; then
      local found=$(find "$CWD/.claude" -path "*/skills/${name}/SKILL.md" 2>/dev/null | head -1)
      if [[ -n "$found" ]]; then
        echo "$found"
        return 0
      fi
    fi
  fi

  return 1
}

# Extract validate_prompt from frontmatter
extract_validate_prompt() {
  local file="$1"
  # Extract validate_prompt from YAML frontmatter (multiline support)
  awk '
    /^---$/ { if (in_frontmatter) exit; in_frontmatter=1; next }
    in_frontmatter && /^validate_prompt:/ {
      sub(/^validate_prompt:[ ]*/, "")
      if (/^[|>]/) {
        # multiline
        multiline=1
        next
      }
      # single-line (strip quotes)
      gsub(/^["'"'"']|["'"'"']$/, "")
      print
      exit
    }
    multiline && /^[^ ]/ { exit }
    multiline { sub(/^  /, ""); print }
  ' "$file"
}

# Extract type and name
if [[ "$TOOL_NAME" == "Task" ]]; then
  NAME=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')
  TYPE="agent"
else
  NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')
  TYPE="skill"
fi

if [[ -z "$NAME" ]]; then
  exit 0
fi

# Find file
FILE=$(find_file "$NAME" "$TYPE" 2>/dev/null) || exit 0

# Extract validate_prompt
VALIDATE_PROMPT=$(extract_validate_prompt "$FILE")

if [[ -z "$VALIDATE_PROMPT" ]]; then
  exit 0
fi

# Extract tool_response
TOOL_RESPONSE=$(echo "$INPUT" | jq -c '.tool_response')

# Output validation guidance message as additionalContext JSON
CONTEXT="⚠️ VALIDATION REQUIRED for ${TYPE}: ${NAME}\n\nValidate Prompt:\n${VALIDATE_PROMPT}\n\nPlease verify the output meets the above criteria before proceeding."

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'
