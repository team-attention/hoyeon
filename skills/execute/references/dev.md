# Dev Pipeline Reference

This file contains all dev-specific execution logic for the `/execute` skill.
It is loaded when `meta.type == "dev"` (or absent) after Phase 0 completes.

**Prerequisite**: Phase 0 (Find Spec, Get Plan, Init Context, Confirm Pre-work) is already done.
`spec_path`, `plan`, `CONTEXT_DIR`, and `meta_type` are all established.

---

## Mode Selection

### Resolution Order

`{depth}` is resolved in priority order:

1. **CLI override**: `--quick` flag → `{depth}` = quick
2. **spec.json** (default): `meta.mode.depth` from spec.json → `{depth}` = value
3. **Fallback**: if neither exists → `{depth}` = standard

```
IF --quick flag present:
  depth = "quick"
ELSE IF spec.meta.mode.depth exists:
  depth = spec.meta.mode.depth    # "quick" | "standard"
ELSE:
  depth = "standard"
```

Examples:
- `/execute` → reads `meta.mode.depth` from spec.json (set by specify)
- `/execute --quick` → override to quick regardless of spec
- `/execute my-feature` → reads mode from my-feature's spec.json

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
| Final Verify | Holistic spec verification (after Code Review) | Holistic spec verification |

---

## Phase 0.5: Create Tracking Tasks

Create TaskCreate entries for all tasks. **Batch all in one turn.**

### Standard Mode

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

FOR EACH task in plan (flattened from rounds, excluding done):
  w  = TaskCreate(subject="{task.id}.1:Worker — {task.action}",
                  description=WORKER_DESCRIPTION(task.id),
                  activeForm="{task.id}.1: Running Worker")
  v  = TaskCreate(subject="{task.id}.2:Verify",
                  description=VERIFY_DESCRIPTION(task.id),
                  activeForm="{task.id}.2: Verifying")
  cm = TaskCreate(subject="{task.id}.3:Commit",
                  description="Commit {task.id} changes.",
                  activeForm="{task.id}.3: Committing")

# Finalize tasks
rc = TaskCreate(subject="Finalize:Residual Commit", ...)
cr = TaskCreate(subject="Finalize:Code Review",
     description="Review complete diff for integration issues.",
     activeForm="Reviewing all changes")
fv = TaskCreate(subject="Finalize:Final Verify",
     description="Holistic spec verification (goal, constraints, AC, requirements, deliverables).",
     activeForm="Running final verification")
rp = TaskCreate(subject="Finalize:Report",
     activeForm="Generating report")
```

### Quick Mode

```
FOR EACH task in plan (flattened, excluding done):
  w  = TaskCreate(subject="{task.id}.1:Worker — {task.action}",
                  description=WORKER_DESCRIPTION(task.id),
                  activeForm="{task.id}.1: Running Worker")
  cm = TaskCreate(subject="{task.id}.2:Commit",
                  description="Commit {task.id} changes.",
                  activeForm="{task.id}.2: Committing")

# Finalize tasks
rc = TaskCreate(subject="Finalize:Residual Commit", ...)
fv = TaskCreate(subject="Finalize:Final Verify",
     description="Holistic spec verification (goal, constraints, AC, requirements, deliverables).",
     activeForm="Running final verification")
rp = TaskCreate(subject="Finalize:Report",
     activeForm="Generating report")
