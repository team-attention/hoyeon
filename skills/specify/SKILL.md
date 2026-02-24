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
You follow this algorithm step by step. Call `node dev-cli/bin/dev-cli.js` for deterministic operations only.
Recipe files are pure data (agent lists, config values) — you never ask dev-cli to "give you the next step."

---

## Session Model

**Session vs. Spec** — these are separate concepts:

| Concept | Directory | Contents |
|---------|-----------|----------|
| **Spec** | `.dev/specs/{name}/` | Deliverables: `PLAN.md`, `plan-content.json`, `context/`, `session.ref` |
| **Session** | `.dev/.sessions/{sessionId}/` | Work artifacts: `state.json`, `DRAFT.md`, `findings/`, `analysis/` |

**session.ref** is a pointer file at `.dev/specs/{name}/session.ref` containing just the `{sessionId}` UUID.
It links a spec to its active session, enabling dual-path resolution.

**Path resolution** (handled by `paths.js` in dev-cli):
- `DRAFT.md` → `.dev/.sessions/{sessionId}/DRAFT.md` (via session.ref) or `.dev/specs/{name}/DRAFT.md` (legacy)
- `state.json` → `.dev/.sessions/{sessionId}/state.json` (via session.ref)
- `findings/` → `.dev/.sessions/{sessionId}/findings/`
- `analysis/` → `.dev/.sessions/{sessionId}/analysis/`
- `PLAN.md` → always `.dev/specs/{name}/PLAN.md` (deliverable, never in session dir)

You do not need to compute these paths manually. The CLI resolves them automatically based on `session.ref`.

### Rules
- Subagents: Write full results to the output path (from recipe `steps[].agents[].output`, resolved relative to session dir). Return only 1-2 line summary.
- Subagent output format: Markdown with YAML frontmatter (agent, timestamp, summary).
- Early exit: if the task is clearly unnecessary, call `node dev-cli/bin/dev-cli.js abort {name} --reason "..."` instead of silently stopping.

### CLI Error Handling

| CLI Exit Code | Meaning | Action |
|---------------|---------|--------|
| 0 + JSON output | Success | Parse and use result |
| 0 + `{ "ok": true, "noop": true }` | Idempotent no-op | Already done — safe to proceed |
| Non-zero | Error | Read stderr message, do NOT retry blindly |

### On Context Compaction

Call `node dev-cli/bin/dev-cli.js manifest {name} --json` to recover full state.

Returns:
```json
{
  "name": "my-feature",
  "sessionId": "abc-123",
  "mode": "standard-interactive",
  "completedSteps": ["init", "classify", "explore"],
  "currentStep": "interview",
  "artifacts": { "draft": "...", "findings": [...], "analysis": [...], "plan": "..." }
}
```

Resume from `currentStep`. Read artifacts listed. Continue the algorithm below.

---

## STEP 1: Mode Selection & Init

### 1.1 Parse Input & Select Mode

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | depth = quick | depth = standard |
| `--autopilot` | interaction = autopilot | depends on depth |
| `--interactive` | interaction = interactive | depends on depth |

**Auto-Detect Depth** (no flag given):

| Keywords in request | Auto-Depth |
|---------------------|------------|
| "fix", "typo", "rename", "bump", "update version" | quick |
| **Everything else** | **standard** |

**STRICT RULE**: Only the EXACT keywords above trigger `quick`. Do NOT infer quick from words like "simple", "easy", "small". A request to create, add, or implement anything — regardless of perceived simplicity — MUST use `standard`.

**Intent → Depth override** (applied after keyword check):

| Intent | Required Depth |
|--------|---------------|
| New Feature | always standard |
| Architecture | always standard |
| Migration | always standard |
| Research | always standard |
| Performance | always standard |
| Bug Fix | quick only if trivial (typo-level), else standard |
| Refactoring | quick only if rename/cleanup, else standard |

**Interaction Defaults**: quick → autopilot, standard → interactive

### 1.2 Initialize Session

```bash
node dev-cli/bin/dev-cli.js init {name} --recipe specify-{depth}-{interaction} --skill specify [--quick if depth=quick] [--autopilot if interaction=autopilot]
```

If init returns `{ "resumed": true }`, a session already exists — read the state and resume from the current step.

```bash
node dev-cli/bin/dev-cli.js step-done {name} --step init
```

---

