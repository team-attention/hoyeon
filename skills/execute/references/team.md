# TEAM Dispatch Mode Reference

This file contains TEAM-specific execution logic for the `/execute` skill.
It is loaded when the user selects `dispatch=team` in Phase 0.5.
Uses Claude Code's native TeamCreate API for persistent workers with claim-based task distribution.
Optimized for specs with 3+ parallel tasks.

**Prerequisite**: Phase 0 (Find Spec, Derive Plan, Init Context, Confirm Pre-work, Work Mode Selection) and
Phase 0.5 (Plan Analysis, Mode Selection) are already done.
`spec_path`, `plan_path`, `normalized_spec`, `CONTEXT_DIR`, `work_mode`, `verify_depth`, `WORK_DIR`, and `ephemeral` are all established.

- `plan_path` = `<dirname(spec_path)>/plan.json` — all task state I/O via `hoyeon-cli plan` CLI (claim, status, merge).
- `normalized_spec` = session-cached structured spec object (used by lead to construct charters for team workers).
- `ephemeral` = boolean from Phase 0 (`--ephemeral` flag) indicating in-memory-only plan mode.

---

## Mode Exclusivity Preflight (R8.1 / C6)

**FIRST ACTION — before any other work:**

```
IF ephemeral == true:
  print("ERROR: team dispatch requires plan.json; incompatible with --ephemeral (C6)")
  print("  Either:")
  print("    1. Re-run without --ephemeral so a plan.json file is produced, OR")
  print("    2. Choose a different dispatch mode (direct or agent)")
  HALT
```

Team dispatch relies on `plan.json` as the shared claim-board across multiple worker sessions.
An in-memory-only plan cannot serve that purpose.

---

## Phase 0.5: Team Setup

### Worker Count

```
pending_tasks = Bash("hoyeon-cli plan list {plan_path} --status pending --json") → parse .tasks
parallel_tasks = count of tasks with no unresolved dependencies
N = min(ceil(parallel_tasks / 2), 5)  # max 5 workers
```

### Team Creation

```
team_name = "exec-{normalized_spec.meta.name}"  # slug from spec name

TeamCreate(team_name=team_name)
# Current session becomes team lead ("team-lead")
```

### Task Creation (Single Turn)

```
# ===============================================
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ===============================================

FOR EACH task in pending_tasks:
  charter = build_charter([task], normalized_spec)  # inlined GWT for worker
  TaskCreate(
    subject="{task.id}:Work -- {task.action}",
    description=WORKER_DESCRIPTION(task.id, charter),
    owner=null  # unassigned -- workers claim via `plan status --status in_progress`
  )

# Finalize tasks
TaskCreate(subject="Finalize:Verify",
           description="Run verification recipe based on verify tier.",
           owner=null)

TaskCreate(subject="Finalize:Report",
           description="Generate execution report.",
           owner=null)
```

### Set Dependencies (Turn 2)

```
# ===============================================
# TURN 2: Set ALL dependencies in PARALLEL (single message)
# ===============================================

# Cross-task dependencies (from plan.json depends_on)
FOR EACH task WHERE task.depends_on is not empty:
  FOR EACH dep_id in task.depends_on:
    producer = task_ids[dep_id]
    consumer = task_ids[task.id]
    TaskUpdate(taskId=producer, addBlocks=[consumer])

# All work tasks -> Finalize:Verify
FOR EACH task in pending_tasks:
  TaskUpdate(taskId=task_ids[task.id], addBlocks=[verify_task])

# Finalize chain: Verify -> Report
TaskUpdate(taskId=verify_task, addBlocks=[report_task])
```

**Key rule**: Two turns only. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Charter Construction Helper (lead-side)

```
function build_charter(tasks, normalized_spec):
  """
  Build inlined GWT charter for a task (or list of tasks). Lead constructs this
  when creating TaskCreate descriptions so that team workers never need to read
  spec.json — workers only talk to plan.json via CLI.
  """
  charter = {}
  FOR EACH task in tasks:
    subs = []
    FOR EACH req_id in (task.fulfills ?? []):
      req = normalized_spec.requirements.find(r => r.id == req_id)
      IF req:
        FOR EACH s in req.sub:
          subs.push({id: s.id, behavior: s.behavior, given: s.given, when: s.when, then: s.then})
    charter[task.id] = {
      action: task.action,
      depends_on: task.depends_on ?? [],
      fulfills: task.fulfills ?? [],
      sub_requirements: subs
    }
  return charter
```

