---
name: specify
description: |
  This skill should be used when the user says "/specify", "plan this", or "make a plan".
  Interview-driven planning workflow with mode support (quick/standard × interactive/autopilot).
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - AskUserQuestion
  - Bash
---
# /specify - CLI-Orchestrated Planning

**You are the boss. dev-cli is your utility belt.**
Follow this algorithm step by step. Call `node dev-cli/bin/dev-cli.js` for deterministic operations only.
Recipe files are pure data (agent lists, config values) — never ask dev-cli for "the next step."

---

## Session Model

| Concept | Directory | Contents |
|---------|-----------|----------|
| **Spec** | `.dev/specs/{name}/` | `PLAN.md`, `plan-content.json`, `context/`, `session.ref` |
| **Session** | `.dev/.sessions/{sessionId}/` | `state.json`, `DRAFT.md`, `findings/`, `analysis/` |

`session.ref` links a spec to its active session. All paths resolve automatically via CLI.
`PLAN.md` always lives at `.dev/specs/{name}/PLAN.md`.

On context compaction: `node dev-cli/bin/dev-cli.js manifest {name} --json` → returns `{ name, sessionId, mode, completedSteps[], currentStep, artifacts }`. Resume from `currentStep`.

Early exit: `node dev-cli/bin/dev-cli.js abort {name} --reason "..."`.

| CLI Exit Code | Meaning | Action |
|---------------|---------|--------|
| 0 + JSON | Success | Parse and use |
| 0 + `{ "ok": true, "noop": true }` | Idempotent no-op | Proceed |
| Non-zero | Error | Read stderr, do NOT retry blindly |

---

## Recipe Contract

SKILL.md interprets the recipe's step configuration. Behavior fields:

| Field | Default | Meaning |
|-------|---------|---------|
| `autoTransition` | `false` | `true` = auto-proceed without user confirmation |
| `confirmation` | per mode | `"user"` / `"log-only"` / `"none"` |
| `summary` | `"full"` | Cleanup summary: `"full"` / `"compact"` / `"none"` |
| `parallel` | `false` | `true` = run step agents in parallel |
| `maxRounds` | `1` | Max review iterations |
| `agents` | (none) | Agent array; if absent, SKILL.md policy executes directly |

**Step presence rule**: If a step id is not in the recipe → skip. If present → execute.

---

## Invariant Rules

1. `classify` runs before `init` (intent-first, Phase 0)
2. `cleanup` is always the last step
3. HIGH risk → HALT and ask user (even in autopilot)
4. Reviewer exceeds `maxRounds` with REJECT → HALT and inform user
5. Subagents write full results to output path (Markdown+YAML frontmatter), return 1-2 line summary only
6. Call `dev-cli step-done` after each step
7. After context compaction, recover via `dev-cli manifest`

---

## STEP 1: Bootstrap (No Recipe)

### 1.1 Parse Input
Extract flags and `{name}` from user input.

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | depth = quick | standard |
| `--autopilot` | interaction = autopilot | per depth |
| `--interactive` | interaction = interactive | per depth |

### 1.2 Classify Intent

| Intent | Keywords | Strategy |
|--------|----------|----------|
| Refactoring | "refactoring", "cleanup", "migrate" | Safety first |
| New Feature | "add", "new", "implement" | Pattern exploration |
| Bug Fix | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix |
| Architecture | "design", "structure" | Trade-off analysis |
| Research | "investigate", "analyze" | Investigation only |
| Migration | "migration", "upgrade" | Phased approach |
| Performance | "optimize", "slow" | Measure first |

Output: 1-2 sentence intent statement with category and goal.

### 1.3 Resolve Mode

**Auto-Detect Depth** (no flag): Only `"fix", "typo", "rename", "bump", "update version"` → quick. Everything else → standard.
**STRICT**: Do NOT infer quick from "simple"/"easy"/"small". Any create/add/implement → standard.
**Intent overrides**: New Feature, Architecture, Migration, Research, Performance → always standard.
**Interaction defaults**: quick → autopilot, standard → interactive.

### 1.4 Init

```bash
node dev-cli/bin/dev-cli.js init {name} --recipe specify-{depth}-{interaction} --skill specify --intent "<intent>" [--quick] [--autopilot]
```

If `{ "resumed": true }`, read state and resume. Then record Phase 0:
```bash
echo '{"section":"intent","data":"<intent>"}' | node dev-cli/bin/dev-cli.js draft {name} update
node dev-cli/bin/dev-cli.js step-done {name} --step classify
node dev-cli/bin/dev-cli.js step-done {name} --step init
```