```

### Description Templates

> **Why descriptions, not orchestrator-built prompts?**
> Workers self-read task details via `cli`. This means:
> 1. **Orchestrator saves tokens** — no need to Read spec.json or context files
> 2. **Compaction-resilient** — even if orchestrator context is compressed, the description
>    in TaskCreate survives and workers can always re-fetch from CLI/files
> 3. **Self-contained** — each worker has all instructions to operate independently

```
WORKER_DESCRIPTION(task_id) = """
You are a Worker agent. Implement task {task_id}.

## Step 1: Read your task spec
Run: `hoyeon-cli spec task {task_id} --get {spec_path}`
This returns JSON with: action, steps, file_scope, acceptance_criteria,
must_not_do, inputs, outputs, references.

## Step 2: Resolve dependency inputs (if any)
If your task has `inputs[].from_task`, fetch each dependency:
Run: `hoyeon-cli spec task {from_task} --get {spec_path}`
Use its `outputs` to understand what was produced.

## Step 3: Read context files
Read: {CONTEXT_DIR}/learnings.md — conventions & patterns from previous workers
Read: {CONTEXT_DIR}/issues.md — failed approaches to avoid

## Step 4: Implement
Follow the steps and file_scope from your task spec.
Meet ALL acceptance_criteria (run commands to verify before reporting DONE).
Respect must_not_do constraints.
Do NOT run git commands — Orchestrator handles commits.

### Verifying acceptance_criteria (v5 schema)
Task AC has two parts:
1. `acceptance_criteria.scenarios[]` — list of scenario IDs from `requirements[].scenarios[].id`
   - Fetch full spec: `hoyeon-cli spec task {task_id} --get {spec_path}` to get scenario IDs
   - Then look up each scenario in `requirements[].scenarios[]` to find verify commands
   - Run each `verified_by: "machine"` scenario's `verify.run` command (skip `execution_env: "sandbox"` — unless this task's ID starts with T_SV, in which case sandbox scenarios MUST be executed)
   - For `verified_by: "agent"` scenarios, assert the checks manually
   - For `verified_by: "human"` scenarios, skip (report only)
   - After verifying each scenario, record the result:
     Run: `hoyeon-cli spec requirement {scenario_id} --status pass|fail --task {task_id} {spec_path}`
2. `acceptance_criteria.checks[]` — automated checks (static/build/lint/format)
   - Run each check's `run` command and verify exit code 0

Note: If this task's ID starts with T_SV, it is a sandbox verification task — do NOT skip sandbox scenarios. Run them and record each result with `hoyeon-cli spec requirement`.

## Step 5: Update context files
Append to {CONTEXT_DIR}/learnings.md:
  ## {task_id}
  - learning 1
  - learning 2

Append to {CONTEXT_DIR}/issues.md (if any):
  ## {task_id}
  - issue 1

Only append with ## {task_id} header — do NOT overwrite existing content.

## Output (print as last message)
```json
{"status": "DONE"|"FAILED", "summary": "...", "files_modified": [...],
 "acceptance_criteria": [{"id":"...", "category":"...", "status":"PASS|FAIL", "reason":"..."}]}
```
"""

VERIFY_DESCRIPTION(task_id) = """
You are a Verification agent. Verify task {task_id} independently.

## Step 1: Read task spec
Run: `hoyeon-cli spec task {task_id} --get {spec_path}`

## Step 2: Run ALL acceptance criteria
Re-execute every check yourself. Do NOT trust the Worker's self-reported status.

### AC verification (v5 schema)
Task AC has two parts:
1. `acceptance_criteria.scenarios[]` — list of scenario IDs from `requirements[].scenarios[].id`
   - Look up each scenario ID in the full spec's `requirements[].scenarios[]`
   - Run each `verified_by: "machine"` scenario's `verify.run` command (skip `execution_env: "sandbox"` — unless this task's ID starts with T_SV, in which case sandbox scenarios MUST be executed)
   - For `verified_by: "agent"` scenarios, assert the checks manually
   - For `verified_by: "human"` scenarios, skip (report only)
   - After verifying each scenario, record the result:
     Run: `hoyeon-cli spec requirement {scenario_id} --status pass|fail --task {task_id} {spec_path}`
2. `acceptance_criteria.checks[]` — automated checks (static/build/lint/format)
   - Run each check's `run` command and verify exit code 0

Note: If this task's ID starts with T_SV, it is a sandbox verification task — do NOT skip sandbox scenarios. Run them and record each result with `hoyeon-cli spec requirement`.

## Step 3: Check must_not_do violations
Run `git diff` to check for violations.

## Step 4: Scope blockage detection
If failure stems from SCOPE limitations (not code errors), populate
`suggested_adaptation` in your output.

## Output (strict JSON)
```json
{"status": "VERIFIED"|"FAILED",
 "acceptance_criteria": {"pass": N, "fail": N, "results": [...]},
 "must_not_do_violations": [...],
 "suggested_adaptation": null | {"type": "...", "reason": "...", "proposal": "..."}}
```
"""
```

### Set Dependencies (TURN 2)

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

# Standard finalize chain: Residual Commit → Code Review → Final Verify → Report
TaskUpdate(taskId=rc, addBlocks=[cr])
TaskUpdate(taskId=cr, addBlocks=[fv])
TaskUpdate(taskId=fv, addBlocks=[rp])

# Quick finalize chain: Residual Commit → Final Verify → Report
TaskUpdate(taskId=rc, addBlocks=[fv])
TaskUpdate(taskId=fv, addBlocks=[rp])
```