---

## Worker Preamble

Template injected into each worker's spawn prompt. Workers are persistent --
they claim multiple tasks from the plan (and TaskList mirror), not just one.

```
WORKER_PREAMBLE(team_name, worker_name, plan_path, spec_path, CONTEXT_DIR) = """
You are a TEAM WORKER in team "{team_name}". Your name is "{worker_name}".
You report to the team lead ("team-lead").
You are not the leader and must not perform leader orchestration actions.

Do not Read or Write plan.json directly — use the hoyeon-cli plan CLI only.
The CLI holds a flock lock around plan.json to guarantee safe concurrent access.

== WORK PROTOCOL ==

1. CLAIM: List available tasks and atomically claim one.
   - List: `hoyeon-cli plan list {plan_path} --status pending --json`
   - Pick the first pending task whose depends_on are all `done`.
   - Claim it by transitioning its status to `in_progress`:
       hoyeon-cli plan status {task_id} {plan_path} --status in_progress --summary 'claimed by {worker_name}'
   - The CLI's flock guarantees only one worker wins the claim (R8.2). If the CLI
     reports the task was already claimed by someone else, loop back and pick another.
   - Also mirror the claim in TaskList:
       TaskUpdate({"taskId": "<tracking id>", "status": "in_progress", "owner": "{worker_name}"})
   NEVER claim a task that is already "in_progress" / "done" / "blocked" in plan.json.

2. WORK: Execute the task.
   - Fetch task details from plan: `hoyeon-cli plan get {task_id} {plan_path}`
   - Your TaskCreate description already contains a charter with the inlined
     sub-requirement GWT — do NOT Read spec.json.
   - Read context: {CONTEXT_DIR}/learnings.json, {CONTEXT_DIR}/issues.json (if exist)
   - Implement using Read, Write, Edit, Bash, Grep, Glob
   - Respect constraints from the charter
   - Verify: each sub-requirement's GWT (given/when/then) or behavior must be satisfied
   - Run build/lint/typecheck to ensure nothing is broken

3. COMPLETE: When done, mark the task completed via CLI and TaskList:
   hoyeon-cli plan status {task_id} {plan_path} --status done --summary '...'
   TaskUpdate({"taskId": "<tracking id>", "status": "completed"})

4. CONTEXT: Write learnings/issues via CLI:
   hoyeon-cli spec learning --task {task_id} --stdin {spec_path} << 'EOF'
   {"problem": "...", "cause": "...", "rule": "...", "tags": [...]}
   EOF

   hoyeon-cli spec issue --task {task_id} --stdin {spec_path} << 'EOF'
   {"type": "failed_approach|out_of_scope|blocker", "description": "..."}
   EOF

5. REPORT: Notify the lead via SendMessage:
   {"type": "message", "recipient": "team-lead",
    "content": "Completed {task_id}: {summary}. Files: {files_modified}",
    "summary": "Task {task_id} complete"}

6. NEXT: Loop back to step 1 and claim the next unblocked pending task.
   If `hoyeon-cli plan list {plan_path} --status pending --json` is empty or no
   unblocked task exists, notify lead:
   {"type": "message", "recipient": "team-lead",
    "content": "All available tasks complete. Standing by.",
    "summary": "Standing by"}
   Then WAIT for a wake-up message from lead before polling again.

7. SHUTDOWN: On shutdown_request -> respond with:
   {"type": "shutdown_response", "request_id": "<from the request>", "approve": true}

== RULES ==
- NEVER Read or Write plan.json directly — use hoyeon-cli plan CLI only (C8).
- NEVER Read spec.json — your charter carries the GWT you need.
- NEVER spawn sub-agents or use the Task tool
- NEVER run git commands -- lead handles commits
- NEVER run team spawning/orchestration commands
- ALWAYS use absolute file paths
- ALWAYS report progress via SendMessage to "team-lead"
- Use SendMessage with type "message" only -- never "broadcast"
"""
```

