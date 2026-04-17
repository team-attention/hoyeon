# Unified Verify Recipe (execute2)

Single recipe. Depth (`light | standard | thorough`) is a **parameter** that caps
per-sub_req gates — it does NOT select a different recipe. The same three-phase
pipeline runs every time; depth determines which gates are *effective*.

**Consumers**: `execute2` `direct.md`, `agent.md`, `team.md` (Phase 3 finalize).

**Inputs** (from Phase 0 state):
- `verify` — user-selected depth: `"light" | "standard" | "thorough"`
- `plan` — parsed `plan.json` (tasks, verify_plan, journeys)
- `spec_dir` — absolute path to the spec directory
- `plan_path` — `{spec_dir}/plan.json`
- `contracts_path` — `{spec_dir}/contracts.md` or `null`
- `CONTEXT_DIR` — `{spec_dir}` (audit.md / learnings.json / issues.json live here)

**Invariants (enforced throughout)**:
- **INV-4**: no `sleep`, no polling loops. Every parallel burst is a **single message**
  with all `Bash(run_in_background:true)` and/or agent dispatches at once.
- **INV-5**: `plan.json` is mutated only via `hoyeon-cli2 plan task --status`. Verify
  results live inline in the session; task-status transitions go through cli2.
- **INV-2/INV-3**: charter-to-verify agents carry **paths and IDs only** (no inlined
  spec prose). Agents self-read.
- **C4**: on contracts mismatch detection during verify, route the worker output
  through T9's `contracts-patch` recipe (orchestrator inline-edits `contracts.md`,
  logs to `audit.md`, no user confirm).

---

## Depth → Effective Gate Cap

Blueprint's `verify_plan[i].gates` lists which gates apply per sub_req/journey.
Depth caps those gates downward only (never escalates).

| Gate | Meaning                                   | Runs when depth is            |
|------|-------------------------------------------|-------------------------------|
| 1    | Machine toolchain (build/lint/typecheck/unit) | light, standard, thorough  |
| 2    | Static semantic review (code-reviewer + spec-coverage) | standard, thorough |
| 3    | Runtime journey (qa-verifier)             | thorough                      |
| 4    | Human judgement — never auto-run          | never auto-runs — always escalated to `manual_review[]` |

```
function effective_gates(plan_gates, depth):
  IF depth == "light":     cap = 1       # R-F12.1
  ELIF depth == "standard": cap = 2      # R-F12.2
  ELIF depth == "thorough": cap = Infinity   # R-F12.3 (no cap)

  kept = [g for g in plan_gates if g <= cap AND g != 4]
  escalated_manual = [g for g in plan_gates if g == 4]   # R-F12.4
  return (kept, escalated_manual)
```

Gate=4 is **always** stripped from the auto-verify loop and appended to
`manual_review[]` for the stdout report — regardless of depth. (R-F12.4)

If `plan.verify_plan` is empty (requirements-only input), default every sub_req
to gates `[1, 2]`.

---

## Phase 2.0 — Coverage Pre-check

Runs **before** any gate. Gate execution is skipped entirely if the matrix
has unrecoverable persistent gaps, but verify still renders the matrix.

### Step 1: Build the coverage matrix (R-F10.1)

```
# Read done tasks from plan.json
done_tasks = Bash("hoyeon-cli2 plan list {spec_dir} --status done --json").tasks

# Pull every sub_req ID that appears in verify_plan
all_sub_ids = unique([vp.target for vp in plan.verify_plan if vp.type == "sub_req"])

# Seed the matrix
coverage = { sid: { fulfilling_tasks: [], status: "gap" } for sid in all_sub_ids }

# Populate from done-task fulfills[]
FOR t in done_tasks:
  FOR sid in (t.fulfills or []):
    IF sid in coverage:
      coverage[sid].fulfilling_tasks.append(t.id)
      coverage[sid].status = "covered"

# Empty rows stay as gap
gaps = [sid for sid, row in coverage.items() if row.status == "gap"]
```

The matrix shape matches `CoverageMatrixAPI` in `contracts.md`:
`{ [sub_req_id]: { fulfilling_tasks: string[], status: "covered" | "gap" | "partial" } }`

### Step 2: Validate fulfills attribution (R-F10.2)

