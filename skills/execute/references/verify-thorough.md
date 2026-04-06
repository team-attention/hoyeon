# Verify Thorough — Tier 0 + Tier 1 + Tier 2 + Tier 3: Full Progressive Verification

Comprehensive verification: mechanical gate → semantic analysis → integration review → runtime QA.
Each tier gates the next — fail early, save cost.

**Consumers**: `/execute` (TEAM mode or explicit `--verify thorough`), high-risk specs.

---

## Tier 0 + Tier 1: Mechanical + Semantic (prerequisite)

Execute verify-standard first. Read `${baseDir}/references/verify-standard.md`.

```
standard_result = execute_verify_standard(spec_path)
IF standard_result.status == "FAILED":
  # Handle via verify-standard recovery pattern
  # Do NOT proceed to Tier 2 until Tier 0+1 passes
  HALT or FIX (per verify-standard rules)

# Collect UNCERTAIN items from Tier 1 — these go to Tier 3
uncertain_items = standard_result.tier1.sub_requirements
  .filter(s => s.status == "UNCERTAIN")
```

---

## Tier 2: Integration Verification

> Catches issues that individual verification misses: cross-task conflicts,
> code quality problems, and regression risks.

### Dispatch (parallel agents)

Launch up to 3 verification agents in parallel via `run_in_background: true`:

**Agent A — Cross-task compatibility + user journey:**
```
Agent(subagent_type="worker", description="Tier 2: Cross-task compatibility",
  prompt="""
  Read spec at {spec_path}. For each pair of tasks where one task's outputs
  are consumed by another task's inputs (check depends_on relationships):
  1. Verify data format and contract compatibility across the boundary
  2. Check tasks with overlapping file changes for coherent modifications
  3. Trace the main user journey end-to-end across all vertical slice tasks
  4. Report any incompatibilities or broken handoffs found

  Output: {"status": "PASS"|"FAIL", "issues": [...]}
  """,
  run_in_background=true)
```

**Agent B — Sub-requirement coverage audit:**
```
Agent(subagent_type="worker", description="Tier 2: Sub-requirement coverage",
  prompt="""
  Read spec at {spec_path}. Check ALL requirements[].sub[]:
  1. Every sub-requirement should have a corresponding implementation
  2. Flag any requirement where no sub-requirement was verified as PASS in Tier 1
  3. Check for orphaned code (implementation not traced to any sub-requirement)

  Output: {"status": "PASS"|"FAIL", "uncovered": [...], "orphaned": [...]}
  """,
  run_in_background=true)
```

**Code review**: Already executed in verify-standard (Tier 0+1+CR). The result is available
in `standard_result.code_review`. Do NOT re-run code review here — use the existing result.

### Result aggregation

```
Wait for all agents to complete.

IF ANY agent reports FAIL:
  FOR EACH failure:
    derive_result = Bash("""hoyeon-cli spec derive \
      --parent {related_task_id} \
      --source verify-thorough \
      --trigger integration_verification \
      --action "Fix: {failure.description}" \
      --reason "Tier 2: {failure.reason}" \
      {spec_path}""")
    dispatch_fix(derive_result, spec_path)

  # Re-run Tier 2 (max 2 retries total)
  tier2_attempt = tier2_attempt ?? 0
  IF tier2_attempt >= 2:
    HALT with integration failure report
  tier2_attempt += 1

IF ALL agents report PASS:
  → Proceed to Tier 3
```

---

## Tier 3: Runtime Verification

> Executes sub-requirements' Given/When/Then clauses using real tools.
> Also resolves UNCERTAIN items from Tier 1 that couldn't be determined from code alone.

### Dispatch

