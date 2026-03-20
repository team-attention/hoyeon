# Dev Pipeline Reference

This file contains all dev-specific execution logic for the `/execute` skill.
It is loaded when `meta.type == "dev"` (or absent) after Phase 0 completes.

**Prerequisite**: Phase 0 (Find Spec, Get Plan, Init Context, Confirm Pre-work, Work Mode Selection) is already done.
`spec_path`, `plan`, `CONTEXT_DIR`, `meta_type`, `work_mode`, and `WORK_DIR` are all established.

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
| Per-task steps | Worker → Verify → Commit | Worker → Verify → Commit |
| On failure | Worker FAILED → HALT | Worker FAILED → HALT |
| Parallel | Round-based background workers | Round-based background workers |
| Code Review | code-reviewer agent (SHIP/NEEDS_FIXES) | Skipped |
| Final Verify | Holistic spec verification (after Code Review) | Holistic spec verification |

### Code Review Auto-Pass

Code Review can be auto-skipped when changes are small enough.
The orchestrator evaluates auto-pass conditions **before dispatching**.

| Gate | Auto-Pass Condition | What Gets Skipped |
|------|---------------------|-------------------|
| **Code Review** | Total `git diff --stat` shows ≤ 200 lines AND no new dependencies added (`package.json`, `Cargo.toml`, etc. unchanged) AND all tasks are risk "low" | `:Code Review` step |
| **Final Verify** | Never auto-passed | — (always runs) |

**How to evaluate:**

```
function should_auto_pass_code_review() → bool:
  IF depth == "quick": return true  # quick mode already skips code review
  diff_stat = Bash("git diff --stat main...HEAD")
  total_lines = parse_total_lines(diff_stat)
  dep_files_changed = Bash("git diff --name-only main...HEAD | grep -E '(package\\.json|Cargo\\.toml|go\\.mod|requirements\\.txt|pyproject\\.toml)'")
  all_low_risk = plan.tasks.every(t => t.risk == "low")
  return total_lines <= 200 AND dep_files_changed is empty AND all_low_risk
```

**When auto-pass fires:**
- Log to audit: `"AUTO_PASS: {gate} skipped — {reason}"`
- Mark the TaskCreate entry as completed immediately
- Continue to next step

**User override**: If the user explicitly requests `--no-auto-pass` or the spec contains `meta.force_review: true`, all gates run regardless.

---

## Phase 0.5: Create Tracking Tasks

Create TaskCreate entries for all tasks. **Batch all in one turn.**

### Worktree Note

When `work_mode == "worktree"`, the orchestrator has already called `EnterWorktree` in Phase 0.5.
Session CWD is inside the worktree — all tools (Read, Edit, Write, Bash, Glob, Grep) automatically
operate there. No per-worker `cd` is needed. `spec_path` and `CONTEXT_DIR` are absolute paths.

### Task Creation (Both Modes)