For each `(sid, task_id)` in the matrix, confirm the worker output for `task_id`
actually contains a `fulfills` entry for `sid` with a `file_path` + `line`
citation (per `WorkerOutput` in contracts). Worker outputs are cached in the
session's round-summaries (`CONTEXT_DIR/round-summaries.json`) or re-read via
`hoyeon-cli2 plan get`'s attached summaries.

```
FOR sid, row in coverage.items():
  validated = []
  FOR tid in row.fulfilling_tasks:
    worker_out = round_summaries[tid].fulfills or []
    cite = worker_out.find(c => c.sub_req_id == sid)
    IF cite AND cite.file_path AND cite.line:
      validated.append(tid)
  # If any task claimed to fulfill but provided no citation, that claim is a GAP
  IF len(validated) == 0:
    row.status = "gap"
    row.fulfilling_tasks = []
  ELIF len(validated) < len(row.fulfilling_tasks):
    row.status = "partial"
    row.fulfilling_tasks = validated
```

### Step 3: Gap re-dispatch (max 1 round, R-F10.3)

Persistent session counter `gap_retry_rounds` (default 0). Only one re-dispatch
is permitted; the second detection becomes PERSISTENT_GAP.

```
IF gaps AND gap_retry_rounds < 1:
  # Group gaps by owning task (each sub_req → tasks that *should* fulfill it)
  by_task = {}
  FOR sid in gaps:
    owners = [t for t in plan.tasks if sid in (t.fulfills or [])]
    IF len(owners) == 0:
      # nothing to re-dispatch; mark persistent immediately
      continue
    FOR t in owners:
      by_task.setdefault(t.id, []).append(sid)

  # Check dispatch ceiling (INV-6) before re-dispatching
  dispatched_any = False
  FOR tid, sids in by_task.items():
    IF dispatch_count[tid] >= 5:
      audit.append("DISPATCH_CEILING_EXCEEDED", tid)
      continue

    # Build a gap-injection charter — paths/IDs only (INV-2)
    charter = {
      task_id: tid,
      plan_path: plan_path,
      contracts_path: contracts_path,
      sub_req_ids: sids,
      round: current_round + 1,
      prior_failure_context: "GAP: task {tid} did not cite fulfills for " +
                              ", ".join(sids) + ". Must address each sub_req with file:line citation."
    }
    Bash("hoyeon-cli2 plan task --status {tid}=running")   # reset to running
    dispatch_worker(charter)   # via current dispatch mode's worker dispatch
    dispatch_count[tid] += 1
    dispatched_any = True

  # Only charge a retry round if we actually dispatched something. If every
  # owner was blocked by INV-6, log a distinct audit entry and mark the gaps
  # as persistent immediately (the retry budget is not consumed).
  IF dispatched_any:
    gap_retry_rounds += 1
    # After all re-dispatched workers return: rebuild coverage (goto Step 1)
    → goto Step 1
  ELSE:
    FOR sid in gaps:
      Edit(CONTEXT_DIR/audit.md, append="""
      [{timestamp}] PERSISTENT_GAP_CEILING_BLOCKED sub_req={sid}
        reason: every owning task hit INV-6 dispatch ceiling — no gap re-dispatch occurred
      """)
    # Fall through to Step 4 without incrementing gap_retry_rounds AND
    # without re-looping — ceiling-blocked gaps are terminal for this round.
```

### Step 4: Persistent gap → PARTIAL (R-F10.4)

If gaps remain after the allowed re-dispatch round, **do not abort**. Log to
`audit.md`, mark the run as `PARTIAL`, and let verify continue.

```
IF gaps AND gap_retry_rounds >= 1:
  FOR sid in gaps:
    Edit(CONTEXT_DIR/audit.md, append="""
    [{timestamp}] PERSISTENT_GAP sub_req={sid}
      expected fulfilling tasks: {tasks that listed sid in fulfills[]}
      reason: no valid file:line citation after gap re-dispatch round
    """)
  run_status = "PARTIAL"
  uncovered_sub_reqs = gaps
  # Continue to gate execution — PARTIAL is reported, not aborted
```

---

## Phase 2.1 — Gate=1 (Toolchain, Parallel Background)

**Applies when**: at least one sub_req has `effective_gate >= 1`. For `light` depth
this is the ONLY gate that runs (other than the MANUAL escalation).

### R-F11.1 — Parallel fail-fast toolchain

Detect toolchain (same rules as `.claude/skills/execute/references/verify-light.md`
Step 1). Then **spawn every command in a single message** with
`run_in_background: true`. Do not await intermediate results with `sleep`; rely
on the notification the harness emits when each background task completes.

