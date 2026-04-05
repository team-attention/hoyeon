# Direct Pipeline Reference

This file contains all direct-dispatch execution logic for the `/execute` skill.
It is loaded when the user selects `dispatch = direct` in Phase 0.5.

**Prerequisite**: Phase 0 (Find Spec, Get Plan, Init Context, Confirm Pre-work, Work Mode Selection) is already done.
`spec_path`, `plan`, `CONTEXT_DIR`, `meta_type`, `work_mode`, and `WORK_DIR` are all established.

**When to use DIRECT**: 1-2 tasks, single-file edits, config changes, renames, simple additions.
The orchestrator performs all work itself — no subagents are spawned.

---

## Phase 0.5: Create Tracking Tasks

Create TaskCreate entries for tracking only. **No Worker or Commit tasks** — the orchestrator
executes directly. Batch all in one turn.

### Worktree Note

When `work_mode == "worktree"`, the orchestrator has already called `EnterWorktree` in Phase 0.5.
Session CWD is inside the worktree — all tools (Read, Edit, Write, Bash, Glob, Grep) automatically
operate there. No `cd` is needed. `spec_path` and `CONTEXT_DIR` are absolute paths.

### Task Creation

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

FOR EACH task in plan (flattened from rounds, excluding done):
  t = TaskCreate(subject="{task.id}:Direct — {task.action}",
                 description="Orchestrator direct execution of {task.id}.",
                 activeForm="{task.id}: Executing directly")

# Finalize tasks
fv = TaskCreate(subject="Finalize:Verify",
     description="Run verification checks per selected verify depth.",
     activeForm="Running verification")
rp = TaskCreate(subject="Finalize:Report",
     activeForm="Generating report")
```

### Set Dependencies (TURN 2)

```
# ═══════════════════════════════════════════════════
# TURN 2: Set ALL dependencies in PARALLEL (single message)
# ═══════════════════════════════════════════════════

# Cross-task dependencies (from spec.json depends_on)
FOR EACH task WHERE task.depends_on is not empty:
  FOR EACH dep_id in task.depends_on:
    producer = task_ids[dep_id].tracking
    consumer = task_ids[task.id].tracking
    TaskUpdate(taskId=producer, addBlocks=[consumer])

# All task tracking entries → Finalize:Verify
all_tracking = [task_ids[T].tracking for each T]
FOR EACH tracking in all_tracking:
  TaskUpdate(taskId=tracking, addBlocks=[fv])

# Finalize chain: Verify → Report
TaskUpdate(taskId=fv, addBlocks=[rp])
```

**Key rule**: NEVER create tasks one-by-one across multiple turns. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Phase 1: Execute Loop

The orchestrator executes each task directly — no Agent spawning, no subagents.

> **Compaction recovery**: `session-compact-hook.sh` re-injects skill name + state.json path.
> Read state.json to get spec_path, then use `hoyeon-cli spec plan` to rebuild task state.

### Execute Loop

```
FOR EACH task in plan (dependency order, excluding done):

  # 1. Mark in progress
  TaskUpdate(taskId=task_ids[task.id].tracking, status="in_progress")

  # 2. Read task spec
  task_spec = Bash("hoyeon-cli spec task {task.id} --get {spec_path}")

  # 3. Read context files (if they exist)
  learnings = Read("{CONTEXT_DIR}/learnings.json")   # may not exist yet
  issues    = Read("{CONTEXT_DIR}/issues.json")       # may not exist yet

  # 4. Execute directly
  #    Use Edit, Write, Bash, Read, Grep, Glob as needed.
  #    Follow task_spec.action.
  #    Respect constraints from spec.
  #    Do NOT spawn any Agent or Task.
  #
  #    Code quality — avoid AI expression patterns:
  #    - No comments restating code, no catch-rethrow without context
  #    - No assign-then-return, no defensive over-checking for type-guaranteed values
  #    - No single-use helpers, no vacuous JSDoc, no leftover debug code
  IMPLEMENT(task_spec)

  # 5. Verify before marking done
  #    a) Behavioral check: look up fulfills[] → requirements → sub-requirements.
  #       Each sub-req's GWT fields (given/when/then) define the acceptance criterion.
  #       Verify the implementation satisfies all of them.
  #    b) Build/lint/typecheck: run the project's build, lint, type-check commands.
  behavioral_check(task_spec.fulfills)
  build_check()

  # 6. Update spec task status
  Bash("hoyeon-cli spec task {task.id} --status done --summary '...' {spec_path}")
  TaskUpdate(taskId=task_ids[task.id].tracking, status="completed")

  # 7. Write learnings/issues via CLI if any discovered
  #    hoyeon-cli spec learning --task {task.id} --stdin {spec_path} << 'EOF'
  #    {"problem":"...","cause":"...","rule":"...","tags":[...]}
  #    EOF
  #
  #    hoyeon-cli spec issue --task {task.id} --stdin {spec_path} << 'EOF'
  #    {"type":"...","description":"..."}
  #    EOF
