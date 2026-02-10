# Project Guidelines

## Experimentation

Use `.playground/` directory for experiments and testing. This directory is git-ignored.

## Agent/Skill Development

### validate_prompt

To automatically validate agent/skill output, add a `validate_prompt` field to the frontmatter.

**Agent example** (`.claude/agents/my-agent.md`):
```yaml
---
name: my-agent
description: My custom agent
validate_prompt: |
  Must contain X, Y, Z sections.
  Output should be in JSON format.
---
```

**Skill example** (`.claude/skills/my-skill/SKILL.md`):
```yaml
---
name: my-skill
description: My custom skill
validate_prompt: |
  Must produce valid output.
---
```

**How it works:**
1. `PostToolUse` hook detects Task/Skill completion
2. Extracts `subagent_type` or `skill` name from tool input
3. Finds agent/skill file and parses `validate_prompt` from frontmatter
4. Outputs validation reminder to Claude

### Implementation Files

- `.claude/scripts/validate-output.sh` - PostToolUse validation hook
- `.claude/settings.local.json` - registers PostToolUse hook for Task|Skill

## Hook System

Hooks are registered in `.claude/settings.local.json` and automate pipeline transitions and quality enforcement.

### Hook Types

| Type | When it fires | Use case |
|------|--------------|----------|
| `UserPromptSubmit` | User submits a prompt | Initialize state, intercept slash commands |
| `PreToolUse` | Before a tool executes | Block or modify tool calls |
| `PostToolUse` | After a tool completes | Validate output, trigger follow-up |
| `Stop` | Session ends | Transition to next pipeline stage |
| `SubagentStop` | Subagent finishes | Post-agent cleanup |

### Active Hooks

| Script | Type | Purpose |
|--------|------|---------|
| `ultrawork-init-hook.sh` | UserPromptSubmit | Initialize ultrawork pipeline state when `/ultrawork` is typed |
| `dev-specify-stop-hook.sh` | Stop | Auto-transition specify → open when plan is approved |
| `validate-output.sh` | PostToolUse | Validate agent/skill output against `validate_prompt` frontmatter |
| `dev-execute-init-hook.sh` | PreToolUse | Initialize execution context at `/execute` start |

### Hook Development Notes

- Hook scripts live in `.claude/scripts/` and must be executable (`chmod +x`)
- Register hooks in `.claude/settings.local.json` under `hooks.<EventType>.matchers[]`
- A hook script that is not registered in settings will **not fire** — creating the file alone is not enough
- See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for additional hook behavior gotchas

## Git Branching & Release

- **`main`** — release only. Do not commit directly.
- **`develop`** — integration branch. Feature branches merge here.
- **Feature branches** — `feat/xxx` from `develop`, merge back to `develop` via `--no-ff`.

### Release Flow

```
1. All features merged to develop
2. Version bump commit on develop (plugin.json + marketplace.json)
3. git checkout main && git merge develop --no-ff -m "Release X.Y.Z"
4. git tag vX.Y.Z && git push origin main --tags && git push origin develop
5. gh release create vX.Y.Z --title "vX.Y.Z" --notes "## What's New in X.Y.Z ..."
```

## Versioning

- Plugin version is in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
- **Bump both files** in a single commit on `develop` before merging to `main`

## Recent Changes (v0.4.0)

- Specify skill: mode support (quick/standard × interactive/autopilot)
- Execute skill: quick mode (`--quick` flag) for lightweight execution without independent verification
- Init skill: reorganized hy CLI install to Step 1
- Agent prompts: standardized placeholder variables

## Testing Strategy

See [TESTING.md](TESTING.md) for the 4-Tier Testing Model (Unit → Integration → E2E → Agent Sandbox). Verification agents use this as their framework.

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook/tool behavior gotchas discovered during development.