```
# SINGLE MESSAGE — emit all Bash calls concurrently
Bash(cmd=build_command,     run_in_background=true, description="gate1 build")
Bash(cmd=lint_command,      run_in_background=true, description="gate1 lint")
Bash(cmd=typecheck_command, run_in_background=true, description="gate1 typecheck")
Bash(cmd=unit_test_command, run_in_background=true, description="gate1 unit")
```

**CWD rule**: wrap subdirectory commands in a subshell: `Bash("(cd subdir && cmd)")`.
Never bare `cd subdir && cmd` — the harness resets CWD between Bash calls.

### Aggregation + fail-fast

```
tier0_checks = collect_background_results([build, lint, typecheck, unit])

IF any check.status == "FAIL":
  gate1_status = "FAIL"
  # Do NOT dispatch gate=2/gate=3 — fail-fast before higher gates.
  # Accumulate failures (best-effort task attribution from diff / test output)
  # and redirect to Phase 2.3 (Fix Loop). Phase 2.3 is the SOLE writer of
  # run_status = "FAILED" (see Phase 2.5 invariant) — do NOT inline-set it here.
  FOR check IN checks WHERE check.status == "FAIL":
    failures.append({
      task: attributed_task_from_diff_or_output(check),
      gate: 1,
      reason: check.stderr or check.stdout
    })
  → goto Phase 2.3 (Fix Loop)
ELIF "no tests" in unit.stdout:
  unit.status = "PASS"   # warning only — no blocking
  gate1_status = "PASS"
ELSE:
  gate1_status = "PASS"
```

---

## Phase 2.2 — Gate=2 + Gate=3 (Simultaneous Spawn)

**Applies when** gate=1 passed AND at least one sub_req has
`effective_gate >= 2` (i.e., depth ∈ {standard, thorough}) OR at least one
journey has `effective_gate >= 3` (depth == thorough).

### R-F11.2 — Single-message N×2 + M dispatch

All gate=2 reviewer pairs and all gate=3 qa-verifier agents go out **in one
message**. No staging, no waiting between them. Collect results via
notifications.

```
# Build dispatch sets
gate2_subs = [sid for sid, vp in verify_plan.items()
              if vp.type == "sub_req" AND 2 in effective_gates_for(sid)]

gate3_journeys = [j for j in plan.journeys
                  if 3 in effective_gates_for(j.id)]    # only thorough

# Collect diff once (shared across all reviewers)
diff = Bash("git diff --unified=0 HEAD~1 -- .").stdout    # or full session diff
```

```
# ════════════════════════════════════════════════════════════════════
# SINGLE MESSAGE — N×2 reviewer agents + M qa-verifier agents in ONE
# tool-call batch. All run in the background concurrently.
# ════════════════════════════════════════════════════════════════════

FOR sid IN gate2_subs:
  # Pair 1: code-reviewer — catches bugs/regressions in the fulfilling code
  Agent(subagent_type="code-reviewer",
        description="g2 code-reviewer {sid}",
        run_in_background=true,
        prompt=VERIFY_REQUEST_PROMPT(sid, "code-reviewer"))

  # Pair 2: spec-coverage — enforces GWT verbatim citation + file:line (R-F11.3, R-F11.4)
  Agent(subagent_type="spec-coverage",
        description="g2 spec-coverage {sid}",
        run_in_background=true,
        prompt=VERIFY_REQUEST_PROMPT(sid, "spec-coverage"))

FOR j IN gate3_journeys:
  Agent(subagent_type="qa-verifier",
        description="g3 qa-verifier {j.id}",
        run_in_background=true,
        prompt=QA_VERIFIER_PROMPT(j))
```

### `VERIFY_REQUEST_PROMPT` (shared shape, matches `VerifyRequest` in contracts.md)

Charter contains **IDs and paths only** — the agent self-reads requirements/
contracts to pull the GWT text. This preserves INV-2/INV-3.

