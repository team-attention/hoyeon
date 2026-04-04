# Plain Pipeline Reference

This file contains all plain-specific execution logic for the `/execute` skill.
It is loaded when `meta.type == "plain"` after Phase 0 completes.

**Prerequisite**: Phase 0 (Find Spec, Get Plan, Init Context, Confirm Pre-work) is already done.
`spec_path`, `plan`, and `meta_type` are all established.

---

## Create Tracking Tasks

Create TaskCreate entries for all tasks + finalize steps. **Batch all in one turn.**

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

FOR EACH task in plan (flattened from rounds, excluding done):
  t = TaskCreate(subject="{task.id}: {task.action}",
                 description="Plain task {task.id}. Spec: {spec_path}",
                 activeForm="{task.id}: Running")

# Finalize tasks
fv = TaskCreate(subject="Finalize:Final Verify",
     description="Holistic spec verification (goal, constraints, AC, requirements, deliverables).",
     activeForm="Running final verification")
rp = TaskCreate(subject="Finalize:Report",
     activeForm="Generating report")
```

```
# ═══════════════════════════════════════════════════
# TURN 2: Set up dependencies (single message)
# ═══════════════════════════════════════════════════

# Chain tasks by round order — each round blocks the next
FOR EACH consecutive round pair (round_n, round_n+1):
  last_of_n = last task of round_n
  first_of_n+1 = first task of next round
  TaskUpdate(taskId=last_of_n, addBlocks=[first_of_n+1])

# Finalize chain: last task → Final Verify → Report
TaskUpdate(taskId=last_task, addBlocks=[fv])
TaskUpdate(taskId=fv, addBlocks=[rp])
```

**Key rule**: NEVER create tasks one-by-one across multiple turns. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Task Loop

Execute tasks in DAG order from `plan.rounds`.
The orchestrator is flexible in how it handles each task — it can delegate to agents/skills
or execute work directly, depending on the task.

```
FOR EACH round in plan.rounds:
  runnable = round.tasks.filter(t => t.status != "done")

  IF len(runnable) == 0: CONTINUE

  # Mark all in_progress (both spec and Claude Code tracking)
  FOR EACH task in runnable:
    Bash("hoyeon-cli spec task {task.id} --status in_progress {spec_path}")
    TaskUpdate(taskId=task.tracking_id, status="in_progress")

  FOR EACH task in runnable (single message, run_in_background=true if len > 1):
    IF task.tool AND task.tool starts with "/":
      # Invoke as Skill
      Skill(skill=task.tool, args=task.args ?? "")
    ELIF task.tool:
      # Invoke as Agent with specific subagent_type
      Agent(
        subagent_type=task.tool,
        prompt=task.action + "\n\n" + (task.args ?? ""),
        run_in_background=(len(runnable) > 1)
      )
    ELSE:
      # No tool specified — orchestrator handles directly
      Execute task.action directly OR Agent(subagent_type="general-purpose", ...)

  # Collect results (update both spec and Claude Code tracking)
  FOR EACH task in runnable:
    result = await task completion
    IF result indicates success:
      Bash("hoyeon-cli spec task {task.id} --status done --summary '{result.summary}' {spec_path}")
      TaskUpdate(taskId=task.tracking_id, status="completed")
    ELSE:
      print("Task {task.id} FAILED: {result.reason}")
      TaskUpdate(taskId=task.tracking_id, status="cancelled")
      HALT
```

---

## Finalize

After all tasks complete, run Final Verify then report.

### Final Verify

```
TaskUpdate(taskId=fv, status="in_progress")

Read: ${baseDir}/references/final-verify.md
Follow the usage instructions to dispatch the verification worker.
Provide spec_path and parsed spec JSON.

IF result.status == "VERIFIED":
  TaskUpdate(taskId=fv, status="completed")
  # proceed to report
ELSE:
  # On FV failure: generate a partial report with failures noted, THEN halt.
  # This ensures the user has actionable output even when verification fails.
  fv_failed = true
  fv_failures = []
  IF result.goal_alignment.status == "FAIL":
    fv_failures.append("[goal_alignment] GOAL MISALIGNMENT: {result.goal_alignment.reason}")
  FOR EACH category in [constraints, requirements, deliverables]:
    FOR EACH failure in result[category].results.filter(r => r.status == "FAIL"):
      fv_failures.append("[{category}] {failure.description} — {failure.reason}")
```

### Report

```
TaskUpdate(taskId=rp, status="in_progress")
spec = Read(spec_path) → parse JSON

print("""
═══════════════════════════════════════════════════
              EXECUTE COMPLETE (plain)
═══════════════════════════════════════════════════

SPEC: {spec_path}
GOAL: {spec.meta.goal}

───────────────────────────────────────────────────
TASKS
───────────────────────────────────────────────────
{FOR EACH task in spec.tasks:}
{task.id}: {task.action} — {task.status}
  {task.summary}

───────────────────────────────────────────────────
VERIFICATION
───────────────────────────────────────────────────
Final Verify: {result.status}
{IF fv_failed:}
FAILURES:
{FOR EACH f in fv_failures:}
  {f}

───────────────────────────────────────────────────
POST-WORK (human actions after completion)
───────────────────────────────────────────────────
{post_work = spec.external_dependencies.post_work ?? []}
{FOR EACH item in post_work:}
- [{item.id ?? ''}] {item.dependency}: {item.action}

{IF no post_work: "None"}
═══════════════════════════════════════════════════
""")

TaskUpdate(taskId=rp, status="completed")

IF fv_failed:
  HALT
```

---

## Plain-specific Rules

1. **Flexible dispatch** — orchestrator can handle tasks directly, via Skill, or via Agent
2. **No git commits** — plain mode does not manage git operations
3. **No code review** — no code-reviewer agent
4. **No per-task verify** — Worker self-checks + Final Verify provide coverage
5. **Final Verify required** — holistic spec verification always runs at the end
6. **On failure → HALT** — no retry or adaptation flow

---

## Checklist

- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] All tasks dispatched in DAG order from `plan.rounds`
- [ ] Each task handled flexibly (direct work, Skill, or Agent)
- [ ] Dual tracking: both spec (via `hoyeon-cli spec task`) and Claude Code (via TaskUpdate)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] Final verify worker ran holistic spec verification
- [ ] Final report output
