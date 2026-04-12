# Verify Standard — Tier 0 + Sub FV + Journey Static Coverage

Spec-based verification. Mechanical gate first, then two semantic parts:
**(a)** static per-sub-requirement FV, **(b)** static journey coverage.

**Consumers**: `/execute` (AGENT/TEAM mode default), `/check`, `/ralph`.

**Inputs**
- `normalized_spec` — Phase 0 cache (requirements[].sub[] with GWT, verification.journeys[])
- `plan_path` — `<spec-dir>/plan.json` (source of truth for task status / fulfills)

---

## Tier 0: Mechanical Gate (prerequisite)

Execute the same checks as verify-light. Read `${baseDir}/references/verify-light.md`.

```
tier0_result = execute_verify_light()
IF tier0_result.status == "FAILED":
  HALT  # Mechanical gate failed — do NOT proceed to semantic checks.
```

**No tests found** is a PASS with warning — it does not block part (a) or (b).

---

## Part (a): Sub-requirement FV (static)

Load done tasks and their fulfills[]:

```
done_tasks = Bash("hoyeon-cli plan list {plan_path} --status done --json").tasks
fulfilled_sub_ids = flatten(t.fulfills for t in done_tasks)   # dedup
```

Dispatch a single verification worker (read-only):

```
Agent(subagent_type="worker",
  description="Sub-req FV (static)",
  prompt="""
  You are a VERIFICATION worker. DO NOT modify files. Read-only.

  Normalized spec (inlined by orchestrator):
  {normalized_spec.requirements with sub[].id/behavior/given/when/then}

  Done-task fulfills mapping:
  {done_tasks with id + fulfills[]}

  ## Goal Alignment
  - Goal: {normalized_spec.meta.goal}
  - Non-goals: {normalized_spec.meta.non_goals}
  Report PASS/FAIL with reason.

  ## Constraints
  FOR each constraint in normalized_spec.constraints:
    Verify implementation respects [{c.id}] {c.rule}.

  ## Per Sub-requirement FV
  FOR each sub in normalized_spec.requirements[].sub[]:
    1. Find the owning task via fulfilled_sub_ids / done_tasks[].fulfills
    2. Read related source + tests
    3. Trace given/when/then through the code
    4. Assign ONE status:
       - PASS: code or a passing test clearly implements this GWT
       - FAIL: code contradicts GWT, or a test disproves it, or sub is not
               in any done task's fulfills[]
       - UNCERTAIN: runtime/UI/external state prevents static judgment

  Emit:
  { "id": "R1.1", "status": "PASS|FAIL|UNCERTAIN",
    "reason": "...", "test_coverage": bool, "files_checked": [...] }

  ## OUTPUT
  ```json
  { "status": "VERIFIED"|"FAILED",
    "goal_alignment": {"status": "PASS|FAIL", "reason": "..."},
    "constraints":   {"pass": N, "fail": N, "results": [...]},
    "sub_requirements": [...],
    "counts": {"pass": N, "fail": N, "uncertain": N} }
  ```
  """)
```

### Recovery

```
IF result.goal_alignment.status == "FAIL":   HALT (unrecoverable)

IF result.counts.fail > 0:
  # Derive fix tasks in plan.json (NOT spec)
  FOR each failed_sub:
    Bash("hoyeon-cli plan merge {plan_path} --stdin ...")  # append fix task
  IF sub_fv_attempt >= 2: HALT with failures
  sub_fv_attempt += 1; re-run Part (a)

IF result.counts.fail == 0:
  uncertain_ratio = uncertain / (pass + uncertain)
  IF uncertain_ratio > 0.3: part_a_status = "VERIFIED_WITH_GAPS"
  ELSE:                     part_a_status = "VERIFIED"
```

---

## Part (b): Journey Static Coverage

Read `normalized_spec.verification.journeys` from Phase 0 cache.

### Graceful no-journeys (R10.4)

```
journeys = normalized_spec.verification?.journeys ?? []
IF len(journeys) == 0:
  log("no journeys to verify — skipping journey block")
  journey_block = {"status": "SKIPPED", "reason": "no journeys", "results": []}
  → proceed to final aggregation with part_a only
```

