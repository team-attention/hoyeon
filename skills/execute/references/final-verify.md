# Final Verify — Holistic Spec Verification

Reusable verification recipe that checks the full spec holistically:
goal alignment, constraints, acceptance criteria, requirements, and deliverables.

**Consumers**: `/execute` (all modes and types), `/check`, `/ralph`, or any skill needing spec-level verification.

---

## Tier 1: Mechanical + Structural Verification (all modes)

> Tier 1 runs in BOTH standard and quick modes.
> Tier 1 is a GATE — if any check fails, Tier 2 does NOT run.

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
    - [{sub_req_id}] [SANDBOX — delegate to worker agent — see Step 4]
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
  - If any sandbox sub-requirement has status "pending" → mark as SKIPPED with reason "sandbox verification task not executed"
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

    FOR EACH category in [constraints, requirements, deliverables]:
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

---

## Tier 2: Semantic Cross-Verification (standard mode only)

> **Mode Gate**: Quick mode → skip Tier 2. Tier 1 alone is sufficient.
> **Prerequisite**: Tier 1 must PASS before Tier 2 runs.

Tier 2 catches issues that pass Tier 1 but fail in integration — when individual tasks work in isolation but break when combined.

### Why Tier 2 exists

Per-task Verifiers check each task's sub-requirements independently. But they cannot catch:
- Task A outputs JWT tokens, Task B expects session cookies (format mismatch)
- Task A and Task B both modified the same utility file with conflicting changes
- A requirement has no sub-requirements with status "pass" (coverage gap)

### Dispatch (parallel agents)

Launch up to 3 verification agents in parallel via `run_in_background: true`:

**Agent A — Cross-task compatibility + user journey:**
```
Agent(subagent_type="worker", description="FV-Tier2: Cross-task compatibility",
  prompt="""
  Read spec at {spec_path}. For each pair of tasks where one task's outputs
  are consumed by another task's inputs (check depends_on relationships):
  1. Verify data format and contract compatibility across the boundary
  2. Check tasks with overlapping file changes for coherent modifications (no conflicts)
  3. Trace the main user journey end-to-end across all vertical slice tasks
     (e.g., the happy-path flow from first action to final output).
     Verify each handoff between tasks works correctly.
  4. Report any incompatibilities or broken handoffs found

  Output: {"status": "PASS"|"FAIL", "issues": [...]}
  """,
  run_in_background=true)
```

**Agent B — Sub-requirement coverage audit:**
```
Agent(subagent_type="worker", description="FV-Tier2: Sub-requirement coverage",
  prompt="""
  Read spec at {spec_path}. Check ALL requirements[].sub[]:
  1. Every sub-requirement should have status: pass or pending (human)
  2. Flag any sub-requirement with status: fail or no status recorded
  3. Flag any requirement where zero sub-requirements have status: pass

  Output: {"status": "PASS"|"FAIL", "uncovered": [...], "failed": [...]}
  """,
  run_in_background=true)
```

**Agent C — Constraint + must_not_do audit:**
```
Agent(subagent_type="worker", description="FV-Tier2: Constraint audit",
  prompt="""
  Read spec at {spec_path}.
  1. Read all constraints[]. For each, verify implementation respects it
  2. Read all tasks[].must_not_do[]. Verify no task violated its constraints
  3. If must_not_do includes "Do not run git commands", check git log for violations

  Output: {"status": "PASS"|"FAIL", "violations": [...]}
  """,
  run_in_background=true)
```

### Result aggregation

```
Wait for all 3 agents to complete.

IF ANY agent reports FAIL:
  log_to_audit("FV_TIER2 FAILED: {agent}: {issues}")

  # Create fix tasks (same pattern as Tier 1 fix loop)
  FOR EACH failure:
    derive_result = Bash("""hoyeon-cli spec derive \
      --parent {related_task_id} \
      --source final-verify-tier2 \
      --trigger cross_verification \
      --action "Fix: {failure.description}" \
      --reason "Tier 2 {agent_name}: {failure.reason}" \
      {spec_path}""")
    dispatch_fv_fix(derive_result, spec_path)

  # Re-run Tier 2 (max 1 retry)
  IF tier2_attempt >= 2:
    HALT with Tier 2 failure report
  tier2_attempt += 1
  # Re-dispatch all 3 agents

IF ALL agents report PASS:
  log_to_audit("FV_TIER2 PASS")
  → Proceed to Tier 3 (if applicable) or complete FV
```

---

## Tier 3: Multi-Model Review (optional, HIGH risk only)

> **Trigger**: Any task has `risk: "high"` AND Tier 2 passed.
> **Skip condition**: No HIGH risk tasks → Tier 3 skipped automatically.

This maps to the existing Code Review step in dev.md (section 2b).
When the execute pipeline runs Code Review, it is effectively Tier 3 in this verification hierarchy.

No changes needed to Code Review itself — it already runs after FV in the standard pipeline.
The key insight is that Code Review IS Tier 3: multi-model cross-review of the complete diff.
