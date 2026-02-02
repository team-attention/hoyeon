# hoyeon

Claude Code plugin for automated Spec-Driven Development (SDD). Plan, create PRs, execute tasks, and extract learnings — all through an orchestrated skill pipeline.

## Installation

**Prerequisites:**
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- `gh` CLI authenticated (`gh auth login`)
- Git configured with remote repository

**Install the plugin:**

```bash
claude plugin add team-attention/hoyeon
```

## Quick Start

The simplest way to start is with `/ultrawork`:

```
> /ultrawork my-feature-name
```

This runs the full pipeline automatically: interview → plan → Draft PR → implement.

For step-by-step control, use individual skills:

```
> /specify          # Interview + generate PLAN.md
> /open             # Create Draft PR from plan
> /execute          # Implement all TODOs
> /publish          # Mark PR as Ready for Review
> /compound         # Extract learnings
```

## Core Workflow

```
/specify → /open → /execute → /publish → /compound
```

| Step | Skill | What it does |
|------|-------|-------------|
| 1 | `/specify` | Interview-driven planning. Gathers requirements, runs parallel analysis (gap-analyzer, tradeoff-analyzer, verification-planner, external-researcher), generates `PLAN.md` with reviewer approval. |
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

### Infrastructure
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/init` | "/init" | Interactive `.dev/config.yml` initialization |
| `/worktree` | "/worktree" | Git worktree management (create, spawn, status, cleanup) |

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `worker` | Sonnet | Implements delegated TODOs (code, tests, fixes) |
| `gap-analyzer` | Haiku | Identifies missing requirements and pitfalls before planning |
| `tradeoff-analyzer` | Sonnet | Evaluates risk (LOW/MED/HIGH), simpler alternatives, over-engineering warnings |
| `verification-planner` | Sonnet | Builds verification strategy based on 4-Tier testing model, classifies A/H-items, external dependency strategy |
| `docs-researcher` | Sonnet | Searches internal docs (ADRs, READMEs, configs) for conventions and constraints |
| `external-researcher` | Sonnet | Researches external libraries, frameworks, and official docs |
| `ux-reviewer` | Sonnet | Evaluates changes from UX perspective — simplicity, intuitiveness, UX regression prevention |
| `reviewer` | Opus | Evaluates plans for clarity, verifiability, completeness, structural integrity |
| `git-master` | Sonnet | Enforces atomic commits following project style |

## /specify Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERVIEW MODE                           │
│                                                             │
│  Step 1: Initialize                                         │
│   • Classify intent (Refactoring/Feature/Bug/Arch/...)      │
│   • Parallel agents:                                        │
│     ┌──────────┐ ┌──────────┐ ┌────────────────┐            │
│     │Explore #1│ │Explore #2│ │docs-researcher │            │
│     │patterns  │ │structure │ │ADR/conventions │            │
│     └────┬─────┘ └────┬─────┘ └───────┬────────┘            │
│          │      ┌─────────────┐       │                     │
│          │      │ux-reviewer  │       │                     │
│          │      │UX impact    │       │                     │
│          │      └──────┬──────┘       │                     │
│          └─────────────┼──────────────┘                     │
│                       ▼                                     │
│  Step 1.5: Exploration summary                  🧑 HITL #1 │
│   → User confirms codebase understanding                    │
│                       ▼                                     │
│  Step 2: Interview                              🧑 HITL #2 │
│   ASK: edge cases, tradeoffs, success criteria              │
│   PROPOSE: exploration-based suggestions                    │
│                       ▼                                     │
│  Step 3-4: Update DRAFT + prepare transition                │
│   (tech-decision if needed)                     🧑 HITL #3 │
│                       │                                     │
│            User: "generate the plan"            🧑 HITL #4 │
└───────────────────────┼─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  PLAN GENERATION MODE                        │
│                                                             │
│  Step 1: Validate draft completeness                         │
│                       ▼                                     │
│  Step 2: Parallel analysis agents                            │
│   ┌─────────────┐ ┌──────────────────┐ ┌────────────────┐   │
│   │gap-analyzer │ │tradeoff-analyzer │ │verification-   │   │
│   │gaps/risks   │ │risk/alt/overeng. │ │planner         │   │
│   └──────┬──────┘ └────────┬─────────┘ │A/H-items,ExtDep│   │
│          │                 │           └───────┬────────┘   │
│          │         ┌───────────────┐           │            │
│          │         │external-      │           │            │
│          │         │researcher     │           │            │
│          │         │(optional)     │           │            │
│          │         └───────┬───────┘           │            │
│          └─────────────────┼───────────────────┘            │
│                            ▼                                │
│   HIGH risk decision_points → user approval     🧑 HITL #5 │
│                       ▼                                     │
│  Step 3: Decision summary + verification        🧑 HITL #6 │
│   User decisions + auto decisions + A/H-items               │
│                       ▼                                     │
│  Step 4: Generate PLAN.md                                    │
│   (Verification Summary + External Deps + TODOs + Risk)     │
│                       ▼                                     │
│  Step 4.5: Verification Summary review          🧑 HITL #6b│
│                       ▼                                     │
│  Step 5-6: Reviewer evaluation (+ Structural Integrity)      │
│   ┌────────┐                                                │
│   │reviewer│──OKAY──→ Delete DRAFT → Done                   │
│   └───┬────┘                                                │
│       │REJECT                                               │
│       ├─ cosmetic → auto-fix → re-review                    │
│       └─ semantic → user choice                 🧑 HITL #7  │
│           ├ Apply suggested fix                              │
│           ├ Fix manually                                     │
│           └ Return to interview                 🧑 HITL #8  │
└─────────────────────────────────────────────────────────────┘
                        ▼
              /open (Draft PR) or /execute
```

