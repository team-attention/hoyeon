# oh-my-claude-code

Claude Code plugin for automated Spec-Driven Development (SDD). Plan, create PRs, execute tasks, and extract learnings — all through an orchestrated skill pipeline.

## Core Workflow

```
/specify → /open → /execute → /publish → /compound
```

| Step | Skill | What it does |
|------|-------|-------------|
| 1 | `/specify` | Interview-driven planning. Gathers requirements, runs parallel analysis (gap-analyzer, librarian), generates `PLAN.md` with reviewer approval. |
| 2 | `/open` | Creates a Draft PR on `feat/{name}` branch from the approved spec. |
| 3 | `/execute` | Orchestrator reads `PLAN.md`, creates Tasks per TODO, delegates to worker agents, verifies results, commits atomically. |
| 4 | `/publish` | Converts Draft PR to Ready for Review. |
| 5 | `/compound` | Extracts learnings from completed PR into `docs/learnings/`. |

### One-shot: `/ultrawork`

Chains the entire pipeline automatically via Stop hooks:

```
/ultrawork feature-name
  → /specify (interview + plan)
  → /open (create Draft PR)
  → /execute (implement all TODOs)
```

## Skills

### Planning & Execution
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/specify` | "plan this" | Interview → DRAFT.md → PLAN.md with reviewer approval |
| `/open` | "create PR" | Draft PR creation from spec |
| `/execute` | "/execute" | Orchestrate TODO implementation via worker agents |
| `/publish` | "publish PR" | Draft → Ready for Review |
| `/ultrawork` | "/ultrawork name" | Full automated pipeline |

### State & Knowledge
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/state` | "PR status" | PR state management (queue, begin, pause, complete) |
| `/compound` | "document learnings" | Extract knowledge from completed PRs |

### Research & Analysis
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/tech-decision` | "A vs B" | Systematic tech comparison with multi-source research |
| `/dev-scan` | "community opinions" | Aggregate developer perspectives from Reddit, HN, Dev.to, Lobsters |
| `/skill-session-analyzer` | "analyze session" | Post-hoc validation of skill execution |

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `worker` | Sonnet | Implements delegated TODOs (code, tests, fixes) |
| `gap-analyzer` | Haiku | Identifies missing requirements and pitfalls before planning |
| `librarian` | Sonnet | Researches external libraries and official docs |
| `reviewer` | Haiku | Evaluates plans for clarity, verifiability, completeness |
| `git-master` | Sonnet | Enforces atomic commits following project style |

## Hook System

Hooks automate transitions and enforce quality:

| Hook Type | Script | Purpose |
|-----------|--------|---------|
| UserPromptSubmit | `ultrawork-init-hook.sh` | Initialize ultrawork pipeline state |
| Stop | `dev-specify-stop-hook.sh` | Transition specify → open |
| PostToolUse | `validate-output.sh` | Validate agent/skill output against `validate_prompt` |
| PostToolUse | `dev-worker-verify.sh` | Verify worker output (functional, static, runtime) |

## Execute Architecture

The `/execute` skill follows an Orchestrator-Worker pattern:

```
Orchestrator (reads PLAN.md)
  ├── Parse TODOs → Create Tasks with dependencies
  ├── Parallelize non-blocked Tasks
  └── For each TODO:
      ├── Worker agent (implementation)
      ├── Verify (3 checks: functional, static, runtime)
      ├── Context save (learnings, decisions, issues)
      └── git-master (atomic commit)
```

**Key rules:**
- Orchestrator never writes code — only delegates and verifies
- Plan checkboxes (`### [x] TODO N:`) are the single source of truth
- Failed tasks retry up to 3 times (reconciliation)
- Independent TODOs run in parallel

## Project Structure

```
.claude/
├── skills/          # Skill definitions (SKILL.md per skill)
├── agents/          # Agent definitions (frontmatter + system prompt)
└── scripts/         # Hook scripts (bash)

.dev/
├── specs/{name}/    # Per-feature specs
│   ├── PLAN.md
│   └── context/     # learnings.md, decisions.md, issues.md, outputs.json
└── state.local.json # Session state (git-ignored)

docs/
└── learnings/           # Knowledge extracted from development
    └── lessons-learned.md
```

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook and tool behavior gotchas discovered during development.
