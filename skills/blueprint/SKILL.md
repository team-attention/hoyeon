---
name: blueprint
description: |
  "/blueprint", "blueprint", "task graph", "contract derivation", "execution plan",
  "plan tasks from requirements", "contract-first planning"
  Turn requirements.md into an executable blueprint (plan.json + contracts.md).
  Five phases: Contracts → Tasks → Journeys → Verify Plan → Commit.
  Sits between /specify and /execute. Scope-adaptive (greenfield → bugfix).
  Uses hoyeon-cli (plan.json only; requirements.md is read as-is via Read tool).
---

# blueprint: Requirements → Executable Plan

## Overview

Transform `<spec_dir>/requirements.md` (from /specify) into an executable blueprint that /execute can run without rework:

1. **Contract Synthesis** — derive cross-module agreements (types, interfaces, invariants) that keep parallel work safe
2. **Task Graph** — layered DAG (L0 Foundation → L1 Feature → L2 Integration → L3 Deploy) where every sub-requirement has ≥1 fulfilling task
3. **Journey Detection** — identify multi-sub-req user flows that need end-to-end coverage
4. **Verify Plan** — assign verification gates (1=machine, 2=agent_semantic, 3=agent_e2e, 4=human) per sub-req and per journey
5. **Commit** — run cross-ref validation and hand off to /execute

**Contract-first principle**: lock "how modules talk" before anyone writes code. Parallel workers can't break each other's shapes; required invariants are called out explicitly.

**Not blueprint's job**: writing source code, running tests, interviewing for missing requirements. If requirements are incomplete, run /specify first.

## Input / Output

### Input
- `<spec_dir>/requirements.md` — required (produced by /specify)
- Optional: existing `plan.json` — treated as prior state, patched additively

### Output
```
<spec_dir>/
├── requirements.md   # unchanged (input)
├── plan.json         # NEW/UPDATED: tasks + journeys + verify_plan + contracts summary
└── contracts.md      # NEW: cross-module surface (markdown). Optional for trivial bugfix.
```

Only those three files. No rendered view file, no language-specific stubs.

### File role separation
- **requirements.md** — specify owns. Human-editable markdown with sub-requirements (GWT).
- **plan.json** — blueprint owns. Machine state. Schema: `plan/v1` (see `cli/schemas/plan.schema.json`).
- **contracts.md** — blueprint creates. Sibling artifact referenced by `plan.contracts.artifact`. Markdown, language-agnostic.

---

## Prerequisite: cli

All `plan.json` operations go through `hoyeon-cli` (NOT legacy `hoyeon-cli`):

| Command | Purpose |
|---|---|
| `hoyeon-cli plan init <spec_dir> --type <t>` | Create empty stub (if missing) |
| `hoyeon-cli plan merge <spec_dir> --json '<payload>' [--patch\|--append]` | Merge JSON with schema validation |
| `hoyeon-cli plan get <spec_dir> --path <dotted>` | Read field |
| `hoyeon-cli plan validate <spec_dir>` | Schema + internal cross-ref integrity |

**cli never parses requirements.md.** Reading the markdown is the blueprint agent's job (via Read tool). cli only validates plan.json self-consistency. Coverage against requirements.md is enforced semantically by the LLM (Phase 2 / Phase 4 of this skill).

---

## Scope Adaptation (`meta.type`)

| `meta.type` | Contract artifact shape (when written) | Task graph | Approval |
|---|---|---|---|
| `greenfield` | Full surface: types + interfaces + invariants (~50-200 lines) | L0-L3, parallel L1 | Full review |
| `feature` | Delta only: new types/interfaces this feature adds (~10-50 lines) | L0-L2, parallel if multi-module | Standard |
| `refactor` | Pin-style: `## Frozen Public API` + `## Allowed Churn` + `## Invariants` | Flat list with invariant guards | Light |
| `bugfix` | Minimal: typically just an `## Invariants` section | Single chain (1-3 tasks) | Auto-approve if no ambiguity |

**`contracts.md` is content-driven, not type-driven.** Write it whenever `contract-deriver` finds any cross-module content (≥1 invariant or interface) — regardless of `meta.type`. Skip the file (return `artifact: null`) only when the agent genuinely has nothing to pin. A bugfix with 3 load-bearing invariants gets a file; a feature that only adds a config flag may not. `meta.type` decides the template shape, not the file's existence.

