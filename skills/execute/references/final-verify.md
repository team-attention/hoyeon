# Final Verify — Holistic Spec Verification

Reusable verification recipe that checks the full spec holistically:
goal alignment, constraints, acceptance criteria, requirements, and deliverables.

**Consumers**: `/execute` (all modes and types), `/check`, `/ralph`, or any skill needing spec-level verification.

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
    [MANUAL — skip, report only] {constraint.rule}
  {IF no constraints: "None defined — skip this step"}

  ## Step 3: Acceptance Criteria (all tasks)
  {FOR EACH task in spec.tasks where status == "done":}
  ### {task.id}: {task.action}

  **Scenario checks** (from acceptance_criteria.scenarios[]):
  {FOR EACH scenario_id in task.acceptance_criteria.scenarios ?? []:}
    Look up scenario_id in spec.requirements[].scenarios[] to find the full scenario.
    {IF scenario.verified_by == "machine" AND scenario.execution_env != "sandbox":}
    - [{scenario_id}] Run: `{scenario.verify.run}` → expect exit {scenario.verify.expect.exit_code}
    {IF scenario.verified_by == "agent":}
    - [{scenario_id}] Assert: {scenario.verify.checks}
    {IF scenario.verified_by == "human":}
    - [{scenario_id}] [MANUAL — skip, report only] {scenario.then}
    {IF scenario.verified_by == "machine" AND scenario.execution_env == "sandbox":}
    - [{scenario_id}] [SANDBOX — delegate to worker agent — see Step 4]

  **Automated checks** (from acceptance_criteria.checks[]):
  {FOR EACH check in task.acceptance_criteria.checks ?? []:}
  - [{check.type}] Run: `{check.run}` → expect exit 0

  ## Step 4: Scenario Status Check
  Run: `hoyeon-cli spec requirement --status --json {spec_path}`

  Parse the JSON output:
  - If summary.fail > 0 → report each failed scenario with its id, status, and details
  - If any sandbox scenario has status "pending" → mark as SKIPPED with reason "sandbox verification task not executed"
  - Human scenarios with status "pending" → expected, mark as MANUAL REVIEW
  - All machine/agent scenarios should be "pass" — any "pending" ones were missed

  Include scenario_status in the output:
  ```json
  "scenario_status": {
    "pass": N, "fail": N, "pending": N, "skipped": N,
    "results": [
      {"id": "R1-S1", "status": "pass", "task": "T1"},
      {"id": "R1-S2", "status": "pass", "task": "T_SV1"},
      {"id": "R1-S3", "status": "pending", "reason": "human review"}
    ]
  }
  ```

  ## Step 5: Requirements Scenarios
  {FOR EACH req in spec.requirements ?? []:}
  ### {req.id}: {req.behavior}
  {FOR EACH scenario in req.scenarios:}
    {IF scenario.verified_by == "machine" AND (scenario.execution_env == "host" OR !scenario.execution_env):}
    - [{scenario.id}] Given: {scenario.given} | When: {scenario.when} | Then: {scenario.then}
      Run: `{scenario.verify.run}` → expect exit {scenario.verify.expect.exit_code}
    {IF scenario.verified_by == "agent":}
    - [{scenario.id}] Assert: {scenario.verify.checks}
    {IF scenario.verified_by == "human":}
    - [{scenario.id}] [MANUAL — skip, report only] {scenario.then}
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
        {"task_id": "T1", "scenario_id": "S1.1", "description": "...", "status": "PASS|FAIL", "reason": "..."}
      ]
    },
    "scenario_status": {
      "pass": 0, "fail": 0, "pending": 0, "skipped": 0,
      "results": [
        {"id": "R1-S1", "status": "pass", "task": "T1"},
        {"id": "R1-S2", "status": "pending", "reason": "human review"}
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

The caller handles the result. Below is the reference recovery pattern used by `/execute`.

```
IF result.status == "VERIFIED":
  # proceed (e.g., TaskUpdate, mark complete)

ELIF result.status == "FAILED":
  # 1. Classify: goal_alignment failure = unrecoverable, HALT immediately
  IF result.goal_alignment.status == "FAIL":
    print("GOAL MISALIGNMENT — cannot auto-fix. HALT.")
    print("  Reason: {result.goal_alignment.reason}")
    HALT

  # 2. All other failures (constraints, AC, requirements, deliverables):
  #    Create derived fix tasks and re-run Final Verify (max 2 attempts)
  fv_attempt = 0
  WHILE fv_attempt < 2:
    fv_attempt += 1
    fix_tasks = []

    FOR EACH category in [constraints, acceptance_criteria, requirements, deliverables]:
      FOR EACH failure in result[category].results.filter(r => r.status == "FAIL"):
        parent_task_id = failure.task_id ?? last_planned_task_id

        derive_result = Bash("""hoyeon-cli spec derive \
          --parent {parent_task_id} \
          --source final-verify \
          --trigger final_verify \
          --action "FV fix: {failure.description}" \
          --reason "Final Verify {category} failure: {failure.reason}" \
          {spec_path}""")
        fix_tasks.append(derive_result.created)

    # Execute fix tasks WITHOUT per-task verify (no :Verify step for FV-derived tasks)
    FOR EACH fix_task_id in fix_tasks:
      Agent(subagent_type="worker", prompt=WORKER_DESCRIPTION(fix_task_id))
      Bash("hoyeon-cli spec task {fix_task_id} --status done {spec_path}")

    # Commit all FV fixes together
    Agent(subagent_type="git-master", prompt="Commit Final Verify fixes")

    # Re-dispatch Final Verify
    result = dispatch_final_verify_worker()

    IF result.status == "VERIFIED":
      BREAK  # success

    IF result.goal_alignment.status == "FAIL":
      print("GOAL MISALIGNMENT after FV fix — HALT.")
      HALT

  IF result.status != "VERIFIED":
    print("Final Verify failed after {fv_attempt} recovery attempt(s). HALT.")
    HALT
```

### Recovery Constraints

| Constraint | Rule |
|------------|------|
| goal_alignment FAIL | Immediate HALT — no recovery attempt |
| Other failures | Create derived fix tasks via `spec derive --trigger final_verify` |
| FV-derived fix tasks | Execute WITHOUT per-task verify (lightweight path) |
| Max FV re-runs | 2 (circuit breaker — HALT after 2 failed attempts) |
| Manual items (verified_by: human) | SKIP (report only, never HALT) |
