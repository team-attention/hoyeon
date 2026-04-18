---
name: execute
description: |
  Plan-driven orchestrator. Reads plan.json (from /blueprint) or requirements.md,
  then dispatches workers to build the system.
  Use when: "/execute", "execute", "plan 실행", "blueprint 실행"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Edit
  - Write
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - TaskOutput
  - AskUserQuestion
  - EnterWorktree
  - ExitWorktree
  - TeamCreate
  - TeamDelete
  - SendMessage
validate_prompt: |
  Phase 0 must detect input type (plan.json / requirements.md / markdown) and normalize.
  Dispatch mode must be asked via AskUserQuestion.
  Verify depth must be asked via AskUserQuestion.
  All tasks must reach status "completed" or "done" before stopping.
  Verify recipe must run.
  Final report must be output.
---

# /execute — Plan-Driven Orchestrator

**You are the conductor. You do not play instruments.**
Delegate to workers, manage parallelization, verify the result.

## Core Principles

1. **DELEGATE** — Agent/Team: workers do the work. Direct: orchestrator does.
2. **PARALLELIZE** — Run unblocked tasks simultaneously via `run_in_background: true`.
3. **plan.json is the ledger** — Task state via `hoyeon-cli plan` commands. Never direct file writes.
4. **Contracts guide workers** — If `contracts.md` exists, workers reference it for cross-module agreements.
5. **Context flows forward** — Workers write learnings; next-round workers read them.

---

## Phase 0: Initialize

Phase 0 is **plan-first**. The orchestrator resolves an input to a valid `plan.json`, asks two questions (dispatch + verify depth), and prepares a worker charter template. **Phase 0 never reads `requirements.md` or `contracts.md` body** — only `plan.json` structural fields (INV-3).

### 0.1 Parse Input & Resolve

```
/execute [<spec_dir>] [--work worktree|branch|no-commit]
```

```
raw_path = $1  (may be empty)

# (a) No argument → virtual plan path (R-F1.3)
IF raw_path is empty:
  input_mode = "virtual"
  spec_dir   = null   # resolved later in 0.2
  GOTO 0.2

# (b) Argument provided → must exist (R-F1.4)
IF NOT exists(raw_path):
  ERROR: "No such path: {raw_path}"
  guidance: "Provide a directory containing plan.json or requirements.md,
             or call /execute with no argument to synthesize a virtual plan."
  ABORT

spec_dir = raw_path if is_dir(raw_path) else dirname(raw_path)

# (c) Classify what we found
IF exists(spec_dir/plan.json):
  input_mode = "plan"          # R-F1.1
ELIF exists(spec_dir/requirements.md):
  input_mode = "requirements"  # R-F1.2
ELSE:
  ERROR: "{spec_dir} has neither plan.json nor requirements.md"
  guidance: "Run /blueprint on requirements.md, or call /execute without arguments
             for a session-synthesized virtual plan."
  ABORT
```

### 0.2 Resolve to plan.json

Handle each `input_mode` — the goal is to end this sub-phase with a validated `plan.json` on disk and `spec_dir` set.

