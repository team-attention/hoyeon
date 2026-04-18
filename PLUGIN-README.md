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

### Skills (26)

| Skill | Command | Purpose |
|-------|---------|---------|
| specify | `/specify` | Interview-driven requirements derivation (L0-L4) |
| blueprint | `/blueprint` | Contract-first task graph from requirements.md |
| execute | `/execute` | Plan-driven orchestrator (reads plan.json) |
| ultrawork | `/ultrawork` | Automated specify → execute pipeline |
| bugfix | `/bugfix` | Root-cause-based one-shot bug fix |
| scaffold | `/scaffold` | Greenfield project architecture + harness scaffolding |
| council | `/council` | Multi-perspective decision committee |
| ralph | `/ralph` | Iterative DoD-based task loop |
| rulph | `/rulph` | Rubric-based evaluation and self-improvement loop |
| scope | `/scope` | Fast parallel change-scope analyzer |
| check | `/check` | Pre-push verification against rule checklists |
| tribunal | `/tribunal` | Three-way adversarial review |
| discuss | `/discuss` | Free-form problem exploration |
| mirror | `/mirror` | Paraphrase-back for mutual understanding |
| stepback | `/stepback` | One-shot perspective reset |
| compound | `/compound` | Extract learnings from PRs |
| tech-decision | `/tech-decision` | Deep technical decision analysis |
| dev-scan | `/dev-scan` | Collect community developer opinions |
| deep-research | `/deep-research` | Parallel web research |
| google-search | `/google-search` | Google search via real Chrome browser |
| browser-work | `/browser-work` | Recon-first browser automation |
| reference-seek | `/reference-seek` | Find reference implementations |
| issue | `/issue` | Structured GitHub issue creation |
| qa | `/qa` | Systematic QA testing |
| skill-session-analyzer | — | Post-hoc session analysis |
| .guide | — | Internal guide skill |

### Agents (28)

| Agent | Purpose |
|-------|---------|
| worker | Implementation agent (code, tests, fixes) |
| code-explorer | Read-only codebase search specialist |
| code-reviewer | Cross-cutting code reviewer |
| debugger | Root cause analysis specialist |
| git-master | Atomic commits with style detection |
| docs-researcher | Search project internal docs |
| external-researcher | Research external libraries via web |
| gap-analyzer | Identify missing requirements and pitfalls |
| gap-auditor | Audit gaps in requirements |
| tradeoff-analyzer | Evaluate risk and simpler alternatives |
| interviewer | Socratic interviewer |
| browser-explorer | Chrome browser automation via chromux |
| verification-planner | Build verification strategy |
| verify-planner | Plan verification steps |
| verifier | Verify task completion |
| qa-verifier | Runtime QA verification |
| ralph-verifier | Independent DoD verifier for /ralph |
| spec-coverage | GWT citation enforcement for gate=2 review |
| contract-deriver | Derive contracts from requirements |
| taskgraph-planner | Plan task graphs from contracts |
| business-extractor | Extract business requirements |
| interaction-extractor | Extract interaction patterns |
| tech-extractor | Extract technical requirements |
| ux-reviewer | UX impact reviewer |
| codex-risk-analyst | Codex-powered risk analyst |
| codex-strategist | Codex-powered strategist |
| feasibility-checker | Feasibility evaluator |
| value-assessor | Value/impact assessor |

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

