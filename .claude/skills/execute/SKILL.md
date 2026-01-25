---
name: dev.execute
description: |
  This skill should be used when the user says "/dev.execute", "execute", "start work",
  "execute plan", or wants to execute a plan file.
  Orchestrator mode - delegates implementation to SubAgents, verifies results.
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

# /dev.execute - Orchestrator Mode

**You are the conductor. You do not play instruments directly.**

Parallelize Plan TODOs through Task system, delegate to SubAgents, verify results.

---

## Core Principles

### 1. DELEGATE IMPLEMENTATION
Code writing **must always** be delegated to worker agent.

```
✅ YOU CAN DO:                    ❌ YOU MUST DELEGATE:
─────────────────────────────────────────────────────────
- Read files (verification)       - Write/Edit any code → worker
- Run Bash (test verification)    - Fix ANY bugs → worker
- Search with Grep/Glob           - Write ANY tests → worker
- Read/Update plan files          - Git commits → git-master
- Manage parallelization (Task)   - Documentation → worker
```

### 2. VERIFY OBSESSIVELY

⚠️ **SUBAGENTS LIE. VERIFY BEFORE MARKING COMPLETE.**

After Task() delegation, **always** verify directly:
- [ ] File existence check (Read)
- [ ] Build passes (Bash: npm run build / tsc)
- [ ] Tests pass (Bash: npm test)
- [ ] No MUST NOT DO violations (read code directly)

### 3. PARALLELIZE WHEN POSSIBLE
Automatically run pending Tasks with no `blockedBy` in parallel from TaskList.

### 4. ONE TASK PER CALL
Delegate **only one TODO** per Task() call.

---

## State Management

### Source of Truth: Plan Checkbox

```
┌─────────────────────────────────────────────────────────────┐
│  ONLY SOURCE OF TRUTH: Plan checkbox (### [x] TODO N:)      │
│  Task system = Parallelization helper (recreated each       │
│                session)                                      │
└─────────────────────────────────────────────────────────────┘
```

**Plan checkbox is the only state management:**
- Task system is used only for parallelization/dependency calculation
- Tasks are recreated from Plan at each session start
- Only use Task's `completed` status (for removal from TaskList)
- `in_progress` status is not used (unnecessary)
- Plan file is version controlled by git for permanent preservation

### Task System = Parallelization Helper

Role of Task tools:

| Tool | Role | When to Use |
|------|------|-------------|
| **TaskCreate** | TODO → Task conversion | Session start (recreated each time) |
| **TaskUpdate** | Dependency setting (addBlocks) | Right after TaskCreate |
| **TaskList** | Determine parallelizable TODOs | Every execution loop |
| **TaskGet** | Query Task details | When generating Worker prompt |

**Usage patterns:**
- `TaskUpdate(status="completed")` - Use (for removal from TaskList)
- `TaskUpdate(status="in_progress")` - Do not use (unnecessary)

### Dependencies via Task System

```
TaskUpdate(taskId="1", addBlocks=["2"])
→ Task 1 must complete before Task 2 can run

TaskList() result:
#1 [pending] TODO 1: Config setup
#2 [pending] TODO 2: API implementation [blocked by #1]
#3 [pending] TODO 3: Utils (independent)
```

---

## Input Interpretation

| Input | Mode | Behavior |
|-------|------|----------|
| `/dev.execute` | Auto-detect | Current branch → Check Draft PR → PR mode if exists, local mode otherwise |
| `/dev.execute <name>` | Local | Execute `.dev/specs/<name>/PLAN.md` |
| `/dev.execute <PR#>` | PR | Parse spec path from PR body and execute |
| `/dev.execute <PR URL>` | PR | Extract PR# from URL → PR mode |

**Auto-detect logic:**
```bash
# 1. Check Draft PR linked to current branch
gh pr list --head $(git branch --show-current) --draft --json number

# 2. If PR exists → PR mode
# 3. If no PR → Infer spec from branch name (feat/user-auth → user-auth)
```

---

## Execution Modes

### Local Mode

Execute quickly without PR. PR can be created separately after completion.

| Item | Behavior |
|------|----------|
| **Spec location** | `.dev/specs/{name}/PLAN.md` |
| **State management** | Plan checkbox only |
| **History** | Context (`context/*.md`) |
| **Block handling** | Record in Context, report to user |
| **After completion** | git-master commit → Final Report |

