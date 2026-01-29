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
     :Verify  → check hook result, reconcile if FAILED (max 3 retries)
     :Context → save outputs/learnings/issues/decisions to files
     :Commit  → Task(git-master) per Commit Strategy
     :Checkbox → mark Plan checkbox [x] + acceptance criteria
     :Residual Commit → git status → git-master if dirty
     :State Complete   → [PR only] Skill("state", "complete")
     :Report           → output final report
5. (Init, TODO execution, and Finalize are all part of the loop)
```

---

## Core Rules

1. **DELEGATE** — All code writing goes to `Task(subagent_type="worker")`. You may only Read, Grep, Glob, Bash (for verification), and manage Tasks/Plan.
2. **VERIFY** — SubAgents lie. After every `:Worker`, the `:Verify` step checks hook result. Reconcile if FAILED.
3. **PARALLELIZE** — Run all tasks whose `blockedBy` is empty simultaneously. Sub-step chains auto-parallelize across independent TODOs.
4. **ONE TODO PER WORKER** — Each `:Worker` Task handles exactly one TODO.
5. **PLAN CHECKBOX = TRUTH** — `### [x] TODO N:` is the only durable state. Sub-step Tasks (`{N}.1` ~ `{N}.5`) are recreated each session.
6. **DISPATCH BY TYPE** — The loop dispatches each runnable task by its suffix: `:State Begin`, `:Worker`, `:Verify`, `:Context`, `:Checkbox`, `:Commit`, `:Residual Commit`, `:State Complete`, `:Report`.

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

⚠️ For each **unchecked** TODO, create sub-step Tasks (**sequentially** to ensure ID order):

