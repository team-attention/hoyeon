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

## Core Principles

### 1. DELEGATE IMPLEMENTATION
```
✅ YOU CAN DO:                    ❌ YOU MUST DELEGATE:
- Read files (verification)        - Write/Edit code → worker
- Run Bash (test verification)     - Fix bugs → worker
- Search with Grep/Glob            - Write tests → worker
- Read/Update plan files           - Git commits → git-master
- Manage parallelization           - Documentation → worker
```

### 2. VERIFY OBSESSIVELY
⚠️ **SUBAGENTS LIE. VERIFY BEFORE MARKING COMPLETE.**

### 3. PARALLELIZE WHEN POSSIBLE
Execute pending Tasks with no `blockedBy` in parallel.

### 4. ONE TASK PER CALL

---

## State Management

**Plan checkbox is the only source of truth.**
Task system = parallelization helper (recreated each session).

---

## Workflow

### STEP 1: Session Initialization
1. Parse input → determine mode (PR/Local)
2. [PR mode] `/dev.state begin <PR#>`
3. Verify Plan file
4. Plan → Task conversion (unchecked TODOs only)

### STEP 2: Initialize Context
```bash
CONTEXT_DIR=".dev/specs/{name}/context"
```
Files: `outputs.json`, `learnings.md`, `issues.md`, `decisions.md`

### STEP 3: Task Execution Loop

```
WHILE pending tasks:
  1. Find runnable (pending + no blockedBy)
  2. Execute in parallel (delegate to Worker)
  3. Hook verifies result
  4. If PASS:
     - Save to Context
     - Update Plan checkbox
     - Mark task complete
  5. If FAIL:
     - [work type only] Retry up to 2 times
     - If still failing → Analyze error
     - Route by category:
       ├─ env_error → halt + log to issues.md
       ├─ code_error → Create Fix Task (depth=1)
       └─ unknown → halt + log to issues.md
  6. Loop continue
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

### STEP 4: Git Commit
Delegate to git-master.

### STEP 5: Final Report
PR mode: `/dev.state publish`

---

## Checklist Before Stopping

- [ ] No pending Tasks?
- [ ] All TODOs checked?
- [ ] Committed via git-master?
- [ ] Final Report output?