---

## WORKER_DESCRIPTION Template

Task-level description stored in TaskCreate. Workers fetch task state via CLI;
GWT is inlined in the charter so workers do NOT touch spec.json.

```
WORKER_DESCRIPTION(task_id, charter) = """
You are a Worker in TEAM mode. Implement task {task_id}.
Work in the current directory (session CWD).

## Step 1: Claim and read your task
Claim: `hoyeon-cli plan status {task_id} {plan_path} --status in_progress --summary 'claimed'`
Read:  `hoyeon-cli plan get {task_id} {plan_path}`
Do NOT Read or Write plan.json directly — use hoyeon-cli plan CLI only.

## Step 2: Resolve dependency inputs (if any)
If your task has depends_on, fetch each dependency via:
  hoyeon-cli plan get {dep_id} {plan_path}
Use its `summary` field to understand what was produced.

## Step 3: Read context files
Read: {CONTEXT_DIR}/learnings.json -- structured learnings from previous workers (if exists)
Read: {CONTEXT_DIR}/issues.json -- failed approaches to avoid (if exists)

Your behavioral acceptance criteria (GWT) are inlined below — do NOT Read spec.json:

{JSON.stringify(charter, null, 2)}

## Step 4: Implement
Follow the task action from your charter.
Respect constraints.
Do NOT run git commands -- lead handles commits.

### Code quality: avoid AI expression patterns
Do NOT produce these patterns in your implementation:
- Comments that restate what the code already says (e.g., `// increment counter` above `counter++`)
- Catch-rethrow blocks that add no context (`catch(e) { throw e }`)
- Assign to variable only to immediately return (`const result = foo(); return result;`)
- Null checks for values already guaranteed by types or framework validation
- Helper functions called exactly once — inline them
- JSDoc/docstrings that add no information beyond the function signature
- Leftover console.log, debugger statements, or TODO comments

### Verification before reporting DONE
1. **Behavioral check**: For each sub-requirement in your charter, verify the
   given/when/then scenario (or behavior if GWT absent) is satisfied.
2. **Build/lint/typecheck**: Run the project's build, lint, and type-check commands.

## Step 5: Update context files

For each learning discovered during implementation, save via CLI:

```bash
hoyeon-cli spec learning --task {task_id} --stdin {spec_path} << 'EOF'
{
  "problem": "what went wrong or was unexpected",
  "cause": "why it happened",
  "rule": "what to do instead (actionable rule)",
  "tags": ["relevant", "tech", "keywords"]
}
EOF
```

**What to record**: surprising behavior, version-specific gotchas, workarounds, breaking changes, performance pitfalls.
**What NOT to record**: obvious steps that worked as expected, framework basics.

For each issue discovered during implementation, save via CLI:

```bash
hoyeon-cli spec issue --task {task_id} --stdin {spec_path} << 'EOF'
{
  "type": "failed_approach|out_of_scope|blocker",
  "description": "what went wrong or what is out of scope"
}
EOF
```

## Step 6: Mark task done
hoyeon-cli plan status {task_id} {plan_path} --status done --summary '...'

## Output (print as last message)
```json
{"status": "DONE"|"FAILED"|"BLOCKED",
 "summary": "...",
 "files_modified": [...],
 "tier1_checks": [{"type":"build|lint|static|format", "run":"...", "status":"PASS|FAIL"}]}
```

