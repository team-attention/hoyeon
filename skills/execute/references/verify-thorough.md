# Verify Thorough — Standard + Runtime Journey Execution

Full verification: inherits everything from verify-standard, then runs each
journey as a runtime scenario via qa-verifier.

**Consumers**: `/execute` (TEAM mode or explicit `--verify thorough`), high-risk specs.

---

## Phase 1: Run verify-standard (prerequisite)

Execute verify-standard first. Read `${baseDir}/references/verify-standard.md`.

```
standard_result = execute_verify_standard()
IF standard_result.status == "FAILED":
  HALT or FIX (per verify-standard recovery rules).
  Do NOT proceed to runtime journey execution until standard passes.
```

Thorough mode **does not re-run** Tier 0, sub FV, or journey static coverage —
it consumes `standard_result` directly and only adds runtime journey execution.

---

## Phase 2: Runtime Journey Execution

### Graceful no-journeys (R10.4)

```
journeys = normalized_spec.verification?.journeys ?? []
IF len(journeys) == 0:
  log("no journeys to verify — skipping runtime journey block")
  runtime_block = {"status": "SKIPPED", "reason": "no journeys", "results": []}
  → proceed to Final Aggregation
```

### Dispatch

For **each** journey, dispatch one qa-verifier agent (parallel via `run_in_background: true`).
qa-verifier auto-detects the appropriate environment (browser / CLI / desktop / shell / DB)
from the GWT text.

```
agents = []
FOR journey IN journeys:
  agents.append(
    Agent(subagent_type="qa-verifier",
      description="Journey runtime: {journey.id}",
      run_in_background=true,
      prompt="""
      Execute this user journey as a RUNTIME scenario. Use whichever environment
      is appropriate (browser / CLI / desktop app / shell / database) — detect
      from the GWT text below.

      Journey {journey.id}:
        Given: {journey.given}
        When:  {journey.when}
        Then:  {journey.then}

      Composed sub-requirements (context, not individual verification targets):
      FOR s in composed_subs:
        - {s.id}: G={s.given} / W={s.when} / T={s.then}

      Environment-mode references (read ONLY the one matching the env you pick):
        - Browser:  skills/qa/references/browser-mode.md
        - CLI:      skills/qa/references/cli-mode.md
        - Desktop:  skills/qa/references/computer-mode.md

      Perform the full Given → When → Then sequence. Report:
      {
        "journey_id": "{journey.id}",
        "method": "browser" | "cli" | "desktop" | "shell" | "db",
        "status": "PASS" | "FAIL",
        "steps": [
          {"phase": "given", "detail": "...", "ok": true},
          {"phase": "when",  "detail": "...", "ok": true},
          {"phase": "then",  "detail": "...", "ok": true}
        ],
        "evidence": "screenshot path / exit code / stdout excerpt / etc.",
        "error": null
      }

      DO NOT fix any code — report only.
      """))
results = wait_all(agents)
```

### Result aggregation

```
runtime_block = {
  "status": "PASS" if all r.status == "PASS" else "FAIL",
  "total": len(results),
  "pass":  count(r.status == "PASS"),
  "fail":  count(r.status == "FAIL"),
  "methods": tally(r.method for r in results),
  "results": results
}

IF runtime_block.status == "FAIL":
  FOR each failed journey:
    Bash("""hoyeon-cli plan merge {plan_path} --stdin <<'EOF'
    { "tasks": [{ "id": "T_fix_...", "action": "Fix journey {journey.id}: {error}",
                  "status": "pending", "depends_on": [], "fulfills": [...composed_sub_ids] }] }
    EOF""")

  IF runtime_attempt >= 1: HALT with runtime failure report
  runtime_attempt += 1
  → re-run failed journeys only
```

---

## Final Aggregation

```
status = "FAILED" if (standard_result.status == "FAILED"
                       OR runtime_block.status == "FAIL")
         else "VERIFIED_WITH_GAPS" if standard_result.status == "VERIFIED_WITH_GAPS"
         else "VERIFIED"
```

## Output Format (combined)

```json
{
  "status": "VERIFIED" | "VERIFIED_WITH_GAPS" | "FAILED",
  "tier0":   { "...": "from standard_result.tier0" },
  "sub_fv":  { "...": "from standard_result.sub_fv" },
  "journeys_static": { "...": "from standard_result.journeys" },
  "journeys_runtime": {
    "status": "PASS" | "FAIL" | "SKIPPED",
    "total": 3, "pass": 2, "fail": 1,
    "methods": { "browser": 2, "cli": 1 },
    "results": [
      { "journey_id": "J1", "method": "browser", "status": "PASS",
        "steps": [...], "evidence": "..." },
      { "journey_id": "J2", "method": "cli",     "status": "FAIL",
        "error": "CLI exited non-zero", "evidence": "..." }
    ]
  },
  "failures": [
    { "description": "Journey J2 runtime", "reason": "CLI exited non-zero",
      "journey_id": "J2" }
  ]
}
```

---

## Progressive Gate Summary

```
Standard FAIL  → HALT (fix via verify-standard recovery, then re-run thorough)
Standard PASS  → proceed to Phase 2
No journeys    → SKIPPED (do NOT fail; sub FV already ran in standard)
Runtime FAIL   → derive fix tasks in plan.json, re-run failed journeys (max 1 retry)
Runtime PASS   → VERIFIED (or VERIFIED_WITH_GAPS if standard had UNCERTAINs)
```

## Recovery Constraints

| Constraint | Rule |
|------------|------|
| Standard FAIL | Defer to verify-standard recovery; do NOT run runtime phase |
| Runtime FAIL | Derive fix tasks via `hoyeon-cli plan merge`, max 1 retry |
| No journeys | Skip runtime block with log; do NOT fail |
| qa-verifier chooses wrong env | Report only — user may re-run with hint |
