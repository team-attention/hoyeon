# hoyeon

Claude Code plugin for automated Spec-Driven Development (SDD). Plan, execute tasks, and extract learnings — all through an orchestrated skill pipeline.

## Installation

```bash
npm install -g @team-attention/hoyeon-cli
```

## Core Workflow

```
/discuss → /specify → /execute → /compound
                                  ↑
/bugfix ──(circuit breaker)──→ /specify
```

| Step | Skill | What it does |
|------|-------|-------------|
| 0 | `/discuss` | Socratic discussion partner. Challenges assumptions, explores alternatives, and surfaces blind spots before planning. Saves insights for `/specify` handoff. |
| 1 | `/specify` | Interview-driven planning. Gathers requirements, runs parallel analysis (gap-analyzer, tradeoff-analyzer, verification-planner, external-researcher), Codex strategic synthesis, generates `spec.json` with plan-reviewer approval. |
| 2 | `/execute` | Orchestrator reads `spec.json` via cli, creates Tasks per TODO, delegates to worker agents, verifies results, Codex code review gate, commits atomically. |
| 3 | `/compound` | Extracts learnings from completed PR into `docs/learnings/`. |

### One-shot: `/ultrawork`

Chains the entire pipeline automatically via Stop hooks:

```
/ultrawork feature-name
  → /specify (interview + plan)
  → /execute (implement all TODOs)
```

## Skills

### Planning & Execution
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/discuss` | "think with me" | Socratic pre-planning exploration (DIAGNOSE → PROBE → SYNTHESIZE) |
| `/specify` | "plan this" | Interview → spec.json with plan-reviewer approval |
| `/execute` | "/execute" | Orchestrate TODO implementation via worker agents |
| `/quick-plan` | "/quick-plan" | Lightweight spec generation with user confirmation before execution |
| `/ultrawork` | "/ultrawork name" | Full automated pipeline |
| `/ralph` | "/ralph" | DoD-based iterative loop with prompt re-injection and independent verification |
| `/rulph` | "/rulph" | Rubric-based multi-model evaluation loop (Codex, Gemini, Claude) |

### State & Knowledge
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/compound` | "document learnings" | Extract knowledge from completed PRs |
| `/scope` | "/scope" | Scope analysis and boundary definition for a feature |
| `/check` | "/check" | Validate current state against spec or DoD |
| `/mirror` | "/mirror" | Reflect and summarize session state |

### Bug Fixing
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/bugfix` | "/bugfix error desc" | Root cause-based one-shot bug fix. debugger diagnose → worker fix → verify → commit. Escalates to `/specify` after 3 failures |

### Research & Analysis
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/tech-decision` | "A vs B" | Systematic tech comparison with multi-source research |
| `/dev-scan` | "community opinions" | Aggregate developer perspectives from Reddit, X/Twitter, HN, Dev.to, Lobsters |
| `/deep-interview` | "/deep-interview" | Structured requirements elicitation through guided questioning |
| `/deep-research` | "/deep-research" | Deep multi-source research synthesis |
| `/reference-seek` | "/reference-seek" | Find reference implementations via GitHub API, context7, code deep dive |
| `/google-search` | "/google-search" | Targeted web search with result synthesis |
| `/tribunal` | "review this" | 3-perspective adversarial review (Risk/Value/Feasibility → APPROVE/REVISE/REJECT) |
| `/skill-session-analyzer` | "analyze session" | Post-hoc validation of skill execution |


## Agents

| Agent | Model | Role |
|-------|-------|------|
| `browser-explorer` | Haiku | Browser automation via Chromux CDP for UI inspection and screenshot capture |
| `code-explorer` | Haiku | Codebase navigation, file structure analysis, and pattern discovery |
| `code-reviewer` | Sonnet | Multi-model code reviewer (Gemini + Codex + Claude in foreground parallel), synthesizes converged verdict |
| `codex-risk-analyst` | Haiku | /tribunal — adversarial risk analysis via Codex CLI (the challenger) |
| `codex-strategist` | Haiku | Calls Codex CLI to cross-check analysis reports and find blind spots in /specify |
| `debugger` | Sonnet | Root cause analysis specialist. Backward call stack tracing, bug type classification, severity assessment (SIMPLE/COMPLEX). Read-only |
| `docs-researcher` | Sonnet | Searches internal docs (ADRs, READMEs, configs) for conventions and constraints |
| `external-researcher` | Sonnet | Researches external libraries, frameworks, and official docs |
| `feasibility-checker` | Sonnet | /tribunal — pragmatic feasibility and effort evaluation |
| `gap-analyzer` | Sonnet | Identifies missing requirements and pitfalls before planning |
| `git-master` | Sonnet | Enforces atomic commits following project style |
| `interviewer` | Sonnet | Conducts structured interviews to elicit requirements and surface assumptions |
| `plan-reviewer` | Opus | Evaluates plans for clarity, verifiability, completeness, structural integrity |
| `tradeoff-analyzer` | Sonnet | Evaluates risk (LOW/MED/HIGH) with reversibility analysis, simpler alternatives, over-engineering warnings |
| `ux-reviewer` | Sonnet | Evaluates changes from UX perspective — simplicity, intuitiveness, UX regression prevention. Runs early in /specify |
| `value-assessor` | Sonnet | /tribunal — constructive value and goal alignment assessment |
| `verification-planner` | Sonnet | Builds verification strategy based on 4-Tier testing model, A/H/S-items classification, external dependency strategy, sandbox drift detection and bootstrapping patterns |
| `worker` | Sonnet | Implements delegated TODOs (code, tests, fixes) |