```
IF input_mode == "plan":                             # R-F1.1
  # Direct use — NO user confirm.
  Bash("hoyeon-cli plan validate {spec_dir}")

ELIF input_mode == "requirements":                   # R-F1.2
  # Try /blueprint first; fall back to inline planning if unavailable.
  IF Skill(blueprint, args="{spec_dir}") succeeds AND exists(spec_dir/plan.json):
    Bash("hoyeon-cli plan validate {spec_dir}")
  ELSE:
    # Inline planning — lightweight alternative to /blueprint.
    # Read requirements.md directly (exception to INV-3 — only during init).
    reqs_content = Read("{spec_dir}/requirements.md")

    # Extract frontmatter (type, goal, non_goals) + sub-requirements
    meta_type = parse_frontmatter(reqs_content).type
    sub_reqs  = parse_sub_reqs(reqs_content)  # [{id, given, when, then}]

    # Check pre-work section (if present)
    pre_work = parse_pre_work(reqs_content)   # see "Pre-work Gate" below

    # Generate task graph inline (no contracts, no journeys)
    draft_tasks = []
    FOR EACH logical group of sub_reqs (by parent R-X):
      draft_tasks.append({
        id: "T{n}", action: "<what to build>",
        fulfills: [sub_req.id for sub_req in group],
        depends_on: [], parallel_safe: true
      })

    # Generate basic verify_plan (gate 1+2 for all)
    draft_verify = []
    FOR EACH sub_req in sub_reqs:
      draft_verify.append({ target: sub_req.id, type: "sub_req", gates: [1, 2] })

    # Preview (same pattern as blueprint Step 2.3)
    print("[execute] Inline Plan (no /blueprint)")
    print_task_table(draft_tasks)
    print(f"Verify: {len(draft_verify)} entries (all G1+G2)")

    choice = AskUserQuestion(
      question: "Proceed with this inline plan?",
      options: [
        { label: "Proceed", description: "Write plan.json and execute" },
        { label: "Edit",    description: "Revise tasks before proceeding" },
        { label: "Abort",   description: "Stop — run /blueprint first for a detailed plan" }
      ]
    )
    IF choice == "Abort": HALT
    IF choice == "Edit": draft_tasks = interactive_edit(draft_tasks)

    # Write via cli
    Bash("hoyeon-cli plan init {spec_dir} --type {meta_type}")
    write_json_to_tmp({tasks: draft_tasks, verify_plan: draft_verify}) → /tmp/plan-inline.json
    Bash("hoyeon-cli plan merge {spec_dir} --json \"$(cat /tmp/plan-inline.json)\"")
    Bash("hoyeon-cli plan validate {spec_dir}")

ELIF input_mode == "virtual":                        # R-F1.3
  # Session-context synthesis with user confirm.
  timestamp = Bash("date +%Y%m%d-%H%M%S").trim()
  spec_dir  = ".hoyeon/specs/adhoc-{timestamp}"
  Bash("mkdir -p {spec_dir}")

  # Synthesize a minimal plan from recent user messages + cwd state.
  # Keep it in memory first; do NOT write until the user confirms.
  draft_plan = synthesize_virtual_plan(
    recent_user_messages,
    cwd_state = Bash("ls -la").trim()
  )
  # draft_plan shape: { meta, tasks[{id, action, fulfills:[], depends_on:[], parallel_safe}], verify_plan:[] }

  # Summary preview (stdout, not a file)
  print("Virtual plan synthesized ({len(draft_plan.tasks)} tasks):")
  for t in draft_plan.tasks: print("  {t.id}  {t.action}")

  choice = AskUserQuestion(
    question: "Proceed with this virtual plan?",
    options: [
      { label: "Proceed", description: "Write plan.json to {spec_dir} and execute" },
      { label: "Edit",    description: "Open an interactive edit loop to revise tasks" },
      { label: "Abort",   description: "Discard and exit" }
    ]
  )
  IF choice == "Abort": HALT
  IF choice == "Edit":
    draft_plan = interactive_edit(draft_plan)  # loop until user says proceed

  # Persist via cli (INV-5). Write, then validate.
  write_json_to_tmp(draft_plan) → /tmp/plan-virtual.json
  Bash("hoyeon-cli plan init {spec_dir} --type {draft_plan.meta.type}")
  Bash("hoyeon-cli plan merge {spec_dir} --json \"$(cat /tmp/plan-virtual.json)\"")
  Bash("hoyeon-cli plan validate {spec_dir}")
```

At the end of 0.2 we have: `spec_dir/plan.json` (valid) + `input_mode` + (optionally) `spec_dir/contracts.md`.

### 0.2b Pre-work Gate (optional)

If `requirements.md` exists and contains a `## Pre-work` section, parse it and gate on blocking items before proceeding.

```
IF exists("{spec_dir}/requirements.md"):
  pre_work = scan for "## Pre-work" section → parse checkbox items
  # Expected format: "- [ ] action (blocking)" or "- [ ] action (non-blocking)"
  blocking = [item for item in pre_work if "blocking" in item]

  IF len(blocking) > 0:
    print("Pre-work items requiring completion:")
    FOR EACH item in blocking:
      print("  - {item.action}")

    AskUserQuestion(
      question: "Have you completed all blocking pre-work items?",
      options: [
        { label: "Yes, all done", description: "Continue to execution" },
        { label: "Not yet",       description: "Abort — complete pre-work first" }
      ]
    )
    IF answer == "Not yet": HALT
```