**Human-in-the-Loop Checkpoints (9):**

| # | When | Purpose |
|---|------|---------|
| 1 | Exploration summary | Prevent incorrect assumptions |
| 2 | Interview questions | Business judgment |
| 3 | tech-decision | Technology selection |
| 4 | Plan transition | Explicit user intent |
| 5 | HIGH risk decisions | Hard-to-reverse changes |
| 6 | Decision summary + verification strategy | Prevent silent drift + agree on verification |
| 6b | Verification Summary review | Final check on A/H-items + External Deps |
| 7 | Semantic REJECT | Scope/requirement changes |
| 8 | Return to interview | Change direction |

**Risk Tagging:** Each TODO gets a LOW/MEDIUM/HIGH risk tag. HIGH items (DB schema, auth, breaking API) require user approval + rollback plan.

**Verification Strategy:** PLAN header includes Verification Summary (A-items: agent-verifiable, H-items: human-required) + External Dependencies Strategy (pre-work/during/post-work). A-items flow into TODO acceptance criteria.

**Verification Block:** Each TODO includes Functional/Static/Runtime acceptance criteria with executable commands (`npm test`, `npm run typecheck`).

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
- 3-disposition triage on failure: `halt > adapt > retry`
- Independent TODOs run in parallel

## Hook System

Hooks automate transitions and enforce quality:

| Hook Type | Script | Purpose |
|-----------|--------|---------|
| UserPromptSubmit | `ultrawork-init-hook.sh` | Initialize ultrawork pipeline state |
| Stop | `dev-specify-stop-hook.sh` | Transition specify → open |
| PostToolUse | `validate-output.sh` | Validate agent/skill output against `validate_prompt` |
| PreToolUse | `dev-execute-init-hook.sh` | Initialize execution context |

## Project Structure

```
.claude-plugin/
├── plugin.json          # Plugin metadata
└── marketplace.json     # Marketplace listing

.claude/
├── skills/              # Skill definitions (SKILL.md per skill)
├── agents/              # Agent definitions (frontmatter + system prompt)
└── scripts/             # Hook scripts (bash)

.dev/
├── specs/{name}/        # Per-feature specs
│   ├── PLAN.md
│   └── context/         # audit.md, learnings.md, issues.md, outputs.json
└── state.local.json     # Session state (git-ignored)

docs/
└── learnings/           # Knowledge extracted from development
    └── lessons-learned.md
```

## Troubleshooting

**Hook not firing:**
- Verify the script is executable: `chmod +x .claude/scripts/<script>.sh`
- Check registration in `.claude/settings.local.json` under `hooks.<EventType>.matchers[]`
- Creating the file alone is not enough — it must be registered

**`/execute` failing on a TODO:**
- Check `audit.md` in the spec context directory for disposition details
- Failed tasks follow `halt > adapt > retry` triage
- Verification TODOs (read-only) auto-route FAIL → ADAPT

**State issues:**
- Session state lives in `.dev/state.local.json` (git-ignored)
- Use `/state status` to check current pipeline state
- Use `/state list` to see all tracked PRs

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for more hook and tool behavior gotchas.

## License

MIT
