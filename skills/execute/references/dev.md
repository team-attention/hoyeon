# AGENT Dispatch Mode Reference

This is the AGENT dispatch mode reference, loaded when user selects `dispatch=agent`.
It uses Worker subagents with task grouping and round-level commits.

**Prerequisite**: Phase 0 (Find Spec, Get Plan, Init Context, Confirm Pre-work, Work Mode Selection) is already done.
`spec_path`, `plan`, `CONTEXT_DIR`, `meta_type`, `work_mode`, and `WORK_DIR` are all established.
`{verify_depth}` is resolved in Phase 0.5 of SKILL.md and passed to this reference (`light` | `standard` | `thorough`).

---

## Mode Selection

### TDD Mode

`{tdd}` is resolved (default: **OFF**):

```
IF --tdd flag present:
  tdd = true
ELSE:
  tdd = false
```

When `tdd = true`, Workers write tests BEFORE implementation (RED-GREEN-REFACTOR).
The `tdd` flag is passed to `WORKER_DESCRIPTION` / `GROUPED_WORKER_DESCRIPTION` so each Worker knows to use TDD flow.

Examples:
- `/execute` → TDD OFF by default
- `/execute --tdd` → Workers use TDD (RED-GREEN-REFACTOR)

### Code Review Auto-Pass

Code Review can be auto-skipped when changes are small enough.
The orchestrator evaluates auto-pass conditions **before dispatching**.
**Gate**: Runs in `standard` and `thorough` verify (not `light`). Auto-pass skips when diff is small.

| Gate | Auto-Pass Condition | What Gets Skipped |
|------|---------------------|-------------------|
| **Code Review** | Total `git diff --stat` shows ≤ 200 lines AND no new dependencies added (`package.json`, `Cargo.toml`, etc. unchanged) AND all tasks are risk "low". Runs in standard and thorough verify (not light). | Code review agent in verify recipe |

**How to evaluate:**

```
function should_auto_pass_code_review() → bool:
  IF verify_depth == "light": return true  # light skips code review entirely
  # standard and thorough both run conditional code review (handled by verify recipe)
  diff_stat = Bash("git diff --stat main...HEAD")
  total_lines = parse_total_lines(diff_stat)
  dep_files_changed = Bash("git diff --name-only main...HEAD | grep -E '(package\\.json|Cargo\\.toml|go\\.mod|requirements\\.txt|pyproject\\.toml)'")
  return total_lines <= 200 AND dep_files_changed is empty
```

**When auto-pass fires:**
- Log to audit: `"AUTO_PASS: {gate} skipped — {reason}"`
- Mark the TaskCreate entry as completed immediately
- Continue to next step

**User override**: If the user explicitly requests `--no-auto-pass` or the spec contains `meta.force_review: true`, all gates run regardless.

---

## Task Grouping

Before creating tracking tasks, group related tasks to reduce agent count.

```
function group_tasks(plan) → grouped_tasks[]:
  groups = []
  FOR EACH task in plan (flattened):
    # Find if task shares a module/directory with an existing group
    task_dir = primary_directory(task.action)  # heuristic: first file path mentioned
    matched_group = groups.find(g => g.dir == task_dir AND no circular dependency)
    
    IF matched_group AND no dependency conflict:
      matched_group.tasks.push(task)
    ELSE:
      groups.push({dir: task_dir, tasks: [task]})
  
  return groups

# Dependency conflict check:
# Two tasks CANNOT be grouped if one depends_on the other
# (they must run sequentially, so grouping doesn't help)

# Result: fewer workers, each handling related tasks together
```

---

## Phase 0.5: Create Tracking Tasks

Create TaskCreate entries for all task groups. **Batch all in one turn.**

### Worktree Note

When `work_mode == "worktree"`, the orchestrator has already called `EnterWorktree` in Phase 0.5.
Session CWD is inside the worktree — all tools (Read, Edit, Write, Bash, Glob, Grep) automatically
operate there. No per-worker `cd` is needed. `spec_path` and `CONTEXT_DIR` are absolute paths.

### Task Creation

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

grouped_tasks = group_tasks(plan)

FOR EACH group in grouped_tasks:
  task_ids = group.tasks.map(t => t.id).join(", ")
  w = TaskCreate(subject="{task_ids}:Worker — {group summary}",
                 description=GROUPED_WORKER_DESCRIPTION(group.tasks, tdd),
                 activeForm="{task_ids}: Running Worker")

