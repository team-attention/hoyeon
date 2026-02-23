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

## Layer 1: Execution Flow (CLI-driven)

### Session Model

**Session vs. Spec** — these are separate concepts:

| Concept | Directory | Contents |
|---------|-----------|----------|
| **Spec** | `.dev/specs/{name}/` | Deliverables: `PLAN.md`, `plan-content.json`, `context/`, `session.ref` |
| **Session** | `.dev/.sessions/{sessionId}/` | Work artifacts: `state.json`, `DRAFT.md`, `findings/`, `analysis/` |

**session.ref** is a pointer file at `.dev/specs/{name}/session.ref` containing just the `{sessionId}` UUID.
It links a spec to its active session, enabling dual-path resolution: when `session.ref` exists, the CLI reads work artifacts from the session dir; otherwise it falls back to the spec dir (backward compatibility).

**Path resolution** (handled by `paths.js` in dev-cli):
- `DRAFT.md` → `.dev/.sessions/{sessionId}/DRAFT.md` (via session.ref) or `.dev/specs/{name}/DRAFT.md` (legacy)
- `state.json` → `.dev/.sessions/{sessionId}/state.json` (via session.ref) or `.dev/specs/{name}/state.json` (legacy)
- `findings/` → `.dev/.sessions/{sessionId}/findings/` (via session.ref) or `.dev/specs/{name}/findings/` (legacy)
- `analysis/` → `.dev/.sessions/{sessionId}/analysis/` (via session.ref) or `.dev/specs/{name}/analysis/` (legacy)
- `PLAN.md` → always `.dev/specs/{name}/PLAN.md` (deliverable, never in session dir)

You do not need to compute these paths manually. The CLI resolves them automatically based on `session.ref`.

### Rules
- Subagents: Write full results to the `outputPath` provided by CLI using the Write tool. Return only 1-2 line summary.
- Subagent output format: Markdown with YAML frontmatter (agent, timestamp, summary).
- When CLI returns `onComplete` field, execute that command AFTER all subagents finish, BEFORE calling `step complete`.
- When CLI returns `fileInstruction`, follow it exactly.
- Early exit: if the task is clearly unnecessary, call `node dev-cli/bin/dev-cli.js abort {name} --reason "..."` instead of silently stopping.

### Flow
1. `node dev-cli/bin/dev-cli.js init {name} --recipe specify-{depth}-{interaction} --skill specify [--quick] [--autopilot]`
   - `{depth}` = `standard` or `quick`, `{interaction}` = `interactive` or `autopilot` (from mode selection)
   - Creates session dir at `.dev/.sessions/{sessionId}/`
   - Writes `session.ref` into `.dev/specs/{name}/session.ref`
2. Loop: call `node dev-cli/bin/dev-cli.js next {name}` → follow the returned instruction
3. Until CLI returns `{ "done": true }`

### Draft Update
Use flags: `node dev-cli/bin/dev-cli.js draft {name} update --section <id> --data '<json>'`
Or stdin: `echo '{"section":"<id>","data":<value>}' | node dev-cli/bin/dev-cli.js draft {name} update`

> The CLI resolves DRAFT.md path automatically via `session.ref`. Do not hardcode paths.

### On Context Compaction
Call `node dev-cli/bin/dev-cli.js manifest {name}` to recover full state.

The manifest command outputs all active paths (spec dir, session dir, session ID, and locations of key files) so you can resume without re-running init.

---

## Layer 2: Judgment Rules & Knowledge

### Mode Selection

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

**STRICT RULE**: Only the EXACT keywords above trigger `quick`. Do NOT infer quick from words like "simple", "간단", "초간단", "easy", "small", or "빠르게". A request to create, add, or implement anything — regardless of perceived simplicity — MUST use `standard`.

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

**Autopilot Decision Rules**:

| Decision Point | Rule |
|----------------|------|
| Tech choices | Use existing stack; prefer codebase patterns |
| Trade-off questions | Choose lower-risk, simpler option |
| Ambiguous scope | Interpret narrowly (minimum viable scope) |
| HIGH risk items | HALT and ask user (override autopilot) |
| Missing info | Assume standard/conventional; log in Assumptions |

### Intent Classification

