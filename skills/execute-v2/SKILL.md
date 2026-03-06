---
name: execute-v2
description: |
  Spec-driven orchestrator that reads spec.json via dev-cli, dispatches workers,
  verifies acceptance criteria, and handles adaptation.
  Replaces /execute with spec.json-native execution (no PLAN.md).
  Use when: "/execute-v2", "execute v2", "실행해줘", "스펙 실행"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Edit
  - Write
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - TaskOutput
  - AskUserQuestion
validate_prompt: |
  All tasks in spec.json must have status "done" at completion.
  dev-cli spec check must pass (internal consistency).
  Context files (learnings.md, issues.md, audit.md) must exist and be populated.
  Final report must be output.
---

# /execute-v2 — Spec-Driven Orchestrator

**You are the conductor. You do not play instruments directly.**
Delegate to worker agents, verify results via verify workers, manage parallelization.
All task data comes from spec.json via `dev-cli spec plan`.

## Core Principles

1. **DELEGATE** — All code writing goes to `Agent(subagent_type="worker")`. You only Read, Grep, Glob, Bash (for orchestration), and manage Tasks.
2. **VERIFY** — After every Worker, dispatch a verify worker to independently check acceptance criteria. Workers can lie.
3. **PARALLELIZE** — Run all unblocked tasks within a round simultaneously via `run_in_background: true`.
4. **spec.json is truth** — Task status, adaptation, and progress all flow through `dev-cli spec` commands.
5. **Context flows forward** — Workers write learnings/issues to shared context files. Next workers read them.

---

## Mode Selection

### Flag Parsing

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | `{depth}` = quick | `{depth}` = standard |

Examples:
- `/execute-v2` → standard mode
- `/execute-v2 --quick` → quick mode
- `/execute-v2 my-feature` → standard, spec name = my-feature
- `/execute-v2 --quick my-feature` → quick mode with spec name

### Mode Variable

Throughout this document, `{depth}` refers to the resolved mode value:
- `{depth}` = `quick` | `standard`

### Quick vs Standard

| Aspect | Standard | Quick |
|--------|----------|-------|
| Per-task steps | Worker → Verify → Commit | Worker → Commit |
| Verify | Verify worker per task | Skipped |
| On failure | triage: HALT / ADAPT / RETRY (max 2) | HALT immediately |
| Parallel | Round-based background workers | Round-based background workers |
| Code Review | code-reviewer agent (SHIP/NEEDS_FIXES) | Skipped |
| Requirements Check | A-items from requirements[].scenarios | Skipped |
| Final Verify | Included in Requirements Check | Final verify worker (all acceptance criteria) |

---

## Phase 0: Initialize

### 0.1 Find Spec

```
IF arg given:
  spec_path = ".dev/specs/{arg}/spec.json"
ELSE:
  # Find most recently modified spec.json
  spec_path = most recent .dev/specs/*/spec.json
```

Read spec.json and validate:

```bash
node dev-cli/bin/dev-cli.js spec validate {spec_path}
node dev-cli/bin/dev-cli.js spec check {spec_path}
```

### 0.2 Get Execution Plan

```bash
plan_text = Bash("node dev-cli/bin/dev-cli.js spec plan {spec_path}")
plan_json = Bash("node dev-cli/bin/dev-cli.js spec plan {spec_path} --format json")
plan = JSON.parse(plan_json)
```

Display plan_text to user. Filter out already-done tasks:

```
FOR EACH round in plan.rounds:
  round.tasks = round.tasks.filter(t => t.status != "done")
plan.rounds = plan.rounds.filter(r => r.tasks.length > 0)
```

### 0.3 Init Context

```bash
CONTEXT_DIR=".dev/specs/{name}/context"
mkdir -p "$CONTEXT_DIR"
```

**First run** (no context files):
- Create `learnings.md` (empty — workers will append)
- Create `issues.md` (empty — workers will append)
- Create `audit.md` (empty — orchestrator will append)

**Resume** (context files exist):
- Read all three files into memory
- Determine progress from spec.json task statuses (not files)

### 0.4 Run Pre-work

If `external_dependencies.pre_work` exists with `blocking: true` items:

