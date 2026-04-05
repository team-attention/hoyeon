# Verify Thorough — Full Verification + Code Review + Cross-task

Comprehensive verification: standard checks + code review + cross-task compatibility + sandbox.

**Consumers**: `/execute` (TEAM mode or explicit `--verify thorough`), high-risk specs.

---

## Prerequisites

Run verify-standard first. If standard fails, fix before proceeding to thorough.
Read: `${baseDir}/references/verify-standard.md` and execute it first.

## Step 1: Standard Verification (prerequisite)

Execute verify-standard.md fully. Must pass before continuing.

```
result = dispatch_verify_standard(spec_path)
IF result.status == "FAILED":
  # Handle via verify-standard recovery pattern
  # Do NOT proceed to Step 2 until standard passes
  HALT or FIX
```

---

## Step 2: Cross-task Compatibility (Tier 2)

> Catches issues that pass standard verification but fail in integration —
> when individual tasks work in isolation but break when combined.

### Why this step exists

Per-task workers check each task's sub-requirements independently. But they cannot catch:
- Task A outputs JWT tokens, Task B expects session cookies (format mismatch)
- Task A and Task B both modified the same utility file with conflicting changes
- A requirement has no sub-requirements with status "pass" (coverage gap)

### Dispatch (parallel agents)

Launch up to 3 verification agents in parallel via `run_in_background: true`:

**Agent A — Cross-task compatibility + user journey:**
```
Agent(subagent_type="worker", description="Verify-Thorough: Cross-task compatibility",
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
Agent(subagent_type="worker", description="Verify-Thorough: Sub-requirement coverage",
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
Agent(subagent_type="worker", description="Verify-Thorough: Constraint audit",
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
  log_to_audit("VERIFY_THOROUGH_TIER2 FAILED: {agent}: {issues}")

  # Create fix tasks (same pattern as verify-standard fix loop)
  FOR EACH failure:
    derive_result = Bash("""hoyeon-cli spec derive \
      --parent {related_task_id} \
      --source verify-thorough \
      --trigger cross_verification \
      --action "Fix: {failure.description}" \
      --reason "Thorough cross-task: {failure.reason}" \
      {spec_path}""")
    dispatch_fix(derive_result, spec_path)

  # Re-run cross-task checks (max 1 retry)
  IF tier2_attempt >= 2:
    HALT with cross-task failure report
  tier2_attempt += 1
  # Re-dispatch all 3 agents

IF ALL agents report PASS:
  log_to_audit("VERIFY_THOROUGH_TIER2 PASS")
  → Proceed to Step 3
```

---

## Step 3: Code Review (Tier 3)

> Cross-cutting review of the complete diff.
> Maps to the existing Code Review step in dev.md.

### Dispatch

```
Agent(subagent_type="code-reviewer",
  description="Code review for verify-thorough",
  prompt="""
  Review the complete diff for this spec.
  Spec path: {spec_path}

  Focus on:
  - Correctness and edge cases
  - Performance implications
  - Security concerns
  - API contract consistency

  Output: "SHIP" or "NEEDS_FIXES" with list of issues
  """)
```

### Result handling

```
IF result == "SHIP":
  → Proceed to Step 4

IF result == "NEEDS_FIXES":
  # Create fix tasks from review feedback
  FOR EACH fix in result.fixes:
    derive_result = Bash("""hoyeon-cli spec derive \
      --parent {related_task_id} \
      --source verify-thorough \
      --trigger code_review \
      --action "CR fix: {fix.description}" \
      --reason "Code review: {fix.reason}" \
      {spec_path}""")
    dispatch_fix(derive_result, spec_path)

  # Re-review (max 1 round)
  IF cr_attempt >= 2:
    HALT with code review failure report
  cr_attempt += 1
  # Re-dispatch code-reviewer
```

### Auto-pass conditions

Code Review is SKIPPED (auto-pass) when ALL of the following are true:
- Total diff is <= 200 lines changed
- No new dependencies added (package.json, go.mod, Cargo.toml, etc.)
- All tasks are low risk

When auto-passed, log: `"code_review": {"status": "AUTO_PASS", "reason": "..."}`.

---

## Step 4: Sandbox Verification (if sandbox_capability exists)

> Runs real-environment verification using the `/qa` skill for systematic testing.

### Dispatch

```
IF spec.context.sandbox_capability exists:
  # Collect sandbox sub-requirements as QA test targets
  sandbox_subs = spec.requirements.flatMap(r => r.sub)
    .filter(s => s.execution_env == "sandbox")

  IF len(sandbox_subs) > 0:
    # Build QA checklist from sub-requirements
    qa_checklist = sandbox_subs.map(s =>
      "- {s.id}: {s.behavior}" +
      (s.given ? " | Given: {s.given}, When: {s.when}, Then: {s.then}" : "")
    ).join("\n")

    # Route to /qa skill based on sandbox tool type
    qa_mode = ""
    IF "browser" in sandbox_capability.tools:
      qa_mode = "--browser"
    ELIF "desktop" in sandbox_capability.tools:
      qa_mode = "--computer"

    # Invoke /qa skill with spec-derived checklist
    Skill("qa", args="{qa_mode} --tier standard")
    # The /qa skill handles: plan → test → fix → verify loop
    # Pass the checklist as context (print before invoking):
    print("QA checklist from spec sub-requirements:")
    print(qa_checklist)
    print("URL/app: {determine from spec context or task outputs}")

  Results from /qa aggregated into verify output.

IF no sandbox_capability:
  # Sandbox sub-requirements cannot be verified automatically
  FOR EACH sub_req WHERE sub_req.execution_env == "sandbox":
    Mark as SKIPPED with reason "no sandbox capability"
  Report as MANUAL REVIEW items
```

---

## Output Format

```json
{
  "status": "VERIFIED" | "FAILED",
  "standard": {
    "status": "VERIFIED",
    "goal_alignment": { "status": "PASS", "reason": "..." },
    "constraints": { "pass": 0, "fail": 0, "results": [] },
    "sub_requirement_status": { "pass": 0, "fail": 0, "pending": 0, "skipped": 0, "results": [] },
    "requirements": { "pass": 0, "fail": 0, "skipped_human": 0, "results": [] },
    "deliverables": { "pass": 0, "fail": 0, "results": [] }
  },
  "cross_task": {
    "status": "PASS" | "FAIL",
    "compatibility": { "status": "PASS", "issues": [] },
    "coverage": { "status": "PASS", "uncovered": [], "failed": [] },
    "constraints": { "status": "PASS", "violations": [] }
  },
  "code_review": {
    "status": "SHIP" | "NEEDS_FIXES" | "AUTO_PASS",
    "issues": [],
    "reason": "..."
  },
  "sandbox": {
    "status": "PASS" | "SKIPPED",
    "results": [],
    "skipped_reason": "..."
  }
}
```
