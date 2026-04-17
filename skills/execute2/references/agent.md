# Agent Dispatch Mode

Canonical parallel dispatch. Ready-set extraction + module-group batching +
all-in-one-message background worker fan-out + round-level commit.

Use when: 4+ tasks, multiple tasks are `parallel_safe: true`, or plan has
independent modules. This is the default recipe in execute2.

**Prerequisites from Phase 0**: `plan_path`, `spec_dir`, `contracts_path`,
`CONTEXT_DIR` (holds `audit.md`, `learnings.json`, `issues.json`), `work`,
`verify` are established. The orchestrator has NOT read `requirements.md` or
`contracts.md` bodies (INV-3) — it only holds plan.json structural fields.

---

## Invariants enforced by this recipe

| ID     | Rule |
|--------|------|
| INV-1  | **One commit per round.** Never per-task, never per-worker. |
| INV-2  | Worker charter = paths + IDs only. No GWT, no requirements prose, no contracts body inlined. |
| INV-3  | Orchestrator never reads requirements.md / contracts.md body. |
| INV-4  | No sleep / no polling. All round dispatches sent in a **single message**; results arrive via notification. |
| INV-5  | cli2 only for plan.json: `plan get`, `plan task --status`, `plan validate`. |
| INV-6  | Per-task dispatch ceiling = 5. 6th dispatch aborts with `DISPATCH_CEILING_EXCEEDED`. |
| INV-9  | `done` is terminal. Idempotent restart skips `done` tasks. |

---

## Phase A — Ready-Set Extraction  *(fulfills R-F4.1)*

At the start of every round the orchestrator computes the **ready set**: tasks
whose dependencies are all satisfied and whose status is not already `done`.

```
function compute_ready_set(plan_path) → Task[]:
  # Read structural fields only — INV-3.
  all_tasks = cli2("plan get {plan_path} --path tasks")   # full task array
  done_ids  = { t.id for t in all_tasks if t.status == "done" }

  ready = []
  for t in all_tasks:
    if t.status == "done":        continue            # INV-9 skip
    if t.status == "running":     continue            # already dispatched
    if t.status == "blocked":     continue            # dependent-only BLOCKED
    deps = t.depends_on ?? []
    if all(d in done_ids for d in deps):
      ready.append(t)

  # R-F4.1: parallel_safe=true is the agent-mode selector. Sequential tasks
  # (parallel_safe=false) are NOT run by this recipe — route them to direct.md
  # or serialize them into their own single-task round.
  parallel_ready = [t for t in ready if t.parallel_safe == true]
  serial_ready   = [t for t in ready if t.parallel_safe != true]

  return { parallel: parallel_ready, serial: serial_ready }
```

Termination: if `parallel_ready == [] AND serial_ready == []` AND there are
still non-done tasks, a deadlock exists (unresolved BLOCKED) → emit abort
record to `audit.md` and exit.

---

## Phase B — Module-Group Batching  *(fulfills R-F4.2)*

Tasks that touch the same primary file/module are collapsed into one worker
group so the module is edited coherently and committed atomically.

```
function group_by_module(ready_tasks) → Group[]:
  groups = []                          # Group = { module, tasks[] }
  for t in ready_tasks:
    key = primary_module(t)            # see heuristic below
    g = groups.find(g => g.module == key AND no_intra_group_dep(g, t))
    if g:
      g.tasks.append(t)
    else:
      groups.append({ module: key, tasks: [t] })
  return groups

function primary_module(task):
  # Heuristic priority (first match wins):
  #   1. task.module field if plan schema includes it
  #   2. first file path / directory name parsed from task.action
  #   3. fallback to task.layer  (keeps schema-agnostic)
  return task.module
      ?? first_path_segment(task.action)
      ?? task.layer
      ?? task.id                       # last resort: one-task group

function no_intra_group_dep(group, candidate):
  # Two tasks must NOT share a group if one depends on the other —
  # they must run sequentially across rounds, not in the same worker.
  for existing in group.tasks:
    if candidate.id in existing.depends_on: return false
    if existing.id in candidate.depends_on: return false
  return true
```

One group → one worker. Groups of size 1 are fine; they still get a worker.

---

## Phase C — Single-Message Parallel Dispatch  *(fulfills R-F4.3, R-N16.1, R-N16.2)*

The entire round is dispatched in ONE assistant message that emits every
worker Agent call with `run_in_background: true`. The orchestrator then yields
to the notification channel. **No sleep, no polling, no `while true` loop over
task status.**