```
FOR EACH pre_work item where blocking == true:
  Bash(pre_work.command)
  IF exit_code != 0:
    print("Pre-work failed: {pre_work.action}")
    HALT
```

### 0.5 Create Tracking Tasks

Create TaskCreate entries for all tasks. **Batch all in one turn.**

#### Standard Mode

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

FOR EACH task in plan (flattened from rounds, excluding done):
  w  = TaskCreate(subject="{task.id}.1:Worker — {task.action}",
                  description="Implement {task.id}. Steps: {task.steps}. File scope: {task.file_scope}.",
                  activeForm="{task.id}.1: Running Worker")
  v  = TaskCreate(subject="{task.id}.2:Verify",
                  description="Verify acceptance criteria for {task.id}.",
                  activeForm="{task.id}.2: Verifying")
  cm = TaskCreate(subject="{task.id}.3:Commit",
                  description="Commit {task.id} changes.",
                  activeForm="{task.id}.3: Committing")

# Finalize tasks
rc = TaskCreate(subject="Finalize:Residual Commit", ...)
cr = TaskCreate(subject="Finalize:Code Review",
     description="Review complete diff for integration issues.",
     activeForm="Reviewing all changes")
rq = TaskCreate(subject="Finalize:Requirements Check",
     description="Run A-items from requirements[].scenarios.",
     activeForm="Checking requirements")
rp = TaskCreate(subject="Finalize:Report",
     activeForm="Generating report")
```

#### Quick Mode

```
FOR EACH task in plan (flattened, excluding done):
  w  = TaskCreate(subject="{task.id}.1:Worker — {task.action}",
                  description="Implement {task.id}.",
                  activeForm="{task.id}.1: Running Worker")
  cm = TaskCreate(subject="{task.id}.2:Commit",
                  description="Commit {task.id} changes.",
                  activeForm="{task.id}.2: Committing")

# Finalize tasks
rc = TaskCreate(subject="Finalize:Residual Commit", ...)
fv = TaskCreate(subject="Finalize:Final Verify",
     description="Run all acceptance criteria across all tasks.",
     activeForm="Running final verification")
rp = TaskCreate(subject="Finalize:Report",
     activeForm="Generating report")
```

#### Set Dependencies (TURN 2)

```
# ═══════════════════════════════════════════════════
# TURN 2: Set ALL dependencies in PARALLEL (single message)
# ═══════════════════════════════════════════════════

# Standard: Worker → Verify → Commit chain
FOR EACH task:
  TaskUpdate(taskId=w, addBlocks=[v])
  TaskUpdate(taskId=v, addBlocks=[cm])

# Quick: Worker → Commit chain
FOR EACH task:
  TaskUpdate(taskId=w, addBlocks=[cm])

# Cross-task dependencies (from spec.json depends_on)
FOR EACH task WHERE task.depends_on is not empty:
  FOR EACH dep_id in task.depends_on:
    producer_last = task_ids[dep_id].commit
    consumer_first = task_ids[task.id].worker
    TaskUpdate(taskId=producer_last, addBlocks=[consumer_first])

# All last steps → Residual Commit
all_last = [task_ids[T].commit for each T]
FOR EACH last in all_last:
  TaskUpdate(taskId=last, addBlocks=[rc])

# Standard finalize chain: Residual Commit → Code Review → Requirements Check → Report
TaskUpdate(taskId=rc, addBlocks=[cr])
TaskUpdate(taskId=cr, addBlocks=[rq])
TaskUpdate(taskId=rq, addBlocks=[rp])

# Quick finalize chain: Residual Commit → Final Verify → Report
TaskUpdate(taskId=rc, addBlocks=[fv])
TaskUpdate(taskId=fv, addBlocks=[rp])
```

**Key rule**: NEVER create tasks one-by-one across multiple turns. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Phase 1: Execute Loop

```
WHILE TaskList() has pending tasks:
  runnable = TaskList().filter(status=="pending" AND blockedBy==empty)

  IF len(runnable) == 0:
    BREAK  # all done or deadlock

  # Dispatch by task subject suffix
  dispatch_all(runnable)