```
# ═══════════════════════════════════════════════════
# PRE-STEP: Build verify descriptions from CLI plan output
# ═══════════════════════════════════════════════════

# plan_json already has verify_plan per task (from Phase 0.2 formatSlim)
# For each task with sandbox entries in verify_plan, read recipe files

FOR EACH task in plan (flattened):
  task_verify_plan = task.verify_plan  # from formatSlim output

  # Collect sandbox recipes to inline
  sandbox_subjects = unique(task_verify_plan.filter(e => e.env == "sandbox").map(e => e.subject))
  sandbox_recipes = ""
  FOR EACH subject in sandbox_subjects:
    recipe_content = Read("${baseDir}/references/verify-recipes/{subject}.md")
    sandbox_recipes += "### Recipe: {subject}\n{recipe_content}\n\n"

  # Build description
  verify_description[task.id] = VERIFIER_DESCRIPTION(
    task.id,
    JSON.stringify(task_verify_plan, null, 2),
    sandbox_recipes || "None — no sandbox scenarios for this task."
  )

# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

FOR EACH task in plan (flattened from rounds, excluding done):
  w  = TaskCreate(subject="{task.id}.1:Worker — {task.action}",
                  description=WORKER_DESCRIPTION(task.id),
                  activeForm="{task.id}.1: Running Worker")

  # Skip Verify for verification-type tasks (they ARE verification — no need to verify the verifier)
  IF task.type != "verification":
    v  = TaskCreate(subject="{task.id}.V:Verify",
                    description=verify_description[task.id],
                    activeForm="{task.id}.V: Verifying scenarios")

  # Commit tasks only for worktree and branch-commit modes
  IF work_mode != "no-commit":
    cm = TaskCreate(subject="{task.id}.2:Commit",
                    description="Commit {task.id} changes.",
                    activeForm="{task.id}.2: Committing")

# Finalize tasks — commit-related steps only when commits are enabled
IF work_mode != "no-commit":
  rc = TaskCreate(subject="Finalize:Residual Commit", ...)

# Standard only: Code Review
IF depth == "standard":
  cr = TaskCreate(subject="Finalize:Code Review",
       description="Review complete diff for integration issues.",
       activeForm="Reviewing all changes")

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
Work in the current directory (session CWD — already set to worktree if applicable).

## Step 1: Read your task spec
Run: `hoyeon-cli spec task {task_id} --get {spec_path}`
This returns JSON with: action, steps, file_scope, acceptance_criteria,
must_not_do, inputs, outputs, references.

## Step 2: Resolve dependency inputs (if any)
If your task has `inputs[].from_task`, fetch each dependency:
Run: `hoyeon-cli spec task {from_task} --get {spec_path}`
Use its `outputs` to understand what was produced.

## Step 3: Read context files
Read: {CONTEXT_DIR}/learnings.json — structured learnings from previous workers (if exists)
Read: {CONTEXT_DIR}/issues.json — failed approaches to avoid (if exists)

## Step 4: Implement
Follow the steps and file_scope from your task spec.
Meet ALL acceptance_criteria (run commands to verify before reporting DONE).
Respect must_not_do constraints.
Do NOT run git commands — Orchestrator handles commits.

### Verifying acceptance_criteria (Tier 1 only)
Task AC has two parts — Worker handles checks[] only:
1. `acceptance_criteria.checks[]` — automated checks (static/build/lint/format)
   - Run each check's `run` command and verify exit code 0
2. `acceptance_criteria.scenarios[]` — DO NOT verify these. An independent Verifier agent will handle scenario verification after you complete.

Note: If this task's ID starts with T_SV, it is a sandbox verification task — you MUST run sandbox scenarios. Use `hoyeon-cli spec task {task_id} --get {spec_path}` to get scenario details and execute them.

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
 "tier1_checks": [{"type":"build|lint|static|format", "run":"...", "status":"PASS|FAIL"}],
 "scope_blockers": null | {"type": "missing_api|env_constraint|permission|dependency", "reason": "...", "suggested_fix": "..."}}
```

### Status meanings:
- **DONE**: All AC passed, implementation complete.
- **FAILED**: Implementation attempted but AC checks failed (code error).
- **BLOCKED**: Implementation blocked by scope limitation (not a code error).
  Populate `scope_blockers` with the blocker type and suggested fix.
  Examples: missing API key, permission denied, external service unavailable,
  dependency not yet implemented by another task.
"""
```

### Verifier Description Template

```
VERIFIER_DESCRIPTION(task_id, verify_plan_json, sandbox_recipes) = """
You are an independent Verifier agent. Verify task {task_id}.
You did NOT write this code — verify it objectively.
Work in the current directory (session CWD).

## Your Verify Plan

{verify_plan_json}

## Sandbox Recipes (if any)

{sandbox_recipes}

## Execution

Follow the verify_plan entries top-to-bottom.
For each entry, use the execution rules from your agent system prompt (machine/agent/sandbox/human).

Record each result:
  hoyeon-cli spec requirement {entry.scenario} --status pass|fail|pending --task {task_id} {spec_path}

## Output (print as last message)
{"status": "VERIFIED"|"FAILED",
 "scenarios": [{"id": "...", "method": "...", "status": "pass|fail|pending", "evidence": "..."}],
 "failed_count": 0,
 "pending_human_count": 0}