# No per-task :Commit tasks
# Instead, round-level commit:
IF work_mode != "no-commit":
  FOR EACH round:
    rc = TaskCreate(subject="Round-{round}:Commit",
                    description="Commit all changes from round {round}.",
                    activeForm="Committing round {round}")

# Finalize tasks — commit-related steps only when commits are enabled
IF work_mode != "no-commit":
  residual = TaskCreate(subject="Finalize:Residual Commit", ...)

fv = TaskCreate(subject="Finalize:Verify",
     description="Verify spec compliance using {verify_depth} recipe.",
     activeForm="Running verification")
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
WORKER_DESCRIPTION(task_id, tdd) = """
You are a Worker agent. Implement task {task_id}.
Work in the current directory (session CWD — already set to worktree if applicable).
TDD Mode: {IF tdd: "ON" ELSE: "OFF"}

## Step 1: Read your task spec
Run: `hoyeon-cli spec task {task_id} --get {spec_path}`
This returns JSON with: action, fulfills, depends_on, and other task fields.

## Step 2: Resolve dependencies (if any)
If your task has `depends_on`, check that those tasks are done:
Run: `hoyeon-cli spec task {dep_id} --get {spec_path}`
Review their `summary` to understand what was produced.

## Step 3: Read context files
Read: {CONTEXT_DIR}/learnings.json — structured learnings from previous workers (if exists)
Read: {CONTEXT_DIR}/issues.json — failed approaches to avoid (if exists)
Read: {CONTEXT_DIR}/round-summaries.json — previous round results (if exists)
  Focus on tasks that modified files related to your scope.
  These are architectural decisions you must respect — do NOT contradict them.

Also read spec decisions: each decision's `rationale` includes rejected alternatives.
Do NOT revisit rejected approaches unless you find concrete evidence that the rejection reason no longer applies.

## Step 4: Implement
Follow the task action from your task spec.
If TDD Mode is ON, read `skills/execute/references/tdd-guide.md` and follow the TDD workflow (RED → GREEN → REFACTOR).
Respect constraints.
Do NOT run git commands — Orchestrator handles commits.

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
1. **Behavioral check**: Look up `fulfills[]` → requirements → sub-requirements. Each sub-req's GWT fields (given/when/then) define the structured acceptance criterion when available; behavior serves as summary. Verify your implementation satisfies all of them.
2. **Build/lint/typecheck**: Run the project's build, lint, and type-check commands to ensure nothing is broken. Find these from package.json, Makefile, or project config.
3. **Test pass (TDD only)**: If TDD Mode is ON, run the test suite and confirm all tests pass.

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

```
GROUPED_WORKER_DESCRIPTION(tasks, tdd) = """
You are a Worker agent. Implement tasks: {tasks.map(t => t.id).join(", ")}.
Work in the current directory (session CWD — already set to worktree if applicable).
TDD Mode: {IF tdd: "ON" ELSE: "OFF"}

## Your tasks (implement in order)
{FOR EACH task in tasks:}
### {task.id}
Run: `hoyeon-cli spec task {task.id} --get {spec_path}`
Implement as described. After completing each:
  hoyeon-cli spec task {task.id} --status done --summary '...' {spec_path}

## Step 2: Resolve dependency outputs (if any)
If any task has `depends_on[]`, check completed dependency summaries for context:
Run: `hoyeon-cli spec task {dep_task_id} --get {spec_path}`
Use its `summary` field to understand what was produced.

## Step 3: Read context files
Read: {CONTEXT_DIR}/learnings.json — structured learnings from previous workers (if exists)
Read: {CONTEXT_DIR}/issues.json — failed approaches to avoid (if exists)
Read: {CONTEXT_DIR}/round-summaries.json — previous round results (if exists)
  Focus on tasks that modified files related to your scope.
  These are architectural decisions you must respect — do NOT contradict them.

Also read spec decisions: each decision's `rationale` includes rejected alternatives.
Do NOT revisit rejected approaches unless you find concrete evidence that the rejection reason no longer applies.

