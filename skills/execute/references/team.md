# TEAM Dispatch Mode Reference

This file contains TEAM-specific execution logic for the `/execute` skill.
It is loaded when the user selects `dispatch=team` in Phase 0.5.
Uses Claude Code's native TeamCreate API for persistent workers with claim-based task distribution.
Optimized for specs with 3+ parallel tasks.

**Prerequisite**: Phase 0 (Find Spec, Get Plan, Init Context, Confirm Pre-work, Work Mode Selection) and
Phase 0.5 (Plan Analysis, Mode Selection) are already done.
`spec_path`, `plan`, `CONTEXT_DIR`, `work_mode`, `verify_tier`, and `WORK_DIR` are all established.

---

## Phase 0.5: Team Setup

### Worker Count

```
parallel_tasks = count of tasks with no unresolved dependencies
N = min(ceil(parallel_tasks / 2), 5)  # max 5 workers
```

### Team Creation

```
team_name = "exec-{spec.meta.name}"  # slug from spec name

TeamCreate(team_name=team_name)
# Current session becomes team lead ("team-lead")
```

### Task Creation (Single Turn)

```
# ===============================================
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ===============================================

FOR EACH task in plan (excluding done):
  TaskCreate(
    subject="{task.id}:Work -- {task.action}",
    description=WORKER_DESCRIPTION(task.id),
    owner=null  # unassigned -- workers claim from TaskList
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

# Cross-task dependencies (from spec.json depends_on)
FOR EACH task WHERE task.depends_on is not empty:
  FOR EACH dep_id in task.depends_on:
    producer = task_ids[dep_id]
    consumer = task_ids[task.id]
    TaskUpdate(taskId=producer, addBlocks=[consumer])

# All work tasks -> Finalize:Verify
FOR EACH task in plan:
  TaskUpdate(taskId=task_ids[task.id], addBlocks=[verify_task])

# Finalize chain: Verify -> Report
TaskUpdate(taskId=verify_task, addBlocks=[report_task])
```

**Key rule**: Two turns only. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Worker Preamble

Template injected into each worker's spawn prompt. Workers are persistent --
they claim multiple tasks from TaskList, not just one.

