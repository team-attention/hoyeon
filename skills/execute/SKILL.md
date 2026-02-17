---
name: execute
description: |
  This skill should be used when the user says "/execute", "execute".
  Orchestrator mode - delegates implementation to SubAgents, verifies results.
  Supports mode selection: standard (with full verification) and quick (lightweight, no independent verify).
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Edit
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
---

# /execute - Orchestrator Mode

**You are the conductor. You do not play instruments directly.**
Delegate to SubAgents, verify results, manage parallelization.

---

## Mode Selection

### Flag Parsing

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | Sets `{depth}` = quick | `{depth}` = standard |

Examples:
- `/execute` → standard mode
- `/execute --quick` → quick mode
- `/execute --quick my-feature` → quick mode with spec name
- `/execute --quick #42` → quick mode with PR

### Mode Variable

Throughout this document, `{depth}` refers to the resolved mode value:
- `{depth}` = `quick` | `standard`

### Quick Mode Summary

Quick mode removes the independent verification agent and reconciliation system. The Worker's self-reported results are trusted. On failure, execution halts immediately (no retry, no adapt).

| Aspect | Standard | Quick |
|--------|----------|-------|
| Sub-steps per TODO | 4 (Worker, Verify, Wrap-up, Commit) | 3 (Worker, Wrap-up, Commit) |
| Verification | Independent verify agent (4-part) | Worker self-report trusted |
| Reconciliation | halt/adapt/retry (3 retries, dynamic TODOs) | Pass or halt (no retry) |
| Final Code Review | code-reviewer agent (SHIP/NEEDS_FIXES) | Skipped |
| Context files | 4 files (all maintained) | 4 files (all maintained) |
| Report | Full template | Abbreviated summary |

---

## Golden Path (End-to-End Flow)

### Standard Mode (default)

```
1. Parse input → Determine mode (PR / Local) + depth (standard / quick)
2. Read PLAN.md → Create ALL Tasks (Init + TODO sub-steps + Finalize) → Set dependencies
3. Init/resume context (.dev/specs/{name}/context/)
4. LOOP while TaskList() has pending tasks:
   Pick runnable (pending + not blocked) → dispatch by type:
     :State Begin      → [PR only] Skill("state", "begin") → stop on failure
     :Worker  → Task(worker) with substituted variables
     :Verify  → dispatch verify worker, triage (halt > adapt > retry), reconcile if FAILED
     :Wrap-up → save context (Worker + Verify) + mark Plan checkbox [x]
     :Commit  → Task(git-master) per Commit Strategy
     :Residual Commit → git status → git-master if dirty
     :Code Review      → [Standard only] Task(code-reviewer) with full diff → SHIP/NEEDS_FIXES
     :State Complete   → [PR only] Skill("state", "complete")
     :Report           → output final report
5. (Init, TODO execution, and Finalize are all part of the loop)
```

### ⛔ Quick Mode (`--quick`)

```
1. Parse input → Determine mode (PR / Local) + depth = quick
2. Read PLAN.md → Create ALL Tasks (Init + TODO sub-steps [NO Verify] + Finalize) → Set dependencies
3. Init/resume context (.dev/specs/{name}/context/)
4. LOOP while TaskList() has pending tasks:
   Pick runnable (pending + not blocked) → dispatch by type:
     :State Begin      → [PR only] Skill("state", "begin") → stop on failure
     :Worker  → Task(worker) with substituted variables
     ⛔ :Verify  → SKIPPED (no independent verification)
     :Wrap-up → save context (Worker only) + mark Plan checkbox [x]
     :Commit  → Task(git-master) per Commit Strategy
     :Residual Commit → git status → git-master if dirty
     ⛔ :Code Review   → SKIPPED (no final review)
     :State Complete   → [PR only] Skill("state", "complete")
     :Report           → abbreviated summary
5. On Worker failure → HALT (no retry, no adapt)
```

---

## Core Rules

1. **DELEGATE** — All code writing goes to `Task(subagent_type="worker")`. You may only Read, Grep, Glob, Bash (for verification), and manage Tasks/Plan.
2. **VERIFY** — SubAgents lie. After every `:Worker`, the `:Verify` step dispatches a verify worker to independently re-check acceptance criteria. Reconcile if FAILED. ⛔ **Quick**: Skip independent verification. Worker self-report is trusted. On failure → HALT.
3. **PARALLELIZE** — Run all tasks whose `blockedBy` is empty simultaneously. Sub-step chains auto-parallelize across independent TODOs.
4. **ONE TODO PER WORKER** — Each `:Worker` Task handles exactly one TODO.
5. **PLAN CHECKBOX = TRUTH** — `### [x] TODO N:` is the only durable state. Sub-step Tasks are recreated each session. Standard: `{N}.1` ~ `{N}.4`. Quick: `{N}.1` ~ `{N}.3`.
6. **DISPATCH BY TYPE** — The loop dispatches each runnable task by its suffix: `:State Begin`, `:Worker`, `:Verify` (standard only), `:Wrap-up`, `:Commit`, `:Residual Commit`, `:Code Review` (standard only), `:State Complete`, `:Report`.

---

## STEP 1: Initialize

### 1.1 Parse Input & Determine Mode

**Flag parsing**: Strip `--quick` flag from input before mode detection.

| Input | Mode | Depth | Behavior |
|-------|------|-------|----------|
| `/execute` | Auto-detect | standard | Branch → Draft PR check → PR mode if exists, else Local |
| `/execute --quick` | Auto-detect | quick | Same as above, but quick depth |
| `/execute <name>` | Local | standard | `.dev/specs/<name>/PLAN.md` |
| `/execute --quick <name>` | Local | quick | Same as above, but quick depth |
| `/execute <PR#>` | PR | standard | Parse spec path from PR body |
| `/execute --quick <PR#>` | PR | quick | Same as above, but quick depth |
| `/execute <PR URL>` | PR | standard | Extract PR# → PR mode |

Auto-detect logic:
```bash
gh pr list --head $(git branch --show-current) --draft --json number
# PR exists → PR mode | No PR → infer spec from branch name
```

### 1.2 Read Plan & Create All Tasks

Read plan file:
- Local: `.dev/specs/{name}/PLAN.md` — if name not given, use most recent plan file or ask user
- PR: extract Spec Reference link from PR body:
  ```bash
  gh pr view <PR#> --json body -q '.body' | grep -oP '(?<=→ \[)[^\]]+'
  ```

⚠️ **BATCH CREATE all tasks in minimal turns to avoid overhead.**

**Strategy**: Call ALL TaskCreate calls for a single turn in parallel (multiple tool calls in one message). Then set ALL dependencies in one follow-up turn. This reduces task setup from ~3 minutes to ~15 seconds.

### Standard Mode Task Creation

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════
# Send ALL of these TaskCreate calls in ONE message simultaneously.
# Claude Code supports multiple tool calls per message — use it.

# Init (PR only)
IF pr_mode:
  sb = TaskCreate(subject="Init:State Begin", ...)

# Per-TODO sub-steps (ALL TODOs in parallel)
FOR EACH "### [ ] TODO N: {title}" in plan:
  w  = TaskCreate(subject="{N}.1:Worker — {title}",
                  description="{full TODO section content}",
                  activeForm="{N}.1: Running Worker")
  v  = TaskCreate(subject="{N}.2:Verify",
                  description="Dispatch verify worker for TODO {N}. ...",
                  activeForm="{N}.2: Verifying")
  wu = TaskCreate(subject="{N}.3:Wrap-up",
                  description="Wrap-up for TODO {N}. ...",
                  activeForm="{N}.3: Wrapping up")
  IF commit_strategy_has_row(N):
    cm = TaskCreate(subject="{N}.4:Commit",
                    description="Commit TODO {N} changes. ...",
                    activeForm="{N}.4: Committing")