**Key rule**: NEVER create tasks one-by-one across multiple turns. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Phase 1: Execute Loop

> **Compaction recovery**: `session-compact-hook.sh` re-injects skill name + state.json path.
> Read state.json to get spec_path, then use `hoyeon-cli spec plan` to rebuild task state.
> Workers self-read task details via `hoyeon-cli spec task <id> --get` and context files.

```
WHILE TaskList() has pending tasks:
  runnable = TaskList().filter(status=="pending" AND blockedBy==empty)

  IF len(runnable) == 0:
    BREAK  # all done or deadlock

  # Workers self-read context files — orchestrator does NOT read them here.
  # This saves orchestrator tokens and survives compaction.

  # Dispatch by task subject suffix
  dispatch_all(runnable)
```

### Parallel Dispatch Rules

```
IF len(runnable) > 1 AND all are :Worker or :Verify:
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

### Derived Task Helpers

When `spec derive` creates a new task in spec.json, the orchestrator must also create
Claude Code tracking tasks (TaskCreate/TaskUpdate) to keep both DAGs in sync.

```
function dispatch_derived_task(derive_result, spec_path, depth):
  """
  After spec derive, create tracking tasks and dispatch worker.
  Returns {task_id, worker, commit} for the caller to chain dependencies.
  """
  task_id = derive_result.created        # e.g. "T1.retry-1"
  task_action = derive_result.action     # from derive JSON output

  # 1. Create tracking tasks
  fw = TaskCreate(
    subject="{task_id}.1:Worker — {task_action}",
    description=WORKER_DESCRIPTION(task_id),
    activeForm="{task_id}.1: Running Worker")

  IF depth == "standard":
    fv = TaskCreate(subject="{task_id}.2:Verify",
                    description=VERIFY_DESCRIPTION(task_id),
                    activeForm="{task_id}.2: Verifying")
    fc = TaskCreate(subject="{task_id}.3:Commit",
                    description="Commit {task_id} changes.",
                    activeForm="{task_id}.3: Committing")
    TaskUpdate(taskId=fw, addBlocks=[fv])
    TaskUpdate(taskId=fv, addBlocks=[fc])
  ELSE:  # quick
    fc = TaskCreate(subject="{task_id}.2:Commit",
                    description="Commit {task_id} changes.",
                    activeForm="{task_id}.2: Committing")
    TaskUpdate(taskId=fw, addBlocks=[fc])

  # 2. Dispatch worker immediately
  TaskUpdate(taskId=fw, status="in_progress")
  Agent(subagent_type="worker", description="Implement: {task_id}",
        prompt=TaskGet(fw).description)

  # 3. On completion, mark spec task done
  Bash("hoyeon-cli spec task {task_id} --status done --summary '{result.summary}' {spec_path}")
  TaskUpdate(taskId=fw, status="completed")

  return {task_id: task_id, worker: fw, commit: fc}


function dispatch_fv_fix(derive_result, spec_path):
  """
  Lightweight dispatch for Final Verify fixes — NO per-task verify, NO per-task commit.
  FV fixes are committed together after all fixes complete.
  """
  task_id = derive_result.created

  fw = TaskCreate(
    subject="{task_id}.1:Worker — FV fix",
    description=WORKER_DESCRIPTION(task_id),
    activeForm="{task_id}.1: FV fix")

  TaskUpdate(taskId=fw, status="in_progress")
  Agent(subagent_type="worker", description="FV fix: {task_id}",
        prompt=TaskGet(fw).description)

  Bash("hoyeon-cli spec task {task_id} --status done --summary 'FV fix applied' {spec_path}")
  TaskUpdate(taskId=fw, status="completed")
