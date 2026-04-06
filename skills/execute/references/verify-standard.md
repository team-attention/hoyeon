# Verify Standard — Tier 0 + Tier 1 + Code Review: Mechanical + Semantic + Quality

Spec-based verification: mechanical gate first, semantic analysis per sub-requirement, then conditional code review.

**Consumers**: `/execute` (AGENT/TEAM mode default), `/check`, `/ralph`.

---

## Tier 0: Mechanical Gate (prerequisite)

Execute the same checks as verify-light. Read `${baseDir}/references/verify-light.md`.

```
tier0_result = execute_verify_light(spec_path)
IF tier0_result.status == "FAILED":
  # Mechanical gate failed — do NOT proceed to Tier 1
  # Return tier0 result with added context
  HALT
```

**No tests found** is a PASS with warning — it does not block Tier 1.

---

## Tier 1: Semantic Verification

Dispatch a single verification agent. Read-only — no file modifications.

### Dispatch

```
Agent(subagent_type="worker",
  description="Tier 1: Semantic verification",
  prompt="""
  You are a VERIFICATION worker. Read the spec and source code to verify
  each sub-requirement. DO NOT modify any files. Only READ and RUN commands.

  Spec path: {spec_path}

  ## Step 1: Goal Alignment

  - Goal: {spec.meta.goal}
  - Non-goals: {spec.meta.non_goals ?? "None"}
  - Check: Does the implementation achieve the goal?
  - Check: Does it avoid non-goals?
  Report: PASS or FAIL with reason.

  ## Step 2: Constraints

  {FOR EACH constraint in spec.constraints ?? []:}
  - [{constraint.id}] {constraint.rule}
    Verify the implementation respects this constraint.
  {IF no constraints: "None defined — skip."}

  ## Step 3: Per Sub-requirement Verification

  For EACH sub-requirement in spec.requirements[].sub[], evaluate independently:

  1. Read source code related to this sub-requirement
  2. Check if an existing test covers this sub-requirement
  3. If the sub-req has given/when/then, trace the logic through the code
  4. Assign ONE of three statuses:

     PASS — code clearly implements this, or a passing test covers it
     FAIL — code contradicts this, or a failing test disproves it
     UNCERTAIN — cannot determine from code alone. Use ONLY when:
       - No test exists for this sub-req AND logic has conditional branches
       - Sub-req involves UI rendering that code reading can't confirm
       - Sub-req depends on runtime state (DB content, env vars, external API)
       - Related code file not found

  For each sub-req, output:
  {
    "id": "{sub_req.id}",
    "status": "PASS" | "FAIL" | "UNCERTAIN",
    "reason": "specific evidence from code",
    "test_coverage": true | false,
    "files_checked": ["path1", "path2"]
  }

  ## OUTPUT FORMAT
  ```json
  {
    "status": "VERIFIED" | "FAILED",
    "goal_alignment": {
      "status": "PASS" | "FAIL",
      "reason": "..."
    },
    "constraints": {
      "pass": 0, "fail": 0,
      "results": [{"id": "C1", "status": "PASS", "reason": "..."}]
    },
    "sub_requirements": [
      {"id": "R1.1", "status": "PASS", "reason": "...", "test_coverage": true, "files_checked": [...]},
      {"id": "R1.2", "status": "FAIL", "reason": "...", "test_coverage": false, "files_checked": [...]},
      {"id": "R2.1", "status": "UNCERTAIN", "reason": "...", "test_coverage": false, "files_checked": [...]}
    ],
    "counts": {
      "pass": 0, "fail": 0, "uncertain": 0
    }
  }
  ```
  """)
```

### Result Handling

```
# VERIFIED when: no FAIL, goal aligned, constraints passed
# UNCERTAIN items in standard mode → marked as MANUAL REVIEW (no Tier 3)

tier1_attempt = 0

IF result.goal_alignment.status == "FAIL":
  print("GOAL MISALIGNMENT — cannot auto-fix. HALT.")
  HALT  # Unrecoverable

IF result.counts.fail > 0:
  # Build failures array (contract for dev.md/team.md callers)
  failures = []
  IF result.goal_alignment.status == "FAIL":
    failures.append({"description": "Goal misalignment", "reason": result.goal_alignment.reason})
  FOR EACH c in result.constraints.results.filter(r => r.status == "FAIL"):
    failures.append({"description": "Constraint {c.id}", "reason": c.reason, "task_id": null})
  FOR EACH s in result.sub_requirements.filter(s => s.status == "FAIL"):
    failures.append({"description": "Sub-req {s.id}", "reason": s.reason, "task_id": null})

  # Create fix tasks for FAIL items
  FOR EACH failed in failures:
    derive_result = Bash("""hoyeon-cli spec derive \
      --parent {related_task_id} \
      --source verify-standard \
      --trigger semantic_verification \
      --action "Fix: {failed.description} — {failed.reason}" \
      --reason "Tier 1 semantic: {failed.reason}" \
      {spec_path}""")
    dispatch_fix(derive_result, spec_path)

  # Re-run Tier 1 (max 2 retries)
  IF tier1_attempt >= 2:
    HALT with failure report
  tier1_attempt += 1

IF result.counts.fail == 0:
  total = result.counts.pass + result.counts.uncertain
  uncertain_ratio = result.counts.uncertain / total IF total > 0 ELSE 0

  # UNCERTAIN items → report as MANUAL REVIEW
  FOR EACH uncertain in result.sub_requirements.filter(s => s.status == "UNCERTAIN"):
    log("MANUAL REVIEW: {uncertain.id} — {uncertain.reason}")

  IF uncertain_ratio > 0.3:
    status = "VERIFIED_WITH_GAPS"
    print("⚠ {result.counts.uncertain}/{total} sub-reqs could not be verified from code alone.")
    print("  Consider --verify thorough for runtime verification.")
  ELSE:
    status = "VERIFIED"
```

