# oh-my-claude-code

Development workflow automation plugin for Claude Code.

## Overview

Provides a full **specify → open → execute** pipeline with:
- Parallel research agents (docs, external, gap analysis, tradeoffs)
- Interview-driven planning with reviewer approval
- Draft PR creation from specs
- Orchestrator-delegated execution with worker verification
- PR state management and atomic commits
- Hook-based pipeline automation (ultrawork)

## Components

### Skills (11)

| Skill | Command | Purpose |
|-------|---------|---------|
| specify | `/specify` | Interview-driven planning workflow |
| open | `/open` | Create Draft PR from spec |
| execute | `/execute` | Orchestrator delegates to workers |
| publish | `/publish` | Convert Draft PR to Ready |
| ultrawork | `/ultrawork` | Automated specify → open → execute |
| state | `/state` | PR state management (queue, pause, resume) |
| compound | `/compound` | Extract learnings from PRs |
| tech-decision | `/tech-decision` | Deep technical decision analysis |
| dev-scan | `/dev-scan` | Collect community developer opinions |
| skill-session-analyzer | — | Post-hoc session analysis |
| test-validate | — | Validate-output hook test |

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
| PreToolUse(Skill) | dev-execute-init-hook, dev-specify-init-hook | Initialize pipeline state |
| PreToolUse(Edit/Write) | dev-plan-guard, dev-orchestrator-guard | Prevent unauthorized edits |
| PostToolUse(Task) | dev-worker-verify | Verify worker output |
| PostToolUse(Task/Skill) | validate-output | Validate against frontmatter |
| Stop | ultrawork-stop, dev-execute-stop, dev-specify-stop | Pipeline transitions |
| UserPromptSubmit | ultrawork-init, dev-init | Initialize sessions |

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

## State Management

Pipeline state is stored in `.dev/state.local.json` in the project directory. This file is git-ignored.