If there is no `## Pre-work` section, skip silently.

### 0.3 Load plan.json (structural fields only)

INV-3: read **only** structural fields from `plan.json`. Do NOT open `requirements.md` or `contracts.md` body here.

```
plan = Read("{spec_dir}/plan.json") → JSON.parse

# Structural metrics used by 0.4 prompts
task_count     = len(plan.tasks)
parallel_count = count(t for t in plan.tasks if t.parallel_safe)
parallel_ratio = parallel_count / task_count if task_count else 0

# Gate distribution across verify_plan (for the verify-depth hint)
gate_hist = {1:0, 2:0, 3:0, 4:0}
FOR vp in plan.verify_plan:
  FOR g in vp.gates: gate_hist[g] += 1
max_gate = max(g for g,c in gate_hist.items() if c > 0) if any else 0

# contracts.md path — path only, never the body (INV-2)
contracts_path = "{spec_dir}/contracts.md" if exists(spec_dir/contracts.md) else null
```

### 0.4 User Configuration (dispatch + verify depth)

Two `AskUserQuestion` calls in order. Both include a structural hint computed in 0.3.

```
# --- Dispatch mode (R-F2.1) -----------------------------------------
# Recommendation from task count + parallel_safe ratio:
IF task_count <= 3:          recommended = "Direct"
ELIF parallel_ratio >= 0.6:  recommended = "Team"      # many independent tasks
ELSE:                        recommended = "Agent"

dispatch = AskUserQuestion(
  question: "Dispatch mode? ({task_count} tasks, {parallel_count} parallel_safe → recommended: {recommended})",
  options: [
    { label: "Direct", description: "Orchestrator executes tasks sequentially in its own context (best for ≤3 tasks)" },
    { label: "Agent",  description: "Spawn worker subagents per module group, round-level commit" },
    { label: "Team",   description: "TeamCreate persistent workers claim tasks (best for high parallel_safe ratio)" }
  ]
)

# --- Verify depth (R-F2.2) ------------------------------------------
# Hint shows gate distribution from plan.verify_plan.
hint = "gates present: " + join([f"{g}={gate_hist[g]}" for g in [1,2,3,4] if gate_hist[g] > 0], ", ")
IF max_gate == 0: hint = "no verify_plan entries"

verify = AskUserQuestion(
  question: "Verify depth? ({hint})",
  options: [
    { label: "Light",    description: "Gate 1 only — build/lint/typecheck (caps all sub_reqs at gate ≤ 1)" },
    { label: "Standard", description: "Gates 1-2 — build + sub_req double-review (caps all sub_reqs at gate ≤ 2)" },
    { label: "Thorough", description: "All gates — no cap; runs gate 3 (qa-verifier) where planned" }
  ]
)

# --- Work mode (flag or prompt) -------------------------------------
IF --work flag provided:
  work = flag_value
ELSE:
  work = AskUserQuestion(
    question: "Work mode?",
    options: [
      { label: "Worktree",           description: "Isolated worktree, commit per round" },
      { label: "New Branch + Commit", description: "Create feat/ branch from current, commit per round" },
      { label: "Branch + Commit",     description: "Current branch as-is, commit per round" },
      { label: "No Commit",           description: "No git commits" }
    ]
  )
```

### 0.5 Setup — session state + charter template

