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
Delegate to SubAgents via `Task()`, run deterministic ops via `node dev-cli/bin/dev-cli.js`, orchestrate via `TaskList/TaskCreate/TaskUpdate`.

---

## Mode Selection

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | Quick mode (no Verify, no Code Review, no Final Verify) | standard |

Examples: `/execute`, `/execute --quick`, `/execute --quick my-feature`, `/execute --quick #42`

---

## STEP 1: Initialize

### 1.1 Parse Input

```
1. Parse flags: --quick → mode=quick, else mode=standard
2. Determine spec name from argument or current branch
3. If argument is PR number (#N):
   - Extract spec name from PR branch
   - Set PR_MODE=true
4. Verify .dev/specs/{name}/plan-content.json exists
```

### 1.2 Create Tasks from Plan

```bash
node dev-cli/bin/dev-cli.js plan-to-tasks {name} --mode {mode}
```

This outputs `{ tasks, dependencies }`. For each task, call `TaskCreate`:

```
For each task in result.tasks:
  TaskCreate({
    subject: task.subject,
    description: task.description,
    activeForm: task.activeForm,
    metadata: task.metadata
  })

For each dep in result.dependencies:
  TaskUpdate(dep.to, { addBlockedBy: [dep.from] })
```

### 1.3 Init Context

```bash
node dev-cli/bin/dev-cli.js init {name} --execute --{mode}
```

---

## STEP 2: Execute Loop

```
LOOP:
  tasks = TaskList()
  runnable = tasks.filter(status=pending AND blockedBy=empty)
  IF no runnable AND all completed → DONE
  IF no runnable AND some failed → HALTED (report failures)

  Pick first runnable task → read metadata → dispatch by substep type
```

### Dispatch Rules

Each task's `metadata.substep` determines the dispatch:

---

#### :Worker (metadata.substep = "worker")

```bash
prompt=$(node dev-cli/bin/dev-cli.js build-prompt {name} --todo {todoId} --type worker)
```

Then dispatch:
```
TaskUpdate(taskId, { status: "in_progress" })
result = Task(worker, prompt, model=sonnet)
TaskUpdate(taskId, { status: "completed" })
```

---

#### :Verify (metadata.substep = "verify") [Standard only]

```bash
prompt=$(echo '{workerResult}' | node dev-cli/bin/dev-cli.js build-prompt {name} --todo {todoId} --type verify)
```

Dispatch verify worker, then triage:
```
TaskUpdate(taskId, { status: "in_progress" })
verifyResult = Task(worker, prompt, model=sonnet)
```

Triage the result:
```bash
triageResult=$(echo '{verifyResult}' | node dev-cli/bin/dev-cli.js triage {name} --todo {todoId} --retries {N} --depth {D})
```

Route by disposition:
- **pass** → `TaskUpdate(taskId, { status: "completed" })`
- **retry** → Reset worker+verify tasks to pending, increment retries, build fix prompt
- **adapt** → Create dynamic TODO tasks, mark verify completed
- **halt** → Mark TODO failed, skip remaining substeps, log to issues

---

#### :Wrap-up (metadata.substep = "wrap-up")

Two deterministic CLI calls:
```bash
echo '{"outputs":{...},"learnings":"...","issues":"..."}' | node dev-cli/bin/dev-cli.js wrapup {name} --todo {todoId}
node dev-cli/bin/dev-cli.js checkpoint {name} --todo {todoId} --mode {mode}
```

`TaskUpdate(taskId, { status: "completed" })`

---

#### :Commit (metadata.substep = "commit")

```bash
prompt=$(node dev-cli/bin/dev-cli.js build-prompt {name} --todo {todoId} --type commit)
```

Dispatch:
```
TaskUpdate(taskId, { status: "in_progress" })
Task(git-master, prompt, model=sonnet)
TaskUpdate(taskId, { status: "completed" })
```

If commit strategy has `conditional: commit_strategy` and no entry exists, skip.

---

#### :Residual Commit (metadata.substep = "residual-commit")

```
TaskUpdate(taskId, { status: "in_progress" })
Task(git-master, "Check git status --porcelain. If uncommitted changes, create a residual commit. Otherwise skip.", model=sonnet)
TaskUpdate(taskId, { status: "completed" })
```

---

#### :Code Review (metadata.substep = "code-review") [Standard only]

```bash
prompt=$(node dev-cli/bin/dev-cli.js build-prompt {name} --todo finalize --type code-review)
```

```
TaskUpdate(taskId, { status: "in_progress" })
result = Task(code-reviewer, prompt, model=sonnet)
TaskUpdate(taskId, { status: "completed" })
```

If verdict = NEEDS_FIXES, log issues but continue.

---

#### :Final Verify (metadata.substep = "final-verify") [Standard only]

```bash
prompt=$(node dev-cli/bin/dev-cli.js build-prompt {name} --todo finalize --type final-verify)
```

```
TaskUpdate(taskId, { status: "in_progress" })
result = Task(worker, prompt, model=sonnet)
TaskUpdate(taskId, { status: "completed" })
```

---

#### :State Complete (metadata.substep = "state-complete")

PR mode only. Mark execution state as complete.
```
TaskUpdate(taskId, { status: "completed" })
```

---

#### :Report (metadata.substep = "report")

```bash
prompt=$(node dev-cli/bin/dev-cli.js build-prompt {name} --todo finalize --type report)
```

Output the final execution report to the user.
```
TaskUpdate(taskId, { status: "completed" })
```

---

## Quick Mode Differences

| Aspect | Standard | Quick |
|--------|----------|-------|
| TODO substeps | Worker → Verify → Wrap-up → Commit | Worker → Wrap-up → Commit |
| Finalize | Residual Commit → Code Review → Final Verify → State Complete → Report | Residual Commit → State Complete → Report |
| On failure | Retry (3x) / Adapt / Halt | Halt immediately |

Quick mode skips: Verify substep, Code Review, Final Verify, retry/adapt reconciliation.

---

## Recovery (Resume)

`node dev-cli/bin/dev-cli.js plan-to-tasks` automatically skips checked TODOs in PLAN.md. To resume:
1. Run `/execute` again — checked TODOs are excluded from task generation
2. Remaining unchecked TODOs become new tasks
3. Context files (outputs.json, learnings.md) are preserved

---

## Conductor Rule

**The orchestrator MUST NOT modify code directly.**

Allowed tools:
- `Read`, `Grep`, `Glob` — inspect codebase
- `Bash` — ONLY for `node dev-cli/bin/dev-cli.js` commands
- `Task` — dispatch SubAgents (worker, git-master, code-reviewer)
- `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet` — orchestration
- `Edit` — FORBIDDEN for code changes (only `node dev-cli/bin/dev-cli.js checkpoint` handles PLAN.md)

All code changes happen through `Task(worker)`. All deterministic ops through `node dev-cli/bin/dev-cli.js`.