### PR Mode

Linked with GitHub PR. Suitable for collaboration and automation.

| Item | Behavior |
|------|----------|
| **Spec location** | Parse from PR body → `.dev/specs/{name}/PLAN.md` |
| **State management** | Plan checkbox + `/dev.state` skill |
| **History** | Context + PR Comments |
| **Block handling** | `/dev.state pause` → transition to blocked |
| **After completion** | git-master commit → `/dev.state publish` |

---

## Workflow

### STEP 1: Session Initialization

**Flowchart:**
```
┌─────────────────────────────────────────────────────────────┐
│ 1. Parse Input → Determine mode                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   [PR Mode]            [Local Mode]
        │                   │
        ▼                   │
┌───────────────────┐       │
│ 2. /dev.state     │       │
│    begin <PR#>    │       │
└────────┬──────────┘       │
         │                  │
    ┌────┴────┐             │
    ▼         ▼             │
 [Success]  [Failure]       │
    │         │             │
    │         ▼             │
    │    ⛔ STOP immediately│
    │    (Do not proceed)   │
    │                       │
    └─────────┬─────────────┘
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Verify Plan file                                         │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Determine state from Plan checkbox → Recreate Tasks      │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
        (Continue to next steps...)
```

---

1. **Parse Input and Determine Mode**
   ```
   Input is number or PR URL → PR mode
   Input is string → Local mode
   No input → Auto-detect
   ```

2. **[PR Mode Only] State Transition - Duplicate Execution Check**

   ⚠️ **Must execute before reading Plan file!**

   ℹ️ **Skip this step for Local mode and proceed to step 3.**

   **Call `/dev.state begin <PR#>`:**
   - Check duplicate execution (error if already executing)
   - Check blocked state (error if blocked)
   - Remove `state:queued` → Add `state:executing`
   - Record "Execution Started" Comment

   **If state begin fails:**
   - ⛔ "Already executing" → **Stop immediately. Do not proceed to subsequent steps.**
     Guide user: "PR #N is already in executing state. Previous execution may be in progress or interrupted."
   - ⛔ "PR is blocked" → **Stop immediately. Do not proceed to subsequent steps.**
     Guide user: "Please release blocked state first with `/dev.state continue <PR#>`."

3. **Verify Plan File**

   **Local mode:**
   ```
   .dev/specs/{name}/PLAN.md
   ```
   - If plan name is given as argument, use that file
   - If not, use most recent plan file or ask user

   **PR mode:**
   ```bash
   # Extract path from Spec Reference link in PR body
   gh pr view <PR#> --json body -q '.body' | grep -oP '(?<=→ \[)[^\]]+'
   ```

4. **Plan → Task Conversion (Recreated Each Session)**

   Convert only **unchecked** TODOs from Plan file to Tasks:

   ```
   task_id_map = {}  # TODO number → Task ID mapping

   # Parse incomplete TODOs from Plan
   unchecked_todos = parse_plan("### [ ] TODO N:")

   FOR EACH "### [ ] TODO N: {title}" in unchecked_todos (in order):
     result = TaskCreate(
       subject="TODO {N}: {title}",
       description="{Full content of TODO section}",
       activeForm="Executing TODO {N}"
     )
     task_id_map[N] = result.task_id
   ```

   ⚠️ **Note**: Execute TaskCreate sequentially to ensure ID order.

   **Dependency Setup:**

   Interpret the Dependency Graph table from Plan and call TaskUpdate:

   ```
   FOR EACH row in Plan.DependencyGraph:
     IF row.Requires != "-" AND both TODOs are unchecked:
       producer_todo = parse(row.Requires)  # e.g., "todo-1.config_path" → 1
       consumer_todo = row.TODO

       # Convert to actual Task IDs using task_id_map
       producer_task_id = task_id_map[producer_todo]
       consumer_task_id = task_id_map[consumer_todo]

       TaskUpdate(taskId=producer_task_id, addBlocks=[consumer_task_id])
   ```

   **Verify Initialization Complete:**

   ```
   TaskList()

   Expected output:
   #1 [pending] TODO 2: API implementation [blocked by #3]
   #2 [pending] TODO 3: Utils
   #3 [pending] TODO 4: Integration [blocked by #1, #2]
   ```