```

### Parallel Dispatch Rules

```
IF len(runnable) > 1 AND all are :Worker or :Verify or :Commit:
  # PARALLEL — mark in_progress FIRST, then send ALL in ONE message
  FOR EACH task in runnable:
    TaskUpdate(taskId=task.id, status="in_progress")
  FOR EACH task in runnable (in single message):
    dispatch(task, run_in_background=true)
  # Wait for completion notifications (do NOT poll)
ELSE:
  # Sequential — dispatch one at a time
  dispatch(runnable[0])
```

**Which types can run in parallel:**
- `:Worker` — YES (if touching disjoint files per spec file_scope)
- `:Verify` — YES (read-only, no conflicts)
- `:Commit` — NO (git operations must be sequential)

---

### 1a. :Worker — Delegate Implementation

Read spec.json to get full task details, then build worker prompt:

```
spec = Read(spec_path) → parse JSON
task_spec = spec.tasks.find(t => t.id == task_id)

# Read context files for inherited wisdom
learnings = Read("{CONTEXT_DIR}/learnings.md")
issues = Read("{CONTEXT_DIR}/issues.md")

Agent(
  subagent_type="worker",
  description="Implement: {task_spec.action}",
  prompt="""
## TASK
{task_spec.action}

## STEPS
{task_spec.steps joined by newline, or "Implement as described" if empty}

## FILE SCOPE
{task_spec.file_scope joined by newline, or "Determine appropriate files"}

## EXPECTED OUTCOME
**Acceptance Criteria** (all must pass before reporting DONE):

Functional:
{task_spec.acceptance_criteria.functional[].description + command}

Static:
{task_spec.acceptance_criteria.static[].description + command}

Runtime:
{task_spec.acceptance_criteria.runtime[].description + command}

{IF task_spec.acceptance_criteria.cleanup:}
Cleanup:
{task_spec.acceptance_criteria.cleanup[].description}

## REFERENCES
{task_spec.references[] as file:line format}

## MUST NOT DO
{task_spec.must_not_do joined by newline}
- Do not perform other Tasks
- Do not add new dependencies
- Do not run git commands (Orchestrator handles this)

## CONTEXT

### Dependencies (from previous tasks)
{task_spec.inputs[] — resolve from spec.tasks where from_task matches, get outputs}

### Inherited Wisdom
SubAgent does not remember previous calls. Use this context.

**Conventions & learnings (from previous workers):**
{learnings content, or "None yet" if empty}

**Failed approaches to AVOID:**
{issues content, or "None yet" if empty}

## CONTEXT FILE UPDATE
After completing your work, update the shared context files:

1. **Append** learnings to: {CONTEXT_DIR}/learnings.md
   Format: `## {task_id}\n- learning 1\n- learning 2\n`
   Write discovered patterns, conventions, tips for next workers.

2. **Append** issues to: {CONTEXT_DIR}/issues.md
   Format: `## {task_id}\n- issue 1\n- issue 2\n`
   Write unresolved problems, things to avoid.

Only append — do NOT overwrite existing content.

## OUTPUT FORMAT
```json
{
  "status": "DONE" | "FAILED",
  "summary": "what was done",
  "files_modified": ["path1", "path2"],
  "acceptance_criteria": [
    {"id": "...", "category": "functional|static|runtime|cleanup",
     "description": "...", "command": "...", "status": "PASS|FAIL", "reason": "..."}
  ]
}
```
""")
```

**On completion:**

```
IF result.status == "DONE":
  Bash("node dev-cli/bin/dev-cli.js spec task {task_id} --status in_progress {spec_path}")
  TaskUpdate(taskId, status="completed")
  # Next: :Verify (standard) or :Commit (quick)

ELIF result.status == "FAILED":
  IF {depth} == "quick":
    log_to_audit("Worker FAILED for {task_id}, HALT (quick mode)")
    HALT
  ELSE:
    # Standard: proceed to :Verify which will detect and triage
    TaskUpdate(taskId, status="completed")
```

---

### 1b. :Verify — Verify Worker (Standard Only)

> **Mode Gate**: Quick mode SKIPS this entirely. `:Verify` tasks are not created.

Dispatch a verify worker that independently checks acceptance criteria and must-not-do violations.

```
spec = Read(spec_path) → parse JSON
task_spec = spec.tasks.find(t => t.id == task_id)