```
VERIFY_REQUEST_PROMPT(sid, agent_kind) = """
You are the {agent_kind} agent. Verify sub-requirement {sid}.

Inputs:
  sub_req_id:     {sid}
  plan_path:      {plan_path}
  contracts_path: {contracts_path or "null"}

Source diff (unified):
<<<DIFF
{diff}
DIFF>>>

Procedure:
  1. Read {spec_dir}/requirements.md and extract the GWT (given/when/then) for {sid}.
  2. {agent_kind == "spec-coverage"
       ? "Confirm each of given/when/then appears VERBATIM in the diff or in the files the diff touches, with a file:line citation."
       : "Review the diff for correctness, regressions, and adherence to the GWT for {sid}."}
  3. If contracts_path is not null, cross-check relevant interfaces/invariants.

Output JSON (matches VerifyResult in contracts.md):
{
  "verdict": "PASS" | "FAIL",
  "citations": [{"sub_req_id": "{sid}", "given": "...", "when": "...", "then": "...",
                  "file_path": "...", "line": <int>}],   // required on PASS
  "reason": "..."                                        // required on FAIL
}

Do NOT modify files. Read-only.
"""
```

### `QA_VERIFIER_PROMPT`

```
QA_VERIFIER_PROMPT(j) = """
You are qa-verifier. Execute journey {j.id} as a runtime scenario.
Detect environment (browser/cli/desktop/shell) from the GWT text.

Inputs:
  journey_id:     {j.id}
  plan_path:      {plan_path}
  contracts_path: {contracts_path or "null"}

Procedure:
  1. Read plan.journeys[{j.id}] for name/given/when/then and composed sub_req IDs.
  2. Execute given → when → then end to end.
  3. Capture evidence (screenshot path / stdout excerpt / exit codes).

Output JSON:
{
  "journey_id": "{j.id}",
  "method": "browser" | "cli" | "desktop" | "shell" | "db",
  "verdict": "PASS" | "FAIL",
  "steps": [{"phase": "given|when|then", "detail": "...", "ok": true}],
  "evidence": "...",
  "reason": null | "..."
}

Do NOT modify files.
"""
```

### Gate=2 double-review verdict (R-F11.3)

Both reviewers must return `verdict == "PASS"` for the sub_req to pass gate=2.

```
FOR sid IN gate2_subs:
  cr = results["code-reviewer"][sid]
  sc = results["spec-coverage"][sid]
  IF cr.verdict == "PASS" AND sc.verdict == "PASS":
    gate2_result[sid] = "PASS"
  ELSE:
    gate2_result[sid] = "FAIL"
    failures.append({sid: sid, gate: 2,
                     reason: (cr.reason or "") + " | " + (sc.reason or "")})
```

### Gate=3 verdict

```
FOR j IN gate3_journeys:
  gate3_result[j.id] = results["qa-verifier"][j.id].verdict
  IF gate3_result[j.id] == "FAIL":
    failures.append({journey: j.id, gate: 3,
                     reason: results["qa-verifier"][j.id].reason})
```

### Contracts auto-patch hook (C4, routes to T9)

If any verify agent's output mentions `contract_mismatch` or points at a
contracts.md invariant that no longer matches the code, forward that output to
the T9 `contracts-patch` recipe. The orchestrator edits `contracts.md` inline
and appends a diff summary to `audit.md` — no user confirmation.

```
FOR r IN results.values():
  IF r.contract_mismatch:
    dispatch_recipe("contracts-patch", payload=r)
```

---

## Phase 2.3 — Fix Loop (R-F11.5, max 1 round)

Runs when gate=1, gate=2, or gate=3 produced `failures`. Only one round is
allowed — a second failure after the fix loop ends the verify as `FAILED`.

Persistent session counter `fix_loop_rounds` (default 0). Only one fix round is
permitted.

