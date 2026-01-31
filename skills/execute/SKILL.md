---
name: execute
description: |
  This skill should be used when the user says "/execute", "execute".
  Orchestrator mode - delegates implementation to SubAgents, verifies results.
  Refactored version of /execute with clearer 3-step structure.
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

## Golden Path (End-to-End Flow)

```
1. Parse input → Determine mode (PR / Local)
2. Read PLAN.md → Create ALL Tasks (Init + TODO sub-steps + Finalize) → Set dependencies
3. Init/resume context (.dev/specs/{name}/context/)
4. LOOP while TaskList() has pending tasks:
   Pick runnable (pending + not blocked) → dispatch by type:
     :State Begin      → [PR only] Skill("state", "begin") → stop on failure
     :Worker  → Task(worker) with substituted variables
     :Verify  → dispatch verify worker, triage & reconcile if FAILED (max 3 retries)
     :Wrap-up → save context (Worker + Verify) + mark Plan checkbox [x]
     :Commit  → Task(git-master) per Commit Strategy
     :Residual Commit → git status → git-master if dirty
     :State Complete   → [PR only] Skill("state", "complete")
     :Report           → output final report
5. (Init, TODO execution, and Finalize are all part of the loop)
```

---

## Core Rules

1. **DELEGATE** — All code writing goes to `Task(subagent_type="worker")`. You may only Read, Grep, Glob, Bash (for verification), and manage Tasks/Plan.
2. **VERIFY** — SubAgents lie. After every `:Worker`, the `:Verify` step dispatches a verify worker to independently re-check acceptance criteria. Reconcile if FAILED.
3. **PARALLELIZE** — Run all tasks whose `blockedBy` is empty simultaneously. Sub-step chains auto-parallelize across independent TODOs.
4. **ONE TODO PER WORKER** — Each `:Worker` Task handles exactly one TODO.
5. **PLAN CHECKBOX = TRUTH** — `### [x] TODO N:` is the only durable state. Sub-step Tasks (`{N}.1` ~ `{N}.4`) are recreated each session.
6. **DISPATCH BY TYPE** — The loop dispatches each runnable task by its suffix: `:State Begin`, `:Worker`, `:Verify`, `:Wrap-up`, `:Commit`, `:Residual Commit`, `:State Complete`, `:Report`.

---

## STEP 1: Initialize

### 1.1 Parse Input & Determine Mode

| Input | Mode | Behavior |
|-------|------|----------|
| `/execute` | Auto-detect | Branch → Draft PR check → PR mode if exists, else Local |
| `/execute <name>` | Local | `.dev/specs/<name>/PLAN.md` |
| `/execute <PR#>` | PR | Parse spec path from PR body |
| `/execute <PR URL>` | PR | Extract PR# → PR mode |

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
IF pr_mode:
  sc = TaskCreate(subject="Finalize:State Complete", ...)
rp = TaskCreate(subject="Finalize:Report", ...)

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

IF pr_mode:
  TaskUpdate(taskId=rc.task_id, addBlocks=[sc.task_id])
  TaskUpdate(taskId=sc.task_id, addBlocks=[rp.task_id])
ELSE:
  TaskUpdate(taskId=rc.task_id, addBlocks=[rp.task_id])
```

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
#14 [pending] Finalize:State Complete  [blocked by #13]
#15 [pending] Finalize:Report          [blocked by #14]

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
Create: `outputs.json` (`{}`), `learnings.md`, `issues.md`, `decisions.md` (empty).

**Resume** (context folder exists):
- Read `outputs.json` into memory (for variable substitution)
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
    # PARALLEL dispatch — send ALL in ONE message with run_in_background
    FOR EACH task in runnable (in single message):
      dispatch(task, run_in_background=true)
    # Poll for completion
    WAIT until any background task completes (check TaskOutput periodically)
    # Process completed tasks, mark completed, loop
  ELSE:
    # Single task or orchestrator-handled type → dispatch normally
    dispatch(task)
```

**Which types can run in parallel:**
- `:Worker` — YES (if touching disjoint files)
- `:Verify` — YES (read-only, no conflicts)
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

| Suffix | Handler | Action |
|--------|---------|--------|
| `:State Begin` | 2α | `Skill("state", args="begin <PR#>")` → stop on failure |
| `:Worker` | 2a | Variable substitution → Task(worker) |
| `:Verify` | 2b | Dispatch verify worker → triage & reconcile if FAILED |
| `:Wrap-up` | 2c | Save context (Worker + Verify) + mark Plan `[x]` |
| `:Commit` | 2d | Task(git-master) per Commit Strategy |
| `:Residual Commit` | 2f | `git status --porcelain` → git-master if dirty |
| `:State Complete` | 2g | `Skill("state", args="complete <PR#>")` |
| `:Report` | 2h | Final Report output |

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
- Read: Reference existing code
- Edit/Write: Write code
- Bash: Run build/tests