Agent(
  subagent_type="worker",
  description="Verify: {task_id} acceptance criteria",
  prompt="""
## TASK
You are a VERIFICATION worker. Independently verify that {task_id}'s
acceptance criteria are met AND must-not-do rules were not violated.

DO NOT write or modify any code. Only READ and RUN verification commands.

## ACCEPTANCE CRITERIA TO VERIFY

Run each command and report PASS/FAIL independently:

Functional:
{FOR EACH item in task_spec.acceptance_criteria.functional:}
- {item.description}
  Command: `{item.command}`
  Expected: exit code 0

Static:
{FOR EACH item in task_spec.acceptance_criteria.static:}
- {item.description}
  Command: `{item.command}`
  Expected: exit code 0

Runtime:
{FOR EACH item in task_spec.acceptance_criteria.runtime:}
- {item.description}
  Command: `{item.command}`
  Expected: exit code 0

Do NOT trust the Worker's self-reported PASS status.
Re-execute every command yourself and judge independently.

## MUST-NOT-DO VIOLATIONS TO CHECK
{task_spec.must_not_do joined by newline}
- No other Tasks performed
- No new dependencies added
- No git commands run

Check `git diff` (staged + unstaged) for violations.

## SCOPE BLOCKAGE DETECTION
If a failure stems from SCOPE limitations (not Worker error), populate
`suggested_adaptation`:
- scope_violation: Acceptance criteria requires out-of-scope work
- dod_gap: DoD criterion cannot be met without expanding scope
- dependency_missing: Needs outputs not produced by any prior task

Only suggest adaptation for scope blockers, not code errors (those are retries).

## OUTPUT FORMAT (strict JSON)
```json
{
  "status": "VERIFIED" | "FAILED",
  "acceptance_criteria": {
    "pass": 0,
    "fail": 0,
    "results": [
      {
        "id": "criterion_id",
        "category": "functional|static|runtime",
        "description": "what was checked",
        "command": "command run",
        "status": "PASS|FAIL",
        "reason": "failure reason, if FAIL"
      }
    ]
  },
  "must_not_do": {
    "violations": [
      {"rule": "violated rule", "evidence": "what was found", "severity": "critical|warning"}
    ]
  },
  "suggested_adaptation": {
    "blockage_type": "scope_violation|dod_gap|dependency_missing",
    "suggested_todo": {
      "title": "concise TODO title",
      "reason": "why current scope cannot satisfy this criterion",
      "steps": ["step 1", "step 2"],
      "file_scope": ["affected/files"]
    }
  }
}
```

## MUST NOT DO
- Do not modify any files
- Do not write code or fix issues
- Do not run git commands (except read-only: git diff, git status)
- Only verify — report results objectively
""")
```

**Route by result:**

```
IF verify_result.status == "VERIFIED":
  TaskUpdate(taskId, status="completed")
  # → :Commit becomes runnable

ELIF verify_result.status == "FAILED":
  reconcile(task_id, verify_result, attempt=0)
```

---

### 1b.1 Reconciliation (Standard Only)

Single-pass triage with precedence: **HALT > ADAPT > RETRY**.

```
function reconcile(task_id, verify_result, attempt):
  # Log to audit
  append_to_audit(task_id, verify_result)

  disposition = triage(verify_result, task_spec.type)

  IF disposition == HALT:
    log_to_issues(task_id, verify_result)
    log_to_audit("HALT: {reason}")
    HALT execution

  ELIF disposition == ADAPT:
    adapt(task_id, verify_result)

  ELIF disposition == RETRY:
    IF attempt >= 2:
      log_to_audit("RETRY exhausted for {task_id}, HALT")
      HALT
    retry(task_id, verify_result, attempt + 1)
```

**Triage rules:**

```
function triage(verify_result, task_type) → HALT | ADAPT | RETRY:
  # HALT (highest precedence)
  IF any must_not_do violation with severity == "critical" → HALT
  IF any env_error (permission, API key, network) → HALT

  # ADAPT (scope blocker or verification-type task)
  IF suggested_adaptation present → ADAPT
  IF task_type == "verification" AND any acceptance_criteria FAIL → ADAPT

  # RETRY (code error — work tasks only)
  IF any acceptance_criteria FAIL → RETRY