```
# --- Init Tasks (PR only) ---
IF pr_mode:
  sb = TaskCreate(subject="Init:State Begin",
                  description="Skill('state', args='begin <PR#>'). Stop on failure.",
                  activeForm="Beginning PR state")

task_ids = {}  # task_ids[N] = {worker, verify, context, commit, checkbox}

FOR EACH "### [ ] TODO N: {title}" in plan (in order):

  # 1. Worker — delegates implementation
  w = TaskCreate(subject="{N}.1:Worker — {title}",
                 description="{full TODO section content}",
                 activeForm="{N}.1: Running Worker")
  task_ids[N] = {worker: w.task_id}

  # 2. Verify — checks hook result, reconciles if needed
  v = TaskCreate(subject="{N}.2:Verify",
                 description="""Check hook verification result for TODO {N}.
If VERIFIED → mark completed.
If FAILED → reconcile via Task(subagent_type="worker") with fix prompt (max 3 retries).
After 3 retries → categorize (env_error/code_error/unknown) → halt or Fix Task.""",
                 activeForm="{N}.2: Verifying")
  task_ids[N].verify = v.task_id

  # 3. Context — saves outputs/learnings/issues/decisions
  c = TaskCreate(subject="{N}.3:Context",
                 description="Save Worker output to context files for TODO {N}.",
                 activeForm="{N}.3: Saving context")
  task_ids[N].context = c.task_id

  # 4. Checkbox — marks Plan checkbox [x] and acceptance criteria
  cb = TaskCreate(subject="{N}.4:Checkbox",
                  description="Mark TODO {N} checkbox and acceptance criteria in PLAN.md.",
                  activeForm="{N}.4: Updating plan")
  task_ids[N].checkbox = cb.task_id

  # 5. Commit — only if Commit Strategy table has a row for this TODO
  IF commit_strategy_has_row(N):
    cm = TaskCreate(subject="{N}.5:Commit",
                    description="""Commit TODO {N} changes.
Dispatch: Task(subagent_type="git-master")
Message: {Message from Commit Strategy table}
Files: {Files from Commit Strategy table}
Push: {YES if PR mode, NO if Local mode}""",
                    activeForm="{N}.5: Committing")
    task_ids[N].commit = cm.task_id

  # Intra-TODO chain: Worker → Verify → Context → Checkbox → Commit
  TaskUpdate(taskId=w.task_id, addBlocks=[v.task_id])
  TaskUpdate(taskId=v.task_id, addBlocks=[c.task_id])
  TaskUpdate(taskId=c.task_id, addBlocks=[cb.task_id])
  IF task_ids[N].commit:
    TaskUpdate(taskId=cb.task_id, addBlocks=[cm.task_id])

# --- Init → TODO dependency (PR only) ---
IF pr_mode:
  FOR EACH unchecked TODO N:
    TaskUpdate(taskId=sb.task_id, addBlocks=[task_ids[N].worker])

# --- Finalize Tasks ---
# Collect the last sub-step of each unchecked TODO
all_last_steps = [task_ids[N].commit ?? task_ids[N].checkbox for each unchecked TODO N]

rc = TaskCreate(subject="Finalize:Residual Commit",
                description="""Run `git status --porcelain`.
If dirty: Task(subagent_type="git-master") with message "chore({plan-name}): miscellaneous changes".
Push: {YES if PR mode, NO if Local mode}.
If clean: skip.""",
                activeForm="Residual commit check")

IF pr_mode:
  sc = TaskCreate(subject="Finalize:State Complete",
                  description="""Complete PR state.
Dispatch: Skill("state", args="complete <PR#>")
Removes state:executing label, converts Draft → Ready, adds "Published" comment.""",
                  activeForm="Completing PR state")

rp = TaskCreate(subject="Finalize:Report",
                description="Output final orchestration report",
                activeForm="Generating report")

# All TODO chains must finish before Finalize starts
FOR EACH last_step in all_last_steps:
  TaskUpdate(taskId=last_step, addBlocks=[rc.task_id])

# Finalize chain: Residual Commit → State Complete (PR) → Report
IF pr_mode:
  TaskUpdate(taskId=rc.task_id, addBlocks=[sc.task_id])
  TaskUpdate(taskId=sc.task_id, addBlocks=[rp.task_id])
ELSE:
  TaskUpdate(taskId=rc.task_id, addBlocks=[rp.task_id])
```

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
#3  [pending] 1.2:Verify         [blocked by #2]
#4  [pending] 1.3:Context        [blocked by #3]
#5  [pending] 1.4:Checkbox       [blocked by #4]
#6  [pending] 1.5:Commit         [blocked by #5]
#7  [pending] 2.1:Worker — API   [blocked by #6]
#8  [pending] 2.2:Verify         [blocked by #7]
#9  [pending] 2.3:Context        [blocked by #8]
#10 [pending] 2.4:Checkbox       [blocked by #9]
#11 [pending] 3.1:Worker — Utils [blocked by #1]
#12 [pending] 3.2:Verify         [blocked by #11]
#13 [pending] 3.3:Context        [blocked by #12]
#14 [pending] 3.4:Checkbox       [blocked by #13]
#15 [pending] 3.5:Commit         [blocked by #14]
#16 [pending] Finalize:Residual Commit [blocked by #6, #10, #15]
#17 [pending] Finalize:State Complete  [blocked by #16]
#18 [pending] Finalize:Report          [blocked by #17]

→ Round 0: #1 (Init:State Begin)
→ Round 1: #2 (1.1:Worker), #11 (3.1:Worker) — parallel!
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

```
WHILE TaskList() has pending tasks:
  runnable = TaskList().filter(status=="pending" AND blockedBy==empty)
  FOR EACH task in runnable (PARALLEL):
    dispatch(task)  # route by sub-step type suffix
```

**Dispatch by task subject suffix:**

| Suffix | Handler | Action |
|--------|---------|--------|
| `:State Begin` | 2α | `Skill("state", args="begin <PR#>")` → stop on failure |
| `:Worker` | 2a | Variable substitution → Task(worker) |
| `:Verify` | 2b | Check hook result → reconcile if FAILED |
| `:Context` | 2c | Save outputs/learnings/issues/decisions |
| `:Checkbox` | 2d | Mark Plan `[x]` + acceptance criteria |
| `:Commit` | 2e | Task(git-master) per Commit Strategy |
| `:Residual Commit` | 2f | `git status --porcelain` → git-master if dirty |
| `:State Complete` | 2g | `Skill("state", args="complete <PR#>")` |
| `:Report` | 2h | Final Report output |