```
# Collect QA candidates: GWT sub-reqs + Tier 1 UNCERTAIN items
gwt_subs = spec.requirements.flatMap(r => r.sub)
  .filter(s => s.given AND s.when AND s.then)

# UNCERTAIN items from Tier 1 are added even if they lack full GWT
# (qa-verifier will attempt shell/code-based verification)
# Dedup: combine both lists, remove items whose id already appeared earlier
seen_ids = set()
qa_candidates = []
FOR EACH item IN (gwt_subs + uncertain_items):
  IF item.id NOT IN seen_ids:
    seen_ids.add(item.id)
    qa_candidates.append(item)

IF len(qa_candidates) == 0:
  print("No runtime verification candidates — Tier 3 skipped")
  → tier3.status = "SKIPPED"
ELSE:
  # Pre-classify by method (keyword signals in GWT)
  #   browser: URL, localhost, http, "page", "button", "form", "click"
  #   cli:     "run command", "CLI", "REPL", "interactive", "terminal"
  #   desktop: app name, "window", "tray", "native", "Electron", "menu bar"
  #   shell:   everything else (API, curl, file, exit code, docker, database)

  groups = classify_by_method(qa_candidates)

  # Dispatch qa-verifier per method group (parallel)
  agents = []
  FOR EACH method, subs IN groups:
    checklist = subs.map(s =>
      "- {s.id}: {s.behavior} | Given: {s.given}, When: {s.when}, Then: {s.then}"
    ).join("\n")

    agents.append(
      Agent(subagent_type="qa-verifier",
        description="Tier 3: QA verify {method} ({len(subs)} sub-reqs)",
        run_in_background=true,
        prompt="""
        Verify the following sub-requirements using **{method}** tools.
        The method has been pre-classified by the orchestrator — use {method}
        for all items below. Do NOT re-classify to a different method.

        Spec path: {spec_path}

        Sub-requirements to verify:
        {checklist}

        Reference file for {method}:
        - Browser: skills/qa/references/browser-mode.md
        - CLI: skills/qa/references/cli-mode.md
        - Desktop: skills/qa/references/computer-mode.md
        (Read only the one matching your assigned method.)

        Report PASS/FAIL/SKIP per sub-requirement with evidence.
        Do NOT fix any code — report only.
        """))

  # Wait and merge results
  results = wait_all(agents)
  merged = merge_qa_results(results)

  IF merged.fail > 0:
    FOR EACH failed_item in merged.failed_items:
      derive_result = Bash("""hoyeon-cli spec derive \
        --parent {related_task_id} \
        --source verify-thorough \
        --trigger runtime_verification \
        --action "Fix: {failed_item.sub_req_id} — {failed_item.actual}" \
        --reason "Tier 3 runtime: {failed_item.behavior} failed" \
        {spec_path}""")
      dispatch_fix(derive_result, spec_path)

    # Re-run failed groups only (max 2 retries total)
    tier3_attempt = tier3_attempt ?? 0
    IF tier3_attempt >= 2:
      HALT with runtime verification failure report
    tier3_attempt += 1

  IF merged.fail == 0:
    log_to_audit("VERIFY_THOROUGH_TIER3 PASS")
```

---

## Output Format (combined all tiers)

```json
{
  "status": "VERIFIED" | "FAILED",
  "tier0": {
    "status": "VERIFIED",
    "checks": [
      {"name": "build", "status": "PASS", "detail": "..."},
      {"name": "test", "status": "PASS", "detail": "5 passed"}
    ]
  },
  "tier1": {
    "status": "VERIFIED",
    "goal_alignment": { "status": "PASS", "reason": "..." },
    "constraints": { "pass": 2, "fail": 0, "results": [] },
    "sub_requirements": [
      { "id": "R1.1", "status": "PASS", "reason": "...", "test_coverage": true },
      { "id": "R2.1", "status": "UNCERTAIN", "reason": "no test, runtime-dependent" }
    ],
    "counts": { "pass": 8, "fail": 0, "uncertain": 2 }
  },
  "tier2": {
    "status": "PASS",
    "cross_task": { "status": "PASS", "issues": [] },
    "coverage": { "status": "PASS", "uncovered": [] },
    "code_review": "from standard_result.code_review (not re-run)"
  },
  "tier3": {
    "status": "PASS" | "FAIL" | "SKIPPED",
    "tested": 10,
    "pass": 9,
    "fail": 0,
    "skip": 1,
    "methods": { "browser": 4, "cli": 4, "shell": 2 },
    "resolved_uncertain": [
      { "id": "R2.1", "was": "UNCERTAIN", "now": "PASS", "method": "cli", "evidence": "..." }
    ],
    "results": [
      { "sub_req_id": "R1.1", "method": "browser", "status": "PASS", "evidence": "..." }
    ]
  }
}
```

---

## Progressive Gate Summary

```
Tier 0 FAIL → HALT (don't waste $$ on broken build)
Tier 1 FAIL → fix + retry max 2, then HALT
Tier 1 UNCERTAIN → collect, pass to Tier 3
Tier 2 FAIL → fix + retry max 1, then HALT
Tier 3 FAIL → fix + retry max 1, then HALT
Tier 3 resolves Tier 1 UNCERTAIN → final status
```