## Step 4: Implement
Follow each task's action from the task spec, in order.
If TDD Mode is ON, read `skills/execute/references/tdd-guide.md` and follow the TDD workflow (RED → GREEN → REFACTOR).
Respect constraints.
Do NOT run git commands — Orchestrator handles commits.

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
1. **Behavioral check**: For each task, look up `fulfills[]` → requirements → sub-requirements. Each sub-req's GWT fields (given/when/then) define the structured acceptance criterion when available; behavior serves as summary. Verify your implementation satisfies all of them.
2. **Build/lint/typecheck**: Run the project's build, lint, and type-check commands to ensure nothing is broken. Find these from package.json, Makefile, or project config.
3. **Test pass (TDD only)**: If TDD Mode is ON, run the test suite and confirm all tests pass.

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

For each issue discovered during implementation, save via CLI:

```bash
hoyeon-cli spec issue --task {task_id} --stdin {spec_path} << 'EOF'
{
  "type": "failed_approach|out_of_scope|blocker",
  "description": "what went wrong or what is out of scope"
}
EOF
```

## Output (print as last message — report status for ALL tasks)
```json
{"status": "DONE"|"FAILED"|"BLOCKED",
 "summary": "...",
 "files_modified": [...],
 "task_results": [{"task_id": "...", "status": "DONE"|"FAILED"|"BLOCKED", "summary": "..."}],
 "tier1_checks": [{"type":"build|lint|static|format", "run":"...", "status":"PASS|FAIL"}],
 "scope_blockers": null | {"type": "missing_api|env_constraint|permission|dependency", "reason": "...", "suggested_fix": "..."}}
```

### Status meanings:
- **DONE**: All tasks passed, implementation complete.
- **FAILED**: Implementation attempted but checks failed (code error).
- **BLOCKED**: Implementation blocked by scope limitation (not a code error).
  Populate `scope_blockers` with the blocker type and suggested fix.