```
# ═════════════════════════════════════════════════════════════════
# SINGLE MESSAGE — all worker dispatches in one turn (INV-4, R-N16.2)
# ═════════════════════════════════════════════════════════════════

groups = group_by_module(ready_set.parallel)
round_id = next_round_number()
round_workers = []

# 1) Mark each task running via cli2 (batched into this same message).
for g in groups:
  for t in g.tasks:
    cli2("plan task {plan_path} --status {t.id}=running")

# 2) Emit every Agent dispatch in the same message, background mode.
for g in groups:
  worker_id = "{round_id}-{g.module}-worker"
  round_workers.append(worker_id)
  Agent(
    subagent_type   = "worker",
    description     = "Round {round_id} / {g.module}: " + ",".join(t.id for t in g.tasks),
    run_in_background = true,                              # R-F4.3
    prompt          = WORKER_CHARTER(g.tasks, round_id, plan_path, contracts_path,
                                     CONTEXT_DIR, spec_dir)
  )
# End of message. Control returns to the harness. No sleep.
```

### Notification-based result collection  *(R-F4.3, R-N16.1)*

Each backgrounded Agent posts a completion notification. The orchestrator
processes them as they arrive — it never sleeps and never polls plan.json in
a loop:

```
# Pseudocode of the notification handler (NOT a sleep loop).
on_worker_done(worker_id, output):                        # fires once per worker
  parsed = parse_worker_output(output)                    # JSON contract below
  update_round_state(worker_id, parsed)
  if all(round_workers done):
    proceed_to_phase_D(round_id)                          # round commit

# The orchestrator simply stays idle between notifications — there is no
# `while not done: sleep N` construct anywhere in this recipe.
```

The round advances only when every worker of the round has posted its
notification. Because all dispatches were issued in a single message, they
run concurrently; the only latency is the slowest worker.

---

## Worker Charter Template  *(fulfills INV-2, reference R-F6.1 / R-F6.3)*

The charter is **paths and IDs only**. The worker self-reads spec body. No
GWT, no requirements prose, no contracts body is inlined by the orchestrator.

```
# NOTE: `tasks[]` in this charter signature means a multi-task batch — agent
# mode groups tasks by module and dispatches one worker per group
# (charter-per-group pattern). This differs from contracts.md's canonical
# `WorkerCharter { task_id: string }` shape, which is authoritative for
# single-task dispatches (direct.md / team.md). Do not reconcile by editing
# contracts.md from this file — any schema alignment happens there.
WORKER_CHARTER(tasks, round_id, plan_path, contracts_path, CONTEXT_DIR, spec_dir) = """
You are a Worker subagent. Round {round_id}. Dispatch mode: agent.

## Your task IDs
{tasks.map(t => t.id).join(", ")}

## Paths you must self-read (orchestrator has NOT inlined their contents)
- plan_path      : {plan_path}
- spec_dir       : {spec_dir}
- requirements   : {spec_dir}/requirements.md         ← read ONLY sections for your task's fulfills[]
- contracts      : {contracts_path | "(none)"}        ← read if present; honor every interface + invariant
- context dir    : {CONTEXT_DIR}
    - learnings.json  (read if round_id > 1)
    - issues.json     (read if round_id > 1)
    - prior-failure   (read if this task's dispatch round > 1, see "Prior failure" below)

## Self-read protocol (MANDATORY — charter gives paths/IDs only, INV-2)
1. For each task_id in [{tasks.map(t => t.id)}]:
     task = `hoyeon-cli2 plan get {plan_path} --path tasks` → find by id
     fulfills = task.fulfills
2. Read ONLY the sub-requirement sections of {spec_dir}/requirements.md that
   correspond to fulfills[]. Do NOT read the whole file into working memory.
3. If contracts_path is present, Read it and extract interfaces/invariants
   your module touches.
4. If round_id > 1:
     Read {CONTEXT_DIR}/learnings.json          — prior worker learnings
     Read {CONTEXT_DIR}/issues.json             — prior blockers / failures
     Read prior_failure_context (passed below)  — why the last attempt failed

## Prior failure context (round_id > 1 only)
{prior_failure_context ?? "(none — first dispatch)"}

## Implement
Follow each task.action. Respect constraints and contracts.
DO NOT run git commands — orchestrator handles the round commit (INV-1).

### Anti-slop
Do not emit: restating comments, catch-rethrow-no-context, assign-then-return,
redundant null guards, single-use helpers, leftover TODO/console.log/debugger.

### Verify before reporting done
1. Each sub_req GWT in fulfills[] is satisfied (cite file:line).
2. Build / lint / typecheck pass (Tier 1 mechanical).

## Record learnings/issues (NOT via cli2 — Read+Write pattern per worker-charter §3.5; INV-5)
- On success with a non-obvious discovery → Read {CONTEXT_DIR}/learnings.json, append entry to array, Write back.
- On BLOCKED or FAILED → Read {CONTEXT_DIR}/issues.json, append entry to array, Write back.
- Never `Edit` these files with line-anchor replacement — they are JSON arrays; use the Read+Write pattern.

## Mark tasks done (cli2, per INV-5)
For each task you completed:
  `hoyeon-cli2 plan task {plan_path} --status {task_id}=done --summary '<one line>'`
For BLOCKED:
  `hoyeon-cli2 plan task {plan_path} --status {task_id}=blocked --summary '<reason>'`
For FAILED:
  `hoyeon-cli2 plan task {plan_path} --status {task_id}=failed --summary '<reason>'`

## Output (last message — WorkerOutput contract)
```json
{
  "status": "done | failed | blocked",
  "summary": "...",
  "files_modified": ["path/to/file", ...],
  "fulfills": [
    { "sub_req_id": "R-F4.1", "file_path": "path", "line": "42" }
  ],
  "contract_mismatch": null | "free-text description",
  "blocked_reason": null | "only set when status=blocked"
}
```
"""
```