Classify each task into one of 7 categories, then apply the corresponding strategy:

| Intent | Keywords | Strategy |
|--------|----------|----------|
| **Refactoring** | "refactoring", "cleanup", "migrate" | Safety first, regression prevention |
| **New Feature** | "add", "new", "implement" | Pattern exploration, integration points |
| **Bug Fix** | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix |
| **Architecture** | "design", "structure" | Trade-off analysis, oracle consultation |
| **Research** | "investigate", "analyze" | Investigation only, NO implementation |
| **Migration** | "migration", "upgrade" | Phased approach, rollback plan |
| **Performance** | "optimize", "slow" | Measure first, profile → optimize |

### Tech-Decision Integration

> **Mode Gate**: Quick/Autopilot → skip entirely. Use existing stack; log in Assumptions.

**Initial trigger** (after Intent Classification):
- Intent is **Architecture** or **Migration**, OR
- Request contains comparison keywords: "vs", "versus", "compare", "which one", "what should I use"

If triggered, propose `Skill("tech-decision")` to user via AskUserQuestion:
- "Yes, run analysis" → `Skill("tech-decision", args="[comparison topic]")` → incorporate results into DRAFT
- "No, proceed quickly" → skip, proceed to exploration

**Mid-interview trigger** (during interview, interactive only):
When user expresses uncertainty ("which is better?", "what should I use?"), offer tech-decision as an option via AskUserQuestion. If declined, recommend based on existing codebase patterns.

### Interview Principles (Interactive Mode)

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

### Exploration Summary Presentation

After exploration agents complete, present findings to user **before** starting interview.

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

> **Purpose**: Let the user verify the agent's codebase understanding before the interview goes in the wrong direction.

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

### Plan Transition (Interactive Mode)

**Conditions** (all must be met):
- Critical Open Questions all resolved
- User Decisions recorded
- Success Criteria agreed
- User explicitly says "make it a plan" / "generate the plan"

**DO NOT** generate a plan just because you have enough information.

### Mode Gates by Step

| Step | Quick | Standard |
|------|-------|----------|
| Exploration | 2 agents (Explore ×2) | 4 agents (+docs-researcher, +ux-reviewer) |
| Interview | Skip → auto-assume | Full interview loop |
| Analysis | tradeoff-lite only (1 agent) | 4 agents (gap-analyzer, tradeoff-analyzer, simplicity-checker, risk-assessor) |
| Codex synthesis | Skip | Required (Step 2.5) |
| Plan review | 1 round | Up to 3 rounds |

### Plan Generation Judgment

#### DRAFT → plan-content.json Mapping

When generating `plan-content.json`, map DRAFT sections as follows:

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
| Agent Findings > Patterns + Documentation | `todos[].references` |
| Agent Findings > Commands | TODO Final `acceptanceCriteria` commands |
| Agent Findings > External Dependencies | Include in `context.researchFindings` |
| Agent Findings > UX Review | `objectives.mustNotDo` (UX items) + `todos[].mustNotDo` |

#### Using Analysis Agent Results

**gap-analyzer**: Add missing requirements to relevant todos. Include AI Pitfalls in `objectives.mustNotDo` and relevant `todos[].mustNotDo`.

**tradeoff-analyzer**:
- Apply risk tags (LOW/MEDIUM/HIGH) to each todo
- Replace over-engineered approaches with simpler alternatives (SWITCH verdicts)
- For HIGH risk items: include rollback steps in todo steps
- Present `decision_points` to user (interactive) or auto-select conservative option (autopilot, except HIGH → HALT and ask)

**simplicity-checker**: Validate approach isn't over-engineered. Simplify todos where checker flags unnecessary complexity.

**risk-assessor**: Cross-reference with tradeoff-analyzer risk tags. Elevate risk level if assessor flags additional concerns not caught by tradeoff analysis.

#### A/H/S Verification Synthesis

Since recipes use `simplicity-checker` and `risk-assessor` (not `verification-planner`), the agent must synthesize A/H/S items during the `generate-plan` LLM step itself:

- **A-items** (agent-verifiable): automated tests, CLI checks, lint, type-check — derive from Agent Findings > Commands and todo acceptance criteria
- **H-items** (human-required): UX review, visual inspection, subjective quality — derive from ux-reviewer findings
- **S-items** (sandbox): Tier 4 scenarios requiring docker-compose/browser — check if project has sandbox infra (`docker-compose.yml`, `sandbox/features/`)

**S-items fallback**: If any verification items are Tier 4 (E2E browser tests, multi-service integration), classify as S-items, not A-items. If project has sandbox infra but `sItems` is empty, flag as a warning in `gaps`.

**UI screenshot S-items**: If work involves UI/frontend changes, add screenshot-based S-items: capture at affected routes + compare against design spec (`.pen` files via Pencil MCP if available).

#### TESTING.md Pre-Read

Before generating plan-content.json, read TESTING.md from the plugin root to inform verification strategy. Resolve path: `${baseDir}/../../../TESTING.md` (baseDir shown in skill header). Extract the "For Verification Agents" and "Sandbox Bootstrapping Patterns" sections. Use this to correctly classify A/H/S items and select sandbox bootstrapping patterns.

> **Why inline?** Subagents cannot resolve `${baseDir}`. The main agent must read the file and use the content directly in the generate-plan step.

#### Risk Tag Application

| Risk | Plan Requirements |
|------|-------------------|
| LOW | Standard verification only |
| MEDIUM | Verify block + reviewer scrutiny |
| HIGH | Verify block + rollback steps + human approval before execution |

HIGH risk todos MUST include explicit rollback steps. If tradeoff-analyzer flags an irreversible change (Rollback=hard/impossible), propose a reversible alternative in the plan.

### Decision Summary Checkpoint

> **Mode Gate**: standard+interactive only. Autopilot: log to DRAFT, skip user confirmation. Quick: skip entirely.

Before plan generation, present a summary of **all decisions** for user confirmation via AskUserQuestion ("All confirmed" / "Corrections needed").

**Summary sections**:

1. **User Decisions**: items user explicitly chose
2. **Agent Decisions**: items agent decided, with risk tag `[LOW]`/`[MED]`/`[HIGH]`
3. **Codex Synthesis** (if Step 2.5 ran): contradictions, blind spots, strategic concerns, recommendations. Omit if SKIPPED/DEGRADED.
4. **Risk Summary**: table for HIGH items only (change, risk, rollback, reversible alternative, judgment). MEDIUM/LOW as aggregate counts.
5. **Verification Strategy**: A-items (criterion + method), H-items (criterion + reason), S-items (scenario + method if applicable), Verification Gaps

If user selects "Corrections needed": ask which items to change, update DRAFT, re-run affected analysis if needed.

> **Purpose**: Give the user a chance to review agent-decided LOW/MEDIUM items. Prevents silent scope drift.

### Verification Summary Confirmation

> **Mode Gate**: standard+interactive only. Autopilot/Quick: skip.

After plan is generated (PLAN.md created), present a lightweight verification count before sending to reviewer:
- A-items: count
- H-items: count
- S-items: count (or "none — no sandbox infra")

Offer via AskUserQuestion: "Confirmed" or "Corrections needed". If corrections, update PLAN verification section before proceeding to reviewer.

### Reviewer Rejection Handling

**Classification**:

| Type | What changes | Examples |
|------|-------------|----------|
| **Cosmetic** | Wording, formatting, field completeness | Missing field, unclear description |
| **Semantic** | Scope, deliverables, DoD, risk, mustNotDo, acceptance criteria | Requirements change, missing logic |

**Per-mode handling**:

| Mode | Cosmetic | Semantic |
|------|----------|----------|
| Standard+Interactive | Auto-fix | Present to user via AskUserQuestion |
| Standard+Autopilot | Auto-fix | Auto-fix if no scope change; HALT if scope change detected |
| Quick+Interactive | Auto-fix (counts as 1 round) | HALT, inform user |
| Quick+Autopilot | Auto-fix (counts as 1 round) | HALT always |

**Max review rounds**: standard = 3, quick = 1.

If still REJECT after max rounds, HALT and inform user.

> **Note**: CLI `cleanup` handles draft deletion after reviewer OKAY. Do not manually `rm` draft files.

### Plan Approval Summary

