#!/usr/bin/env bash
# generate-skill-rules.sh
# Scans .claude/skills/*/SKILL.md, calls Gemini 2.5 Flash Lite to generate
# keywords and hints, writes results to .claude/skill-rules.json
#
# Auth modes:
#   - GEMINI_API_KEY env var: uses REST API (generativelanguage.googleapis.com)
#   - Fallback: uses `gemini` CLI (OAuth)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILLS_DIR="${REPO_ROOT}/.claude/skills"
OUTPUT_FILE="${REPO_ROOT}/.claude/skill-rules.json"

GEMINI_MODEL="gemini-2.5-flash-lite"
GEMINI_API_URL="https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent"

# Parse YAML frontmatter from a SKILL.md file
# Outputs: name on line 1, description on line 2+
parse_frontmatter() {
  local file="$1"
  local in_frontmatter=0
  local name=""
  local desc_lines=()
  local capturing_desc=0

  while IFS= read -r line; do
    if [[ $in_frontmatter -eq 0 ]]; then
      if [[ "$line" == "---" ]]; then
        in_frontmatter=1
      fi
      continue
    fi

    # End of frontmatter
    if [[ "$line" == "---" ]]; then
      break
    fi

    # Parse name
    if [[ "$line" =~ ^name:[[:space:]]*(.+)$ ]]; then
      name="${BASH_REMATCH[1]}"
      capturing_desc=0
      continue
    fi

    # Parse description (may be multiline with | or >)
    if [[ "$line" =~ ^description:[[:space:]]*(.*)$ ]]; then
      local rest="${BASH_REMATCH[1]}"
      capturing_desc=1
      if [[ "$rest" != "|" && "$rest" != ">" && -n "$rest" ]]; then
        desc_lines+=("$rest")
        capturing_desc=0
      fi
      continue
    fi

    # Capture indented description lines
    if [[ $capturing_desc -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]+ ]]; then
        local stripped="${line#"${line%%[![:space:]]*}"}"
        desc_lines+=("$stripped")
      else
        capturing_desc=0
      fi
    fi
  done < "$file"

  echo "$name"
  # Join description lines (limit to first 5 lines to keep prompt concise)
  local desc_count=0
  for dl in "${desc_lines[@]}"; do
    echo "$dl"
    desc_count=$((desc_count + 1))
    if [[ $desc_count -ge 5 ]]; then
      break
    fi
  done
}

build_prompt() {
  local skill_name="$1"
  local skill_description="$2"

  cat <<PROMPT
You are generating metadata for a Claude Code skill named '${skill_name}'.

Skill description:
${skill_description}

Generate JSON with exactly these fields:
- keywords: array of 10-15 strings (mix of Korean and English) that users might type to invoke this skill
- hint: a single line (max 80 chars) in English describing what this skill does

Rules:
- keywords should include both the skill name, common Korean phrases, and English alternatives
- hint should be concise and actionable
- Return ONLY valid JSON, no markdown fences

Example output:
{"keywords":["bugfix","bug fix","fix error","error fix","resolve error"],"hint":"Analyzes the root cause and fixes the bug in one shot"}
PROMPT
}

# Call via REST API with GEMINI_API_KEY
call_gemini_api() {
  local prompt="$1"
  local request_body
  request_body=$(jq -n \
    --arg prompt "$prompt" \
    '{
      "contents": [{"parts": [{"text": $prompt}]}],
      "generationConfig": {
        "responseMimeType": "application/json",
        "temperature": 0.3
      }
    }')

  curl -s -X POST \
    "${GEMINI_API_URL}" \
    -H "Content-Type: application/json" \
    -H "x-goog-api-key: ${GEMINI_API_KEY}" \
    -d "$request_body" | jq -r '.candidates[0].content.parts[0].text // empty'
}