Key properties:
- No GWT text, no requirements prose, no contracts body appears in the charter.
- Worker self-reads everything — charter stays tiny and stable across retries.
- `prior_failure_context` is the only free-form text block; it is the
  previous worker's failure summary, not spec body.

---

## Phase D — Round-Level Commit  *(fulfills R-F4.4, INV-1)*

Exactly **one** commit per round. Never per-task, never per-group.

```
function commit_round(round_id, round_workers, round_groups):
  if work == "no-commit":
    return                                    # commit disabled

  # Derive task id list + group count from the round's dispatched groups.
  round_task_ids = [t.id for g in round_groups for t in g.tasks]
  group_count    = len(round_groups)

  # Wait until every worker in the round has posted its done-notification.
  # (Not a sleep — this is just "don't commit until the round aggregate
  # function has fired".)
  assert all(w.notification_received for w in round_workers)

  # Empty-diff guard — mirrors team.md:326. If the round produced no file
  # changes (e.g. all workers blocked, all failed pre-write, or every task
  # was a no-op), skip the commit call entirely so git-master does not
  # create an empty-tree commit.
  if Bash("git status --porcelain").output is empty:
    append_audit("[COMMIT_SKIP] round={round_id} no changes to commit")
    return

  Agent(
    subagent_type = "git-master",
    description   = "Round {round_id} commit",
    prompt        = "Commit all changes produced in round {round_id}. "
                    "Spec: {spec_dir}. "
                    "Include task IDs [" + round_task_ids.join(",") + "] in the commit message. "
                    "One commit only (INV-1)."
  )

  append_audit("ROUND {round_id} COMMIT: tasks=[" + round_task_ids.join(",") + "], groups=" + group_count)
```

After the round commit, return to Phase A and compute the next ready set.
Loop exits when no non-done tasks remain, or when an abort condition fires.

---

## Worker outcome handling

The notification handler routes on `status`:

```
on_worker_done(worker_id, parsed):
  # Contracts auto-patch hook (C4 / R-F9.1 / R-F9.2) — MUST run BEFORE per-task
  # routing, so any patch applies before a task is marked done or re-dispatched.
  # See ${baseDir}/references/contracts-patch.md. No user confirm (INV-7).
  IF contracts_path AND (
       parsed.contract_mismatch OR
       (parsed.status == "blocked" AND
        /contract|invariant|interface/i.test(parsed.blocked_reason or ""))
     ):
    run_recipe("contracts-patch",
      worker_output  = parsed,
      task_id        = worker.tasks[0].id,   # representative origin for the group
      round          = round_id,
      contracts_path = contracts_path,
      audit_path     = CONTEXT_DIR + "/audit.md")

  # Per-task outcome is derived from plan.json (the worker marked each task via
  # cli2 per its charter). WorkerOutput's top-level `status` is the group-level
  # summary; re-read plan.json to get per-task status.
  fresh_tasks = cli2("plan get {plan_path} --path tasks")
  for task in worker.tasks:
    current = fresh_tasks.find(t => t.id == task.id)
    switch current.status:
      case "done":
        # already marked done by the worker via cli2. nothing to do.
      case "failed":
        handle_failed(task, parsed)
      case "blocked":
        handle_blocked(task, parsed)
```