Phase 0 (1.1–1.3) runs without dev-cli. CLI calls begin at 1.4.

**Tech-Decision**: If intent is Architecture/Migration or request contains "vs"/"compare"/"which one", propose `Skill("tech-decision")` via AskUserQuestion.

---

## STEP 2: Exploration

Run all agents from `recipe.steps[id=explore].agents` (parallel if configured).
Each agent writes to output path, returns 1-2 line summary.

```bash
node dev-cli/bin/dev-cli.js draft import {name}
node dev-cli/bin/dev-cli.js step-done {name} --step explore
```

**Interactive summary**: key directories, 2-3 patterns (file:line), ADR/conventions, project commands, UX concerns.

---

## STEP 3: Interview / Auto-Assume

Recipe has `interview` → 3a. Recipe has `auto-assume` → 3b.

### 3a: Interview
- **ASK**: boundaries, trade-offs (multiple valid options only), success criteria
- **DISCOVER**: patterns, commands, docs, UX impact
- **PROPOSE**: concrete decisions after each answer; minimize questions, prefer research-backed proposals

Update DRAFT after each exchange. Exit when all critical decisions recorded.
```bash
node dev-cli/bin/dev-cli.js step-done {name} --step interview
```

### 3b: Auto-Assume

| Decision Point | Rule |
|----------------|------|
| Tech choices | Existing stack, codebase patterns |
| Trade-offs | Lower-risk, simpler option |
| Ambiguous scope | Minimum viable |
| HIGH risk | HALT and ask user |
| Missing info | Standard/conventional; log in Assumptions |

```bash
echo '{"section":"assumptions","data":"<table>"}' | node dev-cli/bin/dev-cli.js draft {name} update
node dev-cli/bin/dev-cli.js step-done {name} --step auto-assume
```

### Draft Update Rules

| Trigger | Section | Format |
|---------|---------|--------|
| User answers | User Decisions | `\| question \| decision \| notes \|` |
| Boundary stated | Must NOT Do | Bullet point |
| Criteria agreed | Success Criteria | `- [ ] condition` |
| Agent returns | Agent Findings | `file:line` - description |
| Direction agreed | Approach | Numbered list |
| Assumption made | Assumptions | `\| point \| choice \| rationale \| source \|` |

---

## STEP 4: Decision Confirmation

Present all decisions via AskUserQuestion. "All confirmed" → proceed. "Corrections" → update DRAFT.
```bash
node dev-cli/bin/dev-cli.js step-done {name} --step decision-confirm
```

---

## STEP 5: Analysis

Run agents from `recipe.steps[id=analyze].agents` (parallel if configured).
```bash
node dev-cli/bin/dev-cli.js draft import {name}
node dev-cli/bin/dev-cli.js step-done {name} --step analyze
```

**Using results**: gap-analyzer → add missing requirements, AI Pitfalls to mustNotDo. tradeoff-analyzer → risk tags, simpler alternatives, rollback for HIGH. simplicity-checker → simplify flagged todos. risk-assessor → cross-reference and elevate.

---

## STEP 5.5: Codex Synthesis

Run agent from `recipe.steps[id=codex-synth].agents`.
```bash
node dev-cli/bin/dev-cli.js draft import {name}
node dev-cli/bin/dev-cli.js step-done {name} --step codex-synth
```

---

## STEP 6: Decision Checkpoint

Present via AskUserQuestion: (1) User Decisions, (2) Agent Decisions with `[LOW]/[MED]/[HIGH]` tags, (3) Codex Synthesis if ran, (4) Risk Summary (HIGH table, MED/LOW counts), (5) Verification A/H/S items.
"All confirmed" → proceed. "Corrections" → update and re-run affected analysis.

---

## STEP 7: Plan Generation

**Transition**: `autoTransition: true` → proceed immediately. `false` → wait for "make/generate the plan".

### 7.1 Read TESTING.md
Read `${baseDir}/../../../TESTING.md` — extract "For Verification Agents" and "Sandbox Bootstrapping Patterns".