## STEP 2: Classify Intent

Classify the user intent into one of 7 categories:

| Intent | Keywords | Strategy |
|--------|----------|----------|
| **Refactoring** | "refactoring", "cleanup", "migrate" | Safety first, regression prevention |
| **New Feature** | "add", "new", "implement" | Pattern exploration, integration points |
| **Bug Fix** | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix |
| **Architecture** | "design", "structure" | Trade-off analysis, oracle consultation |
| **Research** | "investigate", "analyze" | Investigation only, NO implementation |
| **Migration** | "migration", "upgrade" | Phased approach, rollback plan |
| **Performance** | "optimize", "slow" | Measure first, profile → optimize |

Output a short intent statement (1-2 sentences) naming the category and the goal.

```bash
echo '{"section":"intent","data":"<intent statement>"}' | node dev-cli/bin/dev-cli.js draft {name} update
node dev-cli/bin/dev-cli.js step-done {name} --step classify
```

### Tech-Decision Integration

> **Mode Gate**: Quick/Autopilot → skip entirely. Use existing stack; log in Assumptions.

**Trigger**: Intent is **Architecture** or **Migration**, OR request contains comparison keywords: "vs", "versus", "compare", "which one".

If triggered, propose `Skill("tech-decision")` to user via AskUserQuestion.

---

## STEP 3: Exploration

> **Mode Gate**:
> - **Standard**: 4 agents (Explore ×2 + docs-researcher + ux-reviewer)
> - **Quick**: 2 agents (Explore ×2 only)

Agent types and outputs come from the recipe's `steps[id=explore].agents` array.

Launch all exploration agents in parallel. Each agent MUST write full results (Markdown with YAML frontmatter) to its output path (resolved relative to session findings dir). Return only a 1-2 line summary.

After all agents complete:
```bash
node dev-cli/bin/dev-cli.js draft import {name}
node dev-cli/bin/dev-cli.js step-done {name} --step explore
```

### Exploration Summary Presentation

| Mode | Behavior |
|------|----------|
| Quick | Abbreviated: patterns + commands only (2-3 lines) |
| Autopilot | Log to DRAFT, no confirmation wait, proceed immediately |
| Interactive | Present full summary, ask user to confirm context is correct |

**What to present** (interactive full summary):
- Structure: key directory layout
- Related patterns: 2-3 discovered patterns (file:line)
- Internal docs: relevant ADR/convention summary
- Project commands: lint/test/build
- UX review: current flow summary + key concerns

---

## STEP 4: Interview / Auto-Assume

> **Mode Gate**:
> - **Standard+Interactive**: Full interview loop (STEP 4a)
> - **Quick+Interactive**: Brief interview (STEP 4a, time-boxed)
> - **Autopilot** (any depth): Auto-assume (STEP 4b)

### STEP 4a: Interview (Interactive)