```

---

### 1a. :Worker — Delegate Implementation

> **Self-read pattern**: The orchestrator does NOT read spec.json or context files.
> The worker's description (set at TaskCreate time) contains all instructions for
> the worker to self-read via `cli` and context files.

```
# Description was already set in Phase 0.5 TaskCreate via WORKER_DESCRIPTION(task_id).
# The orchestrator simply dispatches — no spec.json read, no context file read.

Agent(
  subagent_type="worker",
  description="Implement: {task_id}",
  prompt=TaskGet(task.id).description,  # re-use the description from TaskCreate
  run_in_background=true  # if parallel round
)
```

**On completion:**

```
IF result.status == "DONE":
  Bash("hoyeon-cli spec task {task_id} --status in_progress {spec_path}")
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

Dispatch a verify worker. The description was already set at TaskCreate time via `VERIFY_DESCRIPTION(task_id)`.

```
# Description was already set in Phase 0.5 TaskCreate via VERIFY_DESCRIPTION(task_id).
# The verifier self-reads task spec via cli and runs acceptance criteria commands.

Agent(
  subagent_type="worker",
  description="Verify: {task_id} acceptance criteria",
  prompt=TaskGet(task.id).description,  # re-use the description from TaskCreate
  run_in_background=true  # if parallel round
)
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

  # task_type comes from the initial `spec plan` output (Phase 0), not from reading spec.json here.
  # Under compaction, the SessionStart hook re-injects plan data.
  task_type = plan_data[task_id].type  # "work" | "verification"
  disposition = triage(verify_result, task_type)

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
  failed_summary = failed.map(f => f.description).join(", ")

  # Track retry and dispatch fix worker via shared helper
  derive_result = Bash("""hoyeon-cli spec derive \
    --parent {task_id} \
    --source verify \
    --trigger retry \
    --action "Retry: fix {failed_summary}" \
    --reason "Attempt {attempt}: {failed_summary}" \
    {spec_path}""")

  tracking = dispatch_derived_task(derive_result, spec_path, depth)

  # Re-verify the ORIGINAL task (not the derived one)
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

  # 1. Create derived fix task in spec.json + tracking tasks via helper
  derive_result = Bash("""hoyeon-cli spec derive \
    --parent {task_id} \
    --source verify \
    --trigger adapt \
    --action "{adaptation.suggested_todo.title}" \
    --reason "{adaptation.blockage_type}: {adaptation.reason}" \
    {spec_path}""")

  log_to_audit("ADAPT: created {derive_result.created} for {task_id} — {adaptation.blockage_type}")

  # 2. Dispatch via shared helper (creates TaskCreate + dependencies + dispatches worker)
  tracking = dispatch_derived_task(derive_result, spec_path, depth)

  # 3. Create re-verify task for original
  rv = TaskCreate(subject="{task_id}.R:Re-Verify",
       description="Re-verify {task_id} after fix {derive_result.created} applied.",
       activeForm="{task_id}: Re-verifying")

  # Chain: fix commit → re-verify original → finalize
  TaskUpdate(taskId=tracking.commit, addBlocks=[rv])
  TaskUpdate(taskId=rv, addBlocks=[rc])  # rc = Residual Commit

  # 4. Mark current verify as completed (adaptation handled)
  TaskUpdate(taskId=current_verify, status="completed")
  # Loop continues — fix task will be picked up
```

---

### 1c. :Commit — Per-Task Commit

```
# task_action comes from TaskGet(task.id).subject (e.g., "T1.3:Commit" → parent "T1.1:Worker — Project init")
# Or parse from the Worker TaskCreate subject which includes the action text.

Agent(
  subagent_type="git-master",
  description="Commit: {task_id}",
  prompt="""
    Commit changes for task {task_id}: {task_action from TaskCreate subject}
    Files modified: {from worker result or git status}
    Spec: {spec_path}
  """
)
```