```
IF failures AND fix_loop_rounds < 1:
  # Resolve each failure back to the task that should have covered the sub_req
  by_task = {}
  # Per-task charter derivation context: for journey failures we need to pass
  # the composed sub_req IDs (journey failures are recorded as
  # {journey: j.id, ...} not {sid: ...}), so track them here.
  sub_req_ids_for_task = {}   # tid -> set(sub_req_id)
  FOR f in failures:
    IF f.has("sid"):
      tasks = [t for t in plan.tasks if f.sid in (t.fulfills or [])]
      FOR t in tasks:
        by_task.setdefault(t.id, []).append(f)
        sub_req_ids_for_task.setdefault(t.id, set()).add(f.sid)
    ELIF f.has("journey"):
      composed = plan.journeys[f.journey].composes   # list of sub_req IDs
      tasks = [t for t in plan.tasks if any(s in (t.fulfills or []) for s in composed)]
      FOR t in tasks:
        by_task.setdefault(t.id, []).append(f)
        # Include only the sub_reqs this task actually fulfills from the journey
        FOR s in composed:
          IF s in (t.fulfills or []):
            sub_req_ids_for_task.setdefault(t.id, set()).add(s)

  fix_dispatched_any = False
  FOR tid, fails in by_task.items():
    IF dispatch_count[tid] >= 5:    # INV-6 ceiling
      audit.append("DISPATCH_CEILING_EXCEEDED", tid)
      continue

    charter = {
      task_id: tid,
      plan_path: plan_path,
      contracts_path: contracts_path,
      # Derived from sid failures directly + journey failures via composes
      sub_req_ids: sorted(list(sub_req_ids_for_task.get(tid, set()))),
      round: current_round + 1,
      prior_failure_context: "VERIFY FAIL:\n" + format(fails)
    }
    Bash("hoyeon-cli2 plan task --status {tid}=running")
    dispatch_worker(charter)
    dispatch_count[tid] += 1
    fix_dispatched_any = True

  # Only consume the fix-loop budget + re-run gates when we actually dispatched
  # at least one worker. If every owning task was ceiling-blocked the budget is
  # preserved — and without new work there's nothing to re-verify, so mark the
  # run FAILED and proceed to aggregation (symmetric to the gap-retry guard).
  IF fix_dispatched_any:
    fix_loop_rounds += 1
    # After fix workers return, GO BACK to Phase 2.1 (gate=1) — we re-run the full
    # gate stack, not just the failed gate. Toolchain must still pass.
    → goto Phase 2.1
  ELSE:
    Edit(CONTEXT_DIR/audit.md, append="""
    [{timestamp}] FIX_LOOP_CEILING_BLOCKED
      reason: every failing task's owner hit INV-6 dispatch ceiling — no fix re-dispatch occurred
    """)
    run_status = "FAILED"
    → proceed to Final Aggregation with failures recorded

ELIF failures AND fix_loop_rounds >= 1:
  run_status = "FAILED"    # one fix round already spent; no more retries
  # INVARIANT: run_status = "FAILED" is set HERE (before Phase 2.5). Phase 2.5's
  # aggregation precedence — FAILED > PARTIAL > gate FAIL — relies on this
  # precondition: the fix-loop-exhausted path is the ONLY writer of "FAILED"
  # prior to aggregation. Do NOT introduce any other writer upstream of Phase 2.5
  # without updating the precedence comment there.
  → proceed to Final Aggregation with failures recorded
```

---

## Phase 2.4 — Manual Review Collection (R-F12.4)

Independent of depth, every sub_req or journey whose `plan_gate` includes `4`
is appended to `manual_review[]` verbatim. This section is passed through to
T11's report renderer.

```
manual_review = []
FOR vp in plan.verify_plan:
  IF 4 in vp.gates:
    manual_review.append({
      target: vp.target,
      type: vp.type,        # "sub_req" | "journey"
      reason: "gate=4 — requires human judgement"
    })
```

---

## Phase 2.5 — Final Aggregation

INVARIANT (precondition — do not reorder without reading this):
- `run_status == "FAILED"` is set by the Fix Loop (Phase 2.3) BEFORE Phase 2.5
  runs. It means the single allowed fix round was already spent with failures
  still outstanding. No other upstream phase writes `run_status = "FAILED"`.
- `run_status == "PARTIAL"` is set by the Coverage Pre-check (Phase 2.0,
  Step 4) when gaps persist after the allowed re-dispatch round.
- The precedence below (FAILED > PARTIAL > gate-FAIL > VERIFIED) is safe ONLY
  because of this invariant. If a future change introduces another `FAILED`
  writer outside Phase 2.3, the `ELIF` ordering and the PARTIAL branch here
  must be re-evaluated (e.g. a gate FAIL after fix-loop exhaustion must not
  silently demote to PARTIAL).

```
# Precedence (top-down): exhausted fix loop > persistent gaps > raw gate FAIL
IF run_status == "FAILED":                       # fix loop already exhausted (Phase 2.3)
  final_status = "FAILED"
ELIF run_status == "PARTIAL":                    # persistent gaps (R-F10.4, Phase 2.0 Step 4)
  final_status = "PARTIAL"
ELIF any gate2_result[sid] == "FAIL" OR any gate3_result[j] == "FAIL":
  # Reachable only if fix loop was NEVER entered (impossible given gate FAILs
  # feed Phase 2.3) OR fix_loop_rounds < 1 but failures became empty after
  # re-run — defensive branch, keeps the matrix honest.
  final_status = "FAILED"
ELSE:
  final_status = "VERIFIED"

# assert: (run_status == "FAILED") implies (fix_loop_rounds >= 1)
```