"""
```

### Set Dependencies (TURN 2)

```
# ═══════════════════════════════════════════════════
# TURN 2: Set ALL dependencies in PARALLEL (single message)
# ═══════════════════════════════════════════════════

IF work_mode != "no-commit":
  # Workers in same round run in parallel, then round-level commit
  FOR EACH round:
    round_workers = grouped_tasks.filter(g => g.round == round).map(g => g.worker_id)
    round_commit = round_commits[round]
    
    # All workers in round → round commit
    FOR EACH w in round_workers:
      TaskUpdate(taskId=w, addBlocks=[round_commit])
    
    # Round commit → next round's workers (sequential rounds)
    IF next_round exists:
      next_round_workers = grouped_tasks.filter(g => g.round == next_round).map(g => g.worker_id)
      FOR EACH nw in next_round_workers:
        TaskUpdate(taskId=round_commit, addBlocks=[nw])

  # Cross-group dependencies (from spec.json depends_on)
  FOR EACH group WHERE any task has depends_on pointing to task in another group:
    producer_group_worker = group containing the dependency target
    consumer_group_worker = current group's worker
    TaskUpdate(taskId=producer_group_worker, addBlocks=[consumer_group_worker])

  # Last round commit → Residual Commit → Verify → Report
  last_round_commit = round_commits[last_round]
  TaskUpdate(taskId=last_round_commit, addBlocks=[residual])
  TaskUpdate(taskId=residual, addBlocks=[fv])
  TaskUpdate(taskId=fv, addBlocks=[rp])

ELSE:  # no-commit mode
  # Cross-group dependencies
  FOR EACH group WHERE any task has depends_on pointing to task in another group:
    producer_group_worker = group containing the dependency target
    consumer_group_worker = current group's worker
    TaskUpdate(taskId=producer_group_worker, addBlocks=[consumer_group_worker])

  # All workers (last round) → Verify → Report
  last_round_workers = grouped_tasks.filter(g => g.round == last_round).map(g => g.worker_id)
  FOR EACH w in last_round_workers:
    TaskUpdate(taskId=w, addBlocks=[fv])
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
contains instructions for handling sandbox sub-requirements (T_SV prefix check).

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

### Round-Level Dispatch

```
# Group workers from same round → dispatch in parallel
# After all workers in a round complete → round-level commit
# Then next round

FOR EACH round in execution_order:
  round_workers = runnable.filter(task => task.subject.includes(":Worker"))
  
  IF len(round_workers) > 1:
    # PARALLEL — mark in_progress FIRST, then send ALL in ONE message
    FOR EACH w in round_workers:
      TaskUpdate(taskId=w.id, status="in_progress")
    FOR EACH w in round_workers (in single message):
      dispatch(w, run_in_background=true)
    # Wait for completion notifications (do NOT poll)
  ELSE IF len(round_workers) == 1:
    # Sequential — dispatch single worker
    dispatch(round_workers[0])

  # After all workers in round complete → collect round summary (DONE only)
  round_summary = {
    round: round,
    completed_at: now(),
    tasks: []
  }
  FOR EACH w in round_workers:
    raw_output = TaskOutput(w.id)
    worker_output = try_parse(raw_output) ?? {status: "FAILED", summary: "No parseable output", files_modified: []}
    
    # Only propagate DONE results as forward context — FAILED/BLOCKED may mislead
    IF worker_output.status == "DONE":
      round_summary.tasks.push({
        task_ids: w.task_ids,
        status: worker_output.status,
        summary: worker_output.summary,
        files_modified: worker_output.files_modified ?? [],
        key_decisions: extract_decisions(worker_output.summary)  # heuristic: first 2 sentences
      })

  # Append to round-summaries.json (accumulates across rounds)
  summaries_path = "{CONTEXT_DIR}/round-summaries.json"
  IF NOT exists(summaries_path):
    Write(summaries_path, "[]")
  existing = JSON.parse(Read(summaries_path))
  existing.push(round_summary)
  Write(summaries_path, JSON.stringify(existing, null, 2))
  log_to_audit("ROUND {round} COMPLETE: {len(round_summary.tasks)} tasks, files: {round_summary.tasks.flatMap(t => t.files_modified)}")

  # Round-level commit
  IF work_mode != "no-commit":
    round_commit = round_commits[round]
    Agent(
      subagent_type="git-master",
      description="Commit round {round}",
      prompt="""
        Commit all changes from round {round}.
        Tasks completed: {round_workers.map(w => w.subject).join(", ")}
        Spec: {spec_path}
      """
    )
    TaskUpdate(taskId=round_commit, status="completed")
```

**Which types can run in parallel:**
- `:Worker` — YES (if touching disjoint files per task scope)
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
    description=WORKER_DESCRIPTION(task_id, tdd),
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
  Lightweight dispatch for verify fixes — NO per-task commit.
  Verify fixes are committed together after all fixes complete.
  """
  task_id = derive_result.created

  fw = TaskCreate(
    subject="{task_id}.1:Worker — verify fix",
    description=WORKER_DESCRIPTION(task_id, tdd),
    activeForm="{task_id}.1: Verify fix")

  TaskUpdate(taskId=fw, status="in_progress")
  result = Agent(subagent_type="worker", description="Verify fix: {task_id}",
                 prompt=TaskGet(fw).description)

  Bash("hoyeon-cli spec task {task_id} --status done --summary '{result.summary ?? \"Verify fix applied\"}' {spec_path}")
  TaskUpdate(taskId=fw, status="completed")
```

---

### 1a. :Worker — Delegate Implementation

> **Self-read pattern**: The orchestrator does NOT read spec.json or context files.
> The worker's description (set at TaskCreate time) contains all instructions for
> the worker to self-read via `cli` and context files.

```
# Description was already set in Phase 0.5 TaskCreate via WORKER_DESCRIPTION or GROUPED_WORKER_DESCRIPTION.
# The orchestrator simply dispatches — no spec.json read, no context file read.

Agent(
  subagent_type="worker",
  description="Implement: {task_ids}",
  prompt=TaskGet(task.id).description,  # re-use the description from TaskCreate
  run_in_background=true  # if parallel round
)
```

**On completion:**

```
IF result.status == "DONE":
  # For grouped workers, update all task statuses
  FOR EACH task_id in group.tasks.map(t => t.id):
    Bash("hoyeon-cli spec task {task_id} --status in_progress {spec_path}")
  TaskUpdate(taskId, status="completed")

