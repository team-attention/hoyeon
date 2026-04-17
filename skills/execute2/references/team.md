# Team Dispatch Mode

Persistent workers via `TeamCreate` with claim-based task distribution.
Each worker is a long-lived session that claims multiple tasks in sequence, reusing in-session
context (prior reads of contracts, sibling module code, learnings) across consecutive claims.

Best for plans with layer-sequential work, multi-task modules, or tasks that share upstream
contracts that a worker benefits from remembering across claims.

**Prerequisites from Phase 0**: `plan`, `plan_path`, `contracts_path`, `spec_dir`, `CONTEXT_DIR`,
`work`, `verify` are established. `plan.json` MUST exist on disk (team mode = shared claim-board).

**Invariants honored by this mode**:
- **INV-2**: charter contains only paths + IDs (no inlined GWT / requirements / contracts prose).
  Workers self-read GWT via `hoyeon-cli2 plan get` + self-Read of `contracts_path`.
- **INV-3**: orchestrator (lead) reads only `plan.json` structural fields via cli2.
  Lead never Reads `requirements.md` or `contracts.md` body.
- **INV-5**: `plan.json` mutations go through `hoyeon-cli2 plan` only.
  `audit.md`, `learnings.json`, `issues.json`, `contracts.md` → direct Read/Write/Edit.
- **C2**: round-level commit only. Workers never run `git`. The lead batches one commit per
  worker-pool round (all workers idle + no pending unblocked tasks = round boundary).

---

## Phase 1: Team Setup

### Pool Sizing — layer/module distribution (R-F5.1)

Workers are allocated by how many independent *module buckets* the plan exposes in its ready
frontier. A bucket = set of tasks that share a primary module/file-scope **and** don't cross
a `depends_on` edge with each other.

```
pending = Bash("hoyeon-cli2 plan get {plan_path} --status pending --json").tasks
ready   = pending.filter(t => all(d.status == "done" for d in t.depends_on))

buckets = group_by_module(ready)
  # module = primary directory/file prefix inferred from task.action
  # two tasks share a bucket iff same module AND no depends_on between them

parallel_count = len(buckets)
N = min(max(parallel_count, 1), 5)    # 1..5 workers
```

Why buckets, not raw task count: R-F5.2 wants **one worker per module** so the worker's
in-session memory of that module compounds across consecutive claims.

### Create Team

```
team_name = "exec2-{basename(spec_dir)}"
TeamCreate(team_name=team_name)
# Current session becomes team lead ("team-lead").
```

### Create Tracking Tasks (TURN 1 — single message)

All `TaskCreate` calls go in ONE message. Charter description carries **paths + IDs only**
(INV-2). Workers will fetch GWT themselves via cli2.

```
FOR EACH task in pending:
  TaskCreate(
    subject="{task.id}:Work — {task.action}",
    description=WORKER_DESCRIPTION(
      task_id=task.id,
      plan_path=plan_path,
      contracts_path=contracts_path,   # may be null
      sub_req_ids=task.fulfills,       # e.g. ["R-F5.1","R-F5.2"]
      spec_dir=spec_dir,
      round=1,
      prior_failure_context=null,      # populated on round > 1 re-dispatch
      CONTEXT_DIR=CONTEXT_DIR
    ),
    owner=null                         # unassigned — workers claim
  )

TaskCreate(subject="Finalize:Verify", owner=null)
TaskCreate(subject="Finalize:Report", owner=null)
```

### Set Dependencies (TURN 2 — single message)

```
FOR EACH task WHERE task.depends_on is not empty:
  FOR EACH dep_id in task.depends_on:
    TaskUpdate(taskId=tracking[dep_id], addBlocks=[tracking[task.id]])

FOR EACH task in pending:
  TaskUpdate(taskId=tracking[task.id], addBlocks=[verify_task])
TaskUpdate(taskId=verify_task, addBlocks=[report_task])
```

---

## Charter Shape (no-inline — INV-2)

`WORKER_DESCRIPTION` is a recipe, not a payload. It tells the worker **where** to read, not
**what** the requirement says.