# Finalize tasks
rc = TaskCreate(subject="Finalize:Residual Commit", ...)
cr = TaskCreate(subject="Finalize:Code Review",
     description="Review complete diff for integration issues, hidden bugs, side effects. Dispatch code-reviewer agent.",
     activeForm="Reviewing all changes")
IF pr_mode:
  sc = TaskCreate(subject="Finalize:State Complete", ...)
rp = TaskCreate(subject="Finalize:Report", activeForm="Generating report",
     description="Read ${baseDir}/references/report-template.md, then output the report verbatim replacing placeholders with actual values.")

# ═══════════════════════════════════════════════════
# TURN 2: Set ALL dependencies in PARALLEL (single message)
# ═══════════════════════════════════════════════════
# After Turn 1 returns all task IDs, send ALL TaskUpdate calls
# for dependencies in ONE message simultaneously.

FOR EACH unchecked TODO N:
  TaskUpdate(taskId=w.task_id, addBlocks=[v.task_id])
  TaskUpdate(taskId=v.task_id, addBlocks=[wu.task_id])
  IF task_ids[N].commit:
    TaskUpdate(taskId=wu.task_id, addBlocks=[cm.task_id])

IF pr_mode:
  FOR EACH unchecked TODO N:
    TaskUpdate(taskId=sb.task_id, addBlocks=[task_ids[N].worker])

all_last_steps = [task_ids[N].commit ?? task_ids[N].wrapup for each unchecked TODO N]
FOR EACH last_step in all_last_steps:
  TaskUpdate(taskId=last_step, addBlocks=[rc.task_id])

# Finalize chain: Residual Commit → Code Review → State Complete (PR) → Report
TaskUpdate(taskId=rc.task_id, addBlocks=[cr.task_id])
IF pr_mode:
  TaskUpdate(taskId=cr.task_id, addBlocks=[sc.task_id])
  TaskUpdate(taskId=sc.task_id, addBlocks=[rp.task_id])
ELSE:
  TaskUpdate(taskId=cr.task_id, addBlocks=[rp.task_id])
```

### ⛔ Quick Mode Task Creation

> **Mode Gate**: In quick mode, `:Verify` sub-step is NOT created. Sub-steps per TODO: Worker → Wrap-up → Commit (3 steps instead of 4).

<details>
<summary>Quick Mode Variant (no Verify step)</summary>

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

# Init (PR only)
IF pr_mode:
  sb = TaskCreate(subject="Init:State Begin", ...)

# Per-TODO sub-steps — NO :Verify
FOR EACH "### [ ] TODO N: {title}" in plan:
  w  = TaskCreate(subject="{N}.1:Worker — {title}",
                  description="{full TODO section content}",
                  activeForm="{N}.1: Running Worker")
  wu = TaskCreate(subject="{N}.2:Wrap-up",
                  description="Wrap-up for TODO {N}. Save context + mark checkbox.",
                  activeForm="{N}.2: Wrapping up")
  IF commit_strategy_has_row(N):
    cm = TaskCreate(subject="{N}.3:Commit",
                    description="Commit TODO {N} changes. ...",
                    activeForm="{N}.3: Committing")

# Finalize tasks — ⛔ NO Code Review in Quick mode
rc = TaskCreate(subject="Finalize:Residual Commit", ...)
IF pr_mode:
  sc = TaskCreate(subject="Finalize:State Complete", ...)
rp = TaskCreate(subject="Finalize:Report", activeForm="Generating report",
     description="Output abbreviated summary report.")

# ═══════════════════════════════════════════════════
# TURN 2: Set ALL dependencies in PARALLEL (single message)
# ═══════════════════════════════════════════════════

FOR EACH unchecked TODO N:
  # Direct chain: Worker → Wrap-up → Commit (no Verify)
  TaskUpdate(taskId=w.task_id, addBlocks=[wu.task_id])
  IF task_ids[N].commit:
    TaskUpdate(taskId=wu.task_id, addBlocks=[cm.task_id])

IF pr_mode:
  FOR EACH unchecked TODO N:
    TaskUpdate(taskId=sb.task_id, addBlocks=[task_ids[N].worker])

all_last_steps = [task_ids[N].commit ?? task_ids[N].wrapup for each unchecked TODO N]
FOR EACH last_step in all_last_steps:
  TaskUpdate(taskId=last_step, addBlocks=[rc.task_id])

# Finalize chain (Quick): Residual Commit → State Complete (PR) → Report (no Code Review)
IF pr_mode:
  TaskUpdate(taskId=rc.task_id, addBlocks=[sc.task_id])
  TaskUpdate(taskId=sc.task_id, addBlocks=[rp.task_id])
ELSE:
  TaskUpdate(taskId=rc.task_id, addBlocks=[rp.task_id])
```

</details>

**⚠️ Key rule**: NEVER create tasks one-by-one across multiple turns. All TaskCreate in Turn 1, all TaskUpdate in Turn 2. Two turns total.

### 1.3 Set Cross-TODO Dependencies

From Plan's Dependency Graph table, link the **last sub-step** of the producer to the **Worker** of the consumer:

```
FOR EACH row where row.Requires != "-" AND both TODOs unchecked:
  producer_N = parse(row.Requires)  # e.g., "todo-1.config_path" → 1
  consumer_N = row.TODO

  # Last sub-step of producer = Commit (if exists) or Checkbox
  producer_last = task_ids[producer_N].commit ?? task_ids[producer_N].checkbox
  consumer_first = task_ids[consumer_N].worker

  TaskUpdate(taskId=producer_last, addBlocks=[consumer_first])
```

Verify with `TaskList()`:
```
Expected (PR mode, TODO 1 independent, TODO 2 depends on TODO 1):

#1  [pending] Init:State Begin
#2  [pending] 1.1:Worker — Config setup  [blocked by #1]
#3  [pending] 1.2:Verify          [blocked by #2]
#4  [pending] 1.3:Wrap-up         [blocked by #3]
#5  [pending] 1.4:Commit          [blocked by #4]
#6  [pending] 2.1:Worker — API    [blocked by #5]   ← cross-TODO dep
#7  [pending] 2.2:Verify          [blocked by #6]
#8  [pending] 2.3:Wrap-up         [blocked by #7]
#9  [pending] 3.1:Worker — Utils  [blocked by #1]
#10 [pending] 3.2:Verify          [blocked by #9]
#11 [pending] 3.3:Wrap-up         [blocked by #10]
#12 [pending] 3.4:Commit          [blocked by #11]
#13 [pending] Finalize:Residual Commit [blocked by #5, #8, #12]
#14 [pending] Finalize:Code Review     [blocked by #13]
#15 [pending] Finalize:State Complete  [blocked by #14]
#16 [pending] Finalize:Report          [blocked by #15]

→ Round 0: #1 (Init:State Begin)
→ Round 1: #2 (1.1:Worker), #9 (3.1:Worker) — parallel!
```

### 1.4 Init or Resume Context

```bash
CONTEXT_DIR=".dev/specs/{name}/context"
```

**First run** (no context folder):
```bash
mkdir -p "$CONTEXT_DIR"
```
Create: `outputs.json` (`{}`), `learnings.md`, `issues.md`, `audit.md` (empty).

**Resume** (context folder exists):
- Read `outputs.json` into memory (for variable substitution)
- Read `audit.md` into memory (for dynamic TODO recovery)
- Keep other files as-is (append mode)
- Progress determined from Plan checkboxes

---

## STEP 2: Execute Loop (Type-Based Dispatch)

### Dispatch Rules

**⚠️ CRITICAL: True parallel dispatch requires `run_in_background: true`.**

If you call `Task(...)` without `run_in_background`, Claude Code blocks until the agent returns — making execution sequential even if multiple tasks are runnable. To achieve real parallelism:

```
WHILE TaskList() has pending tasks:
  runnable = TaskList().filter(status=="pending" AND blockedBy==empty)

  IF len(runnable) > 1 AND all are :Worker or :Verify or :Commit:
    # PARALLEL dispatch — mark in_progress FIRST, then send ALL in ONE message
    FOR EACH task in runnable:
      TaskUpdate(taskId=task.id, status="in_progress")
    FOR EACH task in runnable (in single message):
      dispatch(task, run_in_background=true)
    # Poll for completion
    WAIT until any background task completes (check TaskOutput periodically)
    # Process completed tasks, mark completed, loop
  ELSE:
    # Single task — mark in_progress, read details, then dispatch
    TaskUpdate(taskId=task.id, status="in_progress")
    task_details = TaskGet(taskId=task.id)
    dispatch(task, task_details)
```

**Which types can run in parallel:**
- `:Worker` — YES (if touching disjoint files)
- `:Verify` — YES (no Edit/Write, no conflicts)
- `:Commit` — NO (git operations must be sequential)
- `:Wrap-up` — PARTIAL (outputs.json must be sequential, other files OK)
- `:State Begin/Complete` — NO (single task)

### Overhead Reduction Rules

**⚠️ DO NOT re-read context files between worker dispatches.**
- Worker results come back in the Task return value — use that directly
- Only read `outputs.json` when you need variable substitution for the NEXT worker
- Do NOT call `Read` on PLAN.md, learnings.md, issues.md between dispatches — you already have this in memory
- After a worker completes: `TaskUpdate(completed)` → `TaskList()` → dispatch next runnable. That's it. No extra Read/Bash calls.

**Dispatch by task subject suffix:**

| Suffix | Handler | Standard | Quick |
|--------|---------|----------|-------|
| `:State Begin` | 2α | `Skill("state", args="begin <PR#>")` | Same |
| `:Worker` | 2a | Variable substitution → Task(worker) | Same |
| `:Verify` | 2b | Dispatch verify worker → triage & reconcile | ⛔ **SKIPPED** (not created) |
| `:Wrap-up` | 2c | Save context (Worker + Verify) + mark Plan `[x]` | Save context (Worker only) + mark Plan `[x]` |
| `:Commit` | 2d | Task(git-master) per Commit Strategy | Same |
| `:Residual Commit` | 2f | `git status --porcelain` → git-master if dirty | Same |
| `:Code Review` | 2f.5 | Task(code-reviewer) with full diff → SHIP/NEEDS_FIXES | ⛔ **SKIPPED** (not created) |
| `:State Complete` | 2g | `Skill("state", args="complete <PR#>")` | Same |
| `:Report` | 2h | Full report from template | Abbreviated summary |

After each sub-step completes: `TaskUpdate(taskId, status="completed")` → removed from TaskList → dependents unblocked. **Immediately check TaskList() for newly unblocked tasks and dispatch without delay.**

---

### 2α. :State Begin — [PR Mode Only] Begin PR State

```
Skill("state", args="begin <PR#>")
```

- **Success** → `TaskUpdate(taskId, status="completed")` → all TODO `:Worker` tasks become unblocked.
- **"Already executing"** → **STOP immediately**. Guide: "PR #N already executing."
- **"PR is blocked"** → **STOP immediately**. Guide: "Release with `/state continue <PR#>`."

> Only created in PR mode. Local mode skips this task entirely.

---

### 2a. :Worker — Delegate Implementation

**1. Variable Substitution** — replace `${todo-N.outputs.field}` in TODO's Inputs with values from `context/outputs.json`:

```
# outputs.json: {"todo-1": {"config_path": "./config/app.json"}}
# Plan Inputs:  config_path: ${todo-1.outputs.config_path}
# Result:       config_path: ./config/app.json
```

> Full substitution details → REFERENCE A

**2. Build prompt and delegate:**

```
task_details = TaskGet(taskId={task.id})

Task(
  subagent_type="worker",
  description="Implement: {task.subject}",
  prompt="""
## TASK
{TODO title + Steps from task_details.description}

## EXPECTED OUTCOME
When this task is DONE, the following MUST be true:

**Outputs** (must generate):
{Outputs section from Plan}

**Acceptance Criteria** (all must pass):
{Acceptance Criteria section from Plan}

## REQUIRED TOOLS
IF todo_type == "work":
  - Read: Reference existing code
  - Edit/Write: Write code
  - Bash: Run build/tests
IF todo_type == "verification":
  - Read: Reference existing code
  - Bash: Run tests, builds, type checks, and boot test infrastructure (e.g., sandbox:up, docker-compose up)
  - ❌ Edit/Write: FORBIDDEN — do not modify source code

## MUST DO
- Perform only this Task
- Follow existing code patterns (see References below)
- Utilize Inherited Wisdom (see CONTEXT below)

## MUST NOT DO
{Must NOT do section from Plan}
- Do not perform other Tasks
- Do not add new dependencies
- Do not run git commands (Orchestrator handles this)

## CONTEXT
### References (from Plan)
{References section from Plan}

### Dependencies (from Inputs - substituted values)
{Actual values after substitution}

### Inherited Wisdom
SubAgent does not remember previous calls.

**Conventions (from learnings.md):**
{learnings.md content}

**Failed approaches to AVOID (from issues.md):**
{issues.md content}

**Key decisions & reconciliation history (from audit.md):**
{audit.md content}
"""
)
```

**PLAN field → Prompt section mapping:**

| PLAN Field | Prompt Section |
|------------|----------------|
| TODO title + Steps | `## TASK` |
| Outputs + Acceptance Criteria | `## EXPECTED OUTCOME` |
| Required Tools | `## REQUIRED TOOLS` |
| Steps | `## MUST DO` |
| Must NOT do | `## MUST NOT DO` |
| References | `## CONTEXT > References` |
| Inputs (after substitution) | `## CONTEXT > Dependencies` |

**3. On completion:** `TaskUpdate(taskId, status="completed")` → next sub-step becomes runnable (Standard: `:Verify`, Quick: `:Wrap-up`).

---

### 2b. :Verify — Verify Worker & Reconciliation

> **Mode Gate**:
> - ⛔ **Quick**: This entire section is SKIPPED. `:Verify` tasks are not created in quick mode. Worker self-report is trusted. On Worker failure → HALT immediately (log to `issues.md` and `audit.md`, stop execution). No retry, no adapt, no independent verification.

`:Verify` dispatches a **verify worker agent** that independently checks acceptance criteria **AND** must-not-do violations. No hook dependency — the verify worker is the source of truth.

**1. Dispatch Verify Worker:**