```
WORKER_PREAMBLE(team_name, worker_name, spec_path, CONTEXT_DIR) = """
You are a TEAM WORKER in team "{team_name}". Your name is "{worker_name}".
You report to the team lead ("team-lead").
You are not the leader and must not perform leader orchestration actions.

== WORK PROTOCOL ==

1. CLAIM: Call TaskList to see available tasks.
   Pick the first task with status "pending", owner null, and no unresolved blockedBy.
   NEVER claim a task that is already "in_progress" or has an owner set.
   Call TaskUpdate to set status "in_progress" and owner "{worker_name}":
   {"taskId": "ID", "status": "in_progress", "owner": "{worker_name}"}

2. WORK: Execute the task.
   - Read task spec: hoyeon-cli spec task {task_id} --get {spec_path}
   - Read context: {CONTEXT_DIR}/learnings.json, {CONTEXT_DIR}/issues.json (if exist)
   - Implement using Read, Write, Edit, Bash, Grep, Glob
   - Respect constraints from spec
   - Verify: check fulfills[] -> requirements -> sub-requirements (GWT when available)
   - Run build/lint/typecheck to ensure nothing is broken

3. COMPLETE: When done, mark the task completed:
   {"taskId": "ID", "status": "completed"}
   Update spec: hoyeon-cli spec task {task_id} --status done --summary '...' {spec_path}

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

6. NEXT: Call TaskList -> claim next unblocked pending task (go to step 1).
   If no tasks available, notify lead:
   {"type": "message", "recipient": "team-lead",
    "content": "All available tasks complete. Standing by.",
    "summary": "Standing by"}

7. SHUTDOWN: On shutdown_request -> respond with:
   {"type": "shutdown_response", "request_id": "<from the request>", "approve": true}

== RULES ==
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

Task-level description stored in TaskCreate. Workers self-read details via CLI.

```
WORKER_DESCRIPTION(task_id) = """
You are a Worker in TEAM mode. Implement task {task_id}.
Work in the current directory (session CWD).

## Step 1: Read your task spec
Run: `hoyeon-cli spec task {task_id} --get {spec_path}`
This returns JSON with: action, fulfills, depends_on.

## Step 2: Resolve dependency inputs (if any)
If your task has depends_on, fetch each dependency:
Run: `hoyeon-cli spec task {dep_id} --get {spec_path}`
Use its outputs to understand what was produced.

## Step 3: Read context files
Read: {CONTEXT_DIR}/learnings.json -- structured learnings from previous workers (if exists)
Read: {CONTEXT_DIR}/issues.json -- failed approaches to avoid (if exists)

## Step 4: Implement
Follow the task action from your task spec.
Respect constraints.
Do NOT run git commands -- lead handles commits.

### Verification before reporting DONE
1. **Behavioral check**: Look up fulfills[] -> requirements -> sub-requirements.
   Each sub-req's GWT fields (given/when/then) define structured acceptance criteria
   when available; behavior serves as summary. Verify your implementation satisfies all.
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
    prompt=WORKER_PREAMBLE(team_name, "worker-{i}", spec_path, CONTEXT_DIR),
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
#   - On completion: log progress, check if all tasks done
#   - On failure: log_to_audit + reassign or halt (see Watchdog)
#   - On standing by: check if verify phase should start
#   - On blocked: log_to_audit + unblock or reassign

# IMPORTANT: On FAILED or BLOCKED messages, lead MUST append to audit.md:
IF worker reports BLOCKED for task:
  log_to_audit("BLOCKED: {task_id} from {worker} — {reason}")
  # Then proceed to scope fix (derive + reassign)

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

# 10min stuck -> reassign task to another worker
IF time_since_last_message(worker) > 10min:
  stuck_task = find_in_progress_task(worker)
  TaskUpdate(taskId=stuck_task, owner=null, status="pending")
  SendMessage(type="message", recipient="team-lead",
    content="Reassigned {stuck_task} from {worker} -- unresponsive",
    summary="Task reassigned")

# Worker FAILED -> reassign to different worker (NOT halt)
IF worker reports FAILED for task:
  TaskUpdate(taskId=failed_task, owner=null, status="pending")
  log_to_audit("REASSIGN: {task_id} from {worker} -- worker reported FAILED")
  # Another worker will claim it from TaskList
  # If task fails 2+ times across different workers -> HALT
  IF failure_count(task_id) >= 2:
    log_to_audit("HALT: {task_id} failed {failure_count} times across workers")
    HALT
```

### All Tasks Done

```
# When all work tasks are completed (Finalize tasks still pending):
# -> Proceed to Phase 1.5: Verify Stage
```

---

## Phase 1.5: Verify Stage

```
# Verify routing based on user's verify tier selection from Phase 0.5:
Read the verify recipe:
  light    -> ${baseDir}/references/verify-light.md
  standard -> ${baseDir}/references/verify-standard.md
  thorough -> ${baseDir}/references/verify-thorough.md

# In TEAM mode, ALWAYS spawn a dedicated verifier (fresh context, no pollution from implementation work):
Agent(
  subagent_type="worker",
  team_name=team_name,
  name="verifier-1",
  description="Verification worker",
  prompt=WORKER_PREAMBLE(team_name, "verifier-1", spec_path, CONTEXT_DIR) +
         "\nYour task: Execute Finalize:Verify using {verify_recipe_path}. " +
         "Spec: {spec_path}. Report results via SendMessage to team-lead.",
  run_in_background=true
)
TaskUpdate(taskId=verify_task, owner="verifier-1", status="in_progress")
```

---

## Phase 1.6: Fix Stage (on verify failure)

```
IF verify result == FAIL:
  fix_attempt = 0
  MAX_FIX_LOOPS = 3

  WHILE fix_attempt < MAX_FIX_LOOPS:
    fix_attempt += 1
    fix_tasks = []

    FOR EACH failure in verify_result.failures:
      derive_result = Bash("""hoyeon-cli spec derive \
        --parent {failure.related_task_id ?? last_task_id} \
        --source verify \
        --trigger verify_fix \
        --action "Fix: {failure.description}" \
        --reason "Verify failure: {failure.reason}" \
        {spec_path}""")

      fix_task_id = derive_result.created
      fix_tasks.append(fix_task_id)

      # Create tracking task in TeamCreate TaskList
      TaskCreate(
        subject="{fix_task_id}:Work -- Fix: {failure.description}",
        description=WORKER_DESCRIPTION(fix_task_id),
        owner=null
      )

    log_to_audit("VERIFY_FIX attempt {fix_attempt}: created {len(fix_tasks)} fix tasks")

    # Idle workers claim fix tasks from TaskList automatically
    # Wait for fix task completions via SendMessage

    # After all fix tasks done -> re-verify
    verify_result = run_verify(verify_tier)

    IF verify_result == PASS:
      TaskUpdate(taskId=verify_task, status="completed")
      BREAK

  IF verify_result != PASS:
    log_to_audit("HALT: Verify failed after {MAX_FIX_LOOPS} fix attempts")
    HALT
```

---

## Phase 2: Shutdown + Finalize

### Graceful Shutdown

```
# Step 1: Verify completion
# All work tasks and verify task must be completed

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
          prompt="Commit all changes from spec: {spec.meta.goal}")
```

### Report

```
spec = Read(spec_path) -> parse JSON
audit = Read("{CONTEXT_DIR}/audit.md")

print("""
===================================================
              EXECUTE-V2 COMPLETE (TEAM)
===================================================

SPEC: {spec_path}
GOAL: {spec.meta.goal}
DISPATCH: team
WORK: {work_mode}
VERIFY: {verify_tier}
WORKERS: {N} spawned

---------------------------------------------------
TASKS
---------------------------------------------------
{FOR EACH task in spec.tasks:}
{task.id}: {task.action} -- {task.status}
  {task.summary}