```
WORKER_DESCRIPTION(task_id, plan_path, contracts_path, sub_req_ids, spec_dir, round,
                   prior_failure_context, CONTEXT_DIR) = """
You are a TEAM WORKER claiming task {task_id} in spec {spec_dir}.

## Inputs (paths + IDs only — self-read below)
- plan_path:       {plan_path}
- contracts_path:  {contracts_path ?? "(none)"}
- sub_req_ids:     {sub_req_ids}
- CONTEXT_DIR:     {CONTEXT_DIR}
- round:           {round}
- prior_failure:   {prior_failure_context ?? "(none)"}

## Step 1 — Prereq
Claim was already performed by WORKER_PREAMBLE LOOP Step 3 (single owner = cli2 flock).
Do NOT re-claim here. If your session somehow reached this step without holding the
claim, abort and let the LOOP re-run step 3.

## Step 2 — Self-read GWT
  hoyeon-cli2 plan get {plan_path} --task {task_id} --json
  → yields action, depends_on, fulfills[], and embedded sub-requirement GWT

Do NOT Read requirements.md or spec.json. Do NOT Read plan.json directly.

## Step 3 — Self-read contracts (if present)
  IF {contracts_path} != null AND this is your FIRST claim in this session:
    Read({contracts_path})
  ELSE IF you have already Read {contracts_path} earlier in this session:
    Skip — rely on your in-session memory (R-F5.2).

## Step 4 — Self-read context
  Read {CONTEXT_DIR}/learnings.json  (if exists)
  Read {CONTEXT_DIR}/issues.json     (if exists)

## Step 5 — Implement
Satisfy every sub_req in fulfills[]. Respect contracts invariants.
Do NOT run git — lead commits per round (C2).

## Step 6 — Self-verify + fix loop (R-F5.3, max 2 rounds inside this claim)
  self_verify_round = 0
  WHILE self_verify_round < 2:
    run typecheck / lint / unit-test commands from the project
    IF all PASS AND every sub_req has at least one line-citation: BREAK
    self_verify_round += 1
    fix the failures in place (same session — keep your context)
  IF still failing after 2 rounds: mark status=FAILED with detail.

## Step 7 — Record learnings / issues
  Edit {CONTEXT_DIR}/learnings.json  (append JSON)
  Edit {CONTEXT_DIR}/issues.json     (append JSON if blockers)

## Step 8 — Mark done
  hoyeon-cli2 plan task {plan_path} --status {task_id}=done \
    --summary '{one-line summary}'
  TaskUpdate(taskId=tracking, status="completed")

## Step 9 — Report to lead
  SendMessage(recipient="team-lead", type="message",
    content="DONE {task_id}: {summary}. Files: {files_modified}. Fulfills: {citations}.",
    summary="{task_id} done")

## Output (last message, JSON)
{
  "status": "DONE|FAILED|BLOCKED",
  "summary": "...",
  "files_modified": [...],
  "fulfills": [{"sub_req_id": "R-Fx.y", "file_path": "...", "line": "..."}],
  "self_verify_rounds": 0|1|2,
  "contract_mismatch": null | "..."
}
"""
```

Note: the description above is **paths, IDs, and procedure** — it does NOT inline any GWT
text, requirement prose, or contracts snippets (INV-2).

---

## Worker Preamble (persistence layer — R-F5.2)

Injected into each worker session at spawn. Separate from `WORKER_DESCRIPTION` — this is the
loop that lets a single worker claim many tasks while keeping its in-session memory.

```
WORKER_PREAMBLE(team_name, worker_name, plan_path, spec_dir, CONTEXT_DIR) = """
You are TEAM WORKER "{worker_name}" in team "{team_name}".
Report to "team-lead" via SendMessage. Never Read/Write plan.json directly — cli2 only.

== PERSISTENT CLAIM LOOP ==

State you keep across claims (in-session memory, DO NOT re-read unless invalidated):
  - CONTRACTS_SEEN: set of contracts_path values you've already Read
  - MODULE_CACHE:   map of module → files you've already Read from that module
  - LEARNINGS_SEEN: last snapshot hash of learnings.json

LOOP:
  1. LIST ready tasks:
       hoyeon-cli2 plan get {plan_path} --status pending --json
     Filter to tasks whose depends_on are all `done`.
     IF empty → emit "standing by" → WAIT for SendMessage wake-up, then restart LOOP.

  2. PICK (longest-deps-first — R-F5.1):
       Order the ready set by:
         (a) DESC  longest dependency chain length to this task
             (i.e. max depth in the depends_on DAG ending at this task).
             Algorithm: chain_length(t) = 1 + max(chain_length(d) for d in t.depends_on)
             with chain_length(t) = 1 for tasks with no deps. Lead pre-computes this
             via DFS+memo over `depends_on` once per round and embeds the value in
             each TaskCreate description so workers don't re-traverse the DAG.
         (b) DESC  count of other pending tasks blocked on this task
         (c) ASC   task.id (stable tiebreaker)
       Longest-chain-first drains critical-path work before branches.

       Prefer a task whose module is ALREADY in your MODULE_CACHE — this is the R-F5.2
       persistence bonus: stay in the same module across consecutive claims so your
       prior reads (code + contracts) stay valid. If no such task exists, pick the
       highest-priority task from a new module.

  3. CLAIM (atomic via cli2 flock):
       hoyeon-cli2 plan task {plan_path} --status {picked_id}=running
     IF cli2 reports "already claimed" → loop back to step 1.

  4. EXECUTE the task by following its TaskCreate description (WORKER_DESCRIPTION
     above): self-read GWT via `plan get`, self-read contracts (only if not in
     CONTRACTS_SEEN), implement, self-verify, mark done.

     While executing: when you Read a new file under a module, add it to
     MODULE_CACHE[module]. When you Read contracts_path, add to CONTRACTS_SEEN.

  5. REPORT to lead via SendMessage. Go back to step 1.

== STANDING BY ==
When step 1 returns empty, emit:
  SendMessage(recipient="team-lead", type="message",
    content="standing by", summary="idle")
then WAIT. Lead will SendMessage when new tasks unblock (deps completed, fix tasks
appended, or round boundary crossed).

== SHUTDOWN ==
On shutdown_request:
  SendMessage(recipient="team-lead", type="shutdown_response",
    request_id=<from request>, approve=true)

== RULES ==
- Never Read/Write plan.json directly (INV-5 — cli2 only).
- Never Read requirements.md or spec.json (INV-2 — your TaskCreate + `plan get`
  expose the GWT you need).
- Never run git — lead commits per round (C2).
- Never spawn sub-agents.
- Self-verify/fix loop stays inside your claim (max 2 internal rounds — R-F5.3).
  Only if both internal rounds fail → report FAILED to lead.
"""
```