```
Task(
  subagent_type="worker",
  description="Verify: TODO {N} acceptance criteria + must-not-do",
  prompt="""
## TASK
You are a VERIFICATION worker. Your job is to independently verify
that TODO {N}'s acceptance criteria are met AND that must-not-do
rules were not violated.

DO NOT write or modify any code. Only READ and RUN verification commands.

## PART 1: ACCEPTANCE CRITERIA TO VERIFY
{Acceptance Criteria section from Plan for TODO N}

For each criterion, run the specified command and report PASS/FAIL:

1. Functional checks: run commands (test -f, curl, etc.)
2. Static checks: run linter/type-checker (tsc --noEmit, eslint, etc.)
3. Runtime checks: run tests (npm test, pytest, etc.)

⚠️ Do NOT trust the Worker's self-reported PASS status.
Re-execute every command yourself and judge independently.

## PART 2: MUST-NOT-DO VIOLATIONS
{Must NOT do section from Plan for TODO N}
{Standard must-not-do: no other Tasks, no new dependencies, no git commands}

For each must-not-do rule, check whether it was violated:
- Read `git diff` (staged + unstaged) to see what the Worker actually changed
- Check for must-not-do violations from the TODO's rules
- Check for new dependencies added (package.json, go.mod, etc.)
- Check for out-of-scope changes unrelated to this TODO

## PART 3: SIDE-EFFECT & CONTEXT AUDIT
Review the Worker's output JSON and the actual code changes:

1. **Suspicious PASS**: Did the Worker report PASS but the actual
   code doesn't fully satisfy the criterion? (e.g., stub implementation,
   TODO comments, partial logic, error swallowed silently)
2. **Undocumented side-effects**: Did the Worker change things not
   mentioned in its output? (e.g., modified shared utilities, changed
   configs, added exports not in scope)
3. **Missing context**: Did the Worker discover patterns, issues, or
   make decisions that should be in learnings/issues/decisions but aren't?

## PART 4: SCOPE-RELATED BLOCKAGE DETECTION
If you detect a failure that stems from SCOPE limitations (not Worker error),
populate the `suggested_adaptation` field:

**When to suggest adaptation:**
- **scope_violation**: Acceptance criteria requires work beyond current TODO's must-not-do boundaries
- **dod_gap**: DoD (Definition of Done) criterion cannot be met without expanding scope
- **dependency_missing**: Work requires outputs/artifacts not produced by any prior TODO

**Detection signals:**
1. Check if failed acceptance criteria require work that violates must-not-do rules
2. Check if the DoD explicitly requires work beyond current TODO's boundaries
3. Check if the Worker correctly identified a blocker but cannot fix it in-scope

**What NOT to suggest:**
- Worker made a mistake (code_error) → retry, don't adapt
- Environment issue (missing dependency, API key) → env_error, don't adapt
- Suspicious pass or missing context → side_effects, don't adapt

Only suggest adaptation when the PLAN itself needs adjustment, not the Worker's execution.

## OUTPUT FORMAT (strict JSON)
{
  "status": "VERIFIED" | "FAILED",
  "acceptance_criteria": {
    "pass": <number>,
    "fail": <number>,
    "results": [
      {
        "id": "<criterion_id>",
        "category": "functional" | "static" | "runtime",
        "description": "<what was checked>",
        "command": "<command run>",
        "status": "PASS" | "FAIL",
        "reason": "<failure reason, if FAIL>"
      }
    ]
  },
  "must_not_do": {
    "violations": [
      {
        "rule": "<which rule was violated>",
        "evidence": "<what was found>",
        "severity": "critical" | "warning"
      }
    ]
  },
  "side_effects": {
    "suspicious_passes": ["<criterion_id that looks questionable>"],
    "undocumented_changes": ["<file or change not mentioned in output>"],
    "missing_context": ["<learning/issue/decision Worker should have reported>"]
  },
  "suggested_adaptation": {
    // ⚠️ Only include this field when status is FAILED AND you detect a scope-related blockage
    // (e.g., DoD criterion requires work that violates must-not-do, or needs missing dependency)
    "blockage_type": "scope_violation" | "dod_gap" | "dependency_missing",
    "suggested_todo": {
      "title": "<concise TODO title for what needs to be added to plan>",
      "reason": "<why current scope cannot satisfy this criterion>",
      "steps": ["<step 1>", "<step 2>", ...],
      "scope_justification": "<why this new TODO is necessary and in-scope for the overall plan>"
    },
    "scope_signals": {
      "dod_related": ["<which acceptance criteria cannot be met with current scope>"],
      "within_todo_scope": <boolean — true if work fits within current TODO's must-not-do rules, false if out-of-scope>
    }
  }
}

## MUST NOT DO
- Do not modify any files
- Do not write code or fix issues
- Do not run git commands (except read-only: git diff, git status)
- Only verify — report results objectively
"""
)
```

**2. Parse result & route by status:**

- **VERIFIED** (all criteria PASS, no critical violations, no suspicious passes) → `TaskUpdate(taskId, status="completed")` → `:Wrap-up` becomes runnable.
- **FAILED** (any criterion FAIL, or critical must-not-do violation, or suspicious pass found) → `reconcile(TODO_N, verify_result, depth=0)` — pass the result directly, no re-dispatch.

> **`:Wrap-up` enrichment**: When VERIFIED, merge `side_effects.missing_context` into the Worker's learnings/issues/decisions before saving. This ensures context is complete even if the Worker under-reported.

**3. Reconciliation — single-pass triage + loop:**

```
function reconcile(TODO_N, verify_result, depth=0):
  # verify_result is passed in from :Verify handler (no duplicate dispatch)
  if verify_result.status == "VERIFIED" → mark completed, done

  # Log non-blocking items FIRST (always, regardless of disposition)
  log_non_blocking(verify_result)  # warnings → audit.md, undocumented → issues.md, missing_context → learnings.md

  # Single-pass triage (precedence: halt > adapt > retry)
  disposition = triage(verify_result, TODO_N.type)
  append_audit("triage", TODO_N, disposition, verify_result)  # always log triage decision

  if disposition == HALT → log to issues.md, stop execution
  if disposition == ADAPT → adapt(TODO_N, verify_result, depth)
  if disposition == RETRY → retry_loop(TODO_N, verify_result, depth)

function retry_loop(TODO_N, verify_result, depth):
  for attempt in 1..3:
    append_audit("retry", TODO_N, attempt)  # log retry intent
    fix_prompt = build_fix_prompt(verify_result)  # failed criteria + violations + suspicious passes
    Task(subagent_type="worker", prompt=fix_prompt)
    verify_result = dispatch_verify_worker(TODO_N)
    if VERIFIED → done
    log_non_blocking(verify_result)
    disposition = triage(verify_result, TODO_N.type)  # re-triage each cycle
    append_audit("triage", TODO_N, disposition, verify_result)
    if disposition == HALT → stop
    if disposition == ADAPT → adapt(TODO_N, verify_result, depth); return
  # 3 retries exhausted → halt
  halt("retry_exhausted")
```

> **Pattern**: Worker → Verify Worker → triage → (halt | adapt | retry)
> Each verify cycle re-triages from scratch. `suggested_adaptation` triggers adapt immediately — even mid-retry.

**4. Triage rules:**

Single pass. Precedence: **halt > adapt > retry**. Non-blocking items (warnings, undocumented changes, missing context) are logged to `audit.md` and do not block — no separate "skip" disposition needed.

```
function triage(verify_result, todo_type) → HALT | ADAPT | RETRY:
  # todo_type detection:
  #   "verification" — PLAN has `type: verification` field, OR title matches "TODO Final: Verification"
  #   "work"         — all other TODOs (default)

  # --- HALT (highest precedence) ---
  IF any must_not_do with severity==critical → HALT
  IF any env_error (permission, API key, network) → HALT

  # --- ADAPT (scope blocker OR verification TODO) ---
  IF suggested_adaptation present:
    IF scope_check(suggested_adaptation) == safe → ADAPT
    IF scope_check(suggested_adaptation) == destructive_out_of_scope → HALT

  IF todo_type == "verification" AND any acceptance_criteria FAIL:
    → ADAPT (auto-generate fix TODO from failed criteria)
    # Verification TODOs cannot use Edit/Write — retry cannot fix code.
    # Orchestrator builds suggested_adaptation from failed criteria:
    #   title: "Fix: {failed_criterion.description}"
    #   steps: derived from failure reason + affected files
    #   scope: safe (fixing own project's code)

  # --- RETRY (code error, suspicious pass — work TODOs only) ---
  IF any acceptance_criteria FAIL or suspicious_pass → RETRY

  # --- Non-blocking items (logged, not dispositions) ---
  # must_not_do warning     → log to audit.md
  # undocumented_change     → log to audit.md + issues.md
  # missing_context         → log to audit.md + learnings.md
```

| Disposition | Cause | Action |
|-------------|-------|--------|
| **halt** | critical violation, env_error, destructive out-of-scope | Stop execution |
| **adapt** | Scope blocker, OR verification TODO with failures | Create fix TODO → resolve → re-verify |
| **retry** | Code error in work TODO (Worker fixable) | Fix Worker → re-verify (max 3) |

