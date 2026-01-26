# Plan: Plugin Component Generator (`/generate`)

> Create an interactive slash command that generates Claude plugin components (agents, skills, hooks) from minimal templates.

## Context

### Original Request
Create a slash command that generates Claude plugin components (agents, skills, hooks, commands) from templates using an interactive interface.

### Interview Summary
**Key Discussions**:
- Component types: All (agents, skills, hooks) - Note: "commands" are just skills invoked with `/`
- Content level: Minimal (required frontmatter only, no example code)
- Interface: Interactive using AskUserQuestion prompts
- Restrictions: Don't overwrite existing files (fail if exists)

**Research Findings**:
- Skills: `.claude/skills/{name}/SKILL.md` with YAML frontmatter (name, description, allowed-tools)
- Agents: `.claude/agents/{name}.md` with frontmatter (name, description, model, allowed-tools)
- Hooks: `.claude/scripts/{name}.sh` (script only, registration in settings.json is manual)
- Gap analysis confirmed: "commands" are not a separate type - all invokables are skills

## Work Objectives

### Core Objective
Create `/generate` skill that interactively prompts for component type and name, then generates a minimal template file.

### Concrete Deliverables
- `.claude/skills/generate/SKILL.md` - Main skill definition

### Definition of Done
- [ ] `/generate` command can be invoked
- [ ] Skill prompts for component type (agent/skill/hook)
- [ ] Skill prompts for component name
- [ ] Generates valid file at correct location
- [ ] Fails gracefully if file already exists

### Must NOT Do (Guardrails)
- Do not overwrite existing component files
- Do not auto-register hooks in `.claude/settings.json`
- Do not add example code or comments to generated files (minimal only)
- Do not create a separate "commands" component type (commands = skills)
- Do not use emojis in generated frontmatter

---

## Technical Implementation Details

### AskUserQuestion Tool

`AskUserQuestion` is a Claude Code built-in tool for interactive prompts. In skill markdown, instruct Claude to use it like this:

```markdown
Use AskUserQuestion to prompt the user:

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

The skill markdown describes WHEN and HOW to call this tool. Claude executes the tool at runtime.

### Kebab-Case Validation

**Pattern**: `/^[a-z][a-z0-9-]*$/`

| Valid | Invalid |
|-------|---------|
| `my-agent` | `MyAgent` (uppercase) |
| `hook-v2` | `hook_v2` (underscore) |
| `simple` | `123-start` (starts with number) |

In skill, instruct: "Validate name matches kebab-case pattern. If invalid, inform user and prompt again."

### Template Definitions

#### Agent Template (Minimal)
```yaml
---
name: {name}
description: |
  Brief description of what this agent does.
---

# {Name} Agent

Agent instructions go here.
```
**Output path**: `.claude/agents/{name}.md`

#### Skill Template (Minimal)
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
**Output path**: `.claude/skills/{name}/SKILL.md`

#### Hook Template (Minimal)
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
**Output path**: `.claude/scripts/{name}.sh`
**Note**: User must manually register hook in `.claude/settings.json`

---

## Task Flow

```
TODO-1 → TODO-Final
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `skill_path` (file) | work |
| Final | `todo-1.skill_path` | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Single task, no parallelization needed |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(generate): add plugin component generator skill` | `.claude/skills/generate/SKILL.md` | always |

> **Note**: No commit after Final (Verification is read-only).

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `env_error` | Permission denied, path not found | `/EACCES\|ENOENT\|permission/i` |
| `code_error` | Invalid YAML, malformed frontmatter | `/YAML\|parse\|syntax/i` |
| `unknown` | Unclassifiable errors | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → (see below) |
| verification fails | Analyze immediately (no retry) → (see below) |

### After Analyze

| Category | Action |
|----------|--------|
| `env_error` | Halt + log to `issues.md` |
| `code_error` | Create Fix Task (depth=1 limit) |
| `unknown` | Halt + log to `issues.md` |

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Not required |
| Package Install | Denied |
| File Access | `.claude/` directory only |
| Max Execution Time | 2 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## Reference Excerpts

### Skill Frontmatter Pattern (from `.claude/skills/publish/SKILL.md`)
```yaml
---
name: dev.publish
description: |
  "/publish", "publish PR", "PR ready", "publish PR", "remove Draft"
  Convert Draft PR to Ready for review
allowed-tools:
  - Bash
  - Read
  - Glob