```

**Retry flow:**

```
function retry(task_id, verify_result, attempt):
  log_to_audit("RETRY attempt {attempt} for {task_id}")

  # Build fix prompt from failed criteria
  failed = verify_result.acceptance_criteria.results.filter(r => r.status == "FAIL")

  Agent(subagent_type="worker", prompt="""
    ## FIX TASK
    Previous implementation of {task_id} failed verification.

    ## FAILED CRITERIA
    {FOR EACH f in failed:}
    - {f.description}: {f.reason}
      Command: {f.command}

    ## MUST-NOT-DO VIOLATIONS
    {verify_result.must_not_do.violations}

    Fix these issues. Same rules as original task apply.
    Update context files ({CONTEXT_DIR}/learnings.md, issues.md) with what you learn.
  """)

  # Re-verify
  re_verify_result = dispatch_verify_worker(task_id)

  IF re_verify_result.status == "VERIFIED":
    TaskUpdate(taskId, status="completed")
    return

  # Re-triage
  reconcile(task_id, re_verify_result, attempt)
```

---

### 1b.2 Adaptation Flow

When verify detects a scope blocker, orchestrator creates a new fix task in spec.json.

```
function adapt(task_id, verify_result):
  adaptation = verify_result.suggested_adaptation
  # OR build from failed criteria if task_type == "verification"

  # 1. Add new fix task to spec.json
  fix_task_id = "T{next_id}"
  Bash("""node dev-cli/bin/dev-cli.js spec merge {spec_path} --json '{
    "tasks": [{
      "id": "{fix_task_id}",
      "action": "{adaptation.suggested_todo.title}",
      "type": "work",
      "status": "pending",
      "depends_on": ["{task_id}"],
      "steps": {adaptation.suggested_todo.steps as JSON array},
      "file_scope": {adaptation.suggested_todo.file_scope as JSON array},
      "must_not_do": ["Do not run git commands"],
      "acceptance_criteria": {
        "functional": [{"description": "Fix applied and working"}],
        "static": [{"description": "Type check passes", "command": "..."}],
        "runtime": [{"description": "Tests pass", "command": "..."}]
      }
    }]
  }'""")

  log_to_audit("ADAPT: created {fix_task_id} for {task_id} — {adaptation.blockage_type}")

  # 2. Re-plan to get updated DAG
  new_plan = Bash("node dev-cli/bin/dev-cli.js spec plan {spec_path} --format json")

  # 3. Create tracking tasks for the fix
  fw = TaskCreate(subject="{fix_task_id}.1:Worker — {adaptation.suggested_todo.title}", ...)
  fv = TaskCreate(subject="{fix_task_id}.2:Verify", ...)  # standard only
  fc = TaskCreate(subject="{fix_task_id}.3:Commit", ...)

  # Set dependencies: fix task depends on current task's commit
  # After fix completes, add a re-verify of original task

  # 4. Create re-verify task for original
  rv = TaskCreate(subject="{task_id}.R:Re-Verify",
       description="Re-verify {task_id} after fix {fix_task_id} applied.",
       activeForm="{task_id}: Re-verifying")

  # Chain: fix commit → re-verify original
  TaskUpdate(taskId=fc, addBlocks=[rv])
  # Re-verify blocks finalize
  TaskUpdate(taskId=rv, addBlocks=[rc])  # rc = Residual Commit

  # 5. Mark current verify as completed (adaptation handled)
  TaskUpdate(taskId=current_verify, status="completed")
  # Loop continues — fix task will be picked up
```

---

### 1c. :Commit — Per-Task Commit

```
Agent(
  subagent_type="git-master",
  description="Commit: {task_id}",
  prompt="""
    Commit changes for task {task_id}: {task_spec.action}
    Files modified: {from worker result or git status}
    Spec: {spec_path}
  """
)
```

On completion:

```
Bash("node dev-cli/bin/dev-cli.js spec task {task_id} --status done --summary '{summary}' {spec_path}")
TaskUpdate(taskId, status="completed")
```

---

## Phase 2: Finalize

After all task rounds complete, run finalize steps in order.

### 2a. :Residual Commit

```bash
git_status = Bash("git status --porcelain")
IF git_status is not empty:
  Agent(subagent_type="git-master", prompt="Commit remaining changes from spec: {spec.meta.goal}")