### Why the loop preserves context (R-F5.2)

- A worker session is **one** Claude session; the `LOOP` above runs inside that one session.
- `MODULE_CACHE` and `CONTRACTS_SEEN` are natural consequences of the session transcript —
  content already Read is still in the worker's context window. We just tell the worker
  not to Read again when it can reuse.
- The PICK step biases toward same-module tasks, so the worker's next claim usually
  benefits from files it already holds in memory from the previous claim.

### Why longest-deps-first (R-F5.1)

Ordering by longest dependency chain minimizes *tail latency*: the critical path drains
first, and shorter/independent branches fill idle workers later. Combined with the
same-module bias in (b)/(c), we get high-cache-hit sequences per worker.

---

## Phase 2: Lead Execute Loop (claim-driven, no polling — INV-4)

```
# Spawn N persistent workers (single message)
FOR i in 1..N:
  Agent(
    subagent_type="worker",
    name="worker-{i}",
    description="Team worker {i}",
    prompt=WORKER_PREAMBLE(team_name, "worker-{i}", plan_path, spec_dir, CONTEXT_DIR),
    run_in_background=true
  )

# Lead monitors via SendMessage notifications (no sleep/poll — R-F16, INV-4)
round_idx = 1
round_completed_tasks = []
standing_by = set()

WHILE has_pending_tasks_in_plan():
  msg = wait_for_SendMessage()

  IF msg.content starts with "DONE":
    round_completed_tasks.append(msg.task_id)
    standing_by.discard(msg.worker)

    # Detect round boundary:
    # A round is complete when (a) all currently-running workers have reported DONE
    # or are standing by, AND (b) no newly-unblocked task has been picked up yet.
    newly_unblocked = scan_for_unblocked_tasks()
    IF all_workers_idle_or_standing_by() AND len(newly_unblocked) == 0:
      # Nothing more to do this round → commit + next round
      commit_round(round_idx, round_completed_tasks)
      round_idx += 1
      round_completed_tasks = []
      # If plan still has pending tasks, next iteration will unblock them
    ELIF newly_unblocked:
      # Wake idle workers so they can claim
      FOR EACH idle in standing_by:
        SendMessage(recipient=idle, type="message",
          content="wake — {len(newly_unblocked)} tasks unblocked",
          summary="wake")
      standing_by.clear()

  ELIF msg.content starts with "standing by":
    standing_by.add(msg.worker)

  ELIF msg.content starts with "FAILED":
    handle_failed(msg)    # bounded retry via round 2 re-dispatch w/ prior_failure_context

  ELIF msg.content starts with "BLOCKED":
    handle_blocked(msg)   # append fix task via cli2 plan merge, wake workers

# End of loop: all plan tasks are done
final_commit_if_dirty()
```

### Round-level commit (C2)

```
function commit_round(round_idx, completed_task_ids):
  IF work == "no-commit": return
  IF `git status --porcelain` is empty: return
  Agent(subagent_type="git-master",
        description="Commit round {round_idx}",
        prompt="Commit all changes from team-mode round {round_idx}. "
               "Tasks included: {completed_task_ids}. Spec: {spec_dir}.")
  # Lead logs the commit to audit.md (direct Edit — INV-5, not cli2)
  Edit(CONTEXT_DIR + "/audit.md", append=
    "ROUND {round_idx} committed: {completed_task_ids} @ {timestamp}")
```

### FAILED handling — bounded re-dispatch (R-F7.1)