### STEP 2: Initialize or Resume Context

**Check Context folder:**

```bash
CONTEXT_DIR=".dev/specs/{name}/context"
```

**Determine First Run vs Resume:**

```
if context folder doesn't exist:
    → First run: Create folder + initialize files
else:
    → Resume: Keep existing files + load outputs.json
```

**First Run:**

```bash
mkdir -p "$CONTEXT_DIR"
```

| File | Initial Value |
|------|---------------|
| `outputs.json` | `{}` |
| `learnings.md` | Empty file |
| `issues.md` | Empty file |
| `decisions.md` | Empty file |

**Resume (context folder already exists):**

1. Read `outputs.json` and load into memory (for 3a variable substitution)
2. Keep other files as-is (append mode)
3. Determine progress from Plan checkbox

> 📖 See **Context System Details** below for detailed file purposes

### STEP 3: Task Execution Loop

**⚠️ Core: Automatic Parallelization Based on TaskList**

```
WHILE TaskList() shows pending tasks:

  1. Identify Runnable Tasks
     runnable = TaskList().filter(
       status == 'pending' AND
       blockedBy == empty
     )

  2. Execute in Parallel (if multiple runnable, run simultaneously)
     FOR EACH task in runnable (PARALLEL):
       execute_task(task)

  3. Next Loop
```

**execute_task(task) Details:**

#### 3a. Prepare Inputs (Variable Substitution)

**Before** delegating Task to Worker, substitute `${...}` variables defined in Plan's `Inputs` field with actual values.

**Outputs Storage: `context/outputs.json`**

All TODO Outputs are stored in `context/outputs.json` file.

```json
// context/outputs.json
{
  "todo-1": { "config_path": "./config/app.json" },
  "todo-2": { "api_module": "src/api/index.ts" }
}
```

**Variable Substitution Example:**
```
# Plan's Inputs field:
**Inputs**:
- `config_path` (file): `${todo-1.outputs.config_path}`

# After substitution, sent to Worker:
**Inputs**:
- `config_path` (file): `./config/app.json`
```

**Substitution Logic:**
1. Read `context/outputs.json` file
2. Find `${todo-N.outputs.field}` pattern in current TODO's `Inputs` section
3. Extract value from JSON and replace
4. Include substituted value in Worker prompt

#### 3b. Delegate with Prompt Template

**PLAN → Prompt Mapping Table:**

| PLAN Field | Prompt Section | Mapping Method |
|------------|----------------|----------------|
| TODO title + Steps | `## TASK` | Quote directly |
| Outputs + Acceptance Criteria | `## EXPECTED OUTCOME` | Combine into checklist |
| Required Tools | `## REQUIRED TOOLS` | Quote directly |
| Steps | `## MUST DO` | As checkbox items |
| Must NOT do | `## MUST NOT DO` | Quote directly |
| References | `## CONTEXT > References` | In file:line format |
| Inputs (after substitution) | `## CONTEXT > Dependencies` | With actual values |

```
# Query details with TaskGet
task_details = TaskGet(taskId={task.id})

Task(
  subagent_type="worker",
  description="Implement: {task.subject}",
  prompt="""
## TASK
{TODO title + Steps section from task_details.description}

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
{Actual values from 3a substitution}

### Inherited Wisdom
⚠️ SubAgent does not remember previous calls.

**Conventions (from learnings.md):**
{learnings.md content}

**Failed approaches to AVOID (from issues.md):**
{issues.md content}

**Key decisions (from decisions.md):**
{decisions.md content}
"""
)
```

#### 3c. Collect Worker Output + Hook Verification

Check both Worker's returned JSON and **Hook's verification result**.

**1. After Task(worker) call:**

PostToolUse hook (`dev-worker-verify.sh`) automatically:
- Parses JSON from Worker output
- Re-runs each `command` in `acceptance_criteria`
- Outputs verification result

**2. Check Hook Output:**

Task() result includes Hook output:

```
=== VERIFICATION RESULT ===
status: VERIFIED          # or FAILED
pass: 4
fail: 1
skip: 0
failed_items:
  - tsc_check:static:tsc --noEmit src/auth.ts
===========================
```

**3. Worker JSON Structure (new format):**

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