**5. scope_check — single function:**

```
function scope_check(suggested_adaptation) → safe | destructive_out_of_scope:
  # in_scope detection:
  #   needed_for_DoD = any acceptance_criteria in current TODO references the adaptation target
  #   within_todo_scope = adaptation doesn't violate the TODO's must-not-do rules
  in_scope = (needed_for_DoD OR within_todo_scope)

  # destructive detection (ANY of these → destructive):
  #   DB schema changes (migrations, ALTER TABLE)
  #   API breaking changes (endpoint removal, response shape change)
  #   Shared resource deletion (files imported by multiple modules)
  #   Auth/security changes (token handling, permissions, secrets)
  #   External config (CI/CD, deployment, infrastructure)
  destructive = matches_any_destructive_pattern(suggested_adaptation)

  IF in_scope → safe
  IF NOT in_scope AND NOT destructive → safe (log "out-of-scope, non-destructive" to audit.md)
  IF NOT in_scope AND destructive → destructive_out_of_scope
```

Bias toward action: only halt on destructive out-of-scope. Everything else proceeds with logging.

**6. Adapt flow:**

```
function adapt(TODO_N, verify_result, depth):
  IF depth >= 1 → halt("depth_limit")  # no nested adaptation
  # count_dynamic_todos: count PLAN.md entries matching "TODO {N}.a*" (ADDED) markers
  IF count_dynamic_todos(TODO_N) >= 3 → halt("max_dynamic_todos")  # max 3 per original
  suffix = next_suffix(TODO_N)  # "a", "b", "c" — sequential per original TODO

  # 1. Update PLAN.md
  Edit: insert after TODO {N}:
    ### [ ] TODO {N}.{suffix}: (ADDED) {suggested_todo.title}

  # 2. Log to audit.md
  append_audit("adapt", TODO_N, suggested_adaptation)

  # 3. Create & run dynamic TODO (Task subject matches PLAN marker)
  dynamic_task = TaskCreate(
    subject="{N}.{suffix}:Adapt — {suggested_todo.title}",
    description="{suggested_todo.description}",
    metadata={is_dynamic: true, parent_todo: N}
  )
  → reconcile(dynamic_task, depth=1)  # same flow, depth incremented

  # 4. Result
  IF dynamic_task VERIFIED:
    → Mark PLAN.md: [x] TODO {N}.{suffix}
    → Update audit.md: Status = COMPLETED
    → Retry original TODO {N} via reconcile(TODO_N, new_verify_result, depth=0)
  ELSE:
    → Mark PLAN.md: TODO {N}.{suffix} — FAILED
    → Update audit.md: Status = FAILED
    → halt("dynamic_todo_failed")
```

**Safety limits:**
- **depth=1**: Dynamic TODOs (depth=1) use the same reconcile flow but `adapt()` is blocked at depth≥1. Retry (max 3) still works.
- **Max 3 dynamic TODOs** per original TODO. 4th attempt → halt.

**7. Audit logging — single file `audit.md`:**

All reconciliation events go to one file. Replaces `decisions.md` + `amendments.md`.

```markdown
## TODO {N} — Reconciliation

### [YYYY-MM-DD HH:MM] Triage
- acceptance_criteria:login_test FAIL → retry
- must_not_do:no_git_commands warning → logged (non-blocking)
- suggested_adaptation:scope_violation → adapt

### [YYYY-MM-DD HH:MM] Retry #1
- Fix prompt sent, re-verified → FAIL
- acceptance_criteria:login_test FAIL → retry

### [YYYY-MM-DD HH:MM] Adapt
- **Dynamic TODO**: {N}.a — {title}
- **Trigger**: {blockage_type}
- **Scope**: safe (needed_for_DoD=YES)
- **Status**: COMPLETED | FAILED

### [YYYY-MM-DD HH:MM] Halted (if applicable)
- **Reason**: {reason}
- **Evidence**: {evidence}
```

**Mode-specific halt behavior:**
- **Local**: Record in `issues.md`, report to user, offer Continue/Stop. Plan checkbox stays `[ ]`.
- **PR**: `Skill("state", args="pause <PR#> <reason>")` → records "Blocked" comment → stop execution.

> Full reconciliation details → REFERENCE C

---

### 2c. :Wrap-up — Save Context + Mark Checkboxes

Combines context saving and checkbox marking into a single step.

- **Standard**: Only runs after `:Verify` completes (VERIFIED, or reconciliation resolved).
- **Quick**: Runs directly after `:Worker` completes. No verify result to process.

**Part A: Save to Context Files**

| Source | Field | File | Format | Mode |
|--------|-------|------|--------|------|
| Worker | `outputs` | `outputs.json` | `existing["todo-N"] = outputs` → Write | Both |
| Worker | `learnings` | `learnings.md` | `## {N}\n- item` append | Both |
| Worker | `issues` | `issues.md` | `## {N}\n- [ ] item` append | Both |
| Verify | `side_effects.missing_context` | `learnings.md` / `issues.md` | Merge into appropriate file | Standard only |
| Verify | `side_effects.undocumented_changes` | `issues.md` | `- [ ] Undocumented: {change}` append | Standard only |
| Orchestrator | all reconciliation events | `audit.md` | structured entry (see section 7 format) | Standard only |
| `acceptance_criteria` | (not saved) | Used only for verification, not saved to context | Standard only |

Skip empty arrays.

**⚠️ `outputs.json` race condition**: When multiple `:Wrap-up` tasks run in parallel, save `outputs.json` **sequentially** (Read → merge → Write one at a time). Other context files are safe for parallel append.

```
# Parallel 1.3:Wrap-up and 3.3:Wrap-up both runnable:

# outputs.json — SEQUENTIAL:
current = Read("outputs.json")
current["todo-1"] = result1.outputs
Write("outputs.json", current)

current = Read("outputs.json")
current["todo-3"] = result3.outputs
Write("outputs.json", current)

# learnings.md, issues.md — PARALLEL OK (append mode)
```

**Part B: Mark Plan Checkboxes**

**1. Update Plan TODO checkbox:**
```
Edit(plan_path, "### [ ] TODO N: ...", "### [x] TODO N: ...")
```

**2. Update Acceptance Criteria checkboxes:**

**Standard mode**: Based on `:Verify` results.

The `:Verify` step produces `acceptance_criteria` with per-item `status` (PASS/FAIL). Use this to check individual items:

```
FOR EACH criterion in verify_result.acceptance_criteria:
  IF criterion.status == "PASS":
    Edit(plan_path,
         "- [ ] {criterion.description}",
         "- [x] {criterion.description}")
```

**⚠️ Caution (Standard mode):**
- Only check items whose `status` is `PASS` from the `:Verify` result
- Do not check based on SubAgent report alone — use verify worker result
- Items with `status: FAIL` remain `- [ ]`
- Do NOT check Steps items (`- [ ]` under `**Steps**:`) — only Acceptance Criteria

**⛔ Quick mode**: No `:Verify` result available. Check all Acceptance Criteria items as `[x]` based on Worker's self-reported completion. The Worker is trusted in quick mode.

```
# Quick mode: trust Worker self-report
FOR EACH acceptance criterion in TODO N:
  Edit(plan_path,
       "- [ ] {criterion.description}",
       "- [x] {criterion.description}")
```

On completion: `TaskUpdate(taskId, status="completed")` → `:Commit` becomes runnable (if exists), or next TODO's `:Worker` is unblocked.

---

### 2e. :Commit — Per-TODO Commit via git-master

Find matching row in Plan's `## Commit Strategy` table:
- `Condition: always` → commit
- `Condition: {cond}` → evaluate condition
- No row → this sub-step should not have been created (see 1.3)

