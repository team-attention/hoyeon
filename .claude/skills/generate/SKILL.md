---
name: generate
description: |
  "/generate", "create component", "new agent", "new skill", "new hook"
  Interactively prompts for component type and name, then generates minimal template files.
allowed-tools:
  - Write
  - Bash
  - Read
  - AskUserQuestion
---

# /generate Skill

Generate minimal template files for agents, skills, or hooks through interactive prompts.

## Step 1: Prompt for Component Type

Use AskUserQuestion to prompt the user for the component type:

```
AskUserQuestion(
  questions: [{
    question: "What type of component do you want to generate?",
    header: "Component Type",
    options: [
      { label: "Agent", description: "Create a new agent in .claude/agents/" },
      { label: "Skill", description: "Create a new skill in .claude/skills/" },
      { label: "Hook", description: "Create a new hook script in .claude/scripts/" }
    ],
    multiSelect: false
  }]
)
```

Store the selected type (agent/skill/hook).

## Step 2: Prompt for Component Name

Use AskUserQuestion to prompt the user for the component name:

```
AskUserQuestion(
  questions: [{
    question: "What is the name of the component?",
    header: "Component Name",
    inputType: "text",
    placeholder: "e.g., my-agent, my-skill, my-hook"
  }]
)
```

Store the provided name.

## Step 3: Validate Name

Validate that the name matches the kebab-case pattern: `/^[a-z][a-z0-9-]*$/`

Valid examples: `my-agent`, `hook-v2`, `simple`
Invalid examples: `MyAgent`, `hook_v2`, `123-start`

If validation fails, inform the user and stop. The name must:
- Start with a lowercase letter (a-z)
- Contain only lowercase letters, digits, and hyphens

## Step 4: Check if Target File Exists

Based on the component type, determine the target file path:
- Agent: `.claude/agents/{name}.md`
- Skill: `.claude/skills/{name}/SKILL.md`
- Hook: `.claude/scripts/{name}.sh`

Use the Read tool to check if the file exists. If it exists, inform the user and stop to prevent overwriting existing files.

## Step 5: Generate File with Template

Use the Write tool to create the file with the appropriate template:

### Agent Template

For component type "Agent", write to `.claude/agents/{name}.md`:

```yaml
---
name: {name}
description: |
  Brief description of what this agent does.
---

# {Name} Agent

Agent instructions go here.
```

Replace `{name}` with the lowercase component name and `{Name}` with title-cased name.

### Skill Template

For component type "Skill", create directory `.claude/skills/{name}/` first, then write to `.claude/skills/{name}/SKILL.md`:

```yaml
---
name: {name}
description: |
  Brief description of what this skill does.
allowed-tools:
  - Read
  - Write
---

# /{name} Skill

Skill instructions go here.
```

Replace `{name}` with the component name.

### Hook Template

For component type "Hook", write to `.claude/scripts/{name}.sh`:

```bash
#!/bin/bash
# Hook: {name}
# Event: (PreToolUse|PostToolUse|Stop)
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Hook logic here
exit 0
```

Replace `{name}` with the component name.

After successfully creating the file, inform the user of the file path and next steps.