```

### On Failure

```
IF build/lint check fails:
  # Fix directly — orchestrator has full context, no need to derive a new task.
  # Re-run the failing command after applying the fix.
  # If the fix requires changes outside the current task's scope, record as issue.
  FIX_DIRECTLY()
  RE_VERIFY()

IF fix cannot be applied (out of scope):
  Bash("hoyeon-cli spec task {task.id} --status blocked {spec_path}")
  Bash("""hoyeon-cli spec issue --task {task.id} --stdin {spec_path} << 'EOF'
  {"type":"blocker","description":"..."}
  EOF""")
  TaskUpdate(taskId=task_ids[task.id].tracking, status="completed")
  # Continue to next task — do not HALT for DIRECT mode single-task blocks
```

---

## Phase 2: Finalize

After all tasks complete, run verification and report.

### 2a. Commit (if applicable)

```
IF work_mode != "no-commit":
  git_status = Bash("git status --porcelain")
  IF git_status is not empty:
    # Orchestrator commits directly — no git-master agent needed.
    # Single commit for all DIRECT mode changes.
    Bash("git add -A && git commit -m '{spec.meta.goal} — direct execution'")
```

### 2b. Verify

Route to the appropriate verify recipe based on user's verify depth selection from Phase 0.5.

```
verify_depth = spec.meta.mode.verify   # "light" | "standard" | "thorough"

IF verify_depth == "light":
  Read: ${baseDir}/references/verify-light.md
ELIF verify_depth == "standard":
  Read: ${baseDir}/references/verify-standard.md
ELIF verify_depth == "thorough":
  Read: ${baseDir}/references/verify-thorough.md
ELIF verify_depth == "ralph":
  Read: ${baseDir}/references/verify-ralph.md

Follow the verify recipe instructions.
```

**DIRECT mode verify note**: The orchestrator executes all verification checks directly.
No separate verify agent is needed — the orchestrator already has full context from
executing all tasks itself.

```
On completion:

IF all checks PASS:
  TaskUpdate(taskId=fv, status="completed")
ELSE:
  # Fix issues directly (orchestrator has full context)
  FOR EACH failure:
    FIX_DIRECTLY(failure)
  RE_VERIFY()  # max 2 attempts

  IF still failing after 2 attempts:
    print("Verification failed after 2 fix attempts. HALT.")
    HALT
```

### 2c. Report

Simplified report for DIRECT mode.

```
spec = Read(spec_path) -> parse JSON

print("""
═══════════════════════════════════════════════════
            EXECUTE COMPLETE (DIRECT)
═══════════════════════════════════════════════════

SPEC: {spec_path}
GOAL: {spec.meta.goal}
DISPATCH: direct
WORK: {work_mode}
VERIFY: {verify_depth}

───────────────────────────────────────────────────
TASKS
───────────────────────────────────────────────────
{FOR EACH task in spec.tasks:}
{task.id}: {task.action} — {task.status}
  {task.summary}

───────────────────────────────────────────────────
VERIFICATION
───────────────────────────────────────────────────
{verify recipe results}

───────────────────────────────────────────────────
CONTEXT
───────────────────────────────────────────────────
Learnings: {count} entries
Issues: {count} entries

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

## Direct-specific Rules

1. **Orchestrator does ALL work directly** — use Edit, Write, Bash, Read, Grep, Glob. No Agent(), no TaskCreate for workers.
2. **NO subagent spawning** — no Worker agents, no git-master agents, no code-reviewer agents. The orchestrator is the sole executor.
3. **spec.json is the source of truth** — always use `hoyeon-cli spec task` for status tracking, `hoyeon-cli spec plan` for plan state.
4. **Context files still used** — read `learnings.json` and `issues.json` before each task, write learnings/issues via CLI after.
5. **Direct fix pattern** — when build/lint fails, fix directly instead of deriving new tasks. The orchestrator already has full context.
6. **Single commit** — all changes committed together (not per-task). Only one commit for the entire DIRECT execution.
7. **Verify executed directly** — the orchestrator runs all verify checks itself. No verify agent needed.
8. **Two turns for task setup** — Turn 1: all TaskCreate, Turn 2: all TaskUpdate (same as other modes).
9. **Suitable for**: config changes, single-file edits, renames, simple additions, documentation updates, 1-2 task specs.
10. **NOT suitable for**: multi-file refactors, complex features, specs with 3+ tasks, tasks requiring parallel execution.

---

## Checklist

- [ ] All TaskCreate tracking entries created in single turn (Turn 1)
- [ ] All TaskUpdate dependencies set in single turn (Turn 2)
- [ ] Each task read via `hoyeon-cli spec task {id} --get`
- [ ] Context files read before execution (learnings.json, issues.json)
- [ ] All work done directly (Edit/Write/Bash/Read/Grep/Glob) — no Agent spawning
- [ ] Behavioral check against fulfills[] sub-requirements GWT
- [ ] Build/lint/typecheck passes
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Changes committed (if work_mode != "no-commit")
- [ ] Verify recipe executed per selected depth
- [ ] Learnings/issues written via CLI
- [ ] Final report output