`meta.type` normally comes from `/specify` (written into requirements.md frontmatter). If the field is missing — manual authoring, legacy spec, etc. — infer it using this priority (stop at the first matching rule):

1. **Keywords in `goal`** (highest signal, author's stated intent)
   - Contains `refactor` / `migrate` / `restructure` / `rewrite` → `refactor`
   - Contains `fix` / `bug` / `regression` / `broken` → `bugfix`

2. **Repo state** (hard physical signal — either empty or not)
   - `spec_dir`'s parent repo has no source files (empty / fresh scaffold) → `greenfield`

3. **Size** (weakest heuristic — only when 1 and 2 are silent)
   - `< 5` sub-reqs → `bugfix`
   - `< 15` sub-reqs → `feature`
   - `≥ 15` sub-reqs → `greenfield`

**On conflict, stop and ask.** If signals point to different types (e.g., keyword says `refactor` but repo is empty → `greenfield`), do NOT silently pick one. Emit `AskUserQuestion` with the top 2 candidates and let the user decide. Do not proceed to Phase 1 until confirmed.

---

## Phase 0: Init

### Step 0.1: Resolve spec_dir

- If user passed a path, use it. Otherwise ask: "Which spec_dir? (e.g., `.hoyeon/specs/my-thing/`)"
- Error if `<spec_dir>/requirements.md` does not exist — tell user to run /specify first.

### Step 0.2: Read requirements.md

Use **Read tool** directly. Do not shell out to cli for parsing — cli has no such command.

Extract (you, the main agent, parse this from the markdown):
- **Frontmatter**: `type`, `goal`, `non_goals` (YAML between `---` delimiters)
- **Sub-requirements**: every `## R-X<num>:` parent + each `#### R-X<num>.Y:` child with `given/when/then` fields
- **Open decisions (optional)**: any `### OD-N:` blocks

Build an internal list:
```
reqs = [
  { parent: "R-B1", title: "...", subs: [
    { id: "R-B1.1", title: "...", given: "...", when: "...", then: "..." },
    ...
  ]},
  ...
]
```

### Step 0.3: Init plan.json stub

```bash
hoyeon-cli plan init <spec_dir> --type <meta.type>
```

If plan.json already exists (re-run), skip init and treat as patch-merge mode.

### Step 0.4: Patch meta with real goal/non_goals

```bash
cat > /tmp/bp-meta.json << 'EOF'
{"meta": {"type": "<t>", "goal": "<goal>", "non_goals": ["..."]}}
EOF
hoyeon-cli plan merge <spec_dir> --patch --json "$(cat /tmp/bp-meta.json)"
```

---

## Phase 0.5: Codebase Reconnaissance (non-greenfield only)

**Skip if `meta.type == greenfield`.** For `feature`, `refactor`, and `bugfix`, scan the existing codebase so that contract derivation and task planning are grounded in real code structure — not just requirements text.

### Step 0.5.1: Dispatch code-explorer (parallel)

```
Agent(subagent_type="code-explorer",
  prompt="Goal: {meta.goal}. Find: project structure, modules, existing interfaces/types
         relevant to this change. Report as file:line with brief summary.",
  run_in_background=true)

Agent(subagent_type="code-explorer",
  prompt="Goal: {meta.goal}. Find: existing test infrastructure (test runner, test dirs,
         fixture patterns) and build/lint commands. Report as file:line.",
  run_in_background=true)

Agent(subagent_type="code-explorer",
  prompt="Goal: {meta.goal}. Blast radius analysis:
         1. Find all callers/consumers of the modules being changed
         2. Find existing tests that cover these modules (test files + test names)
         3. Identify existing user-facing or API flows that pass through these modules
         4. Flag flows that have NO existing test coverage
         Report as: affected_flows (name + file:line entry), existing_tests (file:line),
         untested_flows (name + why no test found).",
  run_in_background=true)
```

### Step 0.5.2: Build code context summary

Consolidate agent results into a short context block (keep in memory, not a file):
```
code_context = {
  modules: ["src/api/", "src/storage/", "src/ui/"],
  existing_interfaces: ["StorageAPI (src/storage/types.ts:12)", ...],
  test_infra: "vitest, src/__tests__/, no E2E setup",
  entry_points: ["src/main.ts", "src/api/router.ts"],
  blast_radius: {
    affected_flows: ["checkout flow (src/api/orders.ts:45 → src/payment/charge.ts:12)"],
    existing_tests: ["test/checkout.test.ts", "test/payment.integration.ts"],
    untested_flows: ["admin refund flow (no test found)"]
  }
}
```

Pass `code_context` to Phase 1 (contract-deriver), Phase 2 (taskgraph-planner), and **Phase 3 (journey detection)** agent prompts alongside `requirements.md` content. This helps agents ground their output in actual file structure rather than inventing module names.

---

## Phase 1: Contract Synthesis

**Goal**: produce the minimal cross-module surface area.

### Step 1.1: Dispatch `contract-deriver` agent

Pass:
- Full `requirements.md` content (you already read it in 0.2 — inline into agent prompt)
- Detected `meta.type`
- `spec_dir` absolute path
- `code_context` summary from Phase 0.5 (if non-greenfield; omit for greenfield)

The agent writes `<spec_dir>/contracts.md` (markdown) and returns:

```json
{
  "artifact": "contracts.md",
  "interfaces": ["InputAPI", "StorageAPI", "RendererAPI"],
  "invariants": ["INV-1: ...", "INV-2: ..."],
  "ambiguities": []
}
```

**File existence is content-driven (all types).** If the agent produces any `invariants[]` or `interfaces[]`, it writes `contracts.md`. If there is genuinely nothing cross-module to pin, it returns `"artifact": null` and the invariants (if any) live in `plan.contracts.invariants`. This rule is the same for every `meta.type`; the type only decides the file's internal shape.

### Step 1.2: Merge contracts into plan.json

```bash
cat > /tmp/bp-contracts.json << 'EOF'
{"contracts": {"artifact": "contracts.md", "interfaces": [...], "invariants": [...]}}
EOF
hoyeon-cli plan merge <spec_dir> --patch --json "$(cat /tmp/bp-contracts.json)"
```

---

## Phase 2: Task Graph

**Goal**: every sub-requirement is fulfilled by ≥1 task; parallelism is explicit.

### Step 2.1: Dispatch `taskgraph-planner` agent

Pass:
- Full `requirements.md` content
- Phase 1 contracts summary (artifact name + interfaces + invariants)
- `meta.type`
- `code_context` summary from Phase 0.5 (if non-greenfield; omit for greenfield)

Expected output:
```json
{
  "tasks": [
    {
      "id": "T1",
      "layer": "L0",
      "action": "write contracts.md + storage sig util",
      "fulfills": ["R-T2.1", "R-T7.1"],
      "depends_on": [],
      "parallel_safe": false
    },
    ...
  ],
  "ambiguities": []
}
```

Tasks carry **WHAT**, not HOW. The `action` string is the only description field; it must capture intent, not file paths / function names / estimated time. Workers decide implementation detail — locking HOW into plan.json causes drift when the worker discovers the real shape mid-implementation.

### Step 2.2: Coverage gate (semantic, by you)

cli does NOT verify coverage against requirements.md. **You** must ensure:

- **Every** `R-X.Y` sub-requirement appears in at least one `tasks[].fulfills`. Build a set diff:
  ```
  uncovered = { all sub_req_ids } − union(tasks[].fulfills)
  ```
  If `uncovered` is non-empty, re-dispatch taskgraph-planner with the list as a constraint. Max 2 retries. If still uncovered, surface to user.

- **No task references a non-existent sub-req ID** (orphan). Drop orphans before merging.

- **Parallel safety**: for each L1 task pair with `parallel_safe: true`, double-check they touch different modules and share only L0 contract state. If uncertain → set `parallel_safe: false` (serial is safe default).

### Step 2.3: Preview task graph for user

Before merging, show the user what was planned. Print a readable summary:

```
[blueprint] Task Graph (Phase 2)

| # | Layer | Action | Fulfills | Depends | Parallel |
|---|-------|--------|----------|---------|----------|
| T1 | L0 | write contracts.md + storage sig | R-T2.1, R-T7.1 | — | no |
| T2 | L1 | implement auth flow | R-U1.1, R-U1.2 | T1 | yes |
| ...

Coverage: 12/12 sub-reqs fulfilled (0 uncovered)
```

**Auto-approve**: `meta.type == bugfix` AND no ambiguities → skip the ask, print the table, proceed.
Otherwise ask:
```
AskUserQuestion(
  question: "Proceed with this task graph?",
  options: [
    { label: "Approve", description: "Merge tasks into plan.json and continue" },
    { label: "Revise", description: "Re-generate with feedback" },
    { label: "Abort", description: "Stop blueprint" }
  ]
)
```

If **Revise**: ask what to change, re-dispatch taskgraph-planner with the feedback. Max 2 revision rounds.
If **Abort**: exit skill.

### Step 2.4: Merge tasks into plan.json

```bash
cat > /tmp/bp-tasks.json << 'EOF'
{"tasks": [ ... ]}
EOF
hoyeon-cli plan merge <spec_dir> --append --json "$(cat /tmp/bp-tasks.json)"
```

Use `--append` on first write. Use `--patch` later if you need to update individual task fields by id.

---

## Phase 3: Journey Detection

**Goal**: identify multi-sub-req user flows that need E2E coverage.

A **journey** composes ≥2 sub-requirements into a single linear user flow, with its own given/when/then. Example: "user signs up → confirms email → sees dashboard" might compose `R-U1.1` (signup form) + `R-U1.2` (email confirm) + `R-U2.1` (dashboard initial render).

### Step 3.1: Heuristic detection (inline by you)

Scan the sub-req list for clusters where:
- 2+ sub-reqs share a common **actor** (user, admin, API client)
- Their `when` clauses chain naturally (next action follows prior outcome)
- There is a meaningful top-level outcome only visible after running them together

Not every spec has journeys. Bugfix specs usually have 0. Greenfield user-facing specs usually have 2-5.

### Step 3.1b: Regression journey detection (non-greenfield only)

> Skip if `meta.type == greenfield` or `code_context.blast_radius` is empty.

Scan `code_context.blast_radius.affected_flows` for existing flows that pass through modules being changed. For each affected flow, generate a **regression journey** with `[regression]` prefix in the name:

**Heuristic**: an affected flow becomes a regression journey when:
- It passes through ≥1 module that a task in the task graph modifies
- It represents a user-visible or API-facing behavior (not internal-only)

**Link to tasks**: identify which tasks (`T1`, `T2`, ...) touch the affected modules, and list them in the journey's `composes` field alongside any related new sub-req IDs.

**Prioritize untested flows**: flows from `blast_radius.untested_flows` are higher priority — they have no safety net and MUST become regression journeys if they are user-facing.

Regression journeys use the same schema as regular journeys — no schema change needed.

### Step 3.2: Emit journey entries

For each detected journey:
```json
{
  "id": "J1",
  "name": "new user onboarding",
  "composes": ["R-U1.1", "R-U1.2", "R-U2.1"],
  "given": "no prior account",
  "when":  "user completes signup → confirms email → lands on dashboard",
  "then":  "dashboard shows welcome state with 0 items"
}
```

**Regression journey example** (from Step 3.1b):
```json
{
  "id": "J3",
  "name": "[regression] checkout flow preserved after payment module change",
  "composes": ["R-T1.1", "R-T1.2"],
  "given": "existing checkout flow works with valid payment",
  "when": "user completes purchase after code changes from T3/T5",
  "then": "checkout succeeds identically to pre-change behavior"
}
```

Constraints (enforced by schema):
- `id` matches `^J\d+$`
- `composes` has ≥2 items, each is a valid `R-X.Y` id
- `given`, `when`, `then` all non-empty strings
- Regression journeys use `[regression]` prefix in `name` — same schema, no special type field

### Step 3.3: Merge journeys

```bash
cat > /tmp/bp-journeys.json << 'EOF'
{"journeys": [ ... ]}
EOF
hoyeon-cli plan merge <spec_dir> --append --json "$(cat /tmp/bp-journeys.json)"
```

---

## Phase 4: Verify Plan

**Goal**: every sub-req AND every journey gets a gate assignment.

### 4-Gate model (cumulative; each gate adds, never replaces)

| Gate | Name | What it means | Typical cost |
|---|---|---|---|
| 1 | `machine` | Deterministic check: unit test, type check, file contents, shell exit code | seconds, free |
| 2 | `agent_semantic` | LLM reads code/output and judges "does this match the described intent?" | ~1 minute, model call |
| 3 | `agent_e2e` | Real runtime observation: browser, computer-use, CLI run, API call | minutes, sandbox |
| 4 | `human` | Subjective judgment: playtest, aesthetic review, "feels right" | hours, blocking on user |

### Baseline rules (always apply)

- **Every** sub-req and journey gets **Gate 1 + Gate 2** as minimum.
- **Journeys** additionally get **Gate 3** by default (journeys exist precisely because E2E flow matters).
- **Regression journeys** (name starts with `[regression]`) get **Gate 1** (run existing tests from `blast_radius.existing_tests`) **+ Gate 3** (E2E confirmation). Gate 1 is especially important here: if existing tests exist for the affected flow, running them IS the regression check. Gate 2 is optional for regression journeys (semantic review adds less value when the behavior should be identical to pre-change).

### Add Gate 3 (agent_e2e) when sub-req involves:
- Visible UI behavior (`visible`, `rendered`, `displayed`, `shown`, `animation`, `screen shake`, `transition`)
- User interaction (`click`, `tap`, `swipe`, `drag`, `hover`, `keyboard`)
- External system calls (`fetch`, `request`, `API`, `database query`, `file IO` where contents matter beyond schema)
- Platform-specific behavior (`mobile`, `desktop`, `browser tab`, `window`)

### Add Gate 4 (human) when sub-req involves:
- Subjective quality (`feel`, `good UX`, `intuitive`, `natural`, `fun`, `pleasant`)
- Statistical/behavioral metrics requiring real users (`average retry rate`, `time-on-task`, `% of users who`, `sample size`, `playtest`)
- Judgement calls no model can ground (`appropriate`, `reasonable`, `tasteful`)

### Step 4.1: Dispatch `verify-planner` agent

Pass:
- Full `requirements.md` content (for GWT text)
- Full `journeys[]` from Phase 3
- The 4-gate rules above

Expected output:
```json
{
  "verify_plan": [
    { "target": "R-T2.1", "type": "sub_req", "gates": [1, 2] },
    { "target": "R-U5.1", "type": "sub_req", "gates": [1, 2, 3] },
    { "target": "R-B3.1", "type": "sub_req", "gates": [1, 2, 4] },
    { "target": "J1",     "type": "journey", "gates": [1, 2, 3] }
  ],
  "ambiguities": []
}
```

### Step 4.2: Self-check (by you)

- Every sub-req id from requirements.md appears exactly once as a `type: sub_req` target.
- Every journey id appears exactly once as a `type: journey` target.
- Every entry has `gates` containing at least `[1, 2]`.
- `gates` is a sorted unique integer array, each element in `[1..4]`.

If mismatch, re-dispatch verify-planner with the gap list. Max 2 retries.

### Step 4.3: Preview verify plan for user

Translate gate counts into user-facing consequences. The user should not have to decode G1/G2/G3/G4 labels — only understand what the plan will cost them and where their attention is actually required.

```
[blueprint] Verify Plan

  {N_all} checks will run automatically (code review + agent semantic)
  {N_e2e} of those also run in the browser/sandbox (visible UI, interaction, external calls)
  {N_human} items require YOU (playtest, sampled metrics, aesthetic review)

What you need to do: {none | <bullet list of G4 items with their GWT>}
```

Example with no G4:
```
[blueprint] Verify Plan

  46 checks will run automatically
  26 of those also run in the browser sandbox
  0 items require you

What you need to do: nothing — fully machine/agent-verifiable.
```

Example with G4:
```
[blueprint] Verify Plan

  18 checks will run automatically
  7 of those also run in the browser sandbox
  1 item requires you:
    • R-B4.1 "retry rate averages 3+ per session" — needs a playtest with 3+ users

What you need to do: 1 playtest session.
```

**Auto-approve rule** (skip the generic "proceed?" prompt):
- No `ambiguities[]` with `user_impact: time` or `confidence` (after the filter), AND
- No G4 gates in `verify_plan`, AND
- `meta.type` is `bugfix`, `feature`, or `refactor`

Under auto-approve: print the preview block, log "auto-approving (no user-owned commitments)", proceed to Step 4.4.

**When to actually ask**: only when the user has something real to decide. Build the question from the filtered ambiguities queue (see "Ambiguity Handling" section) and/or G4 confirmations:

```
AskUserQuestion(
  # one question per user-impact ambiguity, phrased in user terms, NOT gate labels
  # Example (time-impact):
  question: "R-B4.1 needs real-user data ('retry rate averages 3+') — commit to a 3-user playtest, or relax this requirement to code-review only?",
  options: [
    { label: "Commit to playtest", description: "Add human verification — you run a session with 3+ users before ship" },
    { label: "Relax the bar", description: "Drop the sampled-user requirement, rely on code review of the difficulty curve formula" }
  ]
)
```

Never expose "G1/G2/G3/G4", "gates: [1,2,3]", or "drop redundant G3" to the user. If the planner flagged an ambiguity that way, restate it: what real thing does the user gain/lose by each option?

If the user chooses to revise: apply the chosen option to `verify_plan` (add/drop gates as implied), re-preview once. Max 2 rounds, then proceed with the last-confirmed plan.

### Step 4.4: Merge verify_plan

```bash
cat > /tmp/bp-verify.json << 'EOF'
{"verify_plan": [ ... ]}
EOF
hoyeon-cli plan merge <spec_dir> --append --json "$(cat /tmp/bp-verify.json)"
```

---

## Phase 5: Commit

### Step 5.1: Full validation

```bash
hoyeon-cli plan validate <spec_dir>
```

This runs schema validation AND these internal cross-ref checks:
1. `tasks[].fulfills` ⊆ `verify_plan` sub_req targets
2. `journeys[].composes` ⊆ `verify_plan` sub_req targets
3. Every `journeys[].id` has a `verify_plan` entry of `type: journey`
4. Every `verify_plan` `type: journey` target matches a declared journey id
5. `tasks[].depends_on` ⊆ `tasks[].id`

If validation fails, diagnose the specific rule violation and re-merge corrected JSON. Never ignore a validation failure.

### Step 5.2: Approval gate

Show the user a compact summary:

```
[blueprint] Plan complete.

Summary:
  Type:      greenfield
  Tasks:     11 (L0:2, L1:5 parallel, L2:3, L3:1)
  Journeys:  2
  Verify:    18 entries (G1:18, G2:18, G3:7, G4:1)
  Contracts: 5 interfaces, 3 invariants (contracts.md)

Next: /execute <spec_dir>/
```

Auto-approve rules:
- `meta.type == bugfix` AND no ambiguities → proceed silently
- `--auto` flag → skip summary
- Otherwise → show summary, ask y/n

### Step 5.3: Handoff

```
✅ Blueprint committed.
   plan.json     ← 11 tasks, 2 journeys, 18 verify entries
   contracts.md  ← 5 interfaces, 3 invariants

Next: /execute <spec_dir>/
```

Exit skill.

---

## Ambiguity Handling (strict)

**Rule**: surface ambiguities to the user **only when they own the decision** — i.e., the outcome changes what they must do, pay for, or commit to. Planner-internal optimizations (redundant gates, CSS-vs-measurement, pure-logic gate sufficiency) are NOT user decisions; apply the agent's recommendation silently and log it.

All three agents return `ambiguities[]` with this shape:
```json
{ "concern": "...", "affects": ["...", "..."], "recommendation": "...", "user_impact": "time" | "confidence" | "none" }
```

`user_impact` semantics (see `verify-planner.md` for the canonical definition):
- **`time`** — forces human work (playtest, sampled metrics, aesthetic review). Always prompt.
- **`confidence`** — meaningfully swings verification confidence with no safe default. Prompt unless `--auto`.
- **`none`** — planner-internal call. Never prompt; apply recommendation and log.

Sources collected across phases:
- **requirements.md** `## Open Decisions` section (OD-N blocks) — include if still unresolved (treat as `user_impact: confidence` by default)
- **contract-deriver** return field `ambiguities[]`
- **taskgraph-planner** return field `ambiguities[]`
- **verify-planner** return field `ambiguities[]`

Agents that do not yet emit `user_impact` (older contract-deriver / taskgraph-planner outputs) default to `confidence` unless the concern is obviously planner-internal.

### Protocol

1. **Collect** — after each agent returns, extract its `ambiguities[]` into a single queue.
2. **Filter** — drop every item with `user_impact: none`. Apply its `recommendation` to the in-progress artifact and record one line in the run log: `auto-resolved: <concern> → <recommendation>`.
3. **Dedupe** — merge semantically overlapping items (e.g., OD-2 + a contract-deriver concern about the same decision). Prefer requirements.md wording as canonical.
4. **Translate** — rewrite each remaining item in user-impact language: what does the user gain/lose from each option? Do NOT expose internal labels (G1-G4, gate ids, dispatch types) in the question or options.
5. **Prompt** — emit `AskUserQuestion` for the translated queue. AskUserQuestion tops out at ~5 questions per call; batch across multiple calls in order. Each option must include the agent's recommendation marked `(recommended)`.
6. **Apply answers** — patch the in-progress plan.json (or regenerate the affected section) before proceeding to the next phase.

**Trust the filter.** If the agent labeled something `user_impact: none`, do not second-guess and promote it to a prompt. The agents are instructed to be conservative; items that reach the queue with `time` or `confidence` already passed a "does the user own this?" test.

### Flags

- `--auto` → skip all prompts, apply every recommendation silently (including `time` / `confidence` items), log applied decisions in the final summary
- Default (no flag): prompt only for `user_impact` in (`time`, `confidence`); always auto-resolve `none`

---

## Agent Roster

| Agent | Phase | Owns |
|---|---|---|
| `contract-deriver` | 1 | Writes contracts.md; returns interfaces + invariants + ambiguities |
| `taskgraph-planner` | 2 | Returns tasks[] + ambiguities |
| `verify-planner` | 4 | Returns verify_plan[] + ambiguities |

Agents are globally registered at plugin-root `/agents/{name}.md`. Dispatch via the `Agent` tool with `subagent_type: "<name>"`.

---

## Command Reference (blueprint-only subset)

All state changes go through cli with one `--json` per merge. Never hand-write plan.json.

```bash
# Init (idempotent — skip if exists)
hoyeon-cli plan init <spec_dir> --type greenfield

# Patch meta (replace field values, keep unchanged fields)
hoyeon-cli plan merge <spec_dir> --patch --json '{"meta":{...}}'

# Append to arrays (tasks/journeys/verify_plan)
hoyeon-cli plan merge <spec_dir> --append --json '{"tasks":[...]}'

# Patch array items by id (update single task field)
hoyeon-cli plan merge <spec_dir> --patch --json '{"tasks":[{"id":"T3","status":"in_progress"}]}'

# Final sanity
hoyeon-cli plan validate <spec_dir>
```

**JSON passing**: always write to `/tmp/bp-<step>.json` via heredoc first, then pass with `--json "$(cat ...)"`. Direct inlining breaks on zsh glob expansion (`[`, `{`, `$`).

---

## Failure Modes

| Failure | Recovery |
|---|---|
| `requirements.md` missing | Tell user to run /specify; abort |
| `plan validate` schema error | Diagnose (cli prints specific path + message), re-merge corrected JSON |
| `plan validate` cross-ref error (e.g., task fulfills missing from verify_plan) | Re-dispatch verify-planner with the missing ids |
| Uncovered sub-req after taskgraph-planner | Re-dispatch with uncovered list (max 2 retries), then surface to user |
| User rejects at Phase 5.2 | Do NOT revert files. User can re-run or edit requirements.md and re-run. |

---

## Mode B: Inline call from /execute

When /execute is invoked without a `plan.json`, it may call this skill inline with `--auto --no-summary`. Same phases, no approval prompts. This is a flag combination, not a separate code path.

---

## Non-Goals

- Re-interviewing requirements (that's /specify)
- Implementation work in src/ (contracts.md at spec_dir/ is the only artifact blueprint produces)
- Running verifications (that's /execute)
- Parsing requirements.md inside cli (LLM reads directly via Read tool)
- Rendering a human-readable view file (read `plan.json` directly — it's structured and small)
