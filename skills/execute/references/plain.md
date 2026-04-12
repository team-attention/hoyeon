# Plain Pipeline Reference

This file contains all plain-specific execution logic for the `/execute` skill.
It is loaded when `meta.type == "plain"` after Phase 0 completes.

**Prerequisite**: Phase 0 (Find Spec, Derive Plan, Init Context, Confirm Pre-work) is already done.
`spec_path`, `plan_path`, `normalized_spec`, and `meta_type` are all established.

- `plan_path` = `<dirname(spec_path)>/plan.json` — task state I/O via `hoyeon-cli plan`.
- `normalized_spec` = session-cached spec object. If it has no `requirements`, fall back to each task's `action` as the only behavioral guidance.

---

## Create Tracking Tasks

Create TaskCreate entries for all tasks + finalize steps. **Batch all in one turn.**

```
# ═══════════════════════════════════════════════════
# TURN 1: Create ALL tasks in PARALLEL (single message)
# ═══════════════════════════════════════════════════

pending_tasks = Bash("hoyeon-cli plan list {plan_path} --status pending --json") → parse .tasks

FOR EACH task in pending_tasks:
  t = TaskCreate(subject="{task.id}: {task.action}",
                 description="Plain task {task.id}. Plan: {plan_path}",
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

# Chain by depends_on from plan.json
FOR EACH task WHERE task.depends_on is not empty:
  FOR EACH dep_id in task.depends_on:
    TaskUpdate(taskId=task_ids[dep_id].tracking, addBlocks=[task_ids[task.id].tracking])

# All task trackers → Final Verify → Report
FOR EACH task in pending_tasks:
  TaskUpdate(taskId=task_ids[task.id].tracking, addBlocks=[fv])
TaskUpdate(taskId=fv, addBlocks=[rp])
```

**Key rule**: NEVER create tasks one-by-one across multiple turns. All TaskCreate in Turn 1, all TaskUpdate in Turn 2.

---

## Task Loop

Execute tasks in dependency order from `plan.json`.
The orchestrator is flexible in how it handles each task — it can delegate to agents/skills
or execute work directly, depending on the task.

```
pending_tasks = Bash("hoyeon-cli plan list {plan_path} --status pending --json") → parse .tasks
runnable_rounds = group pending_tasks by dependency layer (topological rounds)

FOR EACH round in runnable_rounds:
  runnable = round.tasks

  IF len(runnable) == 0: CONTINUE

  # Mark all in_progress (plan.json + Claude Code tracking)
  FOR EACH task in runnable:
    Bash("hoyeon-cli plan status {task.id} {plan_path} --status in_progress")
    TaskUpdate(taskId=task.tracking_id, status="in_progress")

  FOR EACH task in runnable (single message, run_in_background=true if len > 1):
    # Guidance: prefer fulfills[] sub-req GWT from normalized_spec when present;
    # fall back to task.action if no requirements are defined in the spec.
    task_spec = Bash("hoyeon-cli plan get {task.id} {plan_path}") → parse JSON

    IF task_spec.tool AND task_spec.tool starts with "/":
      # Invoke as Skill
      Skill(skill=task_spec.tool, args="")
    ELIF task_spec.tool:
      # Invoke as Agent with specific subagent_type
      Agent(
        subagent_type=task_spec.tool,
        prompt=task_spec.action,
        run_in_background=(len(runnable) > 1)
      )
    ELSE:
      # No tool specified — orchestrator handles directly
      Execute task_spec.action directly OR Agent(subagent_type="general-purpose", prompt=task_spec.action)

  # Collect results (update both plan and Claude Code tracking)
  FOR EACH task in runnable:
    result = await task completion
    IF result indicates success:
      Bash("hoyeon-cli plan status {task.id} {plan_path} --status done --summary '{result.summary}'")
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
Provide spec_path, plan_path, and the normalized_spec object.

IF result.status == "VERIFIED" OR result.status == "VERIFIED_WITH_GAPS":
  IF result.status == "VERIFIED_WITH_GAPS":
    log_to_audit("VERIFIED_WITH_GAPS: uncertain sub-reqs detected, proceeding as soft pass")
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
all_tasks = Bash("hoyeon-cli plan list {plan_path} --json") → parse .tasks

print("""
═══════════════════════════════════════════════════
              EXECUTE COMPLETE (plain)
═══════════════════════════════════════════════════

SPEC: {spec_path}
PLAN: {plan_path}
GOAL: {normalized_spec.meta.goal}

───────────────────────────────────────────────────
TASKS
───────────────────────────────────────────────────
{FOR EACH task in all_tasks:}
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
{post_work = normalized_spec.external_dependencies.post_work ?? []}
{FOR EACH item in post_work:}
- {item.action}

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
7. **plan.json is task-state source** — use `hoyeon-cli plan` commands only; do not Read/Write plan.json directly
8. **spec fallback** — if `normalized_spec.requirements` is empty, use `task.action` as sole behavioral guidance

---

## Checklist

- [ ] All TaskCreate in single turn (Turn 1), all TaskUpdate in single turn (Turn 2)
- [ ] All tasks dispatched in dependency order from `plan.json`
- [ ] Each task handled flexibly (direct work, Skill, or Agent)
- [ ] Dual tracking: plan.json (via `hoyeon-cli plan status`) and Claude Code (via TaskUpdate)
- [ ] All plan tasks have `status: "done"`
- [ ] Final verify worker ran holistic spec verification
- [ ] Final report output