## /specify Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERVIEW MODE                           │
│                                                             │
│  Step 1: Initialize                                         │
│   • Intent classification (Refactoring/Feature/Bug/Arch/…)  │
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
│  Step 3-4: Consolidate interview + prepare transition       │
│   (tech-decision if needed)                     🧑 HITL #3 │
│                       │                                     │
│            User: "generate the plan"            🧑 HITL #4 │
└───────────────────────┼─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  PLAN GENERATION MODE                        │
│                                                             │
│  Step 1: Verify interview completeness                       │
│                       ▼                                     │
│  Step 2: Parallel analysis agents                            │
│   ┌─────────────┐ ┌──────────────────┐ ┌────────────────┐   │
│   │gap-analyzer │ │tradeoff-analyzer │ │verification-   │   │
│   │gaps/risks   │ │risk/alt/overeng  │ │planner         │   │
│   └──────┬──────┘ └────────┬─────────┘ │A/H-items,ExtDep│   │
│          │                 │           └───────┬────────┘   │
│          │         ┌───────────────┐           │            │
│          │         │external-      │           │            │
│          │         │researcher     │           │            │
│          │         │(optional)     │           │            │
│          │         └───────┬───────┘           │            │
│          └─────────────────┼───────────────────┘            │
│                            ▼                                │
│  Step 2.5: Codex Strategic Synthesis (Standard mode only)   │
│   ┌─────────────────┐                                      │
│   │codex-strategist │ → cross-check, find blind spots       │
│   └────────┬────────┘                                      │
│                            ▼                                │
│   HIGH risk decision_points → user approval     🧑 HITL #5 │
│                       ▼                                     │
│  Step 3: Decision summary + verification checkpoint         │
│   User decisions + auto decisions + A/H-items   🧑 HITL #6 │
│                       ▼                                     │
│  Step 4: Generate spec.json                                  │
│   (Verification Summary + External Deps + TODOs + Risk)     │
│                       ▼                                     │
│  Step 4.5: Verification Summary review          🧑 HITL #6b│
│                       ▼                                     │
│  Step 5-6: Plan-Reviewer review (+ Structural Integrity)     │
│   ┌─────────────┐                                           │
│   │plan-reviewer│──OKAY──→ Done                             │
│   └───┬────┘                                                │
│       │REJECT                                               │
│       ├─ cosmetic → auto-fix → re-review                    │
│       └─ semantic → user choice                 🧑 HITL #7  │
│           ├ apply suggestion                                │
│           ├ manual fix                                       │
│           └ return to interview                 🧑 HITL #8  │
└─────────────────────────────────────────────────────────────┘
                        ▼
              Next step:
              • /execute — start implementation
```

**Human-in-the-Loop Checkpoints (9):**

| # | When | Purpose |
|---|------|---------|
| 1 | Exploration summary | Prevent wrong assumptions |
| 2 | Interview questions | Business judgment |
| 3 | tech-decision | Technology choice |
| 4 | Plan transition | Explicit user intent |
| 5 | HIGH risk decisions | Hard-to-reverse changes |
| 6 | Decision summary + verification strategy | Prevent silent drift + agree on verification approach |
| 6b | Verification Summary review | Final A/H-items + External Deps confirmation |
| 7 | Semantic REJECT | Scope/requirements change |
| 8 | Return to interview | Direction change |

**Risk Tagging:** Each TODO gets LOW/MEDIUM/HIGH risk tag + reversibility analysis (Reversible/Irreversible). HIGH risk items (DB schema, auth, breaking API) require user approval + rollback plan.

**Verification Strategy:** spec.json top-level Verification Summary (A-items: agent-automated verification, H-items: human confirmation required) + External Dependencies Strategy (Pre-work/During/Post-work). A-items flow into TODO-level Acceptance Criteria.

**Verification Block:** Each TODO includes Functional/Static/Runtime acceptance criteria with executable commands (`npm test`, `npm run typecheck`).

## Hook System

Hooks automate transitions and enforce quality:

| Hook Type | Script | Purpose |
|-----------|--------|---------|
| SessionStart | `execute-compact-hook.sh` | Handle compact session resume for /execute |
| UserPromptSubmit | `ultrawork-init-hook.sh` | Initialize ultrawork pipeline state |
| UserPromptSubmit | `skill-session-init.sh` | Initialize session state for specify/execute |
| UserPromptSubmit | `rv-detector.sh` | Detect `!rv` re-validation keyword |
| PreToolUse(Skill) | `rulph-init.sh` | Initialize rulph loop state |
| PreToolUse(Edit/Write) | `skill-session-guard.sh` | Plan guard (specify) / orchestrator guard (execute) |
| PreToolUse(Edit/Write) | `ralph-dod-guard.sh` | Enforce DoD before writes in /ralph loop |
| PostToolUse(Task/Skill) | `validate-output.sh` | Validate agent/skill output against `validate_prompt` |
| Stop | `ultrawork-stop-hook.sh` | Advance ultrawork pipeline on stop |
| Stop | `skill-session-stop.sh` | Block exit if execute has incomplete tasks |
| Stop | `rv-validator.sh` | Run re-validation pass |
| Stop | `rulph-stop.sh` | Handle rulph loop termination |
| Stop | `ralph-stop.sh` | Ralph loop DoD verification + prompt re-injection |
| SessionEnd | `skill-session-cleanup.sh` | Clean up session state files |

## Execute Architecture

The `/execute` skill follows an Orchestrator-Worker pattern:

```
Orchestrator (reads spec.json via cli)
  ├── Parse tasks → Create Tasks with dependencies
  ├── Parallelize non-blocked Tasks
  ├── For each task:
  │   ├── Worker agent (implementation)
  │   ├── Verify (acceptance criteria checks)
  │   ├── Context save (learnings, decisions, issues)
  │   └── git-master (atomic commit)
  └── Finalize:
      ├── Residual Commit
      ├── Code Review (code-reviewer → SHIP/NEEDS_FIXES)
      ├── State Complete (PR mode)
      └── Report