"""
```

### Set Dependencies (TURN 2)

```
# ═══════════════════════════════════════════════════
# TURN 2: Set ALL dependencies in PARALLEL (single message)
# ═══════════════════════════════════════════════════

IF work_mode != "no-commit":
  # Worker → Verify → Commit chain (verification-type tasks: Worker → Commit directly, no Verify)
  FOR EACH task:
    IF task.type == "verification":
      TaskUpdate(taskId=w, addBlocks=[cm])
    ELSE:
      TaskUpdate(taskId=w, addBlocks=[v])
      TaskUpdate(taskId=v, addBlocks=[cm])

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
  IF depth == "standard":
    TaskUpdate(taskId=rc, addBlocks=[cr])
    TaskUpdate(taskId=cr, addBlocks=[fv])
    TaskUpdate(taskId=fv, addBlocks=[rp])

  # Quick finalize chain: Residual Commit → Final Verify → Report
  IF depth == "quick":
    TaskUpdate(taskId=rc, addBlocks=[fv])
    TaskUpdate(taskId=fv, addBlocks=[rp])

ELSE:  # no-commit mode
  # Worker → Verify chain (no commit)
  # Verification-type tasks: Worker is the last step (no Verify)
  FOR EACH task:
    IF task.type != "verification":
      TaskUpdate(taskId=w, addBlocks=[v])

  # Cross-task dependencies: last step → next Worker
  # For verification-type tasks, Worker is the last step (no Verify)
  FOR EACH task WHERE task.depends_on is not empty:
    FOR EACH dep_id in task.depends_on:
      IF task_ids[dep_id].type == "verification":
        producer_last = task_ids[dep_id].worker
      ELSE:
        producer_last = task_ids[dep_id].verify
      consumer_first = task_ids[task.id].worker
      TaskUpdate(taskId=producer_last, addBlocks=[consumer_first])

  # For finalize chain: last step per task is Verify (non-verification) or Worker (verification)
  all_last = [
    task_ids[T].verify IF task_ids[T].type != "verification"
    ELSE task_ids[T].worker
    for each T
  ]

  IF depth == "standard":
    # Last steps → Code Review → Final Verify → Report
    FOR EACH last in all_last:
      TaskUpdate(taskId=last, addBlocks=[cr])
    TaskUpdate(taskId=cr, addBlocks=[fv])
  ELSE:
    # Last steps → Final Verify → Report (quick, no code review)
    FOR EACH last in all_last:
      TaskUpdate(taskId=last, addBlocks=[fv])

  TaskUpdate(taskId=fv, addBlocks=[rp])
```

**Key rule**: NEVER create tasks one-by-one across multiple turns. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Phase 1: Execute Loop

> **Compaction recovery**: `session-compact-hook.sh` re-injects skill name + state.json path.
> Read state.json to get spec_path, then use `hoyeon-cli spec plan` to rebuild task state.
> Workers self-read task details via `hoyeon-cli spec task <id> --get` and context files.

### Sandbox Task Dispatch

**T_SANDBOX and T_SV* tasks are regular tasks — dispatch them as normal workers.**
Do NOT defer, skip, or mark them done without execution. The worker description already
contains instructions for handling sandbox scenarios (T_SV prefix check).

Before dispatching T_SANDBOX, verify sandbox capability:

```
IF plan contains tasks with ID starting with "T_SANDBOX" or "T_SV":
  capability = spec.context.sandbox_capability
  IF capability is null:
    print("WARNING: Sandbox tasks exist but no sandbox_capability set. Skipping sandbox tasks.")
    FOR EACH sandbox_task in plan WHERE id starts with "T_SANDBOX" or "T_SV":
      Bash("hoyeon-cli spec task {sandbox_task.id} --status done --summary 'Skipped — no sandbox capability' {spec_path}")
      TaskUpdate(taskId=sandbox_task.tracking_id, status="completed")
  ELSE:
    # Sandbox capability confirmed — T_SANDBOX and T_SV tasks will be dispatched
    # normally through the execute loop below. Dependencies handle ordering:
    # T_SV* depends_on T_SANDBOX, so T_SANDBOX runs first automatically.
    print("Sandbox capability confirmed: tools={capability.tools}")
```

### Execute Loop

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
- `:Verify` — YES (read-only, no file conflicts)
- `:Commit` — NO (git operations must be sequential)

---

### Derived Task Helpers

When `spec derive` creates a new task in spec.json, the orchestrator must also create
Claude Code tracking tasks (TaskCreate/TaskUpdate) to keep both DAGs in sync.

```
function dispatch_derived_task(derive_result, spec_path):
  """
  After spec derive, create tracking tasks and dispatch worker.
  Returns {task_id, worker, commit} for the caller to chain dependencies.
  """
  task_id = derive_result.created        # e.g. "T1.fix-1"
  task_action = derive_result.action     # from derive JSON output

  # 1. Create tracking tasks (always 2-step: Worker → Commit)
  fw = TaskCreate(
    subject="{task_id}.1:Worker — {task_action}",
    description=WORKER_DESCRIPTION(task_id),
    activeForm="{task_id}.1: Running Worker")

  fc = TaskCreate(subject="{task_id}.2:Commit",
                  description="Commit {task_id} changes.",
                  activeForm="{task_id}.2: Committing")
  TaskUpdate(taskId=fw, addBlocks=[fc])

  # 2. Dispatch worker immediately
  TaskUpdate(taskId=fw, status="in_progress")
  result = Agent(subagent_type="worker", description="Implement: {task_id}",
                 prompt=TaskGet(fw).description)

  # 3. On completion, mark spec task done
  Bash("hoyeon-cli spec task {task_id} --status done --summary '{result.summary}' {spec_path}")
  TaskUpdate(taskId=fw, status="completed")

  return {task_id: task_id, worker: fw, commit: fc}


function dispatch_fv_fix(derive_result, spec_path):
  """
  Lightweight dispatch for Final Verify fixes — NO per-task commit.
  FV fixes are committed together after all fixes complete.
  """
  task_id = derive_result.created

  fw = TaskCreate(
    subject="{task_id}.1:Worker — FV fix",
    description=WORKER_DESCRIPTION(task_id),
    activeForm="{task_id}.1: FV fix")

  TaskUpdate(taskId=fw, status="in_progress")
  result = Agent(subagent_type="worker", description="FV fix: {task_id}",
                 prompt=TaskGet(fw).description)

  Bash("hoyeon-cli spec task {task_id} --status done --summary '{result.summary ?? \"FV fix applied\"}' {spec_path}")
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
  # → :Verify becomes runnable

ELIF result.status == "BLOCKED":
  # Scope blocker detected — create derived fix task
  log_to_audit("BLOCKED: {task_id} — {result.scope_blockers.type}: {result.scope_blockers.reason}")

  derive_result = Bash("""hoyeon-cli spec derive \
    --parent {task_id} \
    --source worker \
    --trigger scope_blocker \
    --action "Fix: {result.scope_blockers.suggested_fix}" \
    --reason "{result.scope_blockers.type}: {result.scope_blockers.reason}" \
    {spec_path}""")

  tracking = dispatch_derived_task(derive_result, spec_path)

  # Block original .2:Commit to prevent premature commit of partial work
  # cm = original commit task ID from Phase 0.5 (task_ids[task_id].commit)
  cm_original = task_ids[task_id].commit

  # Chain: fix commit → re-run original worker → original commit → finalize
  rw = TaskCreate(subject="{task_id}.R:Worker — Re-run after scope fix",
       description=WORKER_DESCRIPTION(task_id),
       activeForm="{task_id}: Re-running after scope fix")
  TaskUpdate(taskId=tracking.commit, addBlocks=[rw])
  TaskUpdate(taskId=rw, addBlocks=[cm_original])  # re-worker must finish before original commit

  # Update spec.json status
  Bash("hoyeon-cli spec task {task_id} --status blocked {spec_path}")
  TaskUpdate(taskId=taskId, status="completed")  # original worker done (blocked)

ELIF result.status == "FAILED":
  log_to_audit("Worker FAILED for {task_id}, HALT")
  HALT
```

---

### 1b. :Verify — Independent Scenario Verification

> **Self-read pattern**: Same as Worker — Verifier reads spec via CLI.
> Runs in a SEPARATE context from Worker — no shared state, no bias.

```
Agent(
  subagent_type="verifier",
  description="Verify: {task_id}",
  prompt=TaskGet(task.id).description,
  run_in_background=true  # if parallel round
)
```

**On completion:**

```
IF result.status == "VERIFIED":
  Bash("hoyeon-cli spec task {task_id} --status done --summary 'Verified: {result.scenarios.length} scenarios passed' {spec_path}")
  TaskUpdate(taskId, status="completed")
  # → :Commit becomes runnable (or next task if no-commit)

ELIF result.status == "FAILED":
  # Fix loop — max 2 retries per task
  verify_attempt = verify_attempts.get(task_id, 0) + 1
  verify_attempts[task_id] = verify_attempt

  IF verify_attempt > 2:
    log_to_audit("VERIFY FAILED (max retries): {task_id} — {result.failed_count} scenarios failed")
    HALT

  log_to_audit("VERIFY FAILED (attempt {verify_attempt}): {task_id}")

  # Create fix task via spec derive
  failed_scenarios = result.scenarios.filter(s => s.status == "fail")
  derive_result = Bash("""hoyeon-cli spec derive \
    --parent {task_id} \
    --source verifier \
    --trigger scenario_failure \
    --action "Fix verified failures: {failed_scenarios.map(s => s.id).join(', ')}" \
    --reason "Verifier found {result.failed_count} scenario failure(s): {failed_scenarios.map(s => s.id + ': ' + s.evidence).join('; ')}" \
    {spec_path}""")

  # Dispatch fix worker (lightweight — no per-task commit)
  dispatch_fv_fix(derive_result, spec_path)

  # Re-dispatch Verifier (fresh context)
  v_retry = TaskCreate(subject="{task_id}.V.{verify_attempt}:Verify — retry",
       description=verify_description[task_id],
       activeForm="{task_id}: Re-verifying (attempt {verify_attempt})")
  TaskUpdate(taskId=v_retry, status="in_progress")
  result = Agent(subagent_type="verifier", description="Re-verify: {task_id}",
                 prompt=TaskGet(v_retry).description)
  # Handle result recursively (same VERIFIED/FAILED logic)
```

---

### 1c. :Commit — Per-Task Commit

> **Skipped entirely when `work_mode == "no-commit"`** — no :Commit tasks exist in the DAG.

```
# task_action comes from TaskGet(task.id).subject (e.g., "T1.2:Commit" → parent "T1.1:Worker — Project init")
# Or parse from the Worker TaskCreate subject which includes the action text.

# git-master operates in session CWD (already in worktree if applicable)
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

> **Skipped entirely when `work_mode == "no-commit"`** — no `rc` task exists in the DAG.

```bash
IF work_mode == "no-commit":
  # Skip — no residual commit task exists
ELSE:
  git_status = Bash("git status --porcelain")
  IF git_status is not empty:
    Agent(subagent_type="git-master", prompt="Commit remaining changes from spec: {spec.meta.goal}")
  TaskUpdate(taskId=rc, status="completed")
```

### 2b. :Code Review (Standard Only)

> **Mode Gate**: Quick mode SKIPS this entirely.
>
> **Auto-Pass Gate**: If `should_auto_pass_code_review()` returns true, skip code review.
> Log: `"AUTO_PASS: Code Review skipped — {lines} total lines, no new deps, all low risk"`
> Mark `TaskUpdate(taskId=cr, status="completed")` and proceed to Final Verify.
>
> **MUST delegate** (when not auto-passed) — Even if git diff is empty (e.g. git-ignored deliverables),
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
  tracking = dispatch_derived_task(derive_result, spec_path)
  log_to_audit("CODE_REVIEW: created {derive_result.created} — {fix.reason}")
```

- Execute fixes → re-review (max 1 round)

**If SHIP:**
- `TaskUpdate(taskId=cr, status="completed")`

### 2c. :Final Verify (Both Modes)

Holistic verification of the full spec — goal alignment, constraints, acceptance criteria,
requirements, deliverables, and **must_not_do compliance** (since per-task independent verification
is no longer performed, FV is the sole independent check for must_not_do violations).
Runs in **both** standard and quick modes.

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

        # Classify per-failure: scope blockers vs code errors
        trigger = "scope_blocker" IF failure.type == "scope_blocker" ELSE "final_verify"

        derive_result = Bash("""hoyeon-cli spec derive \
          --parent {parent_task_id} \
          --source final-verify \
          --trigger {trigger} \
          --action "FV fix: {failure.description}" \
          --reason "Final Verify {category} failure: {failure.reason}" \
          {spec_path}""")
        fix_tasks.append(derive_result.created)

    log_to_audit("FINAL_VERIFY attempt {fv_attempt}: created {len(fix_tasks)} fix tasks")

    # Execute fix tasks via lightweight FV helper (no per-task commit)
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
WORK: {work_mode}{IF work_mode == "worktree": " ({WORK_DIR}, branch: {branch_name})"}

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
{List any dynamically created fix tasks (scope blocker fixes, FV fixes, CR fixes), or "None"}

───────────────────────────────────────────────────
CONTEXT
───────────────────────────────────────────────────
Learnings: {count} entries
Issues: {count} entries
Audit: {count} events

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
  learnings.json — structured learnings (workers write via hoyeon-cli spec learning)
  issues.json   — structured issues (workers write via hoyeon-cli spec issue)
  audit.md      — scope blockers, FV/CR events (orchestrator appends)
```

### Worker Context Instructions

Worker descriptions (WORKER_DESCRIPTION) include context file read and update instructions.
Workers self-read `{CONTEXT_DIR}/learnings.json` and `{CONTEXT_DIR}/issues.json` directly,
and write their findings via CLI after completing work.

The orchestrator does NOT read these files — only workers do.

### Orchestrator Audit Log

The orchestrator writes to `audit.md` for:
- Scope blocker events (Worker BLOCKED status, derived fix task created)
- Final Verify fix events (FV failure, fix tasks created)
- Code Review fix events (NEEDS_FIXES, fix tasks created)

Format:
```
## {task_id} — {timestamp}
Event: {BLOCKED|FV_FIX|CR_FIX}
Reason: {reason}
Details: {summary}
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
8. **Worker BLOCKED = scope fix** — when Worker reports BLOCKED, orchestrator creates a derived fix task via `spec derive --trigger scope_blocker`, dispatches it, then re-runs the original worker
9. **Worker FAILED = immediate HALT** — no per-task retry. **Verifier FAILED = fix loop** — max 2 retries via spec derive → fix worker → re-verify
10. **Scenario verification by independent Verifier** — Workers perform Tier 1 only (checks[]), Verifier agent handles scenario verification in separate context. must_not_do compliance checked at FV.
11. **Adaptation updates spec.json** — new tasks go through `spec derive` (handles ID generation, origin=derived, derived_from, depends_on, re-plan automatically)
12. **Background for parallel** — use `run_in_background: true` for round-parallel workers
13. **work_mode governs git behavior** — `worktree`: uses `EnterWorktree` to switch session CWD into an isolated worktree (all tools automatically operate there); `branch-commit`: current branch with per-task commits; `no-commit`: current branch, no commits at all (no :Commit tasks, no Residual Commit)
14. **Worktree = session CWD switch** — `EnterWorktree` changes the session's working directory. All tools (Read, Edit, Write, Bash, Glob, Grep) automatically operate in the worktree. No per-worker `cd` needed. `spec_path` and `CONTEXT_DIR` are converted to absolute paths before entering.
15. **Sandbox tasks are regular tasks** — T_SANDBOX and T_SV* tasks MUST be dispatched as normal workers when `sandbox_capability` is set. Only skip when `sandbox_capability` is null/missing. If `scaffold_required: true`, T_SANDBOX sets up the infra first. Dependencies handle execution order (T_SV* depends_on T_SANDBOX).

---

## Checklists

### Standard Mode Checklist

- [ ] Mode resolved: `depth = "standard"`
- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] Worker descriptions use self-read pattern (WORKER_DESCRIPTION)
- [ ] Orchestrator does NOT Read spec.json or context files during dispatch
- [ ] Worker BLOCKED status handled (scope fix derived task + re-worker)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Residual commit handled
- [ ] Code review completed (SHIP verdict or fixes applied)
- [ ] Final verify worker ran holistic spec verification (goal, constraints, AC, requirements, deliverables)
- [ ] Scope blocker events logged in audit.md
- [ ] Manual items listed for human follow-up
- [ ] Final report output

### Quick Mode Checklist

- [ ] Mode resolved: `depth = "quick"`
- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] Worker descriptions use self-read pattern (WORKER_DESCRIPTION)
- [ ] On any worker FAILED → immediate HALT
- [ ] Worker BLOCKED status handled (scope fix derived task + re-worker)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Residual commit handled
- [ ] No code review
- [ ] Final verify worker ran holistic spec verification (goal, constraints, AC, requirements, deliverables)
- [ ] Manual items listed for human follow-up
- [ ] Final report output