```
Task(
  subagent_type="git-master",
  description="Commit {N}",
  prompt="""
Commit TODO {N} changes.
Commit message: {Message from Commit Strategy table}
Files: {Files from Commit Strategy table}
Push after commit: {YES if PR mode, NO if Local mode}
"""
)
```

If commit fails, log to `issues.md` and report to user.

On completion: `TaskUpdate(taskId, status="completed")` → next TODO's `:Worker` is unblocked (if cross-TODO dependency exists).

---

### 2f. :Residual Commit — Check & Commit Remaining Changes

```bash
git status --porcelain
```

If changes exist (context files, unexpected modifications):
```
Task(
  subagent_type="git-master",
  description="Commit: residual changes",
  prompt="""
Plan execution complete. Run `git status`.
If changes: commit "chore({plan-name}): miscellaneous changes"
Push: {YES if PR mode, NO if Local mode}
If clean: report "No uncommitted changes" and exit.
"""
)
```

On completion: `TaskUpdate(taskId, status="completed")` → `:Code Review` (standard) or `:State Complete` (quick+PR) or `:Report` becomes runnable.

---

### 2f.5. :Code Review — Final Quality Gate [Standard Only]

> **Mode Gate**: ⛔ **Quick**: SKIPPED (not created).

#### Pre-flight: Diff Size Check

```
base_branch = detect_base_branch()  # main or develop
diff_stat = Bash("git diff ${base_branch}...HEAD --stat")
diff = Bash("git diff ${base_branch}...HEAD")

# If diff exceeds ~30k characters, add a summary note for the reviewer:
# "Note: Large diff ({N} files, {M} lines). Focus on cross-cutting integration issues."
```

#### Dispatch Code Review

```
Task(
  subagent_type="code-reviewer",
  description="Final code review",
  prompt="""
## Complete PR Diff

${diff}

## PLAN Context
Plan: .dev/specs/{name}/PLAN.md

## Review Instructions
Review this complete diff for:
1. Side effects on existing codebase
2. Design/architecture impact
3. Structural improvements needed
4. API contract / breaking changes
5. Integration issues between TODOs
6. Hidden bugs (edge cases, race conditions, null handling)
7. Security concerns
8. Production readiness (error handling, logging, consistency)

Output verdict: SHIP or NEEDS_FIXES.
"""
)
```

#### Audit Logging

All code review results are logged to `context/audit.md` with explicit status:
```markdown
## Final Code Review

### [YYYY-MM-DD HH:MM] Review #1
- Status: SHIP | NEEDS_FIXES | SKIPPED | DEGRADED
- Findings: CR-001 [critical] ..., CR-002 [warning] ...
- Action: Proceed | Fix tasks created for CR-001, CR-002

### [YYYY-MM-DD HH:MM] Review #2 (if retry)
- Status: SHIP | NEEDS_FIXES
- Remaining: ...
- Action: Proceed | Remaining issues logged to issues.md
```

#### Routing

**SHIP** (reviewed and passed):
```
Log "Status: SHIP" to audit.md → TaskUpdate(taskId, status="completed") → next step unblocked
```

**SKIPPED / DEGRADED** (codex CLI unavailable or call failed):
```
Log explicit "Status: SKIPPED" or "Status: DEGRADED" to audit.md (NOT logged as SHIP)
TaskUpdate(taskId, status="completed") → next step unblocked
# ⚠️ Report will note: "Code review: SKIPPED (codex unavailable)" or "Code review: DEGRADED (call failed)"
# This is distinct from SHIP — the review did NOT happen, but execution continues
```

> **Rationale**: Code review is an additive quality gate. If unavailable, per-TODO verification
> (Worker + Verify) already provides baseline quality assurance. The explicit SKIPPED/DEGRADED
> status ensures operators know the review was not performed.

**NEEDS_FIXES** — Dynamic Fix Chain:

> ⚠️ **Key constraint**: Completed tasks cannot be re-dispatched. NEEDS_FIXES creates
> NEW task instances for the fix-and-retry cycle.

1. Log verdict + findings to `context/audit.md`
2. Extract Fix Items from code-reviewer output (max 3 items)
3. Determine the next step task (`:State Complete` or `:Report`):
   ```
   next_step_id = sc.task_id if pr_mode else rp.task_id
   ```
4. Create fix tasks:
   ```
   fix_tasks = []
   FOR EACH fix_item (max 3):
     fix = TaskCreate(subject="Fix:CR-{id} — {title}",
                      description="Fix: {detail}. File: {file}:{line}. Include acceptance_criteria in output JSON.",
                      activeForm="Fixing CR-{id}")
     fix_tasks.append(fix)
   ```
5. Create new Finalize tasks for retry:
   ```
   rc2 = TaskCreate(subject="Finalize:Residual Commit (post-fix)",
                    description="Commit fix changes after code review",
                    activeForm="Committing fixes")
   cr2 = TaskCreate(subject="Finalize:Code Review (retry)",
                    description="Re-review complete diff after fixes. This is the FINAL review — max 1 retry.",
                    activeForm="Re-reviewing all changes")
   ```
6. Set dependencies — fix tasks → RC2 → CR2 → next step:
   ```
   FOR EACH fix in fix_tasks:
     TaskUpdate(taskId=fix.task_id, addBlocks=[rc2.task_id])
   TaskUpdate(taskId=rc2.task_id, addBlocks=[cr2.task_id])
   # CR2 must block the next step BEFORE CR1 completes:
   TaskUpdate(taskId=cr2.task_id, addBlocks=[next_step_id])
   ```
7. Complete Code Review #1:
   ```
   TaskUpdate(taskId=cr1.task_id, status="completed")
   # State Complete/Report is now blocked by BOTH cr1 (completed ✅) AND cr2 (pending ⏳)
   # → remains blocked until cr2 also completes
   ```

> **Why this works**: Adding CR2 as a blocker to State Complete/Report BEFORE completing CR1
> ensures the next step remains blocked. When CR1 completes, the next step is still blocked by CR2.
> Fix tasks → RC2 → CR2 must all complete before the pipeline continues.

**Code Review (retry)** — same dispatch as above, with one difference:

If retry still returns **NEEDS_FIXES**:
- Log remaining issues to `context/issues.md`
- Log to `context/audit.md`: "Status: NEEDS_FIXES (max retries reached). Remaining issues logged."
- `TaskUpdate(taskId=cr2, status="completed")` → proceed to State Complete / Report
- Report will include unresolved code review findings

> **Design note on Fix Task verification**: Fix tasks are Worker-only (no separate Verify agent).
> The Code Review retry serves as integration-level verification for all fixes. This is intentional:
> fixes are small targeted changes, and the retry reviews the COMPLETE diff including fixes.

On completion: `TaskUpdate(taskId, status="completed")` → `:State Complete` (PR) or `:Report` becomes runnable.

---

### 2g. :State Complete — [PR Mode Only] Complete PR State

```
Skill("state", args="complete <PR#>")
```
Removes `state:executing` label, converts Draft → Ready, adds "Published" comment.

On completion: `TaskUpdate(taskId, status="completed")` → `:Report` becomes runnable.

---

### 2h. :Report — Final Orchestration Report

> **Mode Gate**:
> - ⛔ **Quick**: Output an abbreviated summary instead of the full template. No need to Read the template file.

**Standard mode:**

```
TaskUpdate(report.id, status="in_progress")
template = Read("${baseDir}/references/report-template.md")   ← actual file read
# Output report verbatim, replacing {placeholders} with real values
# Do NOT invent your own format — follow the template exactly
TaskUpdate(report.id, status="completed")
```

**Why Read instead of TaskGet:** The template lives in `references/report-template.md`. Reading it immediately before output keeps the template in close context and prevents the agent from generating a custom format.

**⛔ Quick mode:**

```
TaskUpdate(report.id, status="in_progress")
# Output abbreviated summary — no template file needed
```