ELIF result.status == "BLOCKED":
  # Scope blocker detected — create derived fix task
  log_to_audit("BLOCKED: {task_ids} — {result.scope_blockers.type}: {result.scope_blockers.reason}")

  derive_result = Bash("""hoyeon-cli spec derive \
    --parent {blocked_task_id} \
    --source worker \
    --trigger scope_blocker \
    --action "Fix: {result.scope_blockers.suggested_fix}" \
    --reason "{result.scope_blockers.type}: {result.scope_blockers.reason}" \
    {spec_path}""")

  tracking = dispatch_derived_task(derive_result, spec_path)

  # Re-run the blocked worker after fix completes
  rw = TaskCreate(subject="{blocked_task_id}.R:Worker — Re-run after scope fix",
       description=WORKER_DESCRIPTION(blocked_task_id, tdd),
       activeForm="{blocked_task_id}: Re-running after scope fix")
  TaskUpdate(taskId=tracking.commit, addBlocks=[rw])

  # Update spec.json status
  Bash("hoyeon-cli spec task {blocked_task_id} --status blocked {spec_path}")
  TaskUpdate(taskId=taskId, status="completed")  # original worker done (blocked)

ELIF result.status == "FAILED":
  # Bounded retry: check if retry task already exists (compaction-safe)
  existing_retry = TaskList().find(t => t.subject.includes("{task_ids[0]}.retry:Worker"))
  is_retry = existing_retry != null

  IF NOT is_retry:
    log_to_audit("Worker FAILED for {task_ids} — dispatching retry")

    # Record failure as issue so retry worker knows what to avoid (all tasks in group)
    FOR EACH tid in task_ids:
      escaped_summary = JSON_escape(result.summary ?? "unknown error")
      Bash("""hoyeon-cli spec issue --task {tid} --stdin {spec_path} << 'EOF'
{"type": "failed_approach", "description": "Worker failed: {escaped_summary}. Avoid this approach on retry."}
EOF""")

    # Create retry task with distinct subject (makes retry detection compaction-safe)
    retry_w = TaskCreate(
      subject="{task_ids[0]}.retry:Worker — retry after failure",
      description=TaskGet(task.id).description,
      activeForm="{task_ids[0]}: Retrying")
    TaskUpdate(taskId=retry_w, status="in_progress")
    Agent(
      subagent_type="worker",
      description="Retry: {task_ids}",
      prompt=TaskGet(retry_w).description,
      run_in_background=true
    )
  ELSE:
    log_to_audit("Worker FAILED for {task_ids} after retry — escalating to user")
    AskUserQuestion(
      question: "Worker failed for {task_ids} after retry. How to proceed?",
      options: [
        { label: "Skip", description: "Mark as skipped, continue with remaining tasks" },
        { label: "Abort", description: "Stop execution entirely" }
      ]
    )
    IF answer == "Abort": HALT
    ELSE:
      FOR EACH tid in task_ids:
        Bash("hoyeon-cli spec task {tid} --status done --summary 'Skipped after failed retry' {spec_path}")
      TaskUpdate(taskId=taskId, status="completed")
```

---

## Phase 2: Finalize

After all task rounds complete, run finalize steps in order.

### 2a. :Residual Commit

> **Skipped entirely when `work_mode == "no-commit"`** — no `residual` task exists in the DAG.

```bash
IF work_mode == "no-commit":
  # Skip — no residual commit task exists
ELSE:
  git_status = Bash("git status --porcelain")
  IF git_status is not empty:
    Agent(subagent_type="git-master", prompt="Commit remaining changes from spec: {spec.meta.goal}")
  TaskUpdate(taskId=residual, status="completed")
```

### 2b. :Verify — Verify Routing

Verify routing based on user's `verify_depth` selection:

```
Read the verify recipe based on verify_depth:
  light    → ${baseDir}/references/verify-light.md
  standard → ${baseDir}/references/verify-standard.md
  thorough → ${baseDir}/references/verify-thorough.md
  ralph    → ${baseDir}/references/verify-ralph.md
Follow verify recipe instructions.
```

On completion:

```
IF result.status == "VERIFIED" OR result.status == "VERIFIED_WITH_GAPS":
  IF result.status == "VERIFIED_WITH_GAPS":
    log_to_audit("VERIFIED_WITH_GAPS: {result.tier1.counts.uncertain} sub-reqs unverifiable from code")
  TaskUpdate(taskId=fv, status="completed")