**ASK** (user knows, agent doesn't):
- Boundaries: "Any restrictions on what not to do?"
- Trade-offs: Only when multiple valid options exist
- Success Criteria: "When is this considered complete?"

**DISCOVER** (agent finds via exploration):
- Existing patterns (file:line format)
- Project commands (lint/test/build)
- Internal docs (ADRs, conventions)
- UX impact (current flow analysis)

**PROPOSE** (research first, then suggest):
- After each answer, propose a concrete decision or assumption
- Offer trade-off options (simple-now vs flexible-later)
- Summarize agreed decisions at end of each exchange
- Minimize questions; prefer proposals backed by research

**Update DRAFT after each exchange:**
```bash
echo '{"section":"decisions","data":"<decisions table>"}' | node dev-cli/bin/dev-cli.js draft {name} update
```

**Exit when**: All critical decisions recorded and validated.

```bash
node dev-cli/bin/dev-cli.js step-done {name} --step interview
```

### STEP 4b: Auto-Assume (Autopilot)

**Autopilot Decision Rules**:

| Decision Point | Rule |
|----------------|------|
| Tech choices | Use existing stack; prefer codebase patterns |
| Trade-off questions | Choose lower-risk, simpler option |
| Ambiguous scope | Interpret narrowly (minimum viable scope) |
| HIGH risk items | HALT and ask user (override autopilot) |
| Missing info | Assume standard/conventional; log in Assumptions |

Log all decisions in the Assumptions section of DRAFT:
```bash
echo '{"section":"assumptions","data":"<assumptions table>"}' | node dev-cli/bin/dev-cli.js draft {name} update
node dev-cli/bin/dev-cli.js step-done {name} --step auto-assume
```

### Draft Continuous Update Rules

Update DRAFT incrementally after each event. Never batch updates.

| Trigger | Sections to Update | Format |
|---------|--------------------|--------|
| User answers question | User Decisions (add row), remove from Open Questions | `\| question \| decision \| notes \|` |
| User states boundary | Boundaries > Must NOT Do | Bullet point |
| User agrees on criteria | Success Criteria | Checkbox `- [ ] condition` |
| Exploration agent returns | Agent Findings > Patterns, Structure, Commands | Patterns: `file:line` - description |
| docs-researcher returns | Agent Findings > Documentation | `path:line` - description |
| ux-reviewer returns | Agent Findings > UX Review | Current flow, impact, recommendations |
| External deps discovered | Agent Findings > External Dependencies | Table row: dep, type, setup, env vars |
| Direction agreed | Direction > Approach + Work Breakdown | Numbered list with deps/outputs |
| Assumption made (autopilot) | Assumptions table | `\| decision point \| choice \| rationale \| source \|` |

---

## STEP 5: Decision Confirmation

> **Mode Gate**: Standard+Interactive only. Autopilot: log to DRAFT, skip user confirmation. Quick: skip entirely.

### STEP 5a: Decision Summary (Standard+Interactive)

Before analysis, present a summary of all decisions to user via AskUserQuestion:
- "All confirmed" → proceed to analysis
- "Corrections needed" → ask which items to change, update DRAFT

```bash
node dev-cli/bin/dev-cli.js step-done {name} --step decision-confirm
```

---

## STEP 6: Analysis

> **Mode Gate**:
> - **Standard**: 4 agents (tradeoff-analyzer, gap-analyzer, simplicity-checker, risk-assessor)
> - **Quick**: 1 agent (tradeoff-analyzer lite only)

Agent types and outputs come from the recipe's `steps[id=analyze].agents` array.

Launch all analysis agents in parallel. Each agent writes results to its output path (resolved relative to session analysis dir).

After all agents complete:
```bash
node dev-cli/bin/dev-cli.js draft import {name}
node dev-cli/bin/dev-cli.js step-done {name} --step analyze
```

---

## STEP 6.5: Codex Synthesis (Standard only)

> **Mode Gate**: Standard → required. Quick → skip.

Agent type from recipe's `steps[id=codex-synth].agents` array.

```bash
node dev-cli/bin/dev-cli.js draft import {name}
node dev-cli/bin/dev-cli.js step-done {name} --step codex-synth
```

---

## STEP 7: Decision Summary Checkpoint

> **Mode Gate**: Standard+Interactive only. Autopilot: log to DRAFT, skip. Quick: skip.

Present a comprehensive summary of ALL decisions for user confirmation via AskUserQuestion:

1. **User Decisions**: items user explicitly chose
2. **Agent Decisions**: items agent decided, with risk tag `[LOW]`/`[MED]`/`[HIGH]`
3. **Codex Synthesis** (if ran): contradictions, blind spots, strategic concerns
4. **Risk Summary**: table for HIGH items only. MEDIUM/LOW as aggregate counts.
5. **Verification Strategy**: A-items (criterion + method), H-items (criterion + reason), S-items (scenario + method)

Options: "All confirmed" / "Corrections needed"

If "Corrections needed": ask which items to change, update DRAFT, re-run affected analysis if needed.

---

## STEP 8: Plan Generation

### Plan Transition Conditions (Interactive Mode)

**Conditions** (all must be met):
- Critical Open Questions all resolved
- User Decisions recorded
- Success Criteria agreed
- User explicitly says "make it a plan" / "generate the plan"

**DO NOT** generate a plan just because you have enough information.

> **Mode Gate**: Quick auto-transitions after analysis. Autopilot auto-transitions after analysis.

### 8.1 TESTING.md Pre-Read

Before generating plan-content.json, read TESTING.md from the plugin root: `${baseDir}/../../../TESTING.md`
Extract "For Verification Agents" and "Sandbox Bootstrapping Patterns" sections.

### 8.2 Generate plan-content.json

Write `plan-content.json` to `.dev/specs/{name}/plan-content.json` using the Write tool.

**Required JSON structure:** (see plan-content.json Schema Reference below)

### 8.3 Generate PLAN.md

```bash
node dev-cli/bin/dev-cli.js plan generate {name} --data plan-content.json
node dev-cli/bin/dev-cli.js step-done {name} --step generate-plan
```

### Verification Summary Confirmation

> **Mode Gate**: Standard+Interactive only. Autopilot/Quick: skip.

After plan is generated, present a lightweight verification count:
- A-items: count
- H-items: count
- S-items: count (or "none — no sandbox infra")

Offer via AskUserQuestion: "Confirmed" or "Corrections needed".

---

## STEP 9: Plan Review

> **Mode Gate**:
> - **Standard**: Up to 3 review rounds (from recipe `steps[id=review].maxRounds`)
> - **Quick**: 1 round max

Agent types from recipe's `steps[id=review].agents` array.

### Reviewer Rejection Handling

| Type | What changes | Examples |
|------|-------------|----------|
| **Cosmetic** | Wording, formatting, field completeness | Missing field, unclear description |
| **Semantic** | Scope, deliverables, DoD, risk, mustNotDo | Requirements change, missing logic |

**Per-mode handling**:

| Mode | Cosmetic | Semantic |
|------|----------|----------|
| Standard+Interactive | Auto-fix | Present to user via AskUserQuestion |
| Standard+Autopilot | Auto-fix | Auto-fix if no scope change; HALT if scope change |
| Quick+Interactive | Auto-fix (1 round) | HALT, inform user |
| Quick+Autopilot | Auto-fix (1 round) | HALT always |

If still REJECT after max rounds, HALT and inform user.

After reviewer OKAY:
```bash
node dev-cli/bin/dev-cli.js step-done {name} --step review
```

---

## STEP 10: Cleanup & Summary

```bash
node dev-cli/bin/dev-cli.js cleanup {name}
node dev-cli/bin/dev-cli.js step-done {name} --step cleanup
```

### Plan Approval Summary

> **Mode Gate**: Interactive → print summary + AskUserQuestion (next step). Autopilot → print summary, then stop.

| Section | Source in PLAN.md | Condensing Rule |
|---------|-------------------|-----------------|
| TODO Overview | `## TODOs` | One line per TODO: title + [type] + key files (max 3). |
| Verification | `## Verification Summary` | A/H/S counts. List items if <=5, else count + "see PLAN.md". |
| Pre-work | `External Dependencies > Pre-work` | Show all items. Mark blocking with red indicator. |
| Post-work | `External Dependencies > Post-work` | Show all items. |
| Key Decisions | `Context > Interview Summary` | Max 5 most impactful decisions. |
| Assumptions | `## Assumptions` | Quick/autopilot only. All items + rationale. |

**Next step (interactive only):**
```
AskUserQuestion: "Plan approved. Select the next step."
Options:
  /open → Skill("open", args="{name}")
  /execute → Skill("execute", args="{name}")
  /worktree create {name} → Skill("worktree", args="create {name}")
```

Autopilot: print summary and plan path, then stop (no AskUserQuestion).

---

## plan-content.json Schema Reference

```
Top-level required fields:
  context:         { originalRequest, interviewSummary, researchFindings, assumptions? }
  objectives:      { core, deliverables[], dod[], mustNotDo[] }
  todos[]:         { id, title, type("work"|"verification"),
                     inputs[{name,type,ref}], outputs[{name,type,value,description}],
                     steps[], mustNotDo[], references[],
                     acceptanceCriteria: { functional[], static[], runtime[], cleanup[]? },
                     risk("LOW"|"MEDIUM"|"HIGH") }
  taskFlow:        string (execution order description)
  dependencyGraph: [{ todo, requires[], produces[] }]
  commitStrategy:  [{ afterTodo, message, files[], condition }]
  verificationSummary: { aItems[], hItems[], sItems[], gaps[] }
```

**TODO types**: `work` (implementation) or `verification` (testing/validation)
**Risk values**: `LOW`, `MEDIUM`, `HIGH`
**todo.id format**: `todo-N` for work TODOs, `todo-final` for verification TODO.

### DRAFT → plan-content.json Mapping

| DRAFT Section | plan-content.json Field |
|---------------|------------------------|
| What & Why | `context.originalRequest` |
| User Decisions | `context.interviewSummary` |
| Agent Findings (all) | `context.researchFindings` |
| Assumptions | `context.assumptions` |
| Deliverables | `objectives.deliverables` |
| Boundaries + gap-analyzer mustNotDo | `objectives.mustNotDo` |
| Success Criteria | `objectives.dod` |
| Direction > Work Breakdown | `todos[]` + `taskFlow` + `dependencyGraph` |

### Quality Rules (mandatory)

1. Each todo MUST have >=3 functional acceptance criteria — specific, testable, not vague.
2. verificationSummary.aItems: each item MUST include verification method in parentheses.
3. verificationSummary.hItems: each item MUST explain WHY human verification is needed.
4. commitStrategy: NEVER leave empty.
5. objectives.mustNotDo: minimum 3 items for standard, 2 for quick.
6. Each todo.steps: must be concrete actions with specific file paths.
7. taskFlow: describe execution order, parallelism, and dependency rationale.
8. verificationSummary: standard requires >=3 aItems AND >=3 hItems.

### A/H/S Verification Synthesis

- **A-items** (agent-verifiable): automated tests, CLI checks, lint, type-check
- **H-items** (human-required): UX review, visual inspection, subjective quality
- **S-items** (sandbox): Tier 4 scenarios requiring docker-compose/browser

**Quick Classification Table:**

| Signal | Category | Example |
|--------|----------|---------|
| Can run as CLI command with exit code | A-item | `npm test`, `tsc --noEmit` |
| Needs human judgment/eye | H-item | "Visual theme matches spec" |
| Requires docker-compose/browser/multi-service | S-item | BDD feature file execution |

### Risk Tag Application

| Risk | Plan Requirements |
|------|-------------------|
| LOW | Standard verification only |
| MEDIUM | Verify block + reviewer scrutiny |
| HIGH | Verify block + rollback steps + human approval before execution |

---

## Using Analysis Agent Results

**gap-analyzer**: Add missing requirements to relevant todos. Include AI Pitfalls in `objectives.mustNotDo`.

**tradeoff-analyzer**:
- Apply risk tags (LOW/MEDIUM/HIGH) to each todo
- Replace over-engineered approaches with simpler alternatives (SWITCH verdicts)
- For HIGH risk items: include rollback steps in todo steps
- Present `decision_points` to user (interactive) or auto-select conservative option (autopilot, except HIGH → HALT)

**simplicity-checker**: Validate approach isn't over-engineered. Simplify todos where flagged.

**risk-assessor**: Cross-reference with tradeoff-analyzer risk tags. Elevate if additional concerns found.

---

## Template References

| Template | Path | Purpose |
|----------|------|---------|
| DRAFT_TEMPLATE.md | `${baseDir}/templates/DRAFT_TEMPLATE.md` | Draft structure during interview mode |
| PLAN_TEMPLATE.md | `${baseDir}/templates/PLAN_TEMPLATE.md` | Plan structure for Orchestrator-Worker pattern |

> **`${baseDir}` note**: Subagents cannot resolve it. Main agent must read the file first and inline content into subagent prompts.

---

## Checklist Before Stopping

**All modes**:
- [ ] All steps marked done via `dev-cli step-done`
- [ ] All subagent output files written
- [ ] Plan file exists at `.dev/specs/{name}/PLAN.md`
- [ ] `plan-content.json` correctly populated at `.dev/specs/{name}/plan-content.json`
- [ ] Reviewer returned OKAY
- [ ] Cleanup completed

**Standard mode** (additional):
- [ ] All 4 analysis agents ran
- [ ] Codex synthesis attempted
- [ ] All HIGH risk `decision_points` resolved
- [ ] A/H/S items synthesized in `verificationSummary` (TESTING.md pre-read attempted)

**Interactive mode** (additional):
- [ ] User explicitly requested plan generation (standard+interactive only)
- [ ] Decision Summary Checkpoint presented and confirmed
- [ ] Verification Summary Confirmation presented and confirmed (standard+interactive only)

**Quick mode** (overrides):
- [ ] Only 2 exploration agents used
- [ ] Only tradeoff-lite analysis ran
- [ ] Maximum 1 plan-reviewer round completed

**Autopilot mode** (overrides):
- [ ] No `AskUserQuestion` calls made (except HIGH risk items)
- [ ] All autonomous decisions logged in Assumptions section