Quick mode report format:
```
═══════════════════════════════════════════════════════════
                    ORCHESTRATION COMPLETE
═══════════════════════════════════════════════════════════

PLAN: {plan_path}
MODE: {Local | PR #N} (quick)

RESULT: {completed}/{total} TODOs completed
COMMITS: {count} commits created
FILES: {count} files modified

{If any issues exist:}
ISSUES:
  {from context/issues.md, or "None"}
═══════════════════════════════════════════════════════════
```

On completion: `TaskUpdate(taskId, status="completed")` → all tasks done, execution ends.

---

## STEP 3: Finalize

Finalize tasks (Residual Commit, Code Review, State Complete, Report) are dispatched in the execution loop as `:Residual Commit`, `:Code Review` (2f.5, standard only), `:State Complete`, `:Report` handlers (2f, 2g, 2h). If Code Review returns NEEDS_FIXES, dynamic fix tasks + retry chain are created (see 2f.5 for details).

---

## REFERENCE

### A. Variable Substitution Details

All TODO outputs are stored in `context/outputs.json`:

```json
{
  "todo-1": { "config_path": "./config/app.json" },
  "todo-2": { "api_module": "src/api/index.ts" }
}
```

Substitution logic:
1. Read `context/outputs.json`
2. Find `${todo-N.outputs.field}` pattern in current TODO's Inputs
3. Extract value from JSON and replace
4. Include substituted value in Worker prompt

### B. Context System

| File | Writer | Purpose |
|------|--------|---------|
| `outputs.json` | Worker → Orchestrator saves | TODO output values (input for next TODO) |
| `learnings.md` | Worker → Orchestrator saves | Patterns discovered and applied |
| `issues.md` | Worker → Orchestrator saves | Unresolved issues (`- [ ]` format) |
| `audit.md` | Orchestrator | All reconciliation events (triage, retry, adapt, halt) |

**Context Lifecycle:**
```
Before TODO #1 → Read context → inject into prompt
After TODO #1  → Save outputs + learnings
Before TODO #2 → Read outputs.json → substitute ${todo-1.outputs.X}
After TODO #2  → Update outputs.json + append learnings
(Accumulates. Preserved in files across sessions.)
```

### C. Reconciliation Details

**K8s-style reconciliation pattern (Worker → Verify Worker → triage):**
```
Desired State: All acceptance_criteria PASS, no critical violations
Current State: Verify Worker result

[VERIFIED] → Save context (2c) — include missing_context from Verify
[FAILED] → reconcile(TODO_N, verify_result, depth=0):
  log_non_blocking() → triage(verify_result, todo_type) → single disposition (halt > adapt > retry):
  halt    → Stop execution, log to audit.md + issues.md
  adapt   → Create dynamic TODO via reconcile(depth+1), then retry original
  retry   → Fix Worker → re-verify (max 3), re-triage each cycle
  All triage decisions + retry attempts logged to audit.md
```

**Decision trail**: All events (triage, retry attempts, adapt, halt) recorded in single `audit.md`. Non-blocking items (warnings, undocumented changes) logged but don't produce a disposition.

**Dynamic TODO rules:**
- Created by `adapt()` — uses same `reconcile()` flow at depth=1
- Can be retried (max 3) but cannot trigger further `adapt()` (depth≥1 blocks it)
- Max 3 dynamic TODOs per original TODO
- On failure → halt

**issues.md log format (on halt):**
```markdown
## [YYYY-MM-DD HH:MM] {TODO name} Failed

**Category**: env_error | unknown
**Error**: {error message}
**Retry Count**: {n}
**Analysis**: {why human intervention needed}
**Suggestion**: {recommended action}
```

### D. Commit Strategy Details

**Per-TODO commit flow:**
1. Parse Commit Strategy table from PLAN.md
2. Find matching row for current TODO number
3. `Condition: always` → commit; `Condition: {cond}` → evaluate; No row → skip
4. Delegate to `git-master` agent
5. Wait for completion before next TODO

**Push decision:**
| Mode | Push after commit |
|------|-------------------|
| PR mode | YES |
| Local mode | NO |

### E. Parallelization Examples (Sub-Step Model)

**Setup**: PR mode. TODO 1 (independent), TODO 2 (depends on TODO 1), TODO 3 (independent).
TODO 1 and TODO 3 have commits; TODO 2 does not.

#### Standard Mode

```
TaskList() after initialization:

#1  [pending] Init:State Begin
#2  [pending] 1.1:Worker — Config setup  [blocked by #1]
#3  [pending] 1.2:Verify          [blocked by #2]
#4  [pending] 1.3:Wrap-up         [blocked by #3]
#5  [pending] 1.4:Commit          [blocked by #4]
#6  [pending] 2.1:Worker — API    [blocked by #5]   ← cross-TODO dep
#7  [pending] 2.2:Verify          [blocked by #6]
#8  [pending] 2.3:Wrap-up         [blocked by #7]
#9  [pending] 3.1:Worker — Utils  [blocked by #1]
#10 [pending] 3.2:Verify          [blocked by #9]
#11 [pending] 3.3:Wrap-up         [blocked by #10]
#12 [pending] 3.4:Commit          [blocked by #11]
#13 [pending] Finalize:Residual Commit [blocked by #5, #8, #12]  ← #5=1.4:Commit, #8=2.3:Wrap-up, #12=3.4:Commit
#14 [pending] Finalize:Code Review     [blocked by #13]
#15 [pending] Finalize:State Complete  [blocked by #14]
#16 [pending] Finalize:Report          [blocked by #15]
```

**Execution Rounds (auto-determined by TaskList):**

```
Round 0:  #1 Init:State Begin                   ← PR only
Round 1:  #2 1.1:Worker, #9 3.1:Worker           ← PARALLEL
Round 2:  #3 1.2:Verify, #10 3.2:Verify          ← PARALLEL
Round 3:  #4 1.3:Wrap-up, #11 3.3:Wrap-up        ← PARALLEL (outputs.json sequential!)
Round 4:  #5 1.4:Commit, #12 3.4:Commit          ← PARALLEL
Round 5:  #6 2.1:Worker                           ← unblocked after #5
Round 6:  #7 2.2:Verify
Round 7:  #8 2.3:Wrap-up
Round 8:  #13 Finalize:Residual Commit            ← blocked by all TODO last steps
Round 9:  #14 Finalize:Code Review                ← blocked by #13
Round 10: #15 Finalize:State Complete             ← blocked by #14
Round 11: #16 Finalize:Report                     ← blocked by #15
```

#### ⛔ Quick Mode (same setup)

```
TaskList() after initialization (no :Verify tasks):

#1  [pending] Init:State Begin
#2  [pending] 1.1:Worker — Config setup  [blocked by #1]
#3  [pending] 1.2:Wrap-up         [blocked by #2]
#4  [pending] 1.3:Commit          [blocked by #3]
#5  [pending] 2.1:Worker — API    [blocked by #4]   ← cross-TODO dep
#6  [pending] 2.2:Wrap-up         [blocked by #5]
#7  [pending] 3.1:Worker — Utils  [blocked by #1]
#8  [pending] 3.2:Wrap-up         [blocked by #7]
#9  [pending] 3.3:Commit          [blocked by #8]
#10 [pending] Finalize:Residual Commit [blocked by #4, #6, #9]
#11 [pending] Finalize:State Complete  [blocked by #10]
#12 [pending] Finalize:Report          [blocked by #11]
```

**Execution Rounds:**

```
Round 0:  #1 Init:State Begin
Round 1:  #2 1.1:Worker, #7 3.1:Worker     ← PARALLEL
Round 2:  #3 1.2:Wrap-up, #8 3.2:Wrap-up   ← PARALLEL
Round 3:  #4 1.3:Commit, #9 3.3:Commit     ← PARALLEL
Round 4:  #5 2.1:Worker                     ← unblocked after #4
Round 5:  #6 2.2:Wrap-up
Round 6:  #10 Finalize:Residual Commit
Round 7:  #11 Finalize:State Complete
Round 8:  #12 Finalize:Report
```

