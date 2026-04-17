---
name: blueprint
description: |
  "/blueprint", "blueprint", "task graph", "contract derivation", "execution plan",
  "plan tasks from requirements", "contract-first planning"
  Turn requirements.md into an executable blueprint (plan.json + contracts.md).
  Five phases: Contracts → Tasks → Journeys → Verify Plan → Commit.
  Sits between /specify2 and /execute. Scope-adaptive (greenfield → bugfix).
  Uses hoyeon-cli2 (plan.json only; requirements.md is read as-is via Read tool).
---

# blueprint: Requirements → Executable Plan

## Overview

Transform `<spec_dir>/requirements.md` (from /specify2) into an executable blueprint that /execute can run without rework:

1. **Contract Synthesis** — derive cross-module agreements (types, interfaces, invariants) that keep parallel work safe
2. **Task Graph** — layered DAG (L0 Foundation → L1 Feature → L2 Integration → L3 Deploy) where every sub-requirement has ≥1 fulfilling task
3. **Journey Detection** — identify multi-sub-req user flows that need end-to-end coverage
4. **Verify Plan** — assign verification gates (1=machine, 2=agent_semantic, 3=agent_e2e, 4=human) per sub-req and per journey
5. **Commit** — run cross-ref validation and hand off to /execute

**Contract-first principle**: lock "how modules talk" before anyone writes code. Parallel workers can't break each other's shapes; required invariants are called out explicitly.

**Not blueprint's job**: writing source code, running tests, interviewing for missing requirements. If requirements are incomplete, run /specify2 first.

## Input / Output

### Input
- `<spec_dir>/requirements.md` — required (produced by /specify2)
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
- **requirements.md** — specify2 owns. Human-editable markdown with sub-requirements (GWT).
- **plan.json** — blueprint owns. Machine state. Schema: `plan/v1` (see `cli2/schemas/plan.schema.json`).
- **contracts.md** — blueprint creates. Sibling artifact referenced by `plan.contracts.artifact`. Markdown, language-agnostic.

---

## Prerequisite: cli2

All `plan.json` operations go through `hoyeon-cli2` (NOT legacy `hoyeon-cli`):

| Command | Purpose |
|---|---|
| `hoyeon-cli2 plan init <spec_dir> --type <t>` | Create empty stub (if missing) |
| `hoyeon-cli2 plan merge <spec_dir> --json '<payload>' [--patch\|--append]` | Merge JSON with schema validation |
| `hoyeon-cli2 plan get <spec_dir> --path <dotted>` | Read field |
| `hoyeon-cli2 plan validate <spec_dir>` | Schema + internal cross-ref integrity |

**cli2 never parses requirements.md.** Reading the markdown is the blueprint agent's job (via Read tool). cli2 only validates plan.json self-consistency. Coverage against requirements.md is enforced semantically by the LLM (Phase 2 / Phase 4 of this skill).

---

## Scope Adaptation (`meta.type`)

| `meta.type` | Contract artifact shape (when written) | Task graph | Approval |
|---|---|---|---|
| `greenfield` | Full surface: types + interfaces + invariants (~50-200 lines) | L0-L3, parallel L1 | Full review |
| `feature` | Delta only: new types/interfaces this feature adds (~10-50 lines) | L0-L2, parallel if multi-module | Standard |
| `refactor` | Pin-style: `## Frozen Public API` + `## Allowed Churn` + `## Invariants` | Flat list with invariant guards | Light |
| `bugfix` | Minimal: typically just an `## Invariants` section | Single chain (1-3 tasks) | Auto-approve if no ambiguity |

**`contracts.md` is content-driven, not type-driven.** Write it whenever `contract-deriver` finds any cross-module content (≥1 invariant or interface) — regardless of `meta.type`. Skip the file (return `artifact: null`) only when the agent genuinely has nothing to pin. A bugfix with 3 load-bearing invariants gets a file; a feature that only adds a config flag may not. `meta.type` decides the template shape, not the file's existence.

