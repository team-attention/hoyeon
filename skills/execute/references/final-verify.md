# Final Verify — Holistic Spec Verification

Reusable verification recipe that checks the full spec holistically:
goal alignment, constraints, acceptance criteria, requirements, and deliverables.

**Consumers**: `/execute` (Quick mode), `/check`, `/ralph`, or any skill needing spec-level verification.

---

## Usage

The caller must provide `{spec_path}` and `{spec}` (parsed JSON).
Dispatch as a worker agent — read-only, no file modifications.

```
spec = Read(spec_path) → parse JSON

Agent(
  subagent_type="worker",
  description="Final holistic verification",
  prompt="""
  ## TASK
  You are a FINAL VERIFICATION worker.
  Read the FULL spec and verify the implementation holistically.
  DO NOT modify any files. Only READ and RUN verification commands.

  Spec path: {spec_path}

  ## Step 1: Goal Alignment
  - Goal: {spec.meta.goal}
  - Non-goals: {spec.meta.non_goals ?? "None"}
  - Deliverables: {spec.meta.deliverables ?? "None"}
  - Check: Does the implementation achieve the goal?
  - Check: Does it avoid non-goals?
  - Check: Do all deliverable files exist?
  Report: PASS or FAIL with reason.

  ## Step 2: Constraints
  {FOR EACH constraint in spec.constraints ?? []:}
  - [{constraint.id}] {constraint.rule} (type: {constraint.type})
    verified_by: {constraint.verified_by}
    {IF constraint.verified_by == "machine":}
    Run: `{constraint.verify.run}` → expect exit {constraint.verify.expect.exit_code}
    {IF constraint.verified_by == "agent":}
    Assert: {constraint.verify.checks}
    {IF constraint.verified_by == "human":}
    [H-ITEM — skip, report only] {constraint.rule}
  {IF no constraints: "None defined — skip this step"}

  ## Step 3: Acceptance Criteria (all tasks)
  {FOR EACH task in spec.tasks where status == "done":}
  ### {task.id}: {task.action}
  {FOR EACH category in [functional, static, runtime, cleanup]:}
    {FOR EACH item in task.acceptance_criteria[category] ?? []:}
    - [{category}] {item.description}
      {IF item.command:} Command: `{item.command}`

  ## Step 4: Requirements Scenarios
  {FOR EACH req in spec.requirements ?? []:}
  ### {req.id}: {req.behavior}
  {FOR EACH scenario in req.scenarios:}
    {IF scenario.verified_by == "machine" AND (scenario.execution_env == "host" OR !scenario.execution_env):}
    - [{scenario.id}] Given: {scenario.given} | When: {scenario.when} | Then: {scenario.then}
      Run: `{scenario.verify.run}` → expect exit {scenario.verify.expect.exit_code}
    {IF scenario.verified_by == "agent":}
    - [{scenario.id}] Assert: {scenario.verify.checks}
    {IF scenario.verified_by == "human":}
    - [{scenario.id}] [H-ITEM — skip, report only] {scenario.then}
  {IF no requirements: "None defined — skip this step"}

  ## OUTPUT FORMAT
  ```json
  {
    "status": "VERIFIED" | "FAILED",
    "goal_alignment": {
      "status": "PASS" | "FAIL",
      "reason": "..."
    },
    "constraints": {
      "pass": 0, "fail": 0, "results": []
    },
    "acceptance_criteria": {
      "pass": 0, "fail": 0, "results": [
        {"task_id": "T1", "category": "functional", "description": "...", "status": "PASS|FAIL", "reason": "..."}
      ]
    },
    "requirements": {
      "pass": 0, "fail": 0, "skipped_human": 0, "results": []
    },
    "deliverables": {
      "pass": 0, "fail": 0, "results": []
    },
    "summary": "..."
  }
  ```
  """
)
```

## Result Handling

The caller handles the result:

```
IF result.status == "VERIFIED":
  # proceed (e.g., TaskUpdate, mark complete)

ELIF result.status == "FAILED":
  print("Final verification FAILED:")

  IF result.goal_alignment.status == "FAIL":
    print("  GOAL MISALIGNMENT: {result.goal_alignment.reason}")

  FOR EACH category in [constraints, acceptance_criteria, requirements, deliverables]:
    FOR EACH failure in result[category].results.filter(r => r.status == "FAIL"):
      print("  [{category}] {failure.description} — {failure.reason}")

  # Caller decides: HALT, retry, or escalate
```