# Call via gemini CLI (OAuth fallback)
call_gemini_cli() {
  local prompt="$1"
  local output
  output=$(gemini -p "$prompt" 2>/dev/null)
  # Extract JSON from output (strip any surrounding text)
  echo "$output" | python3 -c "
import sys, json, re
text = sys.stdin.read().strip()
# Try direct parse
try:
    json.loads(text)
    print(text)
    sys.exit(0)
except:
    pass
# Try to extract JSON object
m = re.search(r'\{.*\}', text, re.DOTALL)
if m:
    try:
        json.loads(m.group())
        print(m.group())
        sys.exit(0)
    except:
        pass
print('')
" 2>/dev/null
}

generate_skill_meta() {
  local skill_name="$1"
  local skill_description="$2"
  local prompt
  prompt=$(build_prompt "$skill_name" "$skill_description")
  local content=""

  if [[ -n "${GEMINI_API_KEY:-}" ]]; then
    content=$(call_gemini_api "$prompt")
  elif command -v gemini &>/dev/null; then
    content=$(call_gemini_cli "$prompt")
  else
    echo "ERROR: Neither GEMINI_API_KEY nor 'gemini' CLI is available." >&2
    exit 1
  fi

  if [[ -z "$content" ]]; then
    echo "WARNING: Empty response for skill '${skill_name}'." >&2
    echo '{"keywords":[],"hint":""}'
    return
  fi

  if ! echo "$content" | jq . > /dev/null 2>&1; then
    echo "WARNING: Invalid JSON for skill '${skill_name}': ${content}" >&2
    echo '{"keywords":[],"hint":""}'
    return
  fi

  echo "$content"
}

echo "Scanning skills in ${SKILLS_DIR}..."

skill_dirs=()
for skill_dir in "${SKILLS_DIR}"/*/; do
  [[ -d "$skill_dir" ]] && skill_dirs+=("${skill_dir%/}")
done

total=${#skill_dirs[@]}
echo "Found ${total} skills."

if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  echo "Auth: REST API (GEMINI_API_KEY)"
else
  echo "Auth: gemini CLI (OAuth fallback)"
fi

result="{}"

for skill_dir in "${skill_dirs[@]}"; do
  skill_file="${skill_dir}/SKILL.md"
  if [[ ! -f "$skill_file" ]]; then
    continue
  fi

  slug="$(basename "$skill_dir")"
  echo "Processing skill: ${slug}..."

  # Parse frontmatter (bash 3.2-compatible, no mapfile)
  fm_lines=()
  while IFS= read -r line; do
    fm_lines+=("$line")
  done < <(parse_frontmatter "$skill_file")
  skill_name="${fm_lines[0]:-$slug}"
  skill_desc=""
  if [[ ${#fm_lines[@]} -gt 1 ]]; then
    skill_desc=$(printf '%s\n' "${fm_lines[@]:1}" | /usr/bin/head -5 | tr '\n' ' ')
  fi

  # Call Gemini
  meta=$(generate_skill_meta "$skill_name" "$skill_desc")

  # Safely extract fields (fallback to empty on jq error)
  keywords=$(echo "$meta" | jq '.keywords // []' 2>/dev/null || echo '[]')
  hint=$(echo "$meta" | jq -r '.hint // ""' 2>/dev/null || echo '')
  kw_count=$(echo "$keywords" | jq 'length' 2>/dev/null || echo '0')

  # Build entry using python3 to avoid jq --argjson issues with special chars
  entry=$(python3 -c "
import json, sys
keywords = json.loads(sys.argv[1])
hint = sys.argv[2]
entry = {'keywords': keywords, 'hint': hint, 'isGeneral': False}
print(json.dumps(entry))
" "$keywords" "$hint" 2>/dev/null || echo '{"keywords":[],"hint":"","isGeneral":false}')

  result=$(echo "$result" | jq --arg slug "$slug" --argjson entry "$entry" '. + {($slug): $entry}' 2>/dev/null || echo "$result")

  echo "  Done: ${slug} (${kw_count} keywords)"

  # Rate limiting: avoid hitting API quota
  sleep 0.5
done

echo ""
echo "Writing ${OUTPUT_FILE}..."
echo "$result" | jq . > "${OUTPUT_FILE}"
skill_count=$(echo "$result" | jq 'keys | length')
echo "Done. Generated skill-rules.json with ${skill_count} skills."