ELSE:
  # Classify failures — goal misalignment is unrecoverable
  IF result.goal_alignment.status == "FAIL":
    print("GOAL MISALIGNMENT — cannot auto-fix. HALT.")
    print("  Reason: {result.goal_alignment.reason}")
    HALT

  # For all other failures: create derived fix tasks and re-verify (max 2 attempts)
  fv_attempt = 0
  WHILE fv_attempt < 2:
    fv_attempt += 1
    fix_tasks = []

    FOR EACH failure in result.failures:
      parent_task_id = failure.task_id ?? last_planned_task_id

      derive_result = Bash("""hoyeon-cli spec derive \
        --parent {parent_task_id} \
        --source verify \
        --trigger verify_failure \
        --action "Verify fix: {failure.description}" \
        --reason "Verify failure: {failure.reason}" \
        {spec_path}""")
      fix_tasks.append(derive_result.created)

    log_to_audit("VERIFY attempt {fv_attempt}: created {len(fix_tasks)} fix tasks")

    # Execute fix tasks via lightweight helper (no per-task commit)
    FOR EACH fix_task_id in fix_tasks:
      dispatch_fv_fix({created: fix_task_id}, spec_path)

    # Commit all verify fixes together
    IF work_mode != "no-commit":
      Agent(subagent_type="git-master", prompt="Commit verify fixes")

    # Re-run verify
    result = dispatch_verify_worker()

    IF result.status == "VERIFIED" OR result.status == "VERIFIED_WITH_GAPS":
      IF result.status == "VERIFIED_WITH_GAPS":
        log_to_audit("VERIFIED_WITH_GAPS: {result.tier1.counts.uncertain} sub-reqs unverifiable from code")
      TaskUpdate(taskId=fv, status="completed")
      BREAK

    IF result.goal_alignment.status == "FAIL":
      print("GOAL MISALIGNMENT after verify fix — cannot auto-fix. HALT.")
      HALT

  IF result.status != "VERIFIED" AND result.status != "VERIFIED_WITH_GAPS":
    print("Verify failed after {fv_attempt} recovery attempt(s). HALT.")
    FOR EACH failure in result.failures:
      print("  {failure.description} — {failure.reason}")
    HALT
```

### 2c. :Report

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
DISPATCH: agent
VERIFY: {verify_depth}
WORK: {work_mode}{IF work_mode == "worktree": " ({WORK_DIR}, branch: {branch_name})"}

───────────────────────────────────────────────────
TASKS
───────────────────────────────────────────────────
{FOR EACH task in spec.tasks:}
{task.id}: {task.action}  [{task.type}] — {task.status}
  {task.summary}

───────────────────────────────────────────────────
VERIFICATION
───────────────────────────────────────────────────
Verify depth: {verify_depth}
{Verify results from recipe}

───────────────────────────────────────────────────
ADAPTATIONS
───────────────────────────────────────────────────
{List any dynamically created fix tasks (scope blocker fixes, verify fixes), or "None"}

───────────────────────────────────────────────────
CONTEXT
───────────────────────────────────────────────────
Learnings: {count} entries
Issues: {count} entries
Audit: {count} events

───────────────────────────────────────────────────
MANUAL REVIEW (require human verification)
───────────────────────────────────────────────────
{List any sub-requirements that require manual/visual verification
 based on their behavior description (e.g., UI appearance, UX flows)}

{IF no manual items: "None"}

───────────────────────────────────────────────────
POST-WORK (human actions after completion)
───────────────────────────────────────────────────
{post_work = spec.external_dependencies.post_work ?? []}
{FOR EACH item in post_work:}
- {item.action}

{IF no post_work: "None"}
═══════════════════════════════════════════════════
""")

TaskUpdate(taskId=rp, status="completed")
```

---

## Context File Management

### File Structure

```
.hoyeon/specs/{name}/context/
  learnings.json      — structured learnings (orchestrator creates empty [], workers append via hoyeon-cli spec learning)
  issues.json         — structured issues (orchestrator creates empty [], workers append via hoyeon-cli spec issue)
  audit.md            — scope blockers, verify events (orchestrator creates empty, appends)
  round-summaries.json — per-round completion summaries (orchestrator creates empty [], appends after each round)
```

### Worker Context Instructions

Worker descriptions (WORKER_DESCRIPTION / GROUPED_WORKER_DESCRIPTION) include context file read and update instructions.
Workers self-read `{CONTEXT_DIR}/learnings.json`, `{CONTEXT_DIR}/issues.json`, and `{CONTEXT_DIR}/round-summaries.json` directly,
and write their findings via CLI after completing work.