```

**Key rules:**
- Orchestrator never writes code — only delegates and verifies
- spec.json tasks are the single source of truth
- Failed tasks retry up to 3 times (reconciliation)
- Independent TODOs run in parallel

## /bugfix — One-shot Bug Fixing

Root cause-based one-shot bug fix. Adaptive mode auto-selects pipeline depth based on debugger's severity assessment.

```
/bugfix "error description"
  ├── Phase 1: DIAGNOSE
  │   ├── debugger + verification-planner (parallel)
  │   ├── [COMPLEX] add gap-analyzer
  │   └── User confirms root cause
  ├── Phase 2: FIX (max 3 attempts)
  │   ├── worker (minimal fix + regression tests)
  │   ├── Bash verify (A-items independent run)
  │   └── 3 failures → Circuit Breaker → escalate to /specify
  └── Phase 3: REVIEW & COMMIT
      ├── [COMPLEX] code-reviewer (multi-model)
      └── git-master (atomic commit)
```

| Severity | Agents | Condition |
|----------|--------|-----------|
| **SIMPLE** | 4 (debugger, v-planner, worker, git-master) | Single file, clear cause |
| **COMPLEX** | 6 (+gap-analyzer, +code-reviewer) | Multi-file, integration, security path |

## Project Structure

```
.claude/
├── skills/          # Skill definitions (SKILL.md per skill)
├── agents/          # Agent definitions (frontmatter + system prompt)
└── scripts/         # Hook scripts (bash)

.dev/
├── specs/{name}/    # Per-feature specs
│   ├── spec.json
│   └── context/     # learnings.md, decisions.md, issues.md, outputs.json
└── state.local.json # Session tracking state (git-ignored)

docs/
└── learnings/           # Knowledge extracted from development
    └── lessons-learned.md
```

## Codex Integration

Cross-model strategy using OpenAI Codex CLI (`codex exec`) for adversarial analysis alongside Claude agents.

| Integration Point | Agent | When | Purpose |
|-------------------|-------|------|---------|
| `/specify` Step 2.5 | `codex-strategist` | After 4 analysis agents | Cross-check reports, find blind spots, surface contradictions |
| `/execute` Finalize | `code-reviewer` | After residual commit | Final quality gate code review (SHIP/NEEDS_FIXES) |
| `/tribunal` Risk | `codex-risk-analyst` | Parallel with 2 Claude agents | Adversarial risk analysis from a different model's perspective |

**Graceful degradation**: If `codex` CLI is unavailable, agents return SKIPPED/DEGRADED and the pipeline continues without blocking.

**Mode gate**: Codex steps run in Standard mode only. Quick mode skips them entirely.

## /tribunal — Adversarial Review

3-perspective review skill that evaluates any proposal (plan, PR, diff) from Risk, Value, and Feasibility angles simultaneously.

```
            ┌─ codex-risk-analyst (Codex)  ── "What can go wrong?"
Input ──────┼─ value-assessor (Claude)     ── "What value does this deliver?"
            └─ feasibility-checker (Claude) ── "Can this actually be built?"
                         ↓
               Synthesize → APPROVE / REVISE / REJECT
```

**Verdict matrix**: Risk (BLOCK/CAUTION/CLEAR) × Value (STRONG/ADEQUATE/WEAK) × Feasibility (GO/CONDITIONAL/NO-GO) → final verdict with required actions.

**Usage**: `/tribunal spec.json`, `/tribunal --pr 42`, `/tribunal --diff`

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook and tool behavior gotchas discovered during development.
