#!/bin/bash
# PostToolUse hook: agent/skill의 validate_prompt가 있으면 validation 안내
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Task 또는 Skill이 아니면 무시
if [[ "$TOOL_NAME" != "Task" && "$TOOL_NAME" != "Skill" ]]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')

# Agent/Skill 파일 찾기
find_file() {
  local name="$1"
  local type="$2"  # "agent" or "skill"

  if [[ "$type" == "agent" ]]; then
    # Agent 파일 검색 순서: 프로젝트 → 플러그인 → 사용자
    for path in \
      "$CWD/.claude/agents/${name}.md" \
      "${CLAUDE_PLUGIN_ROOT:-}/.claude/agents/${name}.md" \
      "$HOME/.claude/agents/${name}.md"; do
      if [[ -f "$path" ]]; then
        echo "$path"
        return 0
      fi
    done

    # 플러그인 agents 폴더들 검색
    if [[ -d "$CWD/.claude" ]]; then
      local found=$(find "$CWD/.claude" -path "*/agents/${name}.md" 2>/dev/null | head -1)
      if [[ -n "$found" ]]; then
        echo "$found"
        return 0
      fi
    fi
  else
    # Skill 파일 검색
    for path in \
      "$CWD/.claude/skills/${name}/SKILL.md" \
      "${CLAUDE_PLUGIN_ROOT:-}/.claude/skills/${name}/SKILL.md" \
      "$HOME/.claude/skills/${name}/SKILL.md"; do
      if [[ -f "$path" ]]; then
        echo "$path"
        return 0
      fi
    done

    # 플러그인 skills 폴더들 검색
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

# frontmatter에서 validate_prompt 추출
extract_validate_prompt() {
  local file="$1"
  # YAML frontmatter에서 validate_prompt 추출 (멀티라인 지원)
  awk '
    /^---$/ { if (in_frontmatter) exit; in_frontmatter=1; next }
    in_frontmatter && /^validate_prompt:/ {
      sub(/^validate_prompt:[ ]*/, "")
      if (/^[|>]/) {
        # 멀티라인
        multiline=1
        next
      }
      # 싱글라인 (따옴표 제거)
      gsub(/^["'"'"']|["'"'"']$/, "")
      print
      exit
    }
    multiline && /^[^ ]/ { exit }
    multiline { sub(/^  /, ""); print }
  ' "$file"
}

# 타입과 이름 추출
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

# 파일 찾기
FILE=$(find_file "$NAME" "$TYPE" 2>/dev/null) || exit 0

# validate_prompt 추출
VALIDATE_PROMPT=$(extract_validate_prompt "$FILE")

if [[ -z "$VALIDATE_PROMPT" ]]; then
  exit 0
fi

# tool_response 추출
TOOL_RESPONSE=$(echo "$INPUT" | jq -c '.tool_response')

# validation 안내 메시지 출력 (Claude에게 전달됨)
cat << EOF
---
⚠️ VALIDATION REQUIRED for ${TYPE}: ${NAME}

Validate Prompt:
${VALIDATE_PROMPT}

Please verify the output meets the above criteria before proceeding.
---
EOF