### Status meanings:
- **DONE**: All checks passed, implementation complete.
- **FAILED**: Implementation attempted but checks failed (code error).
- **BLOCKED**: Implementation blocked by scope limitation (not a code error).
"""
```

---

## Phase 1: Exec Stage

### Spawn Workers

```
# Spawn N workers with preamble -- ALL in parallel
FOR i in 1..N:
  Agent(
    subagent_type="worker",
    team_name=team_name,
    name="worker-{i}",
    description="Team worker {i}",
    prompt=WORKER_PREAMBLE(team_name, "worker-{i}", plan_path, spec_path, CONTEXT_DIR),
    run_in_background=true
  )
```

### Lead Monitoring

```
# Lead monitors via SendMessage notifications from workers
# DO NOT poll -- wait for worker messages

# Workers send messages on:
#   - Task completion ("Completed T1: ...")
#   - Task failure ("FAILED T1: ...")
#   - Standing by (no more tasks)
#   - Blocked (dependency or scope issue)

# Lead actions on message receipt:
#   - On completion: log progress, check if all tasks done,
#     AND notify standing-by workers that new tasks may be unblocked:
IF any_workers_standing_by AND pending_tasks_with_no_unresolved_deps > 0:
  FOR EACH idle_worker in standing_by_workers:
    SendMessage(type="message", recipient=idle_worker,
      content="New tasks unblocked. Run `hoyeon-cli plan list {plan_path} --status pending --json` and claim.",
      summary="Wake up — new tasks available")
#   - On failure: log_to_audit + reassign or halt (see Watchdog)
#   - On standing by: track worker as idle. If all workers standing by
#     AND no pending tasks remain → proceed to verify phase
#   - On blocked: log_to_audit + unblock or reassign

# IMPORTANT: On FAILED or BLOCKED messages, lead MUST append to audit.md:
IF worker reports BLOCKED for task:
  log_to_audit("BLOCKED: {task_id} from {worker} — {reason}")
  # Then proceed to scope fix (append fix task + notify workers)

IF worker reports FAILED for task:
  log_to_audit("FAILED: {task_id} from {worker} — {reason}")
  # Then proceed to reassign (see Watchdog)
```

### Watchdog Policy

```
# 5min no message from worker -> SendMessage status check
IF time_since_last_message(worker) > 5min:
  SendMessage(type="message", recipient="worker-{i}",
    content="Status check: what is your current task and progress?",
    summary="Status check")

# 10min stuck -> return task to pending in plan.json (re-claimable by another worker)
IF time_since_last_message(worker) > 10min:
  stuck_task_id = find_in_progress_task_for_worker(worker)
  Bash("hoyeon-cli plan status {stuck_task_id} {plan_path} --status pending --summary 'reassigned — worker unresponsive'")
  TaskUpdate(taskId=<tracking>, owner=null, status="pending")
  SendMessage(type="message", recipient="team-lead",
    content="Reassigned {stuck_task_id} from {worker} -- unresponsive",
    summary="Task reassigned")

# Worker FAILED -> return task to pending (NOT halt); another worker will claim it
IF worker reports FAILED for task:
  Bash("hoyeon-cli plan status {failed_task_id} {plan_path} --status pending --summary 'reassign — prior worker reported FAILED'")
  TaskUpdate(taskId=<tracking>, owner=null, status="pending")
  log_to_audit("REASSIGN: {task_id} from {worker} -- worker reported FAILED")
  # If task fails 2+ times across different workers -> HALT
  IF failure_count(task_id) >= 2:
    log_to_audit("HALT: {task_id} failed {failure_count} times across workers")
    HALT
```

### All Tasks Done

```
# When all pending tasks in plan.json have status="done" (Finalize tasks still pending):
# -> Proceed to Phase 1.5: Verify Stage
```

---

## Phase 1.5: Verify Stage

```
# Verify routing based on user's verify depth selection from Phase 0.5:
Read the verify recipe:
  light    -> ${baseDir}/references/verify-light.md
  standard -> ${baseDir}/references/verify-standard.md
  thorough -> ${baseDir}/references/verify-thorough.md
  ralph    -> ${baseDir}/references/verify-ralph.md

# IMPORTANT: The lead executes the verify recipe DIRECTLY (not via team worker).
# Verify recipes internally spawn sub-agents (code-reviewer, qa-verifier, etc.)
# which team workers cannot do (NEVER spawn sub-agents rule).
# The lead reads the verify recipe and follows its instructions as the orchestrator.

TaskUpdate(taskId=verify_task, status="in_progress")
# Follow verify recipe instructions directly (same as dev.md Phase 2b)
```

---

## Phase 1.6: Fix Stage (on verify failure)

```
IF verify result == VERIFIED_WITH_GAPS:
  log_to_audit("VERIFIED_WITH_GAPS: uncertain sub-reqs detected, proceeding as soft pass")
  TaskUpdate(taskId=verify_task, status="completed")

ELIF verify result == FAIL:
  fix_attempt = 0
  MAX_FIX_LOOPS = 3

  WHILE fix_attempt < MAX_FIX_LOOPS:
    fix_attempt += 1
    fix_tasks = []

    FOR EACH failure in verify_result.failures:
      # Append a fix task to plan.json via CLI (lead-only)
      new_id = "{failure.related_task_id ?? last_task_id}.fix-{next_idx}"
      payload = {
        "tasks": [{
          "id": new_id,
          "action": "Fix: {failure.description}",
          "type": "code",
          "status": "pending",
          "depends_on": [failure.related_task_id ?? last_task_id],
          "fulfills": [],
          "origin": "derived",
          "derived_from": failure.related_task_id ?? last_task_id,
          "reason": "Verify failure: {failure.reason}"
        }]
      }
      Bash("""hoyeon-cli plan merge --stdin --append {plan_path} << 'EOF'
{JSON.stringify(payload)}
EOF""")

      fix_tasks.append(new_id)

      # Mirror into TaskList so team workers can see + claim it
      charter = build_charter([payload.tasks[0]], normalized_spec)
      TaskCreate(
        subject="{new_id}:Work -- Fix: {failure.description}",
        description=WORKER_DESCRIPTION(new_id, charter),
        owner=null
      )

    log_to_audit("VERIFY_FIX attempt {fix_attempt}: appended {len(fix_tasks)} fix tasks to plan.json")

    # Wake any standing-by workers so they claim the new fix tasks
    FOR EACH idle_worker in standing_by_workers:
      SendMessage(type="message", recipient=idle_worker,
        content="New fix tasks available. Claim via hoyeon-cli plan list.",
        summary="Wake up — fix tasks available")

    # Wait for fix task completions via SendMessage

    # After all fix tasks done -> re-verify
    verify_result = run_verify(verify_depth)

    IF verify_result == PASS OR verify_result == VERIFIED_WITH_GAPS:
      IF verify_result == VERIFIED_WITH_GAPS:
        log_to_audit("VERIFIED_WITH_GAPS: uncertain sub-reqs detected after fix")
      TaskUpdate(taskId=verify_task, status="completed")
      BREAK

  IF verify_result != PASS AND verify_result != VERIFIED_WITH_GAPS:
    log_to_audit("HALT: Verify failed after {MAX_FIX_LOOPS} fix attempts")
    HALT
```

---

## Phase 2: Shutdown + Finalize

### Graceful Shutdown

```
# Step 1: Verify completion
# All pending plan tasks must be done and the verify task completed

# Step 2: Request shutdown from each worker
FOR EACH worker in active_workers:
  SendMessage(
    type="shutdown_request",
    recipient="worker-{i}",
    content="All work complete, shutting down team"
  )

# Step 3: Wait for shutdown_response from all workers
# 30s timeout per worker
FOR EACH worker in active_workers:
  WAIT for shutdown_response(approve=true) from worker
  TIMEOUT 30s:
    log_to_audit("WARNING: {worker} did not respond to shutdown within 30s")

# Step 4: Delete team
TeamDelete(team_name=team_name)
```

### Commit

```
# TEAM mode uses round-level or end-of-execution commit (not per-task)
IF work_mode != "no-commit":
  git_status = Bash("git status --porcelain")
  IF git_status is not empty:
    Agent(subagent_type="git-master",
          prompt="Commit all changes from spec: {normalized_spec.meta.goal}")
```

### Report

```
all_tasks = Bash("hoyeon-cli plan list {plan_path} --json") → parse .tasks
audit = Read("{CONTEXT_DIR}/audit.md")

print("""
===================================================
              EXECUTE-V2 COMPLETE (TEAM)