TaskUpdate(taskId=rc, status="completed")
```

### 2b. :Code Review (Standard Only)

> **Mode Gate**: Quick mode SKIPS this entirely.

```
Agent(
  subagent_type="code-reviewer",
  description="Review all changes",
  prompt="""
    Review the complete diff for this spec: {spec.meta.goal}

    ```
    {Bash("git diff main...HEAD")}
    ```

    Check for:
    - Integration issues between tasks
    - Hidden bugs, side effects
    - Design inconsistencies
    - OWASP top 10 vulnerabilities

    Return verdict: SHIP or NEEDS_FIXES with details.
  """
)
```

**If NEEDS_FIXES:**
- Create fix tasks via adaptation flow (same as 1b.2)
- Execute fixes → re-review (max 1 round)

**If SHIP:**
- `TaskUpdate(taskId=cr, status="completed")`

### 2c. :Requirements Check (Standard Only)

> **Mode Gate**: Quick mode uses `:Final Verify` instead.

Run A-items from `requirements[].scenarios` where `verified_by == "machine"` and `execution_env == "host"`:

```
spec = Read(spec_path) → parse JSON

FOR EACH req in spec.requirements:
  FOR EACH scenario in req.scenarios:
    IF scenario.verified_by == "machine" AND (scenario.execution_env == "host" OR !scenario.execution_env):
      result = Bash(scenario.verify.run)
      IF result.exit_code != scenario.verify.expect.exit_code:
        print("FAIL: {scenario.id} — {scenario.then}")
        failures.push(scenario)

IF failures.length > 0:
  # Create fix tasks for failed requirements
  adapt_from_requirements(failures)
ELSE:
  TaskUpdate(taskId=rq, status="completed")
```

For S-items (`execution_env == "sandbox"`), dispatch a verify worker:

```
Agent(subagent_type="worker", prompt="""
  Run sandbox verification scenarios.
  {FOR EACH scenario where execution_env == "sandbox":}
  - {scenario.id}: {scenario.verify.run} → expect exit {scenario.verify.expect.exit_code}
  Start sandbox, run tests, tear down, report results.
""")
```

### 2c-quick. :Final Verify (Quick Only)

> **Mode Gate**: Quick mode only. Replaces Code Review + Requirements Check.

Dispatch a verify worker with ALL tasks' acceptance criteria combined:

```
spec = Read(spec_path) → parse JSON

Agent(
  subagent_type="worker",
  description="Final verification of all tasks",
  prompt="""
  ## TASK
  You are a FINAL VERIFICATION worker. Verify ALL acceptance criteria
  across all completed tasks.

  DO NOT modify any files. Only READ and RUN verification commands.

  ## ACCEPTANCE CRITERIA
  {FOR EACH task in spec.tasks where status == "done":}
  ### {task.id}: {task.action}
  {FOR EACH category in [functional, static, runtime]:}
    {FOR EACH item in task.acceptance_criteria[category]:}
    - [{category}] {item.description}
      Command: `{item.command}`

  ## OUTPUT FORMAT
  ```json
  {
    "status": "VERIFIED" | "FAILED",
    "results": [
      {"task_id": "...", "criterion": "...", "status": "PASS|FAIL", "reason": "..."}
    ]
  }
  ```
  """
)

IF result.status == "VERIFIED":
  TaskUpdate(taskId=fv, status="completed")
ELSE:
  print("Final verification FAILED:")
  FOR EACH failure in result.results.filter(r => r.status == "FAIL"):
    print("  {failure.task_id}: {failure.criterion} — {failure.reason}")
  HALT
```

### 2d. :Report

```
spec = Read(spec_path) → parse JSON
audit = Read("{CONTEXT_DIR}/audit.md")