#### 3d. RECONCILE (Based on Hook Result)

**⚠️ Hook has already completed verification. Orchestrator only checks the result.**

Check `status` from Hook output:

```
if Hook status == "VERIFIED":
    → Proceed to 3e (Save to Context)
else:
    → Reconciliation (retry)
```

---

**Reconciliation Loop (max 3 times):**

```
retry_count = 0

RECONCILE_LOOP:
  Check Hook result

  if status == "VERIFIED":
      → Proceed to 3e (Save to Context)
  else:
      retry_count++
      if retry_count < 3:
          # Pass failed item info to Worker
          Task(worker, "Fix: {failed_items}")
          → Re-enter RECONCILE_LOOP (Hook verifies again)
      else:
          → RECONCILE failure handling (below)
```

**Flowchart (K8s Reconciliation Pattern):**
```
┌─────────────────────────────────────────────────────────┐
│ Desired State: All acceptance_criteria PASS/SKIP        │
└─────────────────────────────────────────────────────────┘
                          │
3b. Delegate ─────────────┼───────────────────────────────
        │                 │
        ▼                 ▼ compare
┌─────────────────────────────────────────────────────────┐
│ Current State: Hook verification result (VERIFIED/FAILED)│
└─────────────────────────────────────────────────────────┘
        │
        ├─── [VERIFIED] ──→ 3e. Save to Context
        │
        └─── [FAILED, retry < 3] ──→ Task(worker, "Fix...")
                                          │
                                          └──→ (Loop)

             [FAILED, retry >= 3] ──→ RECONCILE failure handling
```

---

**RECONCILE Failure Handling (after 3 retries):**

After max retries exceeded, analyze the failure and route by category:

```
Analyze failure:
├─ env_error → halt + log to issues.md
├─ code_error → Create Fix Task (depth=1)
└─ unknown → halt + log to issues.md
```

#### Failure Categories

| Category | Examples | Action |
|----------|----------|--------|
| `env_error` | Permission denied, API key missing, network timeout | Halt + issues.md |
| `code_error` | Type error, lint failure, test failure | Create Fix Task |
| `unknown` | Unclassifiable | Halt + issues.md |

#### Fix Task Rules

- Fix Task inherits context from failed task
- Fix Task type = `work` (can modify files)
- Fix Task failure → Halt (no nested Fix Tasks)
- After Fix Task completes → Original task's dependents become runnable

#### issues.md Log Format

When halting due to `env_error` or `unknown`, log to `issues.md`:

```markdown
## [YYYY-MM-DD HH:MM] {TODO name} Failed

**Category**: env_error | unknown
**Error**: {error message}
**Retry Count**: {n}
**Analysis**: {why this requires human intervention}
**Suggestion**: {recommended manual action}
```

---

**Mode-Specific Handling:**

**Local Mode:**
- Record in `issues.md` as unresolved item (`- [ ] problem content`)
- Report to user: "TODO N verification failed. Manual intervention required."
- **Offer choice**: Continue / Stop
- Plan checkbox remains `[ ]` (not complete)

**PR Mode (auto pause):**
- **Call `/dev.state pause <PR#> "<reason>"`**
  - `state:executing` → `state:blocked` transition
  - Record "Blocked" Comment
- Stop execution, wait for user intervention

#### 3e. Save to Context (Only When VERIFY Passes)

Save Worker JSON to context files only when VERIFY passes.

**Save Rules:**

| Field | File | Format |
|-------|------|--------|
| `outputs` | `outputs.json` | `existing["todo-N"] = outputs` then Write |
| `learnings` | `learnings.md` | `## TODO N\n- item1\n- item2` append |
| `issues` | `issues.md` | `## TODO N\n- [ ] item1` append (unresolved) |
| `decisions` | `decisions.md` | `## TODO N\n- item1` append |
| `acceptance_criteria` | (not saved) | Used only for Orchestrator verification, not saved to context |