```
# (a) Session state
STATE_FILE="$HOME/.hoyeon/$CLAUDE_SESSION_ID/state.json"
Bash: jq -n \
  --arg dispatch "{dispatch}" \
  --arg verify   "{verify}" \
  --arg work     "{work}" \
  --arg spec_dir "{spec_dir}" \
  --arg input    "{input_mode}" \
  --arg contracts "{contracts_path or ""}" \
  '{dispatch:$dispatch, verify:$verify, work:$work, spec_dir:$spec_dir,
    input_mode:$input, contracts_path: ($contracts|select(length>0))}' \
  > $STATE_FILE

# (b) Branch/Worktree setup
IF work == "Worktree":
  spec_dir       = Bash("realpath {spec_dir}").trim()
  contracts_path = Bash("realpath {contracts_path}").trim() if contracts_path
  EnterWorktree(name=basename(spec_dir))

IF work == "New Branch + Commit":
  branch_name = "feat/{spec_name}"   # derived from spec_dir basename
  Bash: git checkout -b {branch_name}
  audit_append("BRANCH_CREATE {branch_name} from {current_branch}")

# (c) Context files (next to plan.json)
CONTEXT_DIR = spec_dir
Bash: [ -s {CONTEXT_DIR}/learnings.json ] || echo '[]' > {CONTEXT_DIR}/learnings.json   # initialize to [] if new
Bash: [ -s {CONTEXT_DIR}/issues.json ]    || echo '[]' > {CONTEXT_DIR}/issues.json      # initialize to [] if new
Bash: touch {CONTEXT_DIR}/audit.md

# (d) Worker charter template — paths and IDs only (INV-2, R-N15.1)
# NEVER inline GWT, requirements prose, or contracts body into this template.
CHARTER_TEMPLATE = {
  task_id:              "<injected per task>",
  plan_path:            "{spec_dir}/plan.json",
  contracts_path:       contracts_path,          # path only — see R-F2.3
  contracts_directive:  (contracts_path != null)
                          ? "Read contracts.md before coding — it defines the
                             cross-module surface you must respect."
                          : null,
  sub_req_ids:          "<injected per task from plan.tasks[].fulfills>",
  round:                1,
  prior_failure_context: null
}
```

`CHARTER_TEMPLATE` is consumed by dispatch references (direct/agent/team) and by
the worker charter recipe (T7). The `contracts_directive` field fulfills R-F2.3:
if `contracts.md` exists, its **path** is embedded in every charter together
with a "read before coding" instruction; its body is **never** inlined (INV-2).

---

## Orchestrator Boundaries (INV-3, R-N15.2)

The orchestrator is a **router over structure**. It must NOT read the body of any
spec prose. Enforced everywhere in this skill and all dispatch/verify references.

**MAY read** (structural, via `hoyeon-cli plan get` or `Read` on plan.json only):
- `plan.json` fields: `tasks`, `journeys`, `verify_plan`, `meta`, `contracts.artifact`, `context`
- Session state in `$HOME/.hoyeon/$CLAUDE_SESSION_ID/state.json`
- Worker output JSON returned by dispatch (WorkerOutput payload)
- `audit.md`, `learnings.json`, `issues.json` for round-to-round context

**MUST NOT read**:
- `requirements.md` body (GWT, behavior prose, decisions, context text)
- `contracts.md` body (invariants, interfaces, data shapes — only the **path** flows through charters)

That body-read responsibility belongs to workers via the self-read pattern in
`references/worker-charter.md` (§1.3, §2 Self-Read). If the orchestrator ever needs
to influence behavior based on a requirement's body, route through a worker or
through the contracts-patch recipe — never inline-read.

---

## Resume Behavior (R-F8.2 idempotent restart)

On any re-entry (compaction recovery, session restart, `/execute` re-invocation on
an existing `spec_dir`), the orchestrator MUST treat `plan.json` as the source of
truth and skip any task whose `status == "done"`. This rule applies uniformly
across all three dispatch modes.

```
# Runs at the top of every dispatch recipe, before any worker is spawned.
plan       = Read("{plan_path}") → JSON.parse
done_ids   = { t.id for t in plan.tasks if t.status == "done" }   # INV-9: monotonic
pending    = [ t for t in plan.tasks if t.status != "done" ]

# Downstream readiness uses done_ids to satisfy depends_on.
ready = [ t for t in pending if all(d in done_ids for d in t.depends_on) ]
```