Recall R-F5.3: a worker already does up to 2 *internal* self-verify/fix rounds before
reporting FAILED. So by the time the lead sees FAILED, the worker already tried twice
inside its claim. Per R-F7.1, the lead may re-dispatch the task up to **2** more
times before halting. This maps to INV-6 budget: 1 initial + 2 R-F7.1 retry (+ 1
gap + 1 verify-fix at higher layers) = 5 attempts.

```
function handle_failed(msg):
  retry = retry_count[msg.task_id]    # 0 on first FAILED, increments per re-dispatch
  IF retry < 2:
    retry_count[msg.task_id] = retry + 1
    # Return to pending so any worker can re-claim
    Bash("hoyeon-cli2 plan task {plan_path} --status {msg.task_id}=pending")
    # Re-issue TaskCreate with prior_failure_context populated
    TaskCreate(
      subject="{msg.task_id}:Work (retry {retry_count[msg.task_id]})",
      description=WORKER_DESCRIPTION(
        task_id=msg.task_id, plan_path=plan_path, contracts_path=contracts_path,
        sub_req_ids=msg.sub_req_ids, spec_dir=spec_dir,
        round=retry_count[msg.task_id] + 1,
        prior_failure_context=msg.summary,
        CONTEXT_DIR=CONTEXT_DIR
      ),
      owner=null
    )
    Edit(audit.md, append="RETRY {msg.task_id} round={retry_count[msg.task_id] + 1}: {msg.summary}")
    wake_standing_by_workers()
  ELSE:
    Edit(audit.md, append="HALT {msg.task_id}: failed after R-F7.1 retries. Worker internal 2 + lead 2 = R-F7.1 budget exhausted (INV-6 floor).")
    HALT
```

### BLOCKED handling

```
function handle_blocked(msg):
  fix_task_json = derive_fix_task(msg)    # id, action, depends_on, fulfills
  Bash("hoyeon-cli2 plan merge {plan_path} --append --json '{fix_task_json}'")
  TaskCreate(subject="{fix_id}:Work — fix", description=WORKER_DESCRIPTION(...), owner=null)
  Edit(audit.md, append="BLOCKED {msg.task_id}: appended fix {fix_id}")
  wake_standing_by_workers()
```

---

## Phase 3: Finalize

```
# 1. Graceful shutdown — send shutdown_request to each worker, wait for responses
FOR EACH worker in spawned_workers:
  SendMessage(recipient=worker, type="shutdown_request",
    content="team work complete")
# (Each worker replies with shutdown_response approve=true per its preamble.)

# 2. TeamDelete
TeamDelete(team_name=team_name)

# 3. Final residual commit (catches anything left uncommitted between rounds)
IF work != "no-commit" AND `git status --porcelain` is not empty:
  Agent(subagent_type="git-master",
        description="Residual commit",
        prompt="Residual commit after team execution. Spec: {spec_dir}.")

# 4. Verify — route to ${baseDir}/references/verify.md (lead executes directly;
#    verify may spawn sub-agents which team workers cannot).

# 5. Report — stdout only (R-F13.4), sections per R-F14.1.
```

---

## Checklist

- [ ] plan.json present on disk (team mode requires it as shared claim-board)
- [ ] Pool size `N = min(max(#module_buckets, 1), 5)` computed from ready frontier
- [ ] `TeamCreate("exec2-{spec_name}")` called; current session = team-lead
- [ ] TURN 1 single message: `TaskCreate` per pending task + Verify + Report (all `owner=null`)
- [ ] TURN 2 single message: all `TaskUpdate` dependency edges
- [ ] `WORKER_DESCRIPTION` carries **paths + IDs only** — no inlined GWT / contracts prose (INV-2)
- [ ] `WORKER_PREAMBLE` includes the persistent claim LOOP with MODULE_CACHE + CONTRACTS_SEEN
- [ ] PICK step orders by longest-deps-first, then same-module bias (R-F5.1 + R-F5.2)
- [ ] CLAIM via `hoyeon-cli2 plan task --status <id>=running` (cli2 flock = single winner)
- [ ] Workers self-read GWT via `hoyeon-cli2 plan get` (never `requirements.md` / `spec.json`)
- [ ] Worker runs internal self-verify / fix loop up to 2 rounds before reporting FAILED (R-F5.3)
- [ ] Lead monitors via SendMessage; no sleep/poll (INV-4)
- [ ] Standing-by workers woken via SendMessage when tasks unblock
- [ ] Commit is round-level via `git-master` agent; workers never run git (C2)
- [ ] audit.md / learnings.json / issues.json written via Edit (not cli2 — INV-5)
- [ ] Graceful shutdown: shutdown_request → shutdown_response → TeamDelete
- [ ] Verify + Report handled directly by lead (not by a team worker)