> Quick mode saves 2 rounds (no Verify rounds) — 8 rounds vs 10 rounds for the same plan.

### F. Session Recovery

Plan checkbox is the only durable state, so recovery = fresh start:

```
### [x] TODO 1: Config setup       ← skip (complete)
### [ ] TODO 2: API implementation ← create sub-step Tasks
### [x] TODO 3: Utils              ← skip (complete)
### [ ] TODO 4: Integration        ← create sub-step Tasks
```

1. Parse checkboxes → only unchecked TODOs
2. Create sub-step Tasks for each unchecked TODO:
   - **Standard**: Worker, Verify, Wrap-up, Commit
   - **⛔ Quick**: Worker, Wrap-up, Commit (no Verify)
3. Set intra-TODO chains + cross-TODO dependencies (only between unchecked)
4. Load `outputs.json` (variable substitution works if prior outputs saved)
5. Resume execution loop — dispatch picks up from where it left off

**Why recovery is simple:**
- No need to worry about Task system state (always recreated from scratch)
- Can see progress from Plan checkbox alone
- Variable substitution works normally if `outputs.json` exists
- Sub-step Tasks are ephemeral — recreated each session

### G. State & Task System

**Plan checkbox = only source of truth.** Task system = sub-step parallelization helper (recreated each session).

**Task types**: Init (1, PR only) + per-TODO sub-steps + Finalize (2-3):

| Sub-Step | Standard Subject | Quick Subject | Purpose |
|----------|-----------------|---------------|---------|
| `:State Begin` | `Init:State Begin` | Same | [PR only] Begin PR state |
| `:Worker` | `{N}.1:Worker — {title}` | `{N}.1:Worker — {title}` | Delegate implementation to worker agent |
| `:Verify` | `{N}.2:Verify` | ⛔ **Not created** | Dispatch verify worker, triage & reconcile if FAILED |
| `:Wrap-up` | `{N}.3:Wrap-up` | `{N}.2:Wrap-up` | Save context + mark Plan `[x]` |
| `:Commit` | `{N}.4:Commit` | `{N}.3:Commit` | Commit via git-master (only if Commit Strategy row exists) |
| `:Residual Commit` | `Finalize:Residual Commit` | Same | Check & commit remaining changes |
| `:Code Review` | `Finalize:Code Review` | ⛔ **Not created** | Final quality gate — review entire diff |
| `:State Complete` | `Finalize:State Complete` | Same | [PR only] Complete PR state |
| `:Report` | `Finalize:Report` | Same (abbreviated output) | Output final orchestration report |

**Task tools:**

| Tool | Role | When |
|------|------|------|
| TaskCreate | TODO → sub-step Tasks | Session start |
| TaskUpdate | Dependency (addBlocks) / completion | After create / after each sub-step |
| TaskList | Find runnable sub-steps | Every loop iteration |
| TaskGet | Query details | Before worker prompt |

**Dependency types:**

```
# Init (PR only):
Init:State Begin → all {N}.1:Worker tasks

# Intra-TODO chain:
Standard: {N}.1:Worker → {N}.2:Verify → {N}.3:Wrap-up → {N}.4:Commit
Quick:    {N}.1:Worker → {N}.2:Wrap-up → {N}.3:Commit

# Cross-TODO (from Dependency Graph):
Standard: 1.4:Commit (or 1.3:Wrap-up) → 2.1:Worker
Quick:    1.3:Commit (or 1.2:Wrap-up) → 2.1:Worker

# Finalize chain:
# Standard: all TODO last steps → Residual Commit → Code Review → State Complete (PR) → Report
# Quick:    all TODO last steps → Residual Commit → State Complete (PR) → Report
#
# NEEDS_FIXES dynamic extension (Standard only):
# ... → Code Review (NEEDS_FIXES) → [Fix:CR-xxx tasks] → Residual Commit (post-fix) → Code Review (retry) → State Complete → Report
# New tasks are created dynamically; completed tasks are NOT re-dispatched.
```

Usage: `TaskUpdate(status="in_progress")` — before dispatching. `TaskUpdate(status="completed")` — after sub-step finishes. Both are used.

**⚠️ Why `in_progress` matters**: With parallel dispatch, `TaskList().filter(status=="pending")` is used to find runnable tasks. Without marking dispatched tasks as `in_progress`, the next loop iteration would re-dispatch them. Always mark `in_progress` BEFORE dispatching.

### H. Mode Differences (PR vs Local)

| Item | Local Mode | PR Mode |
|------|-----------|---------|
| Spec location | `.dev/specs/{name}/PLAN.md` | Parse from PR body |
| State management | Plan checkbox only | Plan checkbox + `/state` skill |
| History | Context files | Context + PR Comments |
| Block handling | Record in context, report to user | `Skill("state", args="pause")` |
| After completion | Per-TODO commits → Report | Commits + push → `/state complete` |

### I. Checklist Before Stopping

#### Common (all modes)

**1. Init Tasks (PR Mode Only):**
- [ ] `Init:State Begin` task created and completed?
- [ ] Stopped immediately on failure?

**2. Task Initialization:**
- [ ] Identified unchecked TODOs from Plan?
- [ ] Created sub-step Tasks for each unchecked TODO?
- [ ] Cross-TODO dependencies set from Dependency Graph?

**3. Execution Phase:**
- [ ] No pending Tasks in TaskList?
- [ ] TaskUpdate(status="completed") on each sub-step?
- [ ] All `:Worker` tasks delegated to worker agent?
- [ ] All `:Wrap-up` tasks saved context + marked Plan `[x]`?
- [ ] All `:Commit` tasks delegated to git-master?
- [ ] Pushed after each commit (PR mode)?

**4. Finalize Tasks:**
- [ ] `Finalize:Residual Commit` task completed?
- [ ] `Finalize:Code Review` task completed? (standard mode only)
- [ ] `Finalize:State Complete` task completed? (PR mode only)
- [ ] `Finalize:Report` task completed?
- [ ] All Finalize tasks dispatched through execution loop?

**Exception Handling:**
- [ ] `Skill("state", args="pause <PR#> <reason>")` on block? (PR)
- [ ] `issues.md` updated on block? (Local)

#### Standard mode (additional)
- [ ] Sub-steps created: Worker, Verify, Wrap-up, Commit per TODO?
- [ ] Intra-TODO chains set (Worker→Verify→Wrap-up→Commit)?
- [ ] All `:Verify` tasks dispatched verify worker + triaged + reconciled if needed?
- [ ] `:Code Review` dispatched code-reviewer agent with full diff?
- [ ] Code review status (SHIP/NEEDS_FIXES/SKIPPED/DEGRADED) logged to `audit.md`?
- [ ] If NEEDS_FIXES: new fix tasks + Residual Commit (post-fix) + Code Review (retry) created?
- [ ] If SKIPPED/DEGRADED: explicit status noted in report (not logged as SHIP)?
- [ ] Triage decisions logged in `audit.md`?
- [ ] Verify `side_effects.missing_context` merged into context files?

#### ⛔ Quick mode (overrides)
- [ ] Sub-steps created: Worker, Wrap-up, Commit per TODO (NO Verify)?
- [ ] Intra-TODO chains set (Worker→Wrap-up→Commit)?
- [ ] No `:Verify` tasks exist?
- [ ] No `:Code Review` task exist?
- [ ] No reconciliation attempted (pass or halt only)?
- [ ] Worker self-report trusted for acceptance criteria?
- [ ] Abbreviated report output (not full template)?

**Continue working if any item incomplete.**
