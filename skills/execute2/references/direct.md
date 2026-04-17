# Direct Dispatch Mode

Orchestrator executes every task itself, one at a time, in depends_on order.
No worker subagents are spawned in this mode — the orchestrator holds the context.

Best for plans with 1–3 tasks, simple edits, or config-only changes.

**Prerequisites from Phase 0**: `plan`, `requirements`, `contracts_path`, `spec_dir`,
`CONTEXT_DIR`, `work`, `verify` are already established.

---

## Invariants direct mode must honor

- **C2 / INV-1**: direct mode commits **ONCE** at the end of Phase 1 (after the
  last task finishes). No per-task commits.
- **INV-5**: only `hoyeon-cli2 plan` commands mutate `plan.json`. `audit.md`,
  `learnings.json`, `issues.json`, and `contracts.md` are written via
  `Edit` / `Write` directly.
- **INV-9**: `status=done` is monotonic. A task that is already `done` is **skipped**,
  never re-transitioned (idempotent restart — fulfills R-F3.2).
- **INV-6**: total dispatch ceiling per task = **5** (1 initial + 2 retry
  + 1 gap + 1 verify-fix). A 6th attempt triggers `DISPATCH_CEILING_EXCEEDED` abort
  (fulfills R-F7.4).

---

## Dispatch Counter

Direct mode re-uses the same per-task dispatch counter as agent/team modes so
that subsequent phases (gap re-dispatch in `verify.md`, verify fix loop) share
one budget per task.

```
# Initialize once at entry to Phase 1
dispatch_count = {}          # task_id → int (initial attempt counts as 1)
blocked_set    = set()       # tasks flagged BLOCKED (and their descendants)

function bump_dispatch(task_id) → ok:
  dispatch_count[task_id] = dispatch_count.get(task_id, 0) + 1
  IF dispatch_count[task_id] > 5:
    audit_append("ABORT DISPATCH_CEILING_EXCEEDED task={task_id} attempts={dispatch_count[task_id]}")
    abort_all("DISPATCH_CEILING_EXCEEDED on {task_id}")
    return false          # fulfills R-F7.4 / INV-6
  return true
```

The same helper is called on every dispatch point: initial run (Phase 2, step 5),
retries (step 8), and later by `verify.md` for gap re-dispatch / verify fix.

---

## Phase 1: Topological Sequential Execution

*(fulfills R-F3.1 — topological sequential execution without worker spawn,
 R-F3.2 — idempotent skip on done, R-F7.1/2/3/4 — retry + abort + BLOCKED + ceiling)*

### 1.1 Build ordered work list

```
# Fetch tasks via cli2 only — never Read plan.json directly (INV-5)
all_tasks = Bash("hoyeon-cli2 plan list {spec_dir} --json").tasks

# Topological sort honoring depends_on; ties broken by (layer asc, id asc).
ordered = topo_sort(all_tasks, key=lambda t: (t.layer, t.id))

# Sanity: verify no cycles (fatal if present — should have been caught by blueprint)
IF has_cycle(all_tasks):
  audit_append("ABORT cycle_detected in plan")
  HALT with error
```

### 1.2 Main loop — one task per iteration, no subagents