A PARTIAL result is **not** an abort — it is a soft pass that still renders
the report with uncovered sub_reqs listed.

---

## Output Shape (consumed by T11 report renderer)

```json
{
  "status": "VERIFIED" | "FAILED" | "PARTIAL",
  "depth": "light" | "standard" | "thorough",
  "coverage_matrix": {
    "<sub_req_id>": {
      "fulfilling_tasks": ["T3", "T7"],
      "status": "covered" | "gap" | "partial"
    }
  },
  "uncovered_sub_reqs": ["R-F11.4"],
  "gate1": {
    "status": "PASS" | "FAIL",
    "checks": [
      {"name": "build",     "status": "PASS", "detail": "..."},
      {"name": "lint",      "status": "PASS", "detail": "..."},
      {"name": "typecheck", "status": "PASS", "detail": "..."},
      {"name": "unit",      "status": "PASS", "detail": "no tests (warning)"}
    ]
  },
  "gate2": {
    "<sub_req_id>": {
      "verdict": "PASS" | "FAIL",
      "code_reviewer":  {"verdict": "PASS", "citations": [...], "reason": null},
      "spec_coverage":  {"verdict": "PASS", "citations": [...], "reason": null}
    }
  },
  "gate3": {
    "<journey_id>": {
      "verdict": "PASS" | "FAIL",
      "method": "browser" | "cli" | "desktop" | "shell" | "db",
      "steps": [...],
      "evidence": "...",
      "reason": null | "..."
    }
  },
  "manual_review": [
    {"target": "R-F11.4", "type": "sub_req", "reason": "gate=4 — requires human judgement"}
  ],
  "failures": [
    {"sid": "R-F4.3", "gate": 2, "reason": "..."},
    {"journey": "J1", "gate": 3, "reason": "..."}
  ],
  "contracts_patches": [
    {"path": "contracts.md", "summary": "...", "trigger_agent": "spec-coverage"}
  ],
  "fix_loop_rounds": 0 | 1,
  "gap_retry_rounds": 0 | 1
}
```

---

## Coverage Matrix Render (stub — T11 owns the final table)

T11 converts the matrix above into a stdout report table. Verify produces
**data**, not presentation. Reference shape for T11:

```
| sub_req   | Gate 1 | Gate 2 | Gate 3 | Gate 4   | Overall |
|-----------|--------|--------|--------|----------|---------|
| R-F10.1   | PASS   | PASS   | —      | —        | PASS    |
| R-F10.2   | PASS   | PASS   | —      | —        | PASS    |
| R-F11.1   | PASS   | PASS   | PASS   | —        | PASS    |
| R-F11.4   | PASS   | PASS   | —      | MANUAL   | MANUAL  |
| R-F12.1   | PASS   | PASS   | —      | —        | PASS    |
```

Cell rules:
- `PASS` / `FAIL` — came from gate execution
- `—` — gate not applicable at this depth
- `MANUAL` — gate=4 always escalated (R-F12.4)
- `GAP` — sub_req had no fulfilling task citation after the pre-check

---

## Recovery Summary

| Condition                            | Action                                                                  | Requirement |
|--------------------------------------|-------------------------------------------------------------------------|-------------|
| Coverage gap, retry available        | Re-dispatch fulfilling tasks with `must address sub_req` context (1×)    | R-F10.3     |
| Coverage gap persists after retry    | Log PERSISTENT_GAP to audit.md, mark run PARTIAL, continue verify        | R-F10.4     |
| Gate=1 FAIL                          | Skip gate=2/3, enter fix loop (R-F11.5)                                  | R-F11.1     |
| Gate=2 or Gate=3 FAIL (fix available) | Re-dispatch failing task once with verify-failure context, re-run gates  | R-F11.5     |
| Gate=2/3 FAIL after 1 fix round      | Terminate verify as FAILED                                               | R-F11.5     |
| Gate=4 present                       | Never auto-run; escalate to MANUAL REVIEW section                        | R-F12.4     |
| Contracts mismatch from any agent    | Route to T9 contracts-patch recipe (no user confirm)                     | C4          |
| Dispatch count for a task hits 5     | Log `DISPATCH_CEILING_EXCEEDED`, skip further re-dispatch                | INV-6       |