# Standard report
print("""
═══════════════════════════════════════════════════
              EXECUTE-V2 COMPLETE
═══════════════════════════════════════════════════

SPEC: {spec_path}
GOAL: {spec.meta.goal}
MODE: {depth}

───────────────────────────────────────────────────
TASKS
───────────────────────────────────────────────────
{FOR EACH task in spec.tasks:}
{task.id}: {task.action}  [{task.type}|{task.risk}] — {task.status}
  {task.summary}

───────────────────────────────────────────────────
VERIFICATION
───────────────────────────────────────────────────
{Standard: Code Review verdict + Requirements Check results}
{Quick: Final Verify results}

───────────────────────────────────────────────────
ADAPTATIONS
───────────────────────────────────────────────────
{List any dynamically created fix tasks, or "None"}

───────────────────────────────────────────────────
CONTEXT
───────────────────────────────────────────────────
Learnings: {count} entries
Issues: {count} entries
Audit: {count} triage decisions

───────────────────────────────────────────────────
H-ITEMS (require human verification)
───────────────────────────────────────────────────
{FOR EACH req in spec.requirements:}
{FOR EACH scenario where verified_by == "human":}
- {scenario.id}: {scenario.then}
  Check: {scenario.verify.ask}

{IF no H-items: "None"}
═══════════════════════════════════════════════════
""")

TaskUpdate(taskId=rp, status="completed")
```

---

## Context File Management

### File Structure

```
.dev/specs/{name}/context/
  learnings.md  — patterns, conventions discovered (workers append)
  issues.md     — failed approaches, unresolved problems (workers append)
  audit.md      — triage decisions, adaptation log (orchestrator appends)
```

### Worker Context Instructions

Every worker prompt includes instructions to update context files:

```
## CONTEXT FILE UPDATE
After completing your work, update the shared context files by appending:

1. {CONTEXT_DIR}/learnings.md
   Format:
   ## {task_id}
   - learning 1
   - learning 2

2. {CONTEXT_DIR}/issues.md
   Format:
   ## {task_id}
   - issue 1
   - issue 2

Only append with ## {task_id} header — do NOT overwrite existing content.
```

### Orchestrator Audit Log

The orchestrator writes to `audit.md` for:
- Triage decisions (HALT/ADAPT/RETRY with reason)
- Adaptation events (new task created, why)
- Retry attempts (attempt number, what changed)

Format:
```
## {task_id} — {timestamp}
Decision: {HALT|ADAPT|RETRY}
Reason: {reason}
Details: {verify result summary}
```

---

## Rules

1. **spec.json is the ONLY source** — no PLAN.md, no state.json
2. **Always use dev-cli** — `spec plan`, `spec task`, `spec merge`, `spec check`
3. **Two turns for task setup** — Turn 1: all TaskCreate, Turn 2: all TaskUpdate
4. **Dual tracking** — both spec.json (via `spec task`) and TaskList (via TaskUpdate)
5. **Workers write context** — orchestrator only writes audit.md
6. **Per-task commit** — every task gets its own commit via git-master
7. **Verify is standard-only** — quick mode skips per-task verification
8. **Adaptation updates spec.json** — new tasks go through `spec merge`, then re-plan
9. **Max 2 retries** — after 2 failed retry attempts, HALT
10. **Background for parallel** — use `run_in_background: true` for round-parallel workers

## Checklist Before Stopping

### Common (all modes)
- [ ] spec.json found and validated
- [ ] `dev-cli spec plan` executed and shown to user
- [ ] Context directory initialized (learnings.md, issues.md, audit.md)
- [ ] Pre-work executed (if blocking items exist)
- [ ] All TaskCreate in single turn, all TaskUpdate in single turn
- [ ] All spec tasks have `status: "done"` (via `dev-cli spec task`)
- [ ] `dev-cli spec check` passes at end
- [ ] Residual commit handled
- [ ] Final report output
- [ ] H-items listed for human follow-up

### Standard mode (additional)
- [ ] Per-task verify worker dispatched for each work task
- [ ] Reconciliation applied where needed (triage logged in audit.md)
- [ ] Code review completed (SHIP verdict or fixes applied)
- [ ] Requirements check completed (A-items + S-items)
- [ ] Adaptations logged in audit.md

### Quick mode (overrides)
- [ ] No per-task verify (`:Verify` tasks not created)
- [ ] Final verify worker ran all acceptance criteria
- [ ] On any worker failure → immediate HALT
- [ ] No code review
- [ ] No requirements check (final verify covers acceptance criteria)