```
FOR EACH task IN ordered:

  # ───────────────────────────────────────────────────────────
  # (A) Idempotent skip — fulfills R-F3.2 / INV-9
  # ───────────────────────────────────────────────────────────
  current = Bash("hoyeon-cli2 plan get {spec_dir} --path tasks")
            .find(t => t.id == task.id)
  IF current.status == "done":
    audit_append("SKIP {task.id} (already done)")
    CONTINUE              # do NOT re-transition — INV-9 monotonic

  # ───────────────────────────────────────────────────────────
  # (B) BLOCKED propagation — fulfills R-F7.3
  # Independent tasks must keep running; only descendants of a
  # BLOCKED task get marked BLOCKED. Ancestors / siblings proceed.
  # ───────────────────────────────────────────────────────────
  IF any(dep IN blocked_set for dep in task.depends_on):
    blocked_set.add(task.id)
    Bash("hoyeon-cli2 plan task {spec_dir} --status {task.id}=blocked \
          --summary 'upstream dep BLOCKED'")
    audit_append("BLOCKED-PROPAGATE {task.id} (depends_on blocked ancestor)")
    CONTINUE

  # ───────────────────────────────────────────────────────────
  # (C) Attempt loop: initial + up to 2 retries — fulfills R-F7.1
  # Total attempts cap is 3 here (1 + 2 retry). Additional
  # gap / verify-fix attempts happen later and share the ceiling (R-F7.4).
  # ───────────────────────────────────────────────────────────
  attempt = 0
  prior_failure_context = null
  task_outcome = null

  WHILE attempt < 3:                          # 1 initial + 2 retry = 3
    IF NOT bump_dispatch(task.id):            # R-F7.4 ceiling check
      BREAK                                   # bump_dispatch already aborted

    attempt += 1

    # (C.1) Mark running via cli2 only (INV-5)
    Bash("hoyeon-cli2 plan task {spec_dir} --status {task.id}=running")
    audit_append("DISPATCH {task.id} attempt={attempt} \
                  total={dispatch_count[task.id]}")

    # (C.2) Look up GWT for this task's fulfills[] from session-cached
    #       requirements. Orchestrator already has this in memory — do NOT
    #       re-read requirements.md (INV-3).
    gwt = find_gwt_for_task(task, requirements)

    # (C.3) Read contracts.md if present. Workers don't exist in direct mode,
    #       so the orchestrator reads contracts itself this one time per task.
    IF contracts_path:
      contracts_text = Read(contracts_path)

    # (C.4) If this is a retry, the prior_failure_context from the previous
    #       iteration is kept in scope and factored into the implementation
    #       strategy — fulfills R-F7.1 "직전 실패 컨텍스트를 charter에 주입".
    #       In direct mode the "charter" is the orchestrator's own reasoning;
    #       the prior_failure_context variable IS the injection.

    # (C.5) Implement the task directly.
    #       Use Read / Edit / Write / Bash tools.
    #       Honor contracts interfaces + invariants.
    #       Verify each sub-req's GWT is locally satisfied.
    try:
      result = implement_task_directly(
        task            = task,
        gwt             = gwt,
        contracts       = contracts_text if contracts_path else null,
        prior_failure   = prior_failure_context   # null on first attempt
      )
    except FatalError as e:
      result = { status: "failed", reason: str(e), files: [] }

    # (C.6) Tier-1 mechanical checks
    tier1 = run_mechanical_checks()            # build / lint / typecheck

    # (C.7) Classify outcome
    IF result.status == "blocked":
      # fulfills R-F7.3 — mark this task BLOCKED in plan + audit, do NOT
      # abort the whole run; dependents will be caught in step (B) above.
      Bash("hoyeon-cli2 plan task {spec_dir} --status {task.id}=blocked \
            --summary '{result.reason}'")
      audit_append("BLOCKED {task.id} reason='{result.reason}'")
      issues_append({ task: task.id, type: "blocked", reason: result.reason })
      blocked_set.add(task.id)
      task_outcome = "blocked"
      BREAK

    ELIF result.status == "done" AND tier1.all_pass:
      Bash("hoyeon-cli2 plan task {spec_dir} --status {task.id}=done \
            --summary '{result.summary}'")    # INV-9: only transition once
      audit_append("DONE {task.id} attempt={attempt} files={result.files}")
      learnings_append({ task: task.id, notes: result.learnings })
      task_outcome = "done"
      BREAK

    ELSE:
      # Failure path — capture context for next retry (R-F7.1)
      prior_failure_context = build_failure_context(result, tier1)
      audit_append("FAIL {task.id} attempt={attempt} reason='{result.reason}'")
      issues_append({ task: task.id, type: "fail", attempt: attempt,
                      reason: result.reason })
      # Loop continues → retry (until attempt == 3)

  # END WHILE

  # ───────────────────────────────────────────────────────────
  # (D) Persistent failure — 3 attempts all failed
  # fulfills R-F7.2: abort entire run, audit.md "ABORT"
  # ───────────────────────────────────────────────────────────
  IF task_outcome != "done" AND task_outcome != "blocked":
    Bash("hoyeon-cli2 plan task {spec_dir} --status {task.id}=failed \
          --summary 'persistent fail after {attempt} attempts'")
    audit_append("ABORT task={task.id} reason=persistent_fail attempts={attempt}")
    emit_partial_report()
    HALT                                       # stop Phase 1 entirely

  # CONTINUE outer FOR loop with next ordered task
END FOR
```

### 1.3 End-of-phase single commit

*(fulfills C2 / INV-1 — direct mode commits once, not per task)*

```
IF work != "no-commit":
  # Only ONE commit for the whole direct-mode Phase 1
  Agent(subagent_type="git-master",
        description="Commit direct-mode phase 1",
        prompt="Commit all changes produced by direct-mode execution of plan \
                {spec_dir}. Single commit covering tasks: \
                {', '.join(t.id for t in ordered if t.status == 'done')}.")
  audit_append("COMMIT phase1 single-commit (direct mode, INV-1)")
```

---

## Phase 2: Hand off to verify

Direct mode does not run verification itself. After Phase 1 completes (or after a
BLOCKED-but-not-aborted run), route to the verify recipe:

```
Read: ${baseDir}/references/verify.md
Follow instructions for the selected verify depth.
```

`verify.md` reuses `dispatch_count` / `bump_dispatch` so that gap re-dispatch
(R-F10.3) and verify fix (R-F11.5) stay inside the 5-attempt ceiling per task
(R-F7.4 / INV-6).

---

## Helper contracts

Helpers referenced above. Each is a plain function in the orchestrator's
context (no new subagents).

```
function audit_append(line):
  # INV-5: audit.md via Edit, not cli2
  Edit({spec_dir}/audit.md, append="- [{ISO timestamp}] {line}\n")

function learnings_append(entry):
  Edit({CONTEXT_DIR}/learnings.json, append_json_array=entry)

function issues_append(entry):
  Edit({CONTEXT_DIR}/issues.json, append_json_array=entry)

function run_mechanical_checks():
  # project-appropriate build/lint/typecheck — see verify.md Tier 1
  return { all_pass: bool, results: [...] }

function build_failure_context(result, tier1):
  return {
    prior_reason     : result.reason,
    prior_diff_hint  : result.files,
    tier1_failures   : tier1.failures,
    guidance         : "address the concrete failure above; do not regress \
                        passing checks."
  }

function abort_all(reason):
  # Graceful halt — emit report then raise
  emit_partial_report()
  HALT
```

---

## Sub-requirement loci (for coverage matrix)

| Sub-req   | Locus in this file                                                     |
|-----------|------------------------------------------------------------------------|
| R-F3.1    | Phase 1.1 (topo_sort) + Phase 1.2 FOR EACH loop — no subagent spawn    |
| R-F3.2    | Phase 1.2 (A) — `current.status == "done" → CONTINUE`                  |
| R-F7.1    | Phase 1.2 (C) attempt loop + `prior_failure_context` injection in (C.4)|
| R-F7.2    | Phase 1.2 (D) — abort + audit `ABORT` on 3rd fail                      |
| R-F7.3    | Phase 1.2 (B) dep-check + (C.7) BLOCKED branch — descendants only      |
| R-F7.4    | `bump_dispatch` helper + call sites in (C); DISPATCH_CEILING_EXCEEDED  |