`meta.type` normally comes from `/specify2` (written into requirements.md frontmatter). If the field is missing — manual authoring, legacy spec, etc. — infer it using this priority (stop at the first matching rule):

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
- Error if `<spec_dir>/requirements.md` does not exist — tell user to run /specify2 first.

### Step 0.2: Read requirements.md

Use **Read tool** directly. Do not shell out to cli2 for parsing — cli2 has no such command.

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
hoyeon-cli2 plan init <spec_dir> --type <meta.type>
```

If plan.json already exists (re-run), skip init and treat as patch-merge mode.

### Step 0.4: Patch meta with real goal/non_goals

```bash
cat > /tmp/bp-meta.json << 'EOF'
{"meta": {"type": "<t>", "goal": "<goal>", "non_goals": ["..."]}}
EOF
hoyeon-cli2 plan merge <spec_dir> --patch --json "$(cat /tmp/bp-meta.json)"
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
```

### Step 0.5.2: Build code context summary

Consolidate agent results into a short context block (keep in memory, not a file):
```
code_context = {
  modules: ["src/api/", "src/storage/", "src/ui/"],
  existing_interfaces: ["StorageAPI (src/storage/types.ts:12)", ...],
  test_infra: "vitest, src/__tests__/, no E2E setup",
  entry_points: ["src/main.ts", "src/api/router.ts"]
}
```

Pass `code_context` to Phase 1 (contract-deriver) and Phase 2 (taskgraph-planner) agent prompts alongside `requirements.md` content. This helps agents ground their output in actual file structure rather than inventing module names.

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
hoyeon-cli2 plan merge <spec_dir> --patch --json "$(cat /tmp/bp-contracts.json)"
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

cli2 does NOT verify coverage against requirements.md. **You** must ensure:

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
hoyeon-cli2 plan merge <spec_dir> --append --json "$(cat /tmp/bp-tasks.json)"
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

Constraints (enforced by schema):
- `id` matches `^J\d+$`
- `composes` has ≥2 items, each is a valid `R-X.Y` id
- `given`, `when`, `then` all non-empty strings

### Step 3.3: Merge journeys

```bash
cat > /tmp/bp-journeys.json << 'EOF'
{"journeys": [ ... ]}
EOF
hoyeon-cli2 plan merge <spec_dir> --append --json "$(cat /tmp/bp-journeys.json)"
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

Show the gate assignments so the user understands what verification will happen:

```
[blueprint] Verify Plan (Phase 4)

| Target | Type | Gates | Rationale |
|--------|------|-------|-----------|
| R-T2.1 | sub_req | 1, 2 | pure logic, no UI |
| R-U5.1 | sub_req | 1, 2, 3 | visible UI behavior |
| R-B3.1 | sub_req | 1, 2, 4 | subjective quality |
| J1 | journey | 1, 2, 3 | E2E user flow |
| ...

Summary: {N} entries — G1:{n} G2:{n} G3:{n} G4:{n}
```

**Auto-approve**: `meta.type == bugfix` AND no ambiguities → skip the ask, print the table, proceed.
Otherwise ask:
```
AskUserQuestion(
  question: "Proceed with this verify plan?",
  options: [
    { label: "Approve", description: "Merge verify_plan and finalize" },
    { label: "Revise", description: "Adjust gate assignments" },
    { label: "Abort", description: "Stop blueprint" }
  ]
)
```

If **Revise**: ask which targets need gate changes, re-dispatch or manually patch. Max 2 rounds.
If **Abort**: exit skill.

### Step 4.4: Merge verify_plan

```bash
cat > /tmp/bp-verify.json << 'EOF'
{"verify_plan": [ ... ]}
EOF
hoyeon-cli2 plan merge <spec_dir> --append --json "$(cat /tmp/bp-verify.json)"
```

---

## Phase 5: Commit

### Step 5.1: Full validation