| Mode          | Where the skip happens                                                 |
|---------------|------------------------------------------------------------------------|
| `direct.md`   | Phase 1.2 (A) — `current.status == "done" → CONTINUE` (per-task loop)  |
| `agent.md`    | Phase A `compute_ready_set()` — `t.status == "done" → continue` (INV-9)|
| `team.md`     | Phase 1 ready-set filter + Phase 2 claim loop skip already-done        |

Additional guarantees:

- Verify (`references/verify.md`) builds its coverage matrix from `done_tasks` only, so a
  partial run resumes verification on exactly the tasks that completed.
- `hoyeon-cli plan task --status X=done` is idempotent (INV-5, INV-9); re-issuing
  it on a task that is already `done` is a no-op, never a re-transition.
- The orchestrator NEVER rewrites plan.json directly — resume reads are through
  `hoyeon-cli plan get` (INV-5).

---

## Concurrency Rules (INV-4 — no sleep, no polling)

Every parallel burst MUST be emitted as a **single message** with all background
dispatches at once. Results arrive via notifications (TaskOutput, SendMessage,
`run_in_background:true` completion events), never via a `sleep` / re-read poll
loop.

Hard bans — enforced across SKILL.md and every dispatch / verify reference:

- No `sleep <n>` between dispatches.
- No `while not done: ... sleep` over plan.json or worker state.
- No `hoyeon-cli plan get` called in a loop to poll for `status == "done"`.
- No serial `Bash` calls in separate messages where a single-message parallel
  burst would work (e.g. per-round worker fan-out, gate-1 toolchain fan-out).

Already-enforced sites (for reference):
- `direct.md` — sequential by design, no polling (one task per loop iteration).
- `agent.md` — Phase C notification handler, explicitly `await_round_notifications(round_id)`
  with the comment "NO SLEEP" (R-N16.1 fulfilled).
- `team.md` — Phase 2 lead loop uses `wait_for_SendMessage()` events; standing-by
  workers wait on inbound SendMessage rather than polling plan.json (INV-4).
- `verify.md` — INV-4 listed in invariants block; gate-1/gate-2 fan-out runs as a
  single-message burst.

If you feel tempted to add `sleep`, you are wrong. Use background dispatch +
notification handler instead.

---

## Dispatch Routing

The orchestrator picks one of three recipes based on `dispatch` from Phase 0.4.
All three consume the same Phase 0 state and delegate worker construction to the
canonical charter in `references/worker-charter.md` — **no recipe inlines its own
charter format**.

```
IF dispatch == "direct":
  Read: ${baseDir}/references/direct.md
  Follow ALL instructions. (sequential — one task at a time in orchestrator context)

ELIF dispatch == "agent":
  Read: ${baseDir}/references/agent.md
  Follow ALL instructions. (round-based parallel — TaskCreate per ready-set group)

ELIF dispatch == "team":
  Read: ${baseDir}/references/team.md
  Follow ALL instructions. (persistent TeamCreate workers claim tasks)
```

**Canonical charter** — every dispatch recipe builds worker charters by importing
`references/worker-charter.md`. The charter carries **paths and IDs only** (INV-2,
R-N15.1): `task_id`, `plan_path`, `contracts_path`, `sub_req_ids`, `round`,
`prior_failure_context`. No GWT, no requirements prose, no contracts body.

All dispatch references receive these variables from Phase 0:
- `plan_path` — `{spec_dir}/plan.json` (workers self-read it, orchestrator structural-reads it)
- `spec_dir`, `CONTEXT_DIR` — directory paths
- `contracts_path` — path to contracts.md, or null
- `work` — `"Worktree" | "Branch + Commit" | "No Commit"`
- `verify` — `"Light" | "Standard" | "Thorough"` (depth cap for verify.md)
- `CHARTER_TEMPLATE` — from Phase 0.5, passed through to worker-charter.md

Resume behavior (R-F8.2) is mandatory across all three — see "Resume Behavior"
above for the uniform done-skip contract.

---

## Verify Routing

After all plan tasks reach `done` / `failed` / `blocked`, run verification. There
is a **single** verify recipe; `verify` depth is a parameter that caps gates per
sub_req, not a selector between different recipes (T8 design).