After reviewer OKAY + cleanup, present a comprehensive summary before stopping.

> **Mode Gate**: Interactive → print summary + AskUserQuestion (next step). Autopilot → print summary, then stop.

**Agent's role**: Ensure `plan-content.json` was correctly populated so CLI-generated PLAN.md has all sections. Then extract and present:

| Section | Source in PLAN.md | Condensing Rule |
|---------|-------------------|-----------------|
| TODO Overview | `## TODOs` | One line per TODO: title + [type] + key files (max 3). `⤷ depends on:` only for non-obvious deps. |
| Verification | `## Verification Summary` | A/H/S counts. List items if ≤5 per category, else count + "see PLAN.md". If S: 0 with sandbox infra → flag `⚠️`. |
| Pre-work | `External Dependencies > Pre-work` | Show all items. Mark blocking with `🔴`. |
| Post-work | `External Dependencies > Post-work` | Show all items. |
| Key Decisions | `Context > Interview Summary` | Max 5 most impactful decisions. |
| Assumptions | `## Assumptions` | Quick/autopilot only. All items + rationale. Append `--interactive` re-run hint. |

**Next step (interactive only)**:
```
AskUserQuestion: "Plan approved. Select the next step."
Options:
  /open → Skill("open", args="{name}")
  /execute → Skill("execute", args="{name}")
  /worktree create {name} → Skill("worktree", args="create {name}")
```

Autopilot: print summary and plan path, then stop (no AskUserQuestion).

### Template References

| Template | Path | Purpose |
|----------|------|---------|
| DRAFT_TEMPLATE.md | `${baseDir}/templates/DRAFT_TEMPLATE.md` | Draft structure during interview mode |
| PLAN_TEMPLATE.md | `${baseDir}/templates/PLAN_TEMPLATE.md` | Plan structure for Orchestrator-Worker pattern |

> **`${baseDir}` note**: This variable is provided as header context to the main agent only. Subagents cannot resolve it. When subagents need template content, the main agent must read the file first and inline the content into the subagent prompt.

### plan-content.json Schema Reference

The `generate-plan` step must produce JSON matching this exact schema (validated by `plan-content.schema.js`):

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
**Acceptance Criteria categories**: functional (behavior), static (lint/type), runtime (test execution), cleanup (optional post-work)

### Checklist Before Stopping

**All modes**:
- [ ] `dev-cli next` returned `{ "done": true }` (or `abort` was called)
- [ ] No pending `onComplete` commands left unexecuted
- [ ] All subagent `outputPath` files written
- [ ] Plan file (deliverable) exists at `.dev/specs/{name}/PLAN.md`
- [ ] `plan-content.json` correctly populated (all required fields present) — at `.dev/specs/{name}/plan-content.json`
- [ ] Reviewer returned OKAY
- [ ] DRAFT.md (work artifact) is at `.dev/.sessions/{sessionId}/DRAFT.md` (post-refactor) or `.dev/specs/{name}/DRAFT.md` (legacy)

**Standard mode** (additional):
- [ ] All 4 analysis agents ran (gap-analyzer, tradeoff-analyzer, simplicity-checker, risk-assessor)
- [ ] Codex synthesis attempted — result is one of: applied / SKIPPED / DEGRADED
- [ ] All HIGH risk `decision_points` resolved
- [ ] A/H/S items synthesized in `verificationSummary` (TESTING.md pre-read attempted)

**Interactive mode** (additional):
- [ ] User explicitly requested plan generation (standard+interactive only; quick auto-transitions)
- [ ] Decision Summary Checkpoint presented and confirmed by user
- [ ] Verification Summary Confirmation presented and confirmed (standard+interactive only)

**Quick mode** (overrides):
- [ ] Only 2 exploration agents used (Explore ×2)
- [ ] Only tradeoff-lite analysis ran (1 agent)
- [ ] Interview skipped (quick+autopilot) or minimal (quick+interactive); Assumptions populated
- [ ] Maximum 1 plan-reviewer round completed

**Autopilot mode** (overrides):
- [ ] No `AskUserQuestion` calls made (except HIGH risk items)
- [ ] All autonomous decisions logged in Assumptions section
- [ ] Decision Summary logged to DRAFT (not presented to user)