---
```

### Agent Frontmatter Pattern (from `.claude/agents/reviewer.md`)
```yaml
---
name: reviewer
description: Plan reviewer agent that evaluates work plans...
model: haiku
disallowed-tools:
  - Write
  - Edit
  - Bash
  - Task
---
```

### Hook Script Pattern (from `.claude/scripts/validate-output.sh`)
```bash
#!/bin/bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# Tool-specific logic
if [[ "$TOOL_NAME" != "Task" && "$TOOL_NAME" != "Skill" ]]; then
  exit 0
fi
```

---

## TODOs

### [ ] TODO 1: Create /generate skill

**Type**: work

**Required Tools**: Write, Bash

**Inputs**: (none - first task)

**Outputs**:
- `skill_path` (file): `.claude/skills/generate/SKILL.md` - The generate skill definition

**Steps**:
- [ ] Create skill directory: `mkdir -p .claude/skills/generate`
- [ ] Write `SKILL.md` with:
  - YAML frontmatter: `name: generate`, `description`, `allowed-tools: [Write, Bash, Read, AskUserQuestion]`
  - Instructions for Step 1: Use AskUserQuestion to prompt for component type (agent/skill/hook)
  - Instructions for Step 2: Use AskUserQuestion to prompt for component name
  - Instructions for Step 3: Validate name matches `/^[a-z][a-z0-9-]*$/`
  - Instructions for Step 4: Check if target file exists using Read, fail if yes
  - Instructions for Step 5: Generate file using Write with the appropriate template from Technical Implementation Details section

**Must NOT do**:
- Do not include example code beyond the minimal templates
- Do not auto-register hooks in settings.json
- Do not use emojis in frontmatter
- Do not run git commands

**References**:
- See "Reference Excerpts" section above for exact patterns
- See "Template Definitions" section above for output templates

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `.claude/skills/generate/SKILL.md`
- [ ] Frontmatter has `name: generate`
- [ ] Frontmatter has `allowed-tools:` including Write
- [ ] Body contains AskUserQuestion usage for component type selection
- [ ] Body contains AskUserQuestion usage for name input
- [ ] Body contains kebab-case validation instruction with pattern `/^[a-z][a-z0-9-]*$/`
- [ ] Body contains file existence check instruction
- [ ] Body contains all three templates (agent, skill, hook) from Template Definitions

*Static:*
- [ ] `head -1 .claude/skills/generate/SKILL.md` outputs `---`
- [ ] `grep -c "AskUserQuestion" .claude/skills/generate/SKILL.md` >= 2

*Runtime:*
- [ ] (skill invocation tested in TODO Final)

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: Read, Bash, Grep

**Inputs**:
- `skill_path` (file): `${todo-1.outputs.skill_path}` - The generate skill file

**Outputs**: (none)

**Steps**:
- [ ] Verify skill file exists
- [ ] Verify YAML frontmatter is valid (starts and ends with `---`)
- [ ] Verify skill contains AskUserQuestion for component type
- [ ] Verify skill contains AskUserQuestion for component name
- [ ] Verify skill contains kebab-case validation pattern
- [ ] Verify skill contains all three templates
- [ ] Verify no emojis in content

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] `.claude/skills/generate/SKILL.md` exists
- [ ] File starts with `---` (valid frontmatter start)
- [ ] Contains `name: generate` in frontmatter
- [ ] Contains `allowed-tools:` with Write
- [ ] Contains "AskUserQuestion" at least twice
- [ ] Contains kebab-case pattern or "kebab-case" mention
- [ ] Contains agent template (checks for `.claude/agents/`)
- [ ] Contains skill template (checks for `.claude/skills/`)
- [ ] Contains hook template (checks for `.claude/scripts/`)

*Static:*
- [ ] `head -1 .claude/skills/generate/SKILL.md` → `---`
- [ ] `grep -q "name: generate" .claude/skills/generate/SKILL.md` → exit 0
- [ ] `grep -q "allowed-tools:" .claude/skills/generate/SKILL.md` → exit 0
- [ ] `grep -c "AskUserQuestion" .claude/skills/generate/SKILL.md` → >= 2
- [ ] `grep -qE "\.claude/agents/|\.claude/skills/|\.claude/scripts/" .claude/skills/generate/SKILL.md` → exit 0

*Runtime:*
- [ ] (manual: invoke `/generate` and verify it prompts for component type)