```
Read: ${baseDir}/references/verify.md
Follow ALL instructions; pass `verify` ∈ {"light","standard","thorough"} as the
depth parameter. verify.md reads done tasks from plan.json (structural only) and
evaluates each sub_req / journey against its capped gate set.
```

### Contracts mismatch hook (C4, R-F9.1)

On any worker output that signals a cross-module contract mismatch — during
dispatch OR during verify fix loops — the orchestrator invokes the auto-patch
recipe **before** marking the task `done` or enqueueing a retry:

```
Read: ${baseDir}/references/contracts-patch.md
Follow ALL instructions. (detect → patch → audit-log → return control)
```

This hook runs without user confirmation (INV-7), is idempotent per worker output,
and routes only through `Read` / `Edit` / `Write` on `contracts.md` and `audit.md`
— never through `hoyeon-cli` (INV-5). See `references/contracts-patch.md` for
detection signals (explicit `contract_mismatch`, `contract_issues[]`, or
`BLOCKED`-with-contract-reason).

---

## Output Artifacts (R-F13.2, R-F13.3, R-F13.4)

execute produces exactly **5 file artifacts** during a run, all inside `<spec_dir>/`.
There is **no `report.md`** — the final report is stdout-only (INV-8 / R-F13.4 / C5).

| Artifact          | Owner             | Tool             | Lifecycle                                                                |
|-------------------|-------------------|------------------|--------------------------------------------------------------------------|
| `plan.json`       | orchestrator      | `hoyeon-cli`    | Status mutated via `plan task --status` (INV-5, INV-9; never direct edit) |
| `contracts.md`    | orchestrator      | `Edit` / `Write` | Inline patched by contracts-patch recipe (no user confirm; INV-7)         |
| `audit.md`        | orchestrator      | `Read` + `Edit`  | Append-only timestamped event log (R-F13.2)                              |
| `learnings.json`  | workers           | `Read` + `Write` | Workers append on success per `worker-charter.md` §3.5 (R-F6.4, R-F13.3) |
| `issues.json`     | workers           | `Read` + `Write` | Workers append on BLOCKED / FAILED per `worker-charter.md` §3.5 (R-F6.4, R-F13.3) |

### audit.md (R-F13.2) — append-only timestamped event log

The orchestrator appends one entry per orchestrator-level event. Format: a markdown
list item starting with an ISO-8601 timestamp. Entries are **append-only** — never
edit or delete prior entries. `audit.md` is initialized as an empty file by Phase 0.5.

| Event class         | Trigger site                                          | Entry shape (markdown)                                                  |
|---------------------|-------------------------------------------------------|--------------------------------------------------------------------------|
| `WORKER_SPAWN`      | direct/agent/team dispatch issues a worker            | `- {ts} WORKER_SPAWN T<id> mode={direct\|agent\|team} round=<n>`         |
| `WORKER_RESULT`     | worker returns done / failed / blocked                | `- {ts} WORKER_RESULT T<id> status=<done\|failed\|blocked>`              |
| `RETRY`             | per-task retry (R-F7.1)                               | `- {ts} RETRY T<id> round=<n> reason="<short>"`                          |
| `BLOCKED`           | worker returned blocked (R-F7.3)                      | `- {ts} BLOCKED T<id> reason="<reason>" propagates_to=[T<id>...]`        |
| `VERIFY_DISPATCH`   | gate-1/2/3 dispatch (verify.md)                       | `- {ts} VERIFY_DISPATCH gate=<n> targets=[<sub_req>...]`                 |
| `VERIFY_RESULT`     | sub_req gate verdict recorded                          | `- {ts} VERIFY_RESULT sub_req=<id> gate=<n> verdict=<PASS\|FAIL\|MANUAL>` |
| `GAP`               | coverage pre-check found uncovered sub_req            | `- {ts} GAP sub_req=<id>`                                                |
| `PERSISTENT_GAP`    | gap survived re-dispatch (R-F10.4)                    | `- {ts} PERSISTENT_GAP sub_req=<id>`                                     |
| `CONTRACTS_PATCH`   | contracts auto-patch applied (R-F9.2)                 | `- {ts} CONTRACTS_PATCH path=<file:line> rationale="<why>" diff="<summary>"` |
| `DISPATCH_CEILING`  | task hit 5-dispatch ceiling (R-F7.4 / INV-6)          | `- {ts} DISPATCH_CEILING_EXCEEDED T<id>`                                 |
| `ABORT`             | run aborted (persistent fail / dispatch ceiling)      | `- {ts} ABORT reason="<reason>"`                                         |