## MUST DO
- Perform only this Task
- Follow existing code patterns (see References below)
- Utilize Inherited Wisdom (see CONTEXT below)

## MUST NOT DO
{Must NOT do section from Plan}
- Do not perform other Tasks
- Do not modify files outside allowed list
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

**Key decisions (from decisions.md):**
{decisions.md content}
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

**3. On completion:** `TaskUpdate(taskId, status="completed")` → `:Verify` becomes runnable.

---

### 2b. :Verify — Verify Worker & Reconciliation

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
{Standard must-not-do: no other Tasks, no files outside allowed list, no new dependencies, no git commands}

For each must-not-do rule, check whether it was violated:
- Read `git diff` (staged + unstaged) to see what the Worker actually changed
- Check for files modified outside the allowed list
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
- **FAILED** (any criterion FAIL, or critical must-not-do violation, or suspicious pass found) → Reconciliation loop (below).

> **`:Wrap-up` enrichment**: When VERIFIED, merge `side_effects.missing_context` into the Worker's learnings/issues/decisions before saving. This ensures context is complete even if the Worker under-reported.

**3. Reconciliation (max 3 retries):**

```
retry_count = 0
RECONCILE_LOOP:
  verify_result = dispatch_verify_worker(TODO_N)
  if verify_result.status == "VERIFIED" → mark completed, done
  retry_count++
  if retry_count < 3:
    # Build fix prompt from ALL failure categories
    fix_prompt = """
    Fix the following issues found by Verify Worker:

    ## Failed Acceptance Criteria
    {verify_result.acceptance_criteria.results where status==FAIL}

    ## Must-Not-Do Violations
    {verify_result.must_not_do.violations}

    ## Suspicious Passes (re-implement properly)
    {verify_result.side_effects.suspicious_passes}

    ## Missing Context (add to your output JSON)
    {verify_result.side_effects.missing_context}
    """
    Task(subagent_type="worker", prompt=fix_prompt)
    → re-enter RECONCILE_LOOP (verify worker runs again)
  else:
    → failure handling (below)
```

> **Pattern**: Worker → Verify Worker → (if FAILED) Fix Worker → Verify Worker → ...
> Each cycle is a full reconciliation round. The verify worker always runs fresh.
> Fix Worker receives ALL categories of failure — not just acceptance criteria.

**4. Reconciliation Decision — Triage each failure item:**

Not all failures require retry. Orchestrator triages each item from `verify_result` into one of 3 dispositions:

| Disposition | When | Action |
|-------------|------|--------|
| **retry** | Fixable by Worker (code_error, suspicious pass, missing context) | Include in fix prompt → retry loop |
| **skip** | Not blocking, or ambiguous/low-severity (warning-level violation, cosmetic) | Mark TODO with partial completion, log decision |
| **halt** | Unfixable (env_error, critical must-not-do violation, unknown after 3 retries) | Stop execution |

**Triage rules:**
```
FOR EACH item in verify_result (failed criteria + violations + side_effects):
  IF item is acceptance_criteria with status==FAIL → retry
  IF item is must_not_do with severity==critical → halt (immediate, no retry)
  IF item is must_not_do with severity==warning → skip (log decision)
  IF item is suspicious_pass → retry (force re-implementation)
  IF item is undocumented_change → skip (log to issues.md)
  IF item is missing_context → skip (merge into Context step)
```

**5. Decision logging — ALL dispositions go to context:**

Every triage decision is recorded in `decisions.md` during the `:Wrap-up` step:

```markdown
## TODO {N} — Reconciliation Decisions

### Retried
- [criterion_id]: {reason} → Fixed in retry #{n}

### Skipped
- [warning_rule]: {evidence} → Skipped: {justification}
- [undocumented_change]: {file} → Logged as issue, not blocking

### Halted
- [critical_rule]: {evidence} → Execution stopped
```

> **Why log skips**: Skipped items are technical debt. They must be visible in context so future TODOs or humans can address them.

**6. After 3 retries (for retry-disposition items only):**

| Category | Examples | Action |
|----------|----------|--------|
| `env_error` | Permission denied, API key missing, network timeout | Halt + log to `issues.md` |
| `code_error` | Type error, lint failure, test failure | Create Fix Task (depth=1, no nesting) |
| `unknown` | Unclassifiable | Halt + log to `issues.md` |