### FAILED retry  *(R-F7.1, bounded)*

```
handle_failed(task, result):
  retries = dispatch_count[task.id]          # orchestrator in-memory counter
  if retries + 1 > MAX_DISPATCH (=5):        # INV-6 ceiling
    append_audit("DISPATCH_CEILING_EXCEEDED: {task.id}")
    abort_run()
  if per_task_retry_count[task.id] < 2:      # R-F7.1: up to 2 retries
    # The NEXT round's ready-set will re-include this task because its
    # status is now `failed`. Re-queue with prior_failure_context so the
    # next worker charter can point to it.
    prior_failure_context[task.id] = result.summary
    cli2("plan task {plan_path} --status {task.id}=pending")   # re-arm
    per_task_retry_count[task.id] += 1
  else:
    append_audit("PERSISTENT_FAIL: {task.id} after 2 retries — aborting run (R-F7.2)")
    abort_run()
```

### BLOCKED propagation  *(R-F7.3)*

```
handle_blocked(task, result):
  append_audit("BLOCKED: {task.id} — {result.blocked_reason}")
  # Only dependents of task are marked blocked. Independent tasks continue.
  dependents = tasks_where(depends_on_contains=task.id)
  for d in transitive_closure(dependents):
    cli2("plan task {plan_path} --status {d.id}=blocked")
  # The round itself is not aborted; other groups keep running.
```

---

## Full Round Loop (single top-level pseudo-function)

```
function run_agent_mode():
  round_id = 0
  serial_queue = []                              # tasks accumulated across
                                                  # rounds with parallel_safe=false
  seen_serial_ids = set()                        # dedupe across rounds
  while true:
    round_id += 1
    ready = compute_ready_set(plan_path)

    # Accumulate any newly-ready serial tasks so they survive until the
    # trailing serial pass below. They are NOT dispatched in the agent
    # round — this loop only drives parallel work.
    for t in ready.serial:
      if t.id not in seen_serial_ids:
        serial_queue.append(t)
        seen_serial_ids.add(t.id)

    if ready.parallel == [] and ready.serial == []:
      break                                      # all done or deadlocked

    # If the only ready work is serial, stop looping — the trailing pass
    # below owns those tasks. Avoids an empty parallel round.
    if ready.parallel == []:
      break

    groups = group_by_module(ready.parallel)     # Phase B

    # ── Phase C: single-message parallel dispatch ───────────────
    dispatch_round(round_id, groups, plan_path, contracts_path,
                   CONTEXT_DIR, spec_dir)

    # ── Notification channel delivers results. NO SLEEP. ────────
    await_round_notifications(round_id)          # handler-driven, not poll

    # ── Phase D: round-level commit (INV-1) ─────────────────────
    commit_round(round_id, round_workers, groups)

  # Serial ready tasks (parallel_safe=false) accumulated across rounds are
  # handed off to direct.md as a trailing serial pass, NOT interleaved into
  # the agent loop. direct.md runs them one at a time with its own per-task
  # commit policy; this recipe's INV-1 (one commit per round) does not apply
  # to the delegated serial pass.
  if serial_queue:
    append_audit("SERIAL_HANDOFF: {len(serial_queue)} tasks → direct.md "
                 "ids=[{serial_queue.map(t => t.id).join(',')}]")
    delegate_to_direct_mode(serial_queue)

  proceed_to_finalize()                          # verify + report
```

---

## Finalize

1. Residual commit (only if uncommitted files remain after last round and
   `work != "no-commit"`) — a single final commit, still not per-task.
2. Verify — route to `${baseDir}/references/verify.md` with selected depth.
3. Report — stdout only, no `report.md` ever (INV-8).

---

## Traceability

| Sub-req   | Implemented at |
|-----------|----------------|
| R-F4.1    | Phase A — `compute_ready_set` |
| R-F4.2    | Phase B — `group_by_module` |
| R-F4.3    | Phase C — `run_in_background: true` + notification handler |
| R-F4.4    | Phase D — `commit_round` (one per round) |
| R-N16.1   | Phase C notification handler — no sleep, no poll |
| R-N16.2   | Phase C — "SINGLE MESSAGE" dispatch block |