---

## Code Review (conditional)

> Catches integration issues, hidden bugs, and design inconsistencies that
> per-sub-requirement verification misses.

Runs **after** Tier 1 passes (no FAIL items). Parallel with nothing — sequential gate.

### Auto-pass conditions

```
# Skip code review when ALL true:
#   - Total diff ≤ 200 lines
#   - No new dependencies added (package.json, Cargo.toml, etc. unchanged)
#   - All tasks are low risk
IF auto_pass_conditions_met:
  cr_result = {"status": "AUTO_PASS", "reason": "small diff, no new deps, low risk"}
ELSE:
  Agent(subagent_type="code-reviewer",
    description="Code review",
    prompt="""
    Review the complete diff for this spec.
    Spec path: {spec_path}
    Focus on: correctness, edge cases, security, API consistency.
    Output: "SHIP" or "NEEDS_FIXES" with list of issues
    """)
```

### Result handling

```
IF cr_result.status == "AUTO_PASS" OR cr_result.verdict == "SHIP":
  # Code review passed — proceed to final status
  pass

IF cr_result.verdict == "NEEDS_FIXES":
  FOR EACH fix_item in cr_result.fix_items:
    derive_result = Bash("""hoyeon-cli spec derive \
      --parent {related_task_id} \
      --source verify-standard \
      --trigger code_review \
      --action "Fix: {fix_item.id} — {fix_item.description}" \
      --reason "Code review: {fix_item.impact}" \
      {spec_path}""")
    dispatch_fix(derive_result, spec_path)

  # Re-run code review after fixes (max 1 retry)
  IF cr_attempt >= 1:
    HALT with code review failure report
  cr_attempt += 1
```

---

## Return Contract

This recipe returns the **combined Tier 0 + Tier 1 + Code Review** format below (not the inner agent JSON).
Callers (verify-thorough, dev.md, team.md) access `result.tier1.sub_requirements`, `result.code_review`, and `result.failures`.

**Caller handling for `status`:**
- `VERIFIED` → task done, proceed
- `VERIFIED_WITH_GAPS` → task done, log gap count, proceed (soft success)
- `FAILED` → enter fix loop using `result.failures[]`

## Output Format

```json
{
  "status": "VERIFIED" | "VERIFIED_WITH_GAPS" | "FAILED",
  "failures": [
    { "description": "Sub-req R1.2", "reason": "missing file handler", "task_id": null }
  ],
  "tier0": {
    "status": "VERIFIED",
    "checks": [...]
  },
  "tier1": {
    "status": "VERIFIED" | "FAILED",
    "goal_alignment": { "status": "PASS", "reason": "..." },
    "constraints": { "pass": 0, "fail": 0, "results": [] },
    "sub_requirements": [
      { "id": "R1.1", "status": "PASS", "reason": "...", "test_coverage": true, "files_checked": [] },
      { "id": "R2.1", "status": "UNCERTAIN", "reason": "no test, UI rendering", "test_coverage": false, "files_checked": [] }
    ],
    "counts": { "pass": 0, "fail": 0, "uncertain": 0 }
  },
  "code_review": {
    "status": "SHIP" | "NEEDS_FIXES" | "AUTO_PASS",
    "issues": []
  },
  "manual_review": ["R2.1"]
}
```

---

## Recovery Constraints

| Constraint | Rule |
|------------|------|
| Tier 0 FAIL | Immediate HALT — fix build/lint before semantic verification |
| goal_alignment FAIL | Immediate HALT — no recovery attempt |
| sub-req FAIL | Create derived fix tasks via `spec derive`, max 2 retries |
| sub-req UNCERTAIN | Standard mode → MANUAL REVIEW. Thorough mode → deferred to Tier 3 |
| Code review NEEDS_FIXES | Create derived fix tasks via `spec derive`, max 1 retry |
| Code review AUTO_PASS | Small diff + no deps + low risk → skip (no agent spawned) |
| No tests warning | Does not block — Tier 1 agent evaluates code directly |
