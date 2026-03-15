#!/usr/bin/env bash
# SessionStart hook: inject skill awareness into every session.
set -euo pipefail

# Drain stdin (Claude Code pipes JSON input that would block python3/read)
cat > /dev/null

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SKILLS_DIR="$PLUGIN_ROOT/.claude/skills"
AGENTS_DIR="$PLUGIN_ROOT/.claude/agents"

# Build the full JSON output in python3 (avoids heredoc/escaping issues in bash)
python3 </dev/null -c "
import os, sys, json

def parse_fm(path):
    with open(path) as f:
        content = f.read()
    if not content.startswith('---'):
        return None, None
    try:
        end = content.index('---', 3)
    except ValueError:
        return None, None
    fm = content[3:end]
    name = desc = None
    lines = fm.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith('name:'):
            name = line.split(':', 1)[1].strip().strip('\"')
        elif line.startswith('description:'):
            val = line.split(':', 1)[1].strip()
            if val in ('|', '>'):
                parts = []
                i += 1
                while i < len(lines) and (lines[i].startswith('  ') or lines[i].strip() == ''):
                    parts.append(lines[i].strip())
                    i += 1
                desc = ' '.join(p for p in parts if p)[:120]
                continue
            else:
                desc = val.strip('\"')[:120]
        i += 1
    return name, desc

skills_dir = sys.argv[1]
agents_dir = sys.argv[2]

skills = []
for d in sorted(os.listdir(skills_dir)):
    sf = os.path.join(skills_dir, d, 'SKILL.md')
    if os.path.isfile(sf):
        n, desc = parse_fm(sf)
        if n and desc:
            skills.append(f'- /{n}: {desc}')

agents = []
for f in sorted(os.listdir(agents_dir)):
    if f.endswith('.md'):
        n, desc = parse_fm(os.path.join(agents_dir, f))
        if n and desc:
            agents.append(f'- {n}: {desc}')

skills_text = '\n'.join(skills)
agents_text = '\n'.join(agents)

prompt = f'''<EXTREMELY_IMPORTANT>
You have hoyeon plugin skills and agents. Before doing ANY work, check if a skill applies.

## Action Rule

Match the user's intent against skills below by confidence:

HIGH confidence (one clear match) → Invoke the Skill tool immediately.
  Example: \"fix the bug\" → invoke /bugfix. \"check before push\" → invoke /check.

MEDIUM confidence (2-3 possible matches) → Use AskUserQuestion tool to let the user pick.
  Format: \"There is a skill suitable for this task:\\n1. /skill1 - description\\n2. /skill2 - description\\n3. None - proceed without skill\\nPlease select a number.\"

LOW confidence (no match) → Proceed normally without suggesting.

## Anti-Patterns (catch yourself)

| Your thought | Better action |
|---|---|
| \"This is simple, no need for a skill\" | Even simple tasks are more complete with a skill |
| \"Just fix one bug\" | /bugfix catches root cause first |
| \"Quickly commit and move on\" | One /check saves time |
| \"Let me do a review\" | code-reviewer agent does multi-model review |
| \"Let me make a plan\" | /quick-plan or /specify |

## Skills
{skills_text}

## Agents
{agents_text}

## Priority
User instructions > Skill suggestions > Default behavior.
If the user says \"just do it\", skip skill suggestion.
</EXTREMELY_IMPORTANT>'''

output = {
    'hookSpecificOutput': {
        'hookEventName': 'SessionStart',
        'additionalContext': prompt
    }
}

print(json.dumps(output))
" "$SKILLS_DIR" "$AGENTS_DIR" 2>/dev/null