The orchestrator does NOT read learnings.json or issues.json — only workers do.
The orchestrator DOES write round-summaries.json (after each round) and audit.md.

### Orchestrator Audit Log

The orchestrator writes to `audit.md` for:
- Scope blocker events (Worker BLOCKED status, derived fix task created)
- Verify fix events (verify failure, fix tasks created)

Format:
```
## {task_id} — {timestamp}
Event: {BLOCKED|VERIFY_FIX}
Reason: {reason}
Details: {summary}
```

---

## AGENT Mode Rules

1. **spec.json is the ONLY source** — no PLAN.md, no state.json
2. **Always use cli** — `spec plan`, `spec task`, `spec merge`, `spec check`
3. **Two turns for task setup** — Turn 1: all TaskCreate, Turn 2: all TaskUpdate
4. **Dual tracking** — both spec.json (via `spec task`) and TaskList (via TaskUpdate)
5. **Workers self-read everything** — Workers use `hoyeon-cli spec task --get` and Read context files themselves. Orchestrator does NOT read spec.json or context files during dispatch. Orchestrator only writes audit.md.
6. **Description = recipe** — TaskCreate description contains the full self-read recipe (CLI commands, context paths, output format). At dispatch time, orchestrator just passes `TaskGet(id).description` as the Agent prompt.
7. **Task grouping** — related tasks (same module/directory) are grouped into a single worker to reduce agent count. Tasks with dependencies on each other cannot be grouped.
8. **Round-level commit** — instead of per-task commits, all changes from a round are committed together via a single git-master dispatch after all workers in that round complete.
9. **Worker BLOCKED = scope fix** — when Worker reports BLOCKED, orchestrator creates a derived fix task via `spec derive --trigger scope_blocker`, dispatches it, then re-runs the original worker
10. **Worker FAILED = bounded retry (max 1)** — first failure records issue via `spec issue`, then retries. Second failure escalates to user (Skip/Abort). Workers perform Tier 1 checks (build/lint/typecheck). TDD mode adds test-first workflow.
11. **Adaptation updates spec.json** — new tasks go through `spec derive` (handles ID generation, origin=derived, derived_from, depends_on, re-plan automatically)
12. **Background for parallel** — use `run_in_background: true` for round-parallel workers
13. **work_mode governs git behavior** — `worktree`: uses `EnterWorktree` to switch session CWD into an isolated worktree (all tools automatically operate there); `branch-commit`: current branch with round-level commits; `no-commit`: current branch, no commits at all (no :Commit tasks, no Residual Commit)
14. **Worktree = session CWD switch** — `EnterWorktree` changes the session's working directory. All tools (Read, Edit, Write, Bash, Glob, Grep) automatically operate in the worktree. No per-worker `cd` needed. `spec_path` and `CONTEXT_DIR` are converted to absolute paths before entering.
15. **Sandbox tasks are regular tasks** — T_SANDBOX and T_SV* tasks MUST be dispatched as normal workers when `sandbox_capability` is set. Only skip when `sandbox_capability` is null/missing. If `scaffold_required: true`, T_SANDBOX sets up the infra first. Dependencies handle execution order (T_SV* depends_on T_SANDBOX).
16. **Verify routing** — verification depth is determined by `verify_depth` (light/standard/thorough) and dispatched to the corresponding verify recipe.

---

## Checklist

- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] Tasks grouped by module/directory (group_tasks applied)
- [ ] Worker descriptions use self-read pattern (WORKER_DESCRIPTION / GROUPED_WORKER_DESCRIPTION)
- [ ] Orchestrator does NOT Read spec.json or context files during dispatch
- [ ] Round-level commits used (not per-task commits)
- [ ] Worker BLOCKED status handled (scope fix derived task + re-worker)
- [ ] Worker FAILED → bounded retry (max 1), then escalate to user
- [ ] Round summaries collected after each round (round-summaries.json)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Residual commit handled
- [ ] Verify recipe dispatched based on `verify_depth` (light/standard/thorough)
- [ ] Scope blocker events logged in audit.md
- [ ] Manual items listed for human follow-up
- [ ] Final report output