The orchestrator writes audit entries via `Read` + `Edit` (append) — **never** via
`hoyeon-cli` (INV-5 / R-N17.1). The contracts-patch recipe writes its own
`CONTRACTS_PATCH` line directly (see `references/contracts-patch.md` §"audit.md append").

### learnings.json + issues.json (R-F13.3) — worker-managed JSON arrays

Both files are flat JSON arrays initialized to `[]` in Phase 0.5. Workers append
entries per `references/worker-charter.md` §3.5 using `Read` + `Write`. The
orchestrator only **reads** these files (round-to-round context, final report).

- `learnings.json` — appended on worker success. Schema is owned by worker-charter.md.
- `issues.json` — appended when worker returns `BLOCKED` or `FAILED`. Same constraint.

Workers MUST NOT use `hoyeon-cli` to mutate either file (INV-5).

### NO report.md (R-F13.4 / INV-8 / C5)

The orchestrator MUST NOT create a `report.md`, `summary.md`, or any other report
file. The final report is emitted to stdout only (see "Stdout Report Format" below).
This rule applies even if the user asks for a file — surface it via stdout and let
the user redirect if they want to capture it.

---

## Stdout Report Format (R-F14.1, R-F14.2, R-F14.3)

After verify completes, the orchestrator prints **one final report to stdout** —
no file is written (INV-8 / R-F13.4). The report has **8 fixed sections** in this
exact order (R-F14.1):

1. **Status** — `✅ COMPLETE` | `⚠️ PARTIAL` | `❌ FAILED`
2. **Summary** — task counts, sub_req coverage counts, contracts patch count
3. **Post-Work** — action items for the user (directly under Summary, action-first; R-F14.2)
4. **Tasks** — table: T# / status / commits / round
5. **Verify Coverage Matrix** — sub_req × gate table with `PASS` / `FAIL` / `—` / `MANUAL` / `GAP` cells (R-F14.3)
6. **Contracts Auto-Patches** — list extracted from `audit.md` `CONTRACTS_PATCH` entries
7. **Issues Encountered** — extracted from `issues.json` (and `audit.md` `BLOCKED` / `ABORT` entries)
8. **Learnings** — extracted from `learnings.json`

### Status determination

| Status        | Condition                                                                                          |
|---------------|----------------------------------------------------------------------------------------------------|
| `✅ COMPLETE` | All tasks `done`, all sub_reqs `PASS` / `MANUAL` (no GAP, no FAIL, no BLOCKED, no ABORT)            |
| `⚠️ PARTIAL`  | Any `PERSISTENT_GAP`, `BLOCKED` task, gate=4 escalation, or verify result `MANUAL` without failures |
| `❌ FAILED`   | Any `ABORT`, `DISPATCH_CEILING_EXCEEDED`, persistent verify FAIL after fix loop, or failed task     |

### Section sources

| Section             | Source                                                                |
|---------------------|-----------------------------------------------------------------------|
| Status              | Computed from plan.json task statuses + verify results + audit events |
| Summary             | `hoyeon-cli plan list` counts + verify result tallies                 |
| Post-Work           | Computed from MANUAL gate=4 entries, PERSISTENT_GAP entries, BLOCKED tasks |
| Tasks               | `hoyeon-cli plan get <plan> --path tasks` + git log per round         |
| Verify Coverage Matrix | Coverage matrix data from `verify.md` (see `references/verify.md` §"Coverage Matrix Render") |
| Contracts Auto-Patches | `audit.md` lines matching `CONTRACTS_PATCH`                          |
| Issues Encountered  | `issues.json` + `audit.md` `BLOCKED` / `ABORT` lines                  |
| Learnings           | `learnings.json`                                                      |