On completion:

```
Bash("hoyeon-cli spec task {task_id} --status done --summary '{summary}' {spec_path}")
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
>
> **MUST delegate** — Even if git diff is empty (e.g. git-ignored deliverables),
> always dispatch `code-reviewer`. The orchestrator MUST NOT judge SHIP/NEEDS_FIXES itself.
> Pass the deliverable file paths so the reviewer can read them directly.

```
diff = Bash("git diff main...HEAD")

Agent(
  subagent_type="code-reviewer",
  description="Review all changes",
  prompt="""
    Review the complete diff for this spec: {spec.meta.goal}

    ## Git Diff
    ```
    {diff OR "(empty — all deliverables are in git-ignored directories)"}
    ```

    {IF diff is empty:}
    ## Deliverable Files (git-ignored)
    The following files were created but are git-ignored.
    Read them directly and review for quality:
    {FOR EACH task in spec.tasks where status == "done":}
    - {task.file_scope}

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

For each fix identified by the code reviewer, create and dispatch via shared helper:

```
FOR EACH fix in code_review_result.fixes:
  derive_result = Bash("""hoyeon-cli spec derive \
    --parent {closest_related_task_id or last_task_id} \
    --source code-reviewer \
    --trigger code_review \
    --action "{fix.title}" \
    --reason "{fix.reason}" \
    {spec_path}""")
  tracking = dispatch_derived_task(derive_result, spec_path, depth)
  log_to_audit("CODE_REVIEW: created {derive_result.created} — {fix.reason}")
```

- Execute fixes → re-review (max 1 round)

**If SHIP:**
- `TaskUpdate(taskId=cr, status="completed")`

### 2c. :Final Verify (Both Modes)

Holistic verification of the full spec — goal alignment, constraints, acceptance criteria,
requirements, and deliverables. Runs in **both** standard and quick modes.

```
Read: ${baseDir}/references/final-verify.md
Follow the usage instructions to dispatch the verification worker.
Provide spec_path and parsed spec JSON.
```

On completion:

```
IF result.status == "VERIFIED":
  TaskUpdate(taskId=fv, status="completed")
ELSE:
  # Classify failures — goal misalignment is unrecoverable
  IF result.goal_alignment.status == "FAIL":
    print("GOAL MISALIGNMENT — cannot auto-fix. HALT.")
    print("  Reason: {result.goal_alignment.reason}")
    HALT

  # For all other failures (constraints, AC, requirements, deliverables):
  # Create derived fix tasks and re-run Final Verify (max 2 attempts)
  fv_attempt = 0
  WHILE fv_attempt < 2:
    fv_attempt += 1
    fix_tasks = []

    FOR EACH category in [constraints, acceptance_criteria, requirements, deliverables]:
      FOR EACH failure in result[category].results.filter(r => r.status == "FAIL"):
        # Find the most relevant parent task (from failure context or last planned task)
        parent_task_id = failure.task_id ?? last_planned_task_id

        derive_result = Bash("""hoyeon-cli spec derive \
          --parent {parent_task_id} \
          --source final-verify \
          --trigger final_verify \
          --action "FV fix: {failure.description}" \
          --reason "Final Verify {category} failure: {failure.reason}" \
          {spec_path}""")
        fix_tasks.append(derive_result.created)

    log_to_audit("FINAL_VERIFY attempt {fv_attempt}: created {len(fix_tasks)} fix tasks")

    # Execute fix tasks via lightweight FV helper (no per-task verify, no per-task commit)
    FOR EACH fix_task_id in fix_tasks:
      dispatch_fv_fix({created: fix_task_id}, spec_path)

    # Commit all FV fixes together
    Agent(subagent_type="git-master", prompt="Commit Final Verify fixes")

    # Re-run Final Verify
    result = dispatch_final_verify_worker()

    IF result.status == "VERIFIED":
      TaskUpdate(taskId=fv, status="completed")
      BREAK

    # If goal alignment now fails, halt immediately (no further recovery)
    IF result.goal_alignment.status == "FAIL":
      print("GOAL MISALIGNMENT after FV fix — cannot auto-fix. HALT.")
      HALT

  IF result.status != "VERIFIED":
    print("Final Verify failed after {fv_attempt} recovery attempt(s). HALT.")
    FOR EACH category in [constraints, acceptance_criteria, requirements, deliverables]:
      FOR EACH failure in result[category].results.filter(r => r.status == "FAIL"):
        print("  [{category}] {failure.description} — {failure.reason}")
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
{Standard: Code Review verdict + Final Verify results}
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
MANUAL REVIEW (require human verification)
───────────────────────────────────────────────────
{FOR EACH req in (spec.requirements ?? []):}
{FOR EACH scenario where verified_by == "human":}
- {scenario.id}: {scenario.then}
  Check: {scenario.verify.ask}

{IF no manual items: "None"}

───────────────────────────────────────────────────
POST-WORK (human actions after completion)
───────────────────────────────────────────────────
{post_work = spec.external_dependencies.post_work ?? []}
{FOR EACH item in post_work:}
- [{item.id ?? ''}] {item.dependency}: {item.action}
  {IF item.command:} Run: `{item.command}`

{IF no post_work: "None"}
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

Worker descriptions (WORKER_DESCRIPTION / VERIFY_DESCRIPTION) include context file
read and update instructions. Workers self-read `{CONTEXT_DIR}/learnings.md` and
`{CONTEXT_DIR}/issues.md` directly, and append their findings after completing work.

The orchestrator does NOT read these files — only workers do.

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

## Dev-specific Rules

1. **spec.json is the ONLY source** — no PLAN.md, no state.json
2. **Always use cli** — `spec plan`, `spec task`, `spec merge`, `spec check`
3. **Two turns for task setup** — Turn 1: all TaskCreate, Turn 2: all TaskUpdate
4. **Dual tracking** — both spec.json (via `spec task`) and TaskList (via TaskUpdate)
5. **Workers self-read everything** — Workers use `hoyeon-cli spec task --get` and Read context files themselves. Orchestrator does NOT read spec.json or context files during dispatch. Orchestrator only writes audit.md.
6. **Description = recipe** — TaskCreate description contains the full self-read recipe (CLI commands, context paths, output format). At dispatch time, orchestrator just passes `TaskGet(id).description` as the Agent prompt.
7. **Per-task commit** — every task gets its own commit via git-master
8. **Verify is standard-only** — quick mode skips per-task verification
9. **Adaptation updates spec.json** — new tasks go through `spec derive` (handles ID generation, origin=derived, derived_from, depends_on, re-plan automatically)
10. **Max 2 retries** — after 2 failed retry attempts, HALT
11. **Background for parallel** — use `run_in_background: true` for round-parallel workers

---

## Checklists

### Standard Mode Checklist

- [ ] Mode resolved: `depth = "standard"`
- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] Worker descriptions use self-read pattern (WORKER_DESCRIPTION / VERIFY_DESCRIPTION)
- [ ] Orchestrator does NOT Read spec.json or context files during dispatch
- [ ] Per-task verify worker dispatched for each work task
- [ ] Reconciliation applied where needed (triage logged in audit.md)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Residual commit handled
- [ ] Code review completed (SHIP verdict or fixes applied)
- [ ] Final verify worker ran holistic spec verification (goal, constraints, AC, requirements, deliverables)
- [ ] Adaptations logged in audit.md
- [ ] Manual items listed for human follow-up
- [ ] Final report output

### Quick Mode Checklist

- [ ] Mode resolved: `depth = "quick"`
- [ ] No `:Verify` tasks created
- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] Worker descriptions use self-read pattern (WORKER_DESCRIPTION only — no VERIFY_DESCRIPTION)
- [ ] On any worker failure → immediate HALT (no retry, no adapt)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Residual commit handled
- [ ] No code review
- [ ] Final verify worker ran holistic spec verification (goal, constraints, AC, requirements, deliverables)
- [ ] Manual items listed for human follow-up
- [ ] Final report output