### B1. ID coverage (mechanical)

```
FOR each journey in journeys:
  missing = [sid for sid in journey.composes if sid NOT IN fulfilled_sub_ids]
  IF missing:
    journey.id_coverage = {"status": "FAIL", "missing_sub_ids": missing}
  ELSE:
    journey.id_coverage = {"status": "PASS"}
```

### B2. Semantic coverage (code-reviewer agent)

For each journey that passed B1, dispatch one code-reviewer to judge whether
the composed subs' GWTs collectively cover the journey's GWT scenario.

```
FOR each journey where id_coverage.status == "PASS":
  composed_subs = [lookup_sub(sid) for sid in journey.composes]
  Agent(subagent_type="code-reviewer",
    description="Journey semantic coverage: {journey.id}",
    prompt="""
    Judge whether the following sub-requirement GWTs collectively cover the
    journey scenario below, SEMANTICALLY (not just by ID).

    Journey {journey.id}:
      Given: {journey.given}
      When:  {journey.when}
      Then:  {journey.then}

    Composed sub-requirements:
    FOR s in composed_subs:
      - {s.id}: G={s.given} / W={s.when} / T={s.then}

    Questions:
    1. Does the union of sub GWTs reach every state in the journey's Given?
    2. Does every action in the journey's When appear in some sub's When?
    3. Does every observable in the journey's Then appear in some sub's Then?

    Output JSON:
    { "verdict": "PASS" | "FAIL",
      "gaps": ["..."],   // non-empty only when FAIL
      "evidence": "..." }
    """)
```

### Journey aggregation

```
FOR each journey:
  IF id_coverage.FAIL OR semantic.verdict == "FAIL":
    journey.status = "FAIL"
  ELSE:
    journey.status = "PASS"

journey_block.status = "PASS" if every journey PASS else "FAIL"

IF journey_block.status == "FAIL":
  FOR each failed journey:
    Bash("hoyeon-cli plan merge {plan_path} --stdin ...")  # derive fix task
  IF journey_attempt >= 1: HALT with journey failures
  journey_attempt += 1; re-run Part (b)
```

---

## Final Aggregation

```
status =
  "FAILED"               if part_a == "FAILED" or journey_block.status == "FAIL"
  "VERIFIED_WITH_GAPS"   if part_a == "VERIFIED_WITH_GAPS"
  "VERIFIED"             otherwise
```

## Output Format

```json
{
  "status": "VERIFIED" | "VERIFIED_WITH_GAPS" | "FAILED",
  "tier0": { "status": "VERIFIED", "checks": [...] },
  "sub_fv": {
    "status": "VERIFIED" | "VERIFIED_WITH_GAPS" | "FAILED",
    "goal_alignment": { "status": "PASS", "reason": "..." },
    "constraints":    { "pass": 0, "fail": 0, "results": [] },
    "sub_requirements": [
      {"id": "R1.1", "status": "PASS", "reason": "...", "test_coverage": true}
    ],
    "counts": { "pass": 0, "fail": 0, "uncertain": 0 }
  },
  "journeys": {
    "status": "PASS" | "FAIL" | "SKIPPED",
    "results": [
      { "id": "J1",
        "id_coverage": { "status": "PASS", "missing_sub_ids": [] },
        "semantic":    { "verdict": "PASS", "gaps": [], "evidence": "..." },
        "status": "PASS" }
    ]
  },
  "failures": [
    { "description": "Sub-req R1.2", "reason": "missing handler", "task_id": null },
    { "description": "Journey J1 semantic", "reason": "Then step not covered" }
  ]
}
```

## Recovery Constraints

| Constraint | Rule |
|------------|------|
| Tier 0 FAIL | Immediate HALT |
| goal_alignment FAIL | Immediate HALT |
| sub FAIL | Derive fix tasks in plan.json; max 2 retries |
| sub UNCERTAIN | Report as MANUAL REVIEW (resolved only in verify-thorough) |
| Journey id_coverage FAIL | Derive fix tasks; max 1 retry |
| Journey semantic FAIL | Derive fix tasks; max 1 retry |
| No journeys | Skip journey block with log; do NOT fail |