### Verify Coverage Matrix (R-F14.3)

Rendered as a markdown table — **rows = sub_req**, **columns = gate**, last column =
overall result. Cell values: `PASS`, `FAIL`, `—` (gate not applicable at depth),
`MANUAL` (gate=4), `GAP` (no fulfilling citation).

### Concrete example

```markdown
## ✅ COMPLETE — execute run 2026-04-17T14:32:11Z

### Summary
- Tasks: 13 done / 0 failed / 0 blocked
- Sub-requirements: 50 PASS / 2 MANUAL / 0 FAIL / 0 GAP (52 total)
- Contracts auto-patches: 1
- Dispatch mode: agent · Verify depth: standard · Work mode: branch

### Post-Work
- [ ] MANUAL REVIEW: R-F11.4 (gate=4) — confirm GWT citations match human intent
- [ ] MANUAL REVIEW: R-F12.4 (gate=4) — confirm escalation policy is acceptable

### Tasks
| Task | Status | Commits          | Round |
|------|--------|------------------|-------|
| T1   | done   | a1b2c3d          | 1     |
| T2   | done   | a1b2c3d          | 1     |
| T3   | done   | e4f5g6h          | 2     |
| ...  | ...    | ...              | ...   |

### Verify Coverage Matrix
| sub_req   | Gate 1 | Gate 2 | Gate 3 | Gate 4   | Overall |
|-----------|--------|--------|--------|----------|---------|
| R-F1.1    | PASS   | PASS   | —      | —        | PASS    |
| R-F1.2    | PASS   | PASS   | —      | —        | PASS    |
| R-F11.4   | PASS   | PASS   | —      | MANUAL   | MANUAL  |
| R-F12.4   | PASS   | PASS   | —      | MANUAL   | MANUAL  |
| ...       | ...    | ...    | ...    | ...      | ...     |

### Contracts Auto-Patches
- 2026-04-17T14:18:02Z — `contracts.md:88` — interface `FooAPI.call` signature aligned with worker T7 output (`+ retries: number`)

### Issues Encountered
- (none)

### Learnings
- T7: worker self-read pattern — pulling sub_req IDs from plan.json before reading body avoids re-parsing on round 2
- T8: gate=1 toolchain fan-out via single-message `run_in_background:true` cut wall time ~40% vs serial
```

The example is illustrative; counts, hashes, and timestamps come from live data.
The section order, headings, and matrix shape are **normative** (R-F14.1, R-F14.2,
R-F14.3).

---

## Generic Rules

1. **plan.json is the ledger** — all task CRUD via `hoyeon-cli plan` (status/list/get/merge). Never direct file writes (INV-5).
2. **Structural reads only** — orchestrator reads plan.json fields, never requirements.md / contracts.md body (see Orchestrator Boundaries above; INV-3, R-N15.2).
3. **Two-turn task setup** — Turn 1: all TaskCreate. Turn 2: all TaskUpdate dependencies.
4. **Background for parallel** — `run_in_background: true` for concurrent workers, single-message burst (INV-4; see Concurrency Rules).
5. **Contracts are reference** — workers receive `contracts_path` to Read, not inlined content (INV-2).
6. **Workers self-read** — workers fetch their own task state + context files per `references/worker-charter.md` §2.
7. **Context files** — `learnings.json`, `audit.md`, `issues.json` in CONTEXT_DIR. Workers append learnings; orchestrator reads them round-to-round.
8. **Compaction recovery** — `session-compact-hook.sh` re-injects state. Use `hoyeon-cli plan list` to rebuild; done tasks skip on re-entry (R-F8.2; see Resume Behavior above).

## Checklist Before Stopping

- [ ] Input detected and normalized (plan.json / requirements.md / virtual)
- [ ] Plan generated or validated via hoyeon-cli
- [ ] Dispatch/verify/work modes selected
- [ ] All tasks dispatched and completed (status "done"/"failed"/"blocked" in plan.json)
- [ ] Verify recipe ran (single verify.md with selected depth)
- [ ] Contracts auto-patch hook invoked on any mismatch signals
- [ ] Final report output
- [ ] Worktree exited (if entered)