After each sub-step completes: `TaskUpdate(taskId, status="completed")` → removed from TaskList → dependents unblocked.

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

### 2b. :Verify — Check Hook Result & Reconcile

PostToolUse hook (`dev-worker-verify.sh`) automatically re-runs acceptance criteria commands after the `:Worker` Task completes. The hook returns its result via `additionalContext` JSON, which is injected into your context automatically.

**1. Check hook output** — look for the VERIFICATION RESULT block that appears in your context after the Task(worker) call returns:

```
=== VERIFICATION RESULT ===
status: VERIFIED          # or FAILED
pass: 4
fail: 1
failed_items:
  - tsc_check:static:tsc --noEmit src/auth.ts
===========================
```

> **How it works**: The hook outputs `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}` which Claude Code injects into your context. You will see the VERIFICATION RESULT text directly after the Task(worker) result.

**Worker JSON structure** (parsed from Task result):
```json
{
  "outputs": {"config_path": "./config.json"},
  "acceptance_criteria": [
    {
      "id": "file_exists",
      "category": "functional",
      "description": "File exists",
      "command": "test -f ./config.json",
      "status": "PASS"
    },
    {
      "id": "tsc_check",
      "category": "static",
      "description": "tsc passes",
      "command": "tsc --noEmit",
      "status": "FAIL",
      "reason": "Type error in line 42"
    }
  ],
  "learnings": ["Uses ESM"],
  "issues": ["Incomplete type definitions"],
  "decisions": ["Following existing pattern"]
}
```

**2. Route by status:**

- **VERIFIED** → `TaskUpdate(taskId, status="completed")` → `:Context` becomes runnable.
- **FAILED** → Reconciliation loop (below).

**3. Reconciliation (max 3 retries):**

```
retry_count = 0
RECONCILE_LOOP:
  if hook status == "VERIFIED" → mark completed, done
  retry_count++
  if retry_count < 3:
    Task(worker, "Fix: {failed_items details}")
    → re-enter RECONCILE_LOOP (hook verifies again)
  else:
    → failure handling (below)
```

**After 3 retries, categorize failure:**

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

### 2c. :Context — Save to Context Files

Save Worker JSON fields to context files. Only runs after `:Verify` passes.

| Worker JSON Field | File | Format |
|-------------------|------|--------|
| `outputs` | `outputs.json` | `existing["todo-N"] = outputs` → Write |
| `learnings` | `learnings.md` | `## {N}\n- item` append |
| `issues` | `issues.md` | `## {N}\n- [ ] item` append |
| `decisions` | `decisions.md` | `## {N}\n- item` append |
| `acceptance_criteria` | (not saved) | Used only for verification, not saved to context |

Skip empty arrays.

**⚠️ `outputs.json` race condition**: When multiple `:Context` tasks run in parallel, save `outputs.json` **sequentially** (Read → merge → Write one at a time). Other context files are safe for parallel append.

```
# Parallel 1.3:Context and 3.3:Context both runnable:

# outputs.json — SEQUENTIAL:
current = Read("outputs.json")
current["todo-1"] = result1.outputs
Write("outputs.json", current)

current = Read("outputs.json")
current["todo-3"] = result3.outputs
Write("outputs.json", current)

# learnings.md, issues.md — PARALLEL OK (append mode)
```

On completion: `TaskUpdate(taskId, status="completed")` → `:Checkbox` becomes runnable.

---

### 2d. :Checkbox — Mark Plan Complete

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
- Do not check based on SubAgent report alone — use hook verification result
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