**Notes:**
- Use current TODO number (N) being processed
- Skip fields with empty arrays (`[]`) (don't add header only)
- **For parallel execution, save outputs.json sequentially** (no concurrent writes)

**Context Save Order for Parallel Execution:**
```
# After parallel TODO 1, 3 execution completes

# 1. Wait for all parallel Tasks to complete
results = await Promise.all([task1, task3])

# 2. Save outputs.json sequentially (prevent race condition)
FOR EACH result in results (sequential):
  current = Read("outputs.json")
  current[f"todo-{result.todo_number}"] = result.outputs
  Write("outputs.json", current)

# 3. Other context files can be parallel (append mode)
FOR EACH result in results (can be parallel):
  Append("learnings.md", result.learnings)
  Append("issues.md", result.issues)
```

**Save Example:**

→ `outputs.json`:
```json
{"todo-1": {"config_path": "./config.json"}}
```

→ `learnings.md`:
```markdown
## TODO 1
- Uses ESM
```

#### 3f. Update Plan Checkbox & Task Status

1. **Change Task status to completed**
   ```
   TaskUpdate(taskId={task.id}, status="completed")
   ```
   → Task is removed from TaskList()

2. **Update Plan file's TODO checkbox**
   ```
   Edit(plan_path, "### [ ] TODO N: Task title", "### [x] TODO N: Task title")
   ```

3. **Update Acceptance Criteria checkboxes**
   Check Acceptance Criteria that passed verification (3d):
   ```
   # For each Acceptance Criteria within that TODO section
   Edit(plan_path, "  - [ ] verified condition", "  - [x] verified condition")
   ```

   **⚠️ Caution**:
   - Only check items you directly verified
   - Do not check based on SubAgent report alone
   - Items that failed verification remain `- [ ]`

#### 3g. Next Iteration

```
Check pending Tasks with TaskList()
→ If pending Tasks exist, continue loop
→ If none, proceed to STEP 4
```

---

### STEP 4: Git Commit & Push

After all TODOs complete, **before** Final Report, delegate commit to git-master:

```
Task(
  subagent_type="git-master",
  description="Commit: {plan-name} changes",
  prompt="""
Plan execution complete. Please commit the changed files.

Plan: {plan-name}
Completed TODOs: {N}

Check changed files with `git status`.
Split into atomic commits following project conventions.

Push after commit: {YES | NO}
"""
)
```

**Push Option Decision:**
| Mode | Push after commit |
|------|-------------------|
| PR mode | YES |
| Local mode | NO |

**Notes:**
- Proceed to Final Report after git-master reports commit complete
- If commit fails, report to user and request manual commit
- If push fails, git-master reports error, guide manual push

---

### STEP 5: Final Report

When all TODOs complete:

**PR Mode Additional Work:**
Execute /dev.state publish.

**Output Final Report:**

```
═══════════════════════════════════════════════════════════
                    ORCHESTRATION COMPLETE
═══════════════════════════════════════════════════════════

📋 PLAN: .dev/specs/{name}/PLAN.md
🔗 MODE: Local | PR #123

📊 TASK SUMMARY:
   Total TODOs:               8
   Completed:                 8
   Failed:                    0

   Acceptance Criteria:      24
   Verified & Checked:       24

📁 FILES MODIFIED:
   - src/auth/token.ts
   - src/auth/token.test.ts
   - src/utils/crypto.ts

📚 LEARNINGS ACCUMULATED:
   - This project uses ESM only
   - Test files use .test.ts extension
   - crypto module uses Node.js built-in

⚠️  ISSUES DISCOVERED:
   - Issues found in existing code (not fixed, out of scope)

✅ ACCEPTANCE CRITERIA:
   - Functional: PASS (all TODOs)
   - Static: PASS (all TODOs)
   - Runtime: PASS (all TODOs)

═══════════════════════════════════════════════════════════
```


---

## Context System Details

### File Purposes

| File | Writer | Purpose | Example |
|------|--------|---------|---------|
| **outputs.json** | Worker → Orchestrator saves | TODO's Output values (Input for next TODO) | `{"todo-1": {"config_path": "./config.json"}}` |
| learnings.md | Worker → Orchestrator saves | Patterns discovered and **applied** | `- This project uses ESM` |
| issues.md | Worker → Orchestrator saves | **Unresolved** issues (always save as `- [ ]`) | `- [ ] Incomplete type definitions` |
| decisions.md | Worker → Orchestrator saves | Decisions and reasons | `- Selected Session instead of JWT` |

### Context Lifecycle

```
Before delegating TODO #1 → Read Context (including outputs.json) → Inject into prompt
After TODO #1 completes → Save Output to outputs.json + Save learnings to learnings/issues

Before delegating TODO #2 → Read outputs.json → Substitute ${todo-1.outputs.X}
After TODO #2 completes → Update outputs.json + Append learnings to Context

... (accumulates, preserved in files even if session disconnects)
```

---

## Parallelization (Task-Based)

### Automatic Parallelization

Task system manages dependencies automatically:

```
TaskList() result:
#1 [pending] TODO 1: Config setup
#2 [pending] TODO 2: API implementation [blocked by #1]
#3 [pending] TODO 3: Utils
#4 [pending] TODO 4: Integration [blocked by #2, #3]
```

**Execution Order (auto-determined):**

```
Round 1 (parallel):
  #1 TODO 1, #3 TODO 3  (no blockedBy)

Round 2 (parallel):
  #2 TODO 2  (unblocked after #1 completes)

Round 3:
  #4 TODO 4  (unblocked after #2, #3 complete)
```

### Parallel Execution Example

```
# Round 1: Call two Tasks simultaneously
Task(subagent_type="worker", prompt="TODO 1...")
Task(subagent_type="worker", prompt="TODO 3...")

# Update status after both Tasks complete
TaskUpdate(taskId="1", status="completed")  # Removed from TaskList
TaskUpdate(taskId="3", status="completed")  # Removed from TaskList
Edit(plan, "### [ ] TODO 1:", "### [x] TODO 1:")
Edit(plan, "### [ ] TODO 3:", "### [x] TODO 3:")

# Check TaskList → Only TODO 2, 4 remain
# TODO 2 has no blockedBy (TODO 1 completed)
# TODO 4 has blockedBy #2 (TODO 3 completed, TODO 2 pending)

# Round 2
Task(subagent_type="worker", prompt="TODO 2...")
# ...
```

---

## Session Recovery

### Session Resume = Same as New Session Start

Since **Plan checkbox is the only state**, session resume is simple:

```
# Check Plan file state
### [x] TODO 1: Config setup       ← Complete (don't create Task)
### [ ] TODO 2: API implementation ← Incomplete (create Task)
### [x] TODO 3: Utils              ← Complete (don't create Task)
### [ ] TODO 4: Integration        ← Incomplete (create Task)
```

### Resume Logic (Plan-Based)

```
# 1. Parse Plan checkbox state
unchecked_todos = parse_plan("### [ ] TODO N:")  # [2, 4]

# 2. TaskCreate only for unchecked TODOs
FOR EACH todo_num in unchecked_todos:
    TaskCreate(subject=f"TODO {todo_num}: ...", ...)

# 3. Set dependencies (only between unchecked)
setup_dependencies_from_plan()

# 4. Start execution
runnable = TaskList().filter(pending AND not blocked)
execute_parallel(runnable)
```

**Why session resume is simple:**
- No need to worry about Task system state (always recreated)
- Can see progress from Plan checkbox alone
- Variable substitution works normally if outputs.json exists

---

## Checklist Before Stopping

**⚠️ Check in Workflow order:**

**1. Start Phase (PR Mode Only):**
- [ ] Called `/dev.state begin <PR#>`? (Stopped immediately on failure?)

**2. Task Initialization:**
- [ ] Identified unchecked TODOs from Plan checkbox state?
- [ ] TaskCreate only for unchecked TODOs?
- [ ] Set dependencies with TaskUpdate(addBlocks)?

**3. Execution Phase:**
- [ ] No pending Tasks in TaskList?
- [ ] Called `TaskUpdate(status="completed")` on each Task completion?
- [ ] All TODOs checked as `### [x] TODO N:`?
- [ ] All TODO Acceptance Criteria checked as `- [x]` after verification?
- [ ] Performed direct verification after each Task completion?
- [ ] Recorded learnings in Context?

**4. Completion Phase:**
- [ ] Delegated commit to git-master?
- [ ] Output Final Report?

**5. PR Mode Completion (PR Mode Only):**
- [ ] Added completion Comment to PR?

**Exception Handling (if applicable):**
- [ ] Called `/dev.state pause` when blocked? (PR mode)
- [ ] Recorded in `issues.md` as unresolved item when blocked? (Local mode)

**Continue working if any item is incomplete.**