### 7.2 Write plan-content.json
Write to `.dev/specs/{name}/plan-content.json`. See [Schema Reference](#plan-content-json-schema).

### 7.3 Generate PLAN.md
```bash
node dev-cli/bin/dev-cli.js plan generate {name} --data plan-content.json
node dev-cli/bin/dev-cli.js step-done {name} --step generate-plan
```

**Interactive**: show A/H/S counts, offer "Confirmed" / "Corrections" via AskUserQuestion.

---

## STEP 8: Plan Review

Run agents from `recipe.steps[id=review].agents` up to `maxRounds`.

| Rejection Type | Handling |
|----------------|----------|
| Cosmetic (wording, formatting) | Always auto-fix |
| Semantic (scope, DoD, risk) | Interactive: ask user. Autopilot: auto-fix (HALT on scope change) |

If REJECT after max rounds → HALT.
```bash
node dev-cli/bin/dev-cli.js step-done {name} --step review
```

---

## STEP 9: Cleanup

```bash
node dev-cli/bin/dev-cli.js cleanup {name}
node dev-cli/bin/dev-cli.js step-done {name} --step cleanup
```

Summary per `recipe.steps[id=cleanup].summary`:

| Section | Rule |
|---------|------|
| TODO Overview | One line per TODO: title + [type] + key files (max 3) |
| Verification | A/H/S counts; list if <=5, else "see PLAN.md" |
| Pre/Post-work | All items; mark blocking |
| Key Decisions | Max 5 most impactful |
| Assumptions | Autopilot only; all + rationale |

**Interactive**: offer next step via AskUserQuestion: `/open`, `/execute`, `/worktree create {name}`.
**Autopilot**: output summary and stop.

---

## plan-content.json Schema

```
context:         { originalRequest, interviewSummary, researchFindings, assumptions? }
objectives:      { core, deliverables[], dod[], mustNotDo[] }
todos[]:         { id, title, type("work"|"verification"),
                   inputs[], outputs[], steps[], mustNotDo[], references[],
                   acceptanceCriteria: { functional[], static[], runtime[], cleanup[]? },
                   risk("LOW"|"MEDIUM"|"HIGH") }
taskFlow:        string
dependencyGraph: [{ todo, requires[], produces[] }]
commitStrategy:  [{ afterTodo, message, files[], condition }]
verificationSummary: { aItems[], hItems[], sItems[], gaps[] }
```

`todo.id`: `todo-N` (work) or `todo-final` (verification). Risk: `LOW`/`MEDIUM`/`HIGH`.

### DRAFT → plan-content.json Mapping

| DRAFT Section | Field |
|---------------|-------|
| What & Why | `context.originalRequest` |
| User Decisions | `context.interviewSummary` |
| Agent Findings | `context.researchFindings` |
| Assumptions | `context.assumptions` |
| Deliverables | `objectives.deliverables` |
| Boundaries + mustNotDo | `objectives.mustNotDo` |
| Success Criteria | `objectives.dod` |
| Work Breakdown | `todos[]` + `taskFlow` + `dependencyGraph` |

### Quality Rules

1. Each todo: >=3 functional acceptance criteria (specific, testable)
2. `aItems`: include verification method in parentheses
3. `hItems`: explain WHY human verification needed
4. `commitStrategy`: NEVER empty
5. `mustNotDo`: min 3 (standard), 2 (quick)
6. `todo.steps`: concrete actions with file paths
7. `taskFlow`: order, parallelism, dependency rationale
8. Standard: >=3 aItems AND >=3 hItems

### A/H/S Classification

| Signal | Category | Example |
|--------|----------|---------|
| CLI with exit code | A-item | `npm test`, `tsc --noEmit` |
| Human judgment | H-item | "Visual theme matches spec" |
| Docker/browser/multi-service | S-item | BDD feature file |

### Risk Tags

| Risk | Requirements |
|------|-------------|
| LOW | Standard verification |
| MEDIUM | Verify block + reviewer scrutiny |
| HIGH | Verify + rollback + human approval |

---

## Template References

| Template | Path |
|----------|------|
| DRAFT_TEMPLATE.md | `${baseDir}/templates/DRAFT_TEMPLATE.md` |
| PLAN_TEMPLATE.md | `${baseDir}/templates/PLAN_TEMPLATE.md` |

> Subagents cannot resolve `${baseDir}`. Main agent must read and inline content.

---

## Checklist Before Stopping

- [ ] All recipe steps marked done via `dev-cli step-done`
- [ ] All subagent output files created
- [ ] `PLAN.md` exists at `.dev/specs/{name}/PLAN.md`
- [ ] `plan-content.json` exists at `.dev/specs/{name}/plan-content.json`
- [ ] Reviewer OKAY (or HALT on maxRounds exceeded)
- [ ] Cleanup completed
