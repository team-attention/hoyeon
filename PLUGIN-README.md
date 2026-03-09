# oh-my-claude-code

Development workflow automation plugin for Claude Code.

## Overview

Provides a full **specify → execute** pipeline with:
- Parallel research agents (docs, external, gap analysis, tradeoffs)
- Interview-driven planning with reviewer approval
- Orchestrator-delegated execution with worker verification
- Atomic commits
- Hook-based pipeline automation (ultrawork)

## Components

### Skills (7)

| Skill | Command | Purpose |
|-------|---------|---------|
| specify | `/specify` | Interview-driven planning workflow |
| execute | `/execute` | Orchestrator delegates to workers |
| ultrawork | `/ultrawork` | Automated specify → execute |
| compound | `/compound` | Extract learnings from PRs |
| tech-decision | `/tech-decision` | Deep technical decision analysis |
| dev-scan | `/dev-scan` | Collect community developer opinions |
| skill-session-analyzer | — | Post-hoc session analysis |

### Agents (7)

| Agent | Purpose |
|-------|---------|
| docs-researcher | Search project internal docs |
| external-researcher | Research external libraries via web |
| gap-analyzer | Identify missing requirements and pitfalls |
| tradeoff-analyzer | Evaluate risk and simpler alternatives |
| reviewer | Evaluate plan clarity and completeness |
| worker | Implementation (code, tests, fixes) |
| git-master | Atomic commits with style detection |

### Hooks

| Event | Scripts | Purpose |
|-------|---------|---------|
| UserPromptSubmit + PreToolUse(Skill) | skill-session-init | Initialize session state for specify/execute |
| PreToolUse(Edit/Write) | skill-session-guard | Plan guard (specify) / orchestrator guard (execute) |
| PostToolUse(Task/Skill) | validate-output | Validate against frontmatter |
| Stop | ultrawork-stop, skill-session-stop | Pipeline transitions |
| SessionEnd | skill-session-cleanup | Clean up session state files |
| UserPromptSubmit | ultrawork-init | Initialize ultrawork pipeline |

## Installation

```bash
claude --plugin-dir /path/to/oh-my-claude-code/.claude-plugin
```

Or add to your project's `.claude/settings.json`:
```json
{
  "enabledPlugins": {
    "oh-my-claude-code": true
  }
}
```

