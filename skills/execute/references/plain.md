# Plain Pipeline Reference

This file contains all plain-specific execution logic for the `/execute` skill.
It is loaded when `meta.type == "plain"` after Phase 0 completes.

**Prerequisite**: Phase 0 (Find Spec, Get Plan, Init Context, Confirm Pre-work) is already done.
`spec_path`, `plan`, and `meta_type` are all established.

---

## Task Loop

Execute tasks in DAG order from `plan.rounds`.
The orchestrator is flexible in how it handles each task — it can delegate to agents/skills
or execute work directly, depending on the task.

```
FOR EACH round in plan.rounds:
  runnable = round.tasks.filter(t => t.status != "done")

  IF len(runnable) == 0: CONTINUE

  # Mark all in_progress
  FOR EACH task in runnable:
    Bash("hoyeon-cli spec task {task.id} --status in_progress {spec_path}")

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
      # This includes: direct file edits, bash commands, research, or any work
      # the orchestrator can do without delegation.
      # If the task is complex enough, delegate to a general-purpose agent.
      Execute task.action directly OR Agent(subagent_type="general-purpose", ...)

  # Collect results
  FOR EACH task in runnable:
    result = await task completion
    IF result indicates success:
      Bash("hoyeon-cli spec task {task.id} --status done --summary '{result.summary}' {spec_path}")
    ELSE:
      print("Task {task.id} FAILED: {result.reason}")
      HALT
```

---

## Finalize

After all tasks complete, run Final Verify then report.

### Final Verify

```
Read: ${baseDir}/references/final-verify.md
Follow the usage instructions to dispatch the verification worker.
Provide spec_path and parsed spec JSON.

IF result.status == "VERIFIED":
  # proceed to report
ELSE:
  # On FV failure: generate a partial report with failures noted, THEN halt.
  # This ensures the user has actionable output even when verification fails.
  fv_failed = true
  fv_failures = []
  IF result.goal_alignment.status == "FAIL":
    fv_failures.append("[goal_alignment] GOAL MISALIGNMENT: {result.goal_alignment.reason}")
  FOR EACH category in [constraints, acceptance_criteria, requirements, deliverables]:
    FOR EACH failure in result[category].results.filter(r => r.status == "FAIL"):
      fv_failures.append("[{category}] {failure.description} — {failure.reason}")
```

### Report

```
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
MANUAL REVIEW (require human verification)
───────────────────────────────────────────────────
{FOR EACH req in spec.requirements ?? []:}
{FOR EACH scenario where verified_by == "human":}
- {scenario.id}: {scenario.then}
  Check: {scenario.verify.ask}

{IF no manual items: "None"}

───────────────────────────────────────────────────
POST-WORK (human actions after completion)
───────────────────────────────────────────────────
{post_work = spec.external_dependencies.post_work ?? []}
{FOR EACH item in post_work:}
- [{item.id ?? ''}] {item.dependency}: {item.action}

{IF no post_work: "None"}
═══════════════════════════════════════════════════
""")

IF fv_failed:
  HALT
```

---

## Plain-specific Rules

1. **Flexible dispatch** — orchestrator can handle tasks directly, via Skill, or via Agent
2. **No git commits** — plain mode does not manage git operations
3. **No code review** — no code-reviewer agent
4. **No per-task verify** — no verify step between tasks
5. **Final Verify required** — holistic spec verification always runs at the end
6. **On failure → HALT** — no retry or adaptation flow

---

## Checklist

- [ ] All tasks dispatched in DAG order from `plan.rounds`
- [ ] Each task handled flexibly (direct work, Skill, or Agent)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] Final verify worker ran holistic spec verification
- [ ] Manual items listed for human follow-up if present
- [ ] Final report output
