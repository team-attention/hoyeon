#!/usr/bin/env bash
# skill-hint-hook.sh — UserPromptSubmit hook
#
# Classifies user prompts against skill-rules.json using Gemini 2.5 Flash Lite API.
# If a skill match is found, outputs plain text with the original prompt + <skill-suggestion>
# block appended (Zeude-style). Plain text stdout is more effective than additionalContext JSON.
#
# Silently exits 0 on: empty prompt, slash-prefix, missing API key, API error, no match.

# Source .zshenv for GEMINI_API_KEY (hooks run under bash, not zsh)
[[ -f "$HOME/.zshenv" ]] && source "$HOME/.zshenv" 2>/dev/null

# Early debug - log that hook was invoked at all
echo "$(date '+%H:%M:%S') HOOK_INVOKED cwd=$(pwd) KEY=${GEMINI_API_KEY:+SET}" >> /tmp/skill-hint-debug.log

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
SKILL_RULES_FILE="${PLUGIN_ROOT}/.claude/skill-rules.json"

# Read stdin
HOOK_INPUT=$(cat)

# Extract prompt
PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // empty')

# Early exit: empty or whitespace-only prompt
if [[ -z "${PROMPT// }" ]]; then
  echo "$(date '+%H:%M:%S') EXIT:empty_prompt" >> /tmp/skill-hint-debug.log
  exit 0
fi

# Early exit: slash-prefix command (e.g. /execute, /specify)
if [[ "$PROMPT" == /* ]]; then
  echo "$(date '+%H:%M:%S') EXIT:slash_prefix prompt=$PROMPT" >> /tmp/skill-hint-debug.log
  exit 0
fi

# Early exit: missing API key
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
if [[ -z "$GEMINI_API_KEY" ]]; then
  echo "$(date '+%H:%M:%S') EXIT:no_api_key" >> /tmp/skill-hint-debug.log
  exit 0
fi

# Early exit: skill-rules.json not found
if [[ ! -f "$SKILL_RULES_FILE" ]]; then
  exit 0
fi

# Build skill list and Gemini API request + parse response — all in one python3 call
# Pass variables via environment to avoid shell escaping issues with special chars
RESULT=$(SKILL_RULES_FILE="$SKILL_RULES_FILE" \
  GEMINI_API_KEY="$GEMINI_API_KEY" \
  GEMINI_API_ENDPOINT="${GEMINI_API_ENDPOINT:-https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent}" \
  USER_PROMPT="$PROMPT" \
  python3 - <<'PYEOF'
import json, os, sys, urllib.request, urllib.error

skill_rules_file = os.environ.get("SKILL_RULES_FILE", "")
api_key = os.environ.get("GEMINI_API_KEY", "")
api_endpoint = os.environ.get("GEMINI_API_ENDPOINT", "")
user_prompt = os.environ.get("USER_PROMPT", "")

# Load skill-rules.json
try:
    with open(skill_rules_file, "r", encoding="utf-8") as f:
        rules = json.load(f)
except Exception:
    sys.exit(0)

if not rules:
    sys.exit(0)

# Build skill list
skill_lines = []
for slug, info in rules.items():
    hint = info.get("hint", "")
    keywords = info.get("keywords", [])
    kw_str = ", ".join(keywords[:5])
    skill_lines.append(f"- {slug}: {hint} (keywords: {kw_str})")
skill_list = "\n".join(skill_lines)

system_instruction = (
    "You are a skill classifier. Given a user prompt, classify it against the available skills listed below.\n\n"
    "Available skills:\n"
    + skill_list
    + "\n\nInstructions:\n"
    "- Analyze the user prompt and determine which skills are relevant.\n"
    "- Return ONLY skills that are a strong match (confidence >= 0.6).\n"
    "- If no skill matches, return an empty matched_skills array.\n"
    "- Each matched skill should include: slug (skill name), confidence (0.0-1.0), hint (brief reason why this skill matches, in same language as user prompt).\n"
    "- Return at most 3 matched skills, ordered by confidence descending."
)

request_body = {
    "system_instruction": {
        "parts": [{"text": system_instruction}]
    },
    "contents": [
        {
            "parts": [{"text": user_prompt}]
        }
    ],
    "generationConfig": {
        "responseMimeType": "application/json",
        "responseSchema": {
            "type": "object",
            "properties": {
                "matched_skills": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "slug": {"type": "string"},
                            "confidence": {"type": "number"},
                            "hint": {"type": "string"}
                        },
                        "required": ["slug", "confidence", "hint"]
                    }
                }
            },
            "required": ["matched_skills"]
        }
    }
}

url = api_endpoint
payload = json.dumps(request_body).encode("utf-8")
req = urllib.request.Request(
    url,
    data=payload,
    headers={
        "Content-Type": "application/json",
        "x-goog-api-key": api_key
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=3) as resp:
        raw = resp.read().decode("utf-8")
except Exception:
    sys.exit(0)

# Parse API response
try:
    resp_data = json.loads(raw)
    text = resp_data["candidates"][0]["content"]["parts"][0]["text"]
    result = json.loads(text)
    matched_skills = result.get("matched_skills", [])
except Exception:
    sys.exit(0)

if not matched_skills:
    sys.exit(0)

# Validate slugs against rules dict
matched_skills = [s for s in matched_skills if s.get("slug", "") in rules]

if not matched_skills:
    sys.exit(0)

# Build skill suggestion block (plain text output — Zeude style)
# Plain text stdout is more effective than additionalContext JSON
hint_lines = []
for s in matched_skills:
    slug = s.get("slug", "")
    hint = s.get("hint", "")
    # Sanitize hint: strip newlines, limit to 200 chars
    hint = hint.replace("\n", " ").replace("\r", " ")[:200]
    if slug:
        hint_lines.append(f"- /{slug} - {hint}")

matched_hints = "\n".join(hint_lines)

# Output plain text: original prompt + skill suggestion
print(f"""{user_prompt}

<skill-suggestion>
MATCHED SKILLS:
{matched_hints}

MANDATORY: You MUST call the AskUserQuestion tool BEFORE doing anything else.
Do NOT read files, do NOT write code, do NOT respond with text first.
Your VERY FIRST action must be AskUserQuestion with these options:
{matched_hints}
- Continue without skill
</skill-suggestion>""")
PYEOF
)

# Debug: log to file
echo "$(date '+%H:%M:%S') RESULT_LEN=${#RESULT}" >> /tmp/skill-hint-debug.log
if [[ -n "$RESULT" ]]; then
  echo "$RESULT" >> /tmp/skill-hint-debug.log
  echo "---STDOUT_SENT---" >> /tmp/skill-hint-debug.log
  printf '%s' "$RESULT"
else
  echo "EMPTY_RESULT" >> /tmp/skill-hint-debug.log
fi

exit 0