**K8s-style reconciliation pattern:**
```
Desired State: All acceptance_criteria PASS/SKIP
Current State: Hook verification result

[VERIFIED] → Save context (2d)
[FAILED, retry < 3] → Task(worker, "Fix...") → re-verify
[FAILED, retry >= 3] → Categorize → Fix Task or Halt
```

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
#4  [pending] 1.3:Context         [blocked by #3]
#5  [pending] 1.4:Checkbox        [blocked by #4]
#6  [pending] 1.5:Commit          [blocked by #5]
#7  [pending] 2.1:Worker — API    [blocked by #6]   ← cross-TODO dep
#8  [pending] 2.2:Verify          [blocked by #7]
#9  [pending] 2.3:Context         [blocked by #8]
#10 [pending] 2.4:Checkbox        [blocked by #9]
#11 [pending] 3.1:Worker — Utils  [blocked by #1]
#12 [pending] 3.2:Verify          [blocked by #11]
#13 [pending] 3.3:Context         [blocked by #12]
#14 [pending] 3.4:Checkbox        [blocked by #13]
#15 [pending] 3.5:Commit          [blocked by #14]
#16 [pending] Finalize:Residual Commit [blocked by #6, #10, #15]  ← #6=1.5:Commit, #10=2.4:Checkbox, #15=3.5:Commit
#17 [pending] Finalize:State Complete  [blocked by #16]
#18 [pending] Finalize:Report          [blocked by #17]
```

**Execution Rounds (auto-determined by TaskList):**

```
Round 0:  #1 Init:State Begin                   ← PR only
Round 1:  #2 1.1:Worker, #11 3.1:Worker          ← PARALLEL
Round 2:  #3 1.2:Verify, #12 3.2:Verify          ← PARALLEL
Round 3:  #4 1.3:Context, #13 3.3:Context        ← PARALLEL (outputs.json sequential!)
Round 4:  #5 1.4:Checkbox, #14 3.4:Checkbox      ← PARALLEL
Round 5:  #6 1.5:Commit, #15 3.5:Commit          ← PARALLEL
Round 6:  #7 2.1:Worker                           ← unblocked after #6
Round 7:  #8 2.2:Verify
Round 8:  #9 2.3:Context
Round 9:  #10 2.4:Checkbox
Round 10: #16 Finalize:Residual Commit             ← blocked by all TODO last steps
Round 11: #17 Finalize:State Complete              ← blocked by #16
Round 12: #18 Finalize:Report                      ← blocked by #17
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
2. Create sub-step Tasks for each unchecked TODO (Worker, Verify, Context, Checkbox, Commit)
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

**Task types**: Init (1, PR only) + per-TODO sub-steps (up to 5 each) + Finalize (2-3):

| Sub-Step | Subject Pattern | Purpose |
|----------|----------------|---------|
| `:State Begin` | `Init:State Begin` | [PR only] Begin PR state |
| `:Worker` | `{N}.1:Worker — {title}` | Delegate implementation to worker agent |
| `:Verify` | `{N}.2:Verify` | Check hook result, reconcile if FAILED |
| `:Context` | `{N}.3:Context` | Save outputs/learnings/issues/decisions |
| `:Checkbox` | `{N}.4:Checkbox` | Mark Plan `[x]` and acceptance criteria |
| `:Commit` | `{N}.5:Commit` | Commit via git-master (only if Commit Strategy row exists) |
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
{N}.1:Worker → {N}.2:Verify → {N}.3:Context → {N}.4:Checkbox → {N}.5:Commit

# Cross-TODO (from Dependency Graph):
1.5:Commit (or 1.4:Checkbox) → 2.1:Worker

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
- [ ] Created sub-step Tasks (Worker, Verify, Context, Checkbox, Commit) for each unchecked TODO?
- [ ] Intra-TODO chains set (Worker→Verify→Context→Checkbox→Commit)?
- [ ] Cross-TODO dependencies set from Dependency Graph?

**3. Execution Phase:**
- [ ] No pending Tasks in TaskList?
- [ ] TaskUpdate(status="completed") on each sub-step?
- [ ] All `:Worker` tasks delegated to worker agent?
- [ ] All `:Verify` tasks checked hook result + reconciled if needed?
- [ ] All `:Context` tasks saved outputs/learnings/issues/decisions?
- [ ] All `:Checkbox` tasks marked Plan `[x]` + acceptance criteria?
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