```bash
hoyeon-cli2 plan validate <spec_dir>
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

**Rule**: if ANY Phase 1-4 agent returns a non-empty `ambiguities[]` payload, you MUST surface it to the user via `AskUserQuestion` before merging dependent state. Silently applying agent recommendations is a spec violation.

All three agents use the same field name (`ambiguities[]`) with the same shape:
```json
{ "concern": "...", "affects": ["...", "..."], "recommendation": "..." }
```

Sources collected after each phase:
- **requirements.md** `## Open Decisions` section (OD-N blocks) — include if still unresolved
- **contract-deriver** return field `ambiguities[]`
- **taskgraph-planner** return field `ambiguities[]`
- **verify-planner** return field `ambiguities[]`

### Protocol

1. **Collect** — after each agent returns, extract its `ambiguities[]` into a single queue.
2. **Dedupe** — merge semantically overlapping items (e.g., OD-2 + a contract-deriver concern about the same decision). Prefer requirements.md wording as canonical.
3. **Prompt** — emit `AskUserQuestion` with every item in the queue. AskUserQuestion tops out at ~5 questions per call; if the queue is larger, batch across multiple calls in order. Each option must include the agent's recommendation marked `(recommended)`.
4. **Apply answers** — patch the in-progress plan.json (or regenerate the affected section) before proceeding to the next phase.
5. **Do NOT skip the prompt** just because "impact seems low" — the whole point of surfacing ambiguities is that the agent already decided it needed user input. Trust the agent's signal.

### Flags

- `--auto` → skip the prompt, apply all recommendations silently, log applied decisions in the final summary
- Default (no flag): strict — any non-empty queue triggers `AskUserQuestion`

---

## Agent Roster

| Agent | Phase | Owns |
|---|---|---|
| `contract-deriver` | 1 | Writes contracts.md; returns interfaces + invariants + ambiguities |
| `taskgraph-planner` | 2 | Returns tasks[] + ambiguities |
| `verify-planner` | 4 | Returns verify_plan[] + ambiguities |

Agents are globally registered at plugin-root `/agents/{name}.md`. Dispatch via the `Task` tool with `subagent_type: "<name>"`.

---

## Command Reference (blueprint-only subset)

All state changes go through cli2 with one `--json` per merge. Never hand-write plan.json.

```bash
# Init (idempotent — skip if exists)
hoyeon-cli2 plan init <spec_dir> --type greenfield

# Patch meta (replace field values, keep unchanged fields)
hoyeon-cli2 plan merge <spec_dir> --patch --json '{"meta":{...}}'

# Append to arrays (tasks/journeys/verify_plan)
hoyeon-cli2 plan merge <spec_dir> --append --json '{"tasks":[...]}'

# Patch array items by id (update single task field)
hoyeon-cli2 plan merge <spec_dir> --patch --json '{"tasks":[{"id":"T3","status":"in_progress"}]}'

# Final sanity
hoyeon-cli2 plan validate <spec_dir>
```

**JSON passing**: always write to `/tmp/bp-<step>.json` via heredoc first, then pass with `--json "$(cat ...)"`. Direct inlining breaks on zsh glob expansion (`[`, `{`, `$`).

---

## Failure Modes

| Failure | Recovery |
|---|---|
| `requirements.md` missing | Tell user to run /specify2; abort |
| `plan validate` schema error | Diagnose (cli2 prints specific path + message), re-merge corrected JSON |
| `plan validate` cross-ref error (e.g., task fulfills missing from verify_plan) | Re-dispatch verify-planner with the missing ids |
| Uncovered sub-req after taskgraph-planner | Re-dispatch with uncovered list (max 2 retries), then surface to user |
| User rejects at Phase 5.2 | Do NOT revert files. User can re-run or edit requirements.md and re-run. |

---

## Mode B: Inline call from /execute

When /execute is invoked without a `plan.json`, it may call this skill inline with `--auto --no-summary`. Same phases, no approval prompts. This is a flag combination, not a separate code path.

---

## Non-Goals

- Re-interviewing requirements (that's /specify2)
- Implementation work in src/ (contracts.md at spec_dir/ is the only artifact blueprint produces)
- Running verifications (that's /execute)
- Parsing requirements.md inside cli2 (LLM reads directly via Read tool)
- Rendering a human-readable view file (read `plan.json` directly — it's structured and small)
