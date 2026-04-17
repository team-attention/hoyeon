---
name: execute2
description: |
  Plan-driven orchestrator. Reads plan.json (from /blueprint) or requirements.md,
  then dispatches workers to build the system.
  Use when: "/execute2", "execute2", "plan 실행", "blueprint 실행"
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

# /execute2 — Plan-Driven Orchestrator

**You are the conductor. You do not play instruments.**
Delegate to workers, manage parallelization, verify the result.

## Core Principles

1. **DELEGATE** — Agent/Team: workers do the work. Direct: orchestrator does.
2. **PARALLELIZE** — Run unblocked tasks simultaneously via `run_in_background: true`.
3. **plan.json is the ledger** — Task state via `hoyeon-cli2 plan` commands. Never direct file writes.
4. **Contracts guide workers** — If `contracts.md` exists, workers reference it for cross-module agreements.
5. **Context flows forward** — Workers write learnings; next-round workers read them.

---

## Phase 0: Initialize

Phase 0 is **plan-first**. The orchestrator resolves an input to a valid `plan.json`, asks two questions (dispatch + verify depth), and prepares a worker charter template. **Phase 0 never reads `requirements.md` or `contracts.md` body** — only `plan.json` structural fields (INV-3).

### 0.1 Parse Input & Resolve

```
/execute2 [<spec_dir>] [--work worktree|branch|no-commit]
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
             or call /execute2 with no argument to synthesize a virtual plan."
  ABORT

spec_dir = raw_path if is_dir(raw_path) else dirname(raw_path)

# (c) Classify what we found
IF exists(spec_dir/plan.json):
  input_mode = "plan"          # R-F1.1
ELIF exists(spec_dir/requirements.md):
  input_mode = "requirements"  # R-F1.2
ELSE:
  ERROR: "{spec_dir} has neither plan.json nor requirements.md"
  guidance: "Run /blueprint on requirements.md, or call /execute2 without arguments
             for a session-synthesized virtual plan."
  ABORT
```

### 0.2 Resolve to plan.json

Handle each `input_mode` — the goal is to end this sub-phase with a validated `plan.json` on disk and `spec_dir` set.

```
IF input_mode == "plan":                             # R-F1.1
  # Direct use — NO user confirm.
  Bash("hoyeon-cli2 plan validate {spec_dir}/plan.json")

ELIF input_mode == "requirements":                   # R-F1.2
  # Auto-invoke /blueprint — NO user confirm. Blueprint writes plan.json (and
  # optionally contracts.md) into the same spec_dir.
  Skill(blueprint, args="{spec_dir}")
  ASSERT exists(spec_dir/plan.json) else ABORT
  Bash("hoyeon-cli2 plan validate {spec_dir}/plan.json")

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

  # Persist via cli2 (INV-5). Write, then validate.
  write_json_to_tmp(draft_plan) → /tmp/plan-virtual.json
  Bash("hoyeon-cli2 plan init {spec_dir} --type {draft_plan.meta.type}")
  Bash("hoyeon-cli2 plan merge {spec_dir}/plan.json --json \"$(cat /tmp/plan-virtual.json)\"")
  Bash("hoyeon-cli2 plan validate {spec_dir}/plan.json")
```

At the end of 0.2 we have: `spec_dir/plan.json` (valid) + `input_mode` + (optionally) `spec_dir/contracts.md`.

### 0.3 Load plan.json (structural fields only)

INV-3: read **only** structural fields from `plan.json`. Do NOT open `requirements.md` or `contracts.md` body here.

```
plan = Bash("hoyeon-cli2 plan get {spec_dir}/plan.json --json") → parse

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
      { label: "Worktree",        description: "Isolated worktree, commit per round" },
      { label: "Branch + Commit", description: "Current branch, commit per round" },
      { label: "No Commit",       description: "No git commits" }
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

# (b) Worktree (if selected)
IF work == "Worktree":
  spec_dir       = Bash("realpath {spec_dir}").trim()
  contracts_path = Bash("realpath {contracts_path}").trim() if contracts_path
  EnterWorktree(name=basename(spec_dir))

# (c) Context files (next to plan.json)
CONTEXT_DIR = spec_dir
Bash: touch {CONTEXT_DIR}/learnings.json   # initialize to [] if new
Bash: touch {CONTEXT_DIR}/issues.json      # initialize to [] if new
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

## Dispatch Routing

```
IF dispatch == "direct":
  Read: ${baseDir}/references/direct.md
  Follow ALL instructions.

ELIF dispatch == "agent":
  Read: ${baseDir}/references/agent.md
  Follow ALL instructions.

ELIF dispatch == "team":
  Read: ${baseDir}/references/team.md
  Follow ALL instructions.
```

All dispatch references receive these variables:
- `plan` — parsed plan.json object
- `requirements` — extracted requirements with GWT
- `contracts_path` — path to contracts.md (or null)
- `spec_dir`, `CONTEXT_DIR` — directory paths
- `work`, `verify` — selected modes

---

## Verify Routing

After all tasks complete, run verification based on selected depth.

```
Read: ${baseDir}/references/verify.md
Follow instructions for the selected verify depth.
```

---

## Generic Rules

1. **plan.json is the ledger** — all task CRUD via `hoyeon-cli2 plan` (status/list/get/merge). Never direct file writes.
2. **Two-turn task setup** — Turn 1: all TaskCreate. Turn 2: all TaskUpdate dependencies.
3. **Background for parallel** — `run_in_background: true` for concurrent workers.
4. **Contracts are reference** — workers receive `contracts_path` to Read, not inlined content.
5. **Workers self-read** — workers fetch their own task state + context files. Orchestrator doesn't read worker output during dispatch (only after completion).
6. **Context files** — `learnings.json`, `audit.md` in CONTEXT_DIR. Workers append learnings.
7. **Compaction recovery** — `session-compact-hook.sh` re-injects state. Use `hoyeon-cli2 plan list` to rebuild.

## Checklist Before Stopping

- [ ] Input detected and normalized (plan.json / requirements.md / markdown)
- [ ] Plan generated or validated via hoyeon-cli2
- [ ] Dispatch/verify/work modes selected
- [ ] All tasks dispatched and completed (status "done" in plan.json)
- [ ] Verify recipe ran
- [ ] Final report output
- [ ] Worktree exited (if entered)