**Fix Task** inherits context from failed task. If Fix Task fails → halt.

**Mode-specific halt behavior:**
- **Local**: Record in `issues.md`, report to user, offer Continue/Stop. Plan checkbox stays `[ ]`.
- **PR**: `Skill("state", args="pause <PR#> <reason>")` → `state:executing` → `state:blocked` transition, records "Blocked" comment → stop execution.

> Full reconciliation details → REFERENCE C

---

### 2c. :Wrap-up — Save Context + Mark Checkboxes

Combines context saving and checkbox marking into a single step. Only runs after `:Verify` completes (VERIFIED or skipped-through).

**Part A: Save to Context Files**

| Source | Field | File | Format |
|--------|-------|------|--------|
| Worker | `outputs` | `outputs.json` | `existing["todo-N"] = outputs` → Write |
| Worker | `learnings` | `learnings.md` | `## {N}\n- item` append |
| Worker | `issues` | `issues.md` | `## {N}\n- [ ] item` append |
| Worker | `decisions` | `decisions.md` | `## {N}\n- item` append |
| Verify | `side_effects.missing_context` | `learnings.md` / `issues.md` | Merge into appropriate file |
| Verify | `side_effects.undocumented_changes` | `issues.md` | `- [ ] Undocumented: {change}` append |
| Orchestrator | reconciliation decisions | `decisions.md` | `## {N} — Reconciliation\n- {disposition}: {item}` append |
| `acceptance_criteria` | (not saved) | Used only for verification, not saved to context |

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

**2. Update Acceptance Criteria checkboxes** based on `:Verify` results:

The `:Verify` step produces `acceptance_criteria` with per-item `status` (PASS/FAIL). Use this to check individual items:

```
FOR EACH criterion in verify_result.acceptance_criteria:
  IF criterion.status == "PASS":
    Edit(plan_path,
         "- [ ] {criterion.description}",
         "- [x] {criterion.description}")
```

**⚠️ Caution:**
- Only check items whose `status` is `PASS` from the `:Verify` result
- Do not check based on SubAgent report alone — use verify worker result
- Items with `status: FAIL` remain `- [ ]`
- Do NOT check Steps items (`- [ ]` under `**Steps**:`) — only Acceptance Criteria

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

```
═══════════════════════════════════════════════════════════
                    ORCHESTRATION COMPLETE
═══════════════════════════════════════════════════════════

PLAN: .dev/specs/{name}/PLAN.md
MODE: Local | PR #123

TASK SUMMARY:
   Total TODOs:               8
   Completed:                 8
   Failed:                    0

   Acceptance Criteria:      24
   Verified & Checked:       24

FILES MODIFIED:
   - src/auth/token.ts
   - src/auth/token.test.ts

LEARNINGS ACCUMULATED:
   - This project uses ESM only

ISSUES DISCOVERED:
   - Issues found in existing code (not fixed, out of scope)

ACCEPTANCE CRITERIA:
   - Functional: PASS (all TODOs)
   - Static: PASS (all TODOs)
   - Runtime: PASS (all TODOs)

═══════════════════════════════════════════════════════════
```

On completion: `TaskUpdate(taskId, status="completed")` → all tasks done, execution ends.

---

## STEP 3: Finalize

Finalize tasks (Residual Commit, State Complete, Report) are dispatched in the execution loop as `:Residual Commit`, `:State Complete`, `:Report` handlers (2f, 2g, 2h).

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
| `decisions.md` | Worker → Orchestrator saves | Decisions and reasons |

**Context Lifecycle:**
```
Before TODO #1 → Read context → inject into prompt
After TODO #1  → Save outputs + learnings
Before TODO #2 → Read outputs.json → substitute ${todo-1.outputs.X}
After TODO #2  → Update outputs.json + append learnings
(Accumulates. Preserved in files across sessions.)
```

### C. Reconciliation Details

**K8s-style reconciliation pattern (Worker → Verify Worker loop):**
```
Desired State: All acceptance_criteria PASS/SKIP, no critical violations
Current State: Verify Worker result

[VERIFIED] → Save context (2c) — include missing_context from Verify
[FAILED] → Triage each item:
  retry   → Fix Worker → Verify Worker (max 3 rounds)
  skip    → Log decision to decisions.md, proceed
  halt    → Stop execution, log to issues.md
```

**Decision trail**: Every triage disposition (retry/skip/halt) is recorded in `decisions.md` during `:Wrap-up`. Skipped items become visible technical debt for humans or future TODOs.