===================================================

SPEC: {spec_path}
PLAN: {plan_path}
GOAL: {normalized_spec.meta.goal}
DISPATCH: team
WORK: {work_mode}
VERIFY: {verify_depth}
WORKERS: {N} spawned

---------------------------------------------------
TASKS
---------------------------------------------------
{FOR EACH task in all_tasks:}
{task.id}: {task.action} -- {task.status}
  {task.summary}

---------------------------------------------------
VERIFICATION
---------------------------------------------------
{Verify tier results}

---------------------------------------------------
ADAPTATIONS
---------------------------------------------------
{List any appended fix tasks from verify failures, or "None"}

---------------------------------------------------
CONTEXT
---------------------------------------------------
Learnings: {count} entries
Issues: {count} entries
Audit: {count} events

---------------------------------------------------
MANUAL REVIEW (require human verification)
---------------------------------------------------
{List any sub-requirements that require manual/visual verification
 based on their behavior description (e.g., UI appearance, UX flows)}

{IF no manual items: "None"}

---------------------------------------------------
POST-WORK (human actions after completion)
---------------------------------------------------
{post_work = normalized_spec.external_dependencies.post_work ?? []}
{FOR EACH item in post_work:}
- [{item.id ?? ''}] {item.dependency}: {item.action}

{IF no post_work: "None"}
===================================================
""")

TaskUpdate(taskId=report_task, status="completed")
```

---

## Context File Management

### File Structure

```
.hoyeon/specs/{name}/context/
  learnings.json — structured learnings (lead creates empty [], workers append via hoyeon-cli spec learning)
  issues.json   — structured issues (lead creates empty [], workers append via hoyeon-cli spec issue)
  audit.md      — scope blockers, verify events, reassignments (lead creates empty, appends)
```

### Who reads/writes what

| File | Created by | Written by | Read by |
|------|-----------|-----------|---------|
| `learnings.json` | lead (Phase 0.7, `[]`) | workers (via `spec learning` CLI) | workers (next worker reads prev learnings) |
| `issues.json` | lead (Phase 0.7, `[]`) | workers (via `spec issue` CLI) | workers (avoid repeated failed approaches) |
| `audit.md` | lead (Phase 0.7, empty) | **lead only** | lead (report generation) |
| `plan.json` | dev-cli (`plan init`) | CLI only (never direct) | CLI only |

### Worker Context Flow

Workers self-read context files — lead does NOT read them during dispatch.
This saves lead tokens and survives compaction.

```
Worker claims task (via plan status --status in_progress)
  → reads learnings.json + issues.json
  → fetches task details via plan get
  → reads inlined charter (GWT) from its TaskCreate description
  → implements task
  → writes learnings/issues via CLI
  → marks done via plan status --status done
  → reports to lead via SendMessage
```

### Lead Audit Log

The lead writes to `audit.md` for:
- Worker BLOCKED events (scope blocker detected, fix task appended)
- Worker FAILED events (task failure, reassignment)
- Verify fix events (verify failure, fix tasks appended)
- Reassignment events (watchdog timeout, task returned to pending)

Format:
```
## {task_id} — {timestamp}
Event: {BLOCKED|FAILED|VERIFY_FIX|REASSIGN}
Worker: {worker_name}
Reason: {reason}
Action: {what was done — fix task appended, reassigned, halt}
```

### plan.json / spec.json Update Responsibilities

| Actor | Updates | Via |
|-------|---------|-----|
| lead | new fix tasks | `hoyeon-cli plan merge --stdin --append` |
| lead | tasks[].status → blocked | `hoyeon-cli plan status <id> --status blocked` |
| workers | tasks[].status → in_progress (claim) | `hoyeon-cli plan status <id> --status in_progress` |
| workers | tasks[].status → done | `hoyeon-cli plan status <id> --status done --summary '...'` |
| workers | learnings/issues | `hoyeon-cli spec learning` / `spec issue` |

Nobody Reads or Writes plan.json directly — all access is through the CLI (C8).
spec.json is only mutated by the `/specify` workflow; the `/execute` workflow treats
it as read-only and caches it as `normalized_spec` in memory.

---

## Team-specific Rules

1. **Ephemeral mode is incompatible** — team dispatch HALTs at preflight if `ephemeral == true`. Team mode requires a real plan.json file as the shared claim-board (C6).
2. **No direct plan.json I/O** — lead and workers MUST use `hoyeon-cli plan` CLI only. Never Read / Write / Edit plan.json directly (C8). The CLI provides flock-based concurrency safety (R8.2).
3. **Claim via `plan status --status in_progress`** — atomic claim is the CLI transition from `pending` → `in_progress`. The CLI's flock ensures single-winner semantics (R8.2). TaskList owner is mirrored for visibility only.
4. **Workers are persistent** -- spawned once, they claim and execute multiple tasks. Do NOT spawn a new worker per task.
5. **Claim-based dispatch** -- workers poll `plan list --status pending --json` and claim. The lead does NOT assign tasks to specific workers.
6. **FAILED tasks -> reassign** -- unlike AGENT mode, TEAM mode returns the failed task to `pending` via `plan status --status pending`, letting another worker claim it. Halt only after 2+ failures on the same task.
7. **SendMessage for all communication** -- workers report completion, failure, and standing-by status via SendMessage to "team-lead". Lead sends status checks, wake-ups, and shutdowns via SendMessage.
8. **No per-task commit** -- TEAM mode uses end-of-execution commit (or round-level if configured). Workers MUST NOT run git commands.
9. **Shutdown protocol is mandatory** -- always send shutdown_request to every worker and wait for shutdown_response before calling TeamDelete. No orphaned workers.
10. **Two turns for task setup** -- Turn 1: all TaskCreate, Turn 2: all TaskUpdate (same as AGENT mode).
11. **Workers self-read plan state, charters carry GWT** -- workers use `hoyeon-cli plan get` for task state, and read the inlined GWT charter from their TaskCreate description. Workers MUST NOT Read spec.json. Lead does NOT read plan.json or context files during dispatch.
12. **Description = recipe** -- TaskCreate description contains the full self-read recipe plus the GWT charter. At dispatch time, the worker preamble plus description provide all instructions.
13. **Adaptation appends to plan.json** -- new fix tasks go through `hoyeon-cli plan merge --stdin --append` (lead-only). Workers then claim them via the normal protocol.
14. **Standing-by wake-up** -- when tasks become unblocked (e.g., dep finished) or new fix tasks are appended, lead notifies idle workers via SendMessage so they resume polling.
15. **Max 5 workers** -- `N = min(ceil(parallel_tasks / 2), 5)`. More workers add coordination overhead without proportional throughput.
16. **Verify stage runs by lead** -- TEAM mode loads the same verify recipes as other dispatch modes. The lead executes the recipe directly (not a team worker), because verify recipes internally spawn sub-agents (code-reviewer, qa-verifier) which team workers cannot do.

---

## Checklist

- [ ] Preflight: ABORT if ephemeral == true (R8.1 / C6)
- [ ] Worker count calculated: `N = min(ceil(parallel_tasks / 2), 5)`
- [ ] TeamCreate called with `exec-{spec-name}` slug
- [ ] All TaskCreate in single turn (Turn 1) with inlined GWT charters, all TaskUpdate in single turn (Turn 2)
- [ ] Worker preamble includes: "no direct plan.json I/O" rule, CLI claim protocol, SendMessage, shutdown response, no-git rule
- [ ] N workers spawned in parallel with `run_in_background=true`
- [ ] Lead monitors via SendMessage (no polling)
- [ ] Watchdog: 5min status check, 10min reassign (return to pending via `plan status`)
- [ ] Failed tasks returned to pending (not halted) -- halt after 2+ failures on same task
- [ ] All plan tasks have `status: "done"` (via `hoyeon-cli plan status`)
- [ ] Verify recipe executed by lead directly (not team worker — verify spawns sub-agents)
- [ ] Fix loop bounded by max 3 attempts; fix tasks appended via `hoyeon-cli plan merge --stdin --append`
- [ ] Standing-by workers woken via SendMessage when new/unblocked tasks appear
- [ ] Shutdown: shutdown_request sent to all workers, shutdown_response received
- [ ] TeamDelete called after all workers confirmed shutdown
- [ ] Commit handled (end-of-execution, not per-task)
- [ ] Final report output with TEAM-specific fields (worker count, dispatch mode)
