# Verify Standard — Spec-Based Holistic Verification

Full verification against spec.json: goal alignment, constraints, sub-requirements, deliverables.

**Consumers**: `/execute` (AGENT/TEAM mode default), `/check`, `/ralph`, or any skill needing spec-level verification.

---

## Usage

The caller must provide `{spec_path}` and `{spec}` (parsed JSON).
Dispatch as a worker agent — read-only, no file modifications.

```
spec = Read(spec_path) → parse JSON

Agent(
  subagent_type="worker",
  description="Spec-based holistic verification",
  prompt="""
  ## TASK
  You are a VERIFICATION worker.
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

  **Sub-requirement checks** (from task.fulfills[]):
  {FOR EACH req_id in task.fulfills ?? []:}
    Look up req_id in spec.requirements[] to find the requirement, then iterate its sub[] items.
    {IF sub_req.verify exists AND sub_req.verified_by == "machine" AND sub_req.execution_env != "sandbox":}
    - [{sub_req_id}] Run: `{sub_req.verify.run}` → expect exit {sub_req.verify.expect.exit_code}
    {IF sub_req.verify exists AND sub_req.verified_by == "agent":}
    - [{sub_req_id}] Assert: {sub_req.verify.checks}
    {IF sub_req.verified_by == "human":}
    - [{sub_req_id}] [MANUAL — skip, report only] {sub_req.then}
    {IF sub_req.verified_by == "machine" AND sub_req.execution_env == "sandbox":}
    - [{sub_req_id}] [SANDBOX — skip in standard mode, see verify-thorough.md]
    {IF sub_req.verify does not exist:}
    - [{sub_req_id}] {IF sub_req.given AND sub_req.when AND sub_req.then:}
      Assert GWT: Given {sub_req.given}, When {sub_req.when}, Then {sub_req.then}
      {ELSE:}
      Assert behavior: {sub_req.behavior}

  **Automated checks** (from acceptance_criteria.checks[] if present):
  {FOR EACH check in task.acceptance_criteria.checks ?? []:}
  - [{check.type}] Run: `{check.run}` → expect exit 0
  (v1 specs have no acceptance_criteria — sub-req given/when/then fields or behavior text above serve as the sole acceptance criteria)

  ## Step 4: Sub-Requirement Status Check
  Run: `hoyeon-cli spec requirement --status --json {spec_path}`

  Parse the JSON output:
  - If summary.fail > 0 → report each failed sub-requirement with its id, status, and details
  - If any sandbox sub-requirement has status "pending" → mark as SKIPPED with reason "sandbox verification deferred to verify-thorough"
  - Human sub-requirements with status "pending" → expected, mark as MANUAL REVIEW
  - All machine/agent sub-requirements should be "pass" — any "pending" ones were missed

  Include sub_requirement_status in the output:
  ```json
  "sub_requirement_status": {
    "pass": N, "fail": N, "pending": N, "skipped": N,
    "results": [
      {"sub_requirement_id": "R1-SR1", "status": "pass", "task": "T1"},
      {"sub_requirement_id": "R1-SR2", "status": "pass", "task": "T_SV1"},
      {"sub_requirement_id": "R1-SR3", "status": "pending", "reason": "human review"}
    ]
  }
  ```

  ## Step 5: Requirements Sub-Requirements
  {FOR EACH req in spec.requirements ?? []:}
  ### {req.id}: {req.behavior}
  {FOR EACH sub_req in req.sub ?? []:}
    {IF sub_req.verify exists AND sub_req.verified_by == "machine" AND (sub_req.execution_env == "host" OR !sub_req.execution_env):}
    - [{sub_req.id}] Description: {sub_req.description}
      Run: `{sub_req.verify.run}` → expect exit {sub_req.verify.expect.exit_code}
    {IF sub_req.verify exists AND sub_req.verified_by == "agent":}
    - [{sub_req.id}] Assert: {sub_req.verify.checks}
    {IF sub_req.verified_by == "human":}
    - [{sub_req.id}] [MANUAL — skip, report only] {sub_req.description}
    {IF sub_req.verify does not exist:}
    - [{sub_req.id}] {IF sub_req.given AND sub_req.when AND sub_req.then:}
      Assert GWT: Given {sub_req.given}, When {sub_req.when}, Then {sub_req.then}
      {ELSE:}
      Assert behavior: {sub_req.behavior}
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
    "sub_requirement_status": {
      "pass": 0, "fail": 0, "pending": 0, "skipped": 0,
      "results": [
        {"sub_requirement_id": "R1-SR1", "status": "pass", "task": "T1"},
        {"sub_requirement_id": "R1-SR2", "status": "pending", "reason": "human review"}
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
  """)
```

## Dispatch Modes

- **DIRECT**: orchestrator executes checks directly (no agent) — use for small specs
- **AGENT**: dispatch as Agent(subagent_type="worker", read-only) — default
- **TEAM**: assign to idle worker or spawn verifier — for team-mode execution

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
  #    Create derived fix tasks and re-run verification (max 2 attempts)
  fv_attempt = 0
  WHILE fv_attempt < 2:
    fv_attempt += 1
    fix_tasks = []

    FOR EACH category in [constraints, requirements, deliverables]:
      FOR EACH failure in result[category].results.filter(r => r.status == "FAIL"):
        parent_task_id = failure.task_id ?? last_planned_task_id

        derive_result = Bash("""hoyeon-cli spec derive \
          --parent {parent_task_id} \
          --source verify-standard \
          --trigger verify_standard \
          --action "Fix: {failure.description}" \
          --reason "Verify standard {category} failure: {failure.reason}" \
          {spec_path}""")
        fix_tasks.append(derive_result.created)

    # Execute fix tasks WITHOUT per-task verify (no :Verify step for fix-derived tasks)
    FOR EACH fix_task_id in fix_tasks:
      Agent(subagent_type="worker", prompt=WORKER_DESCRIPTION(fix_task_id))
      Bash("hoyeon-cli spec task {fix_task_id} --status done {spec_path}")

    # Commit all fixes together
    Agent(subagent_type="git-master", prompt="Commit verification fixes")

    # Re-dispatch verification
    result = dispatch_verify_standard_worker()

    IF result.status == "VERIFIED":
      BREAK  # success

    IF result.goal_alignment.status == "FAIL":
      print("GOAL MISALIGNMENT after fix — HALT.")
      HALT

  IF result.status != "VERIFIED":
    print("Verify standard failed after {fv_attempt} recovery attempt(s). HALT.")
    HALT
```

### Recovery Constraints

| Constraint | Rule |
|------------|------|
| goal_alignment FAIL | Immediate HALT — no recovery attempt |
| Other failures | Create derived fix tasks via `spec derive --trigger verify_standard` |
| Fix-derived tasks | Execute WITHOUT per-task verify (lightweight path) |
| Max re-runs | 2 (circuit breaker — HALT after 2 failed attempts) |
| Manual items (verified_by: human) | SKIP (report only, never HALT) |
| Sandbox items | SKIP (deferred to verify-thorough) |