**Fix Task rules:**
- Inherits context from failed task
- Type = `work` (can modify files)
- Fix Task failure → Halt (no nested Fix Tasks)
- After Fix Task → original task's dependents become runnable

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
#14 [pending] Finalize:State Complete  [blocked by #13]
#15 [pending] Finalize:Report          [blocked by #14]
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
Round 9:  #14 Finalize:State Complete             ← blocked by #13
Round 10: #15 Finalize:Report                     ← blocked by #14
```

### F. Session Recovery

Plan checkbox is the only durable state, so recovery = fresh start:

```
### [x] TODO 1: Config setup       ← skip (complete)
### [ ] TODO 2: API implementation ← create sub-step Tasks
### [x] TODO 3: Utils              ← skip (complete)
### [ ] TODO 4: Integration        ← create sub-step Tasks
```

1. Parse checkboxes → only unchecked TODOs
2. Create sub-step Tasks for each unchecked TODO (Worker, Verify, Wrap-up, Commit)
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

**Task types**: Init (1, PR only) + per-TODO sub-steps (up to 4 each) + Finalize (2-3):

| Sub-Step | Subject Pattern | Purpose |
|----------|----------------|---------|
| `:State Begin` | `Init:State Begin` | [PR only] Begin PR state |
| `:Worker` | `{N}.1:Worker — {title}` | Delegate implementation to worker agent |
| `:Verify` | `{N}.2:Verify` | Dispatch verify worker, triage & reconcile if FAILED |
| `:Wrap-up` | `{N}.3:Wrap-up` | Save context (Worker + Verify) + mark Plan `[x]` |
| `:Commit` | `{N}.4:Commit` | Commit via git-master (only if Commit Strategy row exists) |
| `:Residual Commit` | `Finalize:Residual Commit` | Check & commit remaining changes |
| `:State Complete` | `Finalize:State Complete` | [PR only] Complete PR state |
| `:Report` | `Finalize:Report` | Output final orchestration report |

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

# Intra-TODO chain (always):
{N}.1:Worker → {N}.2:Verify → {N}.3:Wrap-up → {N}.4:Commit

# Cross-TODO (from Dependency Graph):
1.4:Commit (or 1.3:Wrap-up) → 2.1:Worker

# Finalize chain:
all TODO last steps → Residual Commit → State Complete (PR) → Report
```

Usage: `TaskUpdate(status="completed")` — yes. `TaskUpdate(status="in_progress")` — not used.

### H. Mode Differences (PR vs Local)

| Item | Local Mode | PR Mode |
|------|-----------|---------|
| Spec location | `.dev/specs/{name}/PLAN.md` | Parse from PR body |
| State management | Plan checkbox only | Plan checkbox + `/state` skill |
| History | Context files | Context + PR Comments |
| Block handling | Record in context, report to user | `Skill("state", args="pause")` |
| After completion | Per-TODO commits → Report | Commits + push → `/state complete` |

### I. Checklist Before Stopping

**1. Init Tasks (PR Mode Only):**
- [ ] `Init:State Begin` task created and completed?
- [ ] Stopped immediately on failure?

**2. Task Initialization:**
- [ ] Identified unchecked TODOs from Plan?
- [ ] Created sub-step Tasks (Worker, Verify, Wrap-up, Commit) for each unchecked TODO?
- [ ] Intra-TODO chains set (Worker→Verify→Wrap-up→Commit)?
- [ ] Cross-TODO dependencies set from Dependency Graph?

**3. Execution Phase:**
- [ ] No pending Tasks in TaskList?
- [ ] TaskUpdate(status="completed") on each sub-step?
- [ ] All `:Worker` tasks delegated to worker agent?
- [ ] All `:Verify` tasks dispatched verify worker + triaged + reconciled if needed?
- [ ] All `:Wrap-up` tasks saved context + marked Plan `[x]` + logged triage decisions?
- [ ] All `:Commit` tasks delegated to git-master?
- [ ] Pushed after each commit (PR mode)?

**4. Finalize Tasks:**
- [ ] `Finalize:Residual Commit` task completed?
- [ ] `Finalize:State Complete` task completed? (PR mode only)
- [ ] `Finalize:Report` task completed?
- [ ] All Finalize tasks dispatched through execution loop?

**Exception Handling:**
- [ ] `Skill("state", args="pause <PR#> <reason>")` on block? (PR)
- [ ] `issues.md` updated on block? (Local)

**Continue working if any item incomplete.**