---------------------------------------------------
VERIFICATION
---------------------------------------------------
{Verify tier results}

---------------------------------------------------
ADAPTATIONS
---------------------------------------------------
{List any derived fix tasks from verify failures, or "None"}

---------------------------------------------------
CONTEXT
---------------------------------------------------
Learnings: {count} entries
Issues: {count} entries
Audit: {count} events

---------------------------------------------------
MANUAL REVIEW (require human verification)
---------------------------------------------------
{FOR EACH req in (spec.requirements ?? []):}
{FOR EACH sub_req where verified_by == "human":}
- {sub_req.id}: {sub_req.description}

{IF no manual items: "None"}

---------------------------------------------------
POST-WORK (human actions after completion)
---------------------------------------------------
{post_work = spec.external_dependencies.post_work ?? []}
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
| `history.json` | CLI auto | CLI auto (on merge/task/derive) | analysis only |

### Worker Context Flow

Workers self-read context files — lead does NOT read them during dispatch.
This saves lead tokens and survives compaction.

```
Worker claims task → reads learnings.json + issues.json
  → implements task
  → writes learnings/issues via CLI
  → reports to lead via SendMessage
```

### Lead Audit Log

The lead writes to `audit.md` for:
- Worker BLOCKED events (scope blocker detected, derived fix task created)
- Worker FAILED events (task failure, reassignment)
- Verify fix events (verify failure, fix tasks created)
- Reassignment events (watchdog timeout, task moved to different worker)

Format:
```
## {task_id} — {timestamp}
Event: {BLOCKED|FAILED|VERIFY_FIX|REASSIGN}
Worker: {worker_name}
Reason: {reason}
Action: {what was done — derive, reassign, halt}
```

### spec.json Update Responsibilities

| Actor | Updates | Via |
|-------|---------|-----|
| lead | meta.mode (dispatch/work/verify) | `spec merge` |
| lead | context.sandbox_capability | `spec merge` |
| workers | tasks[].status → done | `spec task --status done` |
| lead | tasks[].status → blocked | `spec task --status blocked` |
| lead | new derived tasks | `spec derive` |
| lead | final consistency check | `spec check` (read-only) |

---

## Team-specific Rules

1. **Workers are persistent** -- spawned once, they claim and execute multiple tasks. Do NOT spawn a new worker per task.
2. **Claim-based dispatch** -- workers pick tasks from TaskList (unassigned, unblocked, pending). The lead does NOT assign tasks to specific workers.
3. **FAILED tasks -> reassign** -- unlike AGENT mode which halts on worker failure, TEAM mode reassigns the failed task to a different worker. Halt only after 2+ failures on the same task.
4. **SendMessage for all communication** -- workers report completion, failure, and standing-by status via SendMessage to "team-lead". Lead sends status checks and reassignments via SendMessage.
5. **No per-task commit** -- TEAM mode uses end-of-execution commit (or round-level if configured). Workers MUST NOT run git commands.
6. **Shutdown protocol is mandatory** -- always send shutdown_request to every worker and wait for shutdown_response before calling TeamDelete. No orphaned workers.
7. **Two turns for task setup** -- Turn 1: all TaskCreate, Turn 2: all TaskUpdate (same as AGENT mode).
8. **Workers self-read everything** -- workers use `hoyeon-cli spec task --get` and read context files themselves. Lead does NOT read spec.json or context files during dispatch.
9. **Description = recipe** -- TaskCreate description contains the full self-read recipe. At dispatch time, the worker preamble plus description provide all instructions.
10. **Adaptation updates spec.json** -- new fix tasks go through `spec derive` (handles ID generation, origin=derived, derived_from, depends_on automatically).
11. **Max 5 workers** -- `N = min(ceil(parallel_tasks / 2), 5)`. More workers add coordination overhead without proportional throughput.
12. **Verify stage uses existing recipes** -- TEAM mode loads the same verify recipes as other dispatch modes. The only difference is that a worker (or dedicated verifier) executes the recipe, not the orchestrator.

---

## Checklist

- [ ] Worker count calculated: `N = min(ceil(parallel_tasks / 2), 5)`
- [ ] TeamCreate called with `exec-{spec-name}` slug
- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] Worker preamble includes: claim protocol, SendMessage, shutdown response, no-git rule
- [ ] N workers spawned in parallel with `run_in_background=true`
- [ ] Lead monitors via SendMessage (no polling)
- [ ] Watchdog: 5min status check, 10min reassign
- [ ] Failed tasks reassigned (not halted) -- halt after 2+ failures on same task
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Verify recipe executed by idle worker or dedicated verifier
- [ ] Fix loop bounded by max 3 attempts
- [ ] Shutdown: shutdown_request sent to all workers, shutdown_response received
- [ ] TeamDelete called after all workers confirmed shutdown
- [ ] Commit handled (end-of-execution, not per-task)
- [ ] Final report output with TEAM-specific fields (worker count, dispatch mode)
