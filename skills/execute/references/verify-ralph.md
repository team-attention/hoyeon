# Verify Ralph — Standard Verification + Persistent DoD Loop

Combines verify-standard (spec-based holistic check) with ralph's persistent loop mechanism.
Instead of HALT after 2 failed fix attempts, ralph keeps iterating until all sub-requirements pass.

**Key difference from standalone `/ralph`**: DoD is auto-generated from spec sub-requirements — no user confirmation needed (already approved during `/specify`).

**Consumers**: `/execute` when user selects `verify: ralph` in Phase 0.5.

---

## Phase 1: Auto-Generate DoD from Spec

Build the DoD checklist directly from spec.json sub-requirements. No AskUserQuestion — the spec is the pre-approved DoD.

```
spec = Read(spec_path) -> parse JSON
SESSION_ID = "[session ID from hook]"

# Build DoD items from sub-requirements
dod_items = []

FOR EACH req in spec.requirements ?? []:
  FOR EACH sub in req.sub ?? []:
    IF sub.given AND sub.when AND sub.then:
      item = "[{sub.id}] Given {sub.given}, When {sub.when}, Then {sub.then}"
    ELSE:
      item = "[{sub.id}] {sub.behavior}"

    # Skip human-only items (cannot be auto-verified)
    IF sub.verified_by == "human":
      SKIP (will be reported as MANUAL in final output)
    ELSE:
      dod_items.append(item)

# Also add goal alignment as first DoD item
dod_items.insert(0, "[GOAL] Implementation achieves: {spec.meta.goal}")

# Also add constraints
FOR EACH constraint in spec.constraints ?? []:
  IF constraint.verified_by != "human":
    dod_items.append("[{constraint.id}] Constraint: {constraint.rule}")
```

## Phase 2: Initialize Ralph State

Write the DoD file and register ralph state for the Stop hook.

```
Bash: SESSION_ID="[session ID]" && mkdir -p "$HOME/.hoyeon/$SESSION_ID/files"

# Write DoD file
Write DoD file to $HOME/.hoyeon/$SESSION_ID/files/ralph-dod.md:

  # Definition of Done (from spec sub-requirements)

  - [ ] [GOAL] Implementation achieves: {spec.meta.goal}
  - [ ] [C1] Constraint: ...
  - [ ] [R1-SR1] Given ..., When ..., Then ...
  - [ ] [R1-SR2] ...
  ...

# Register ralph namespace in session state
Bash: hoyeon-cli session set --sid "$SESSION_ID" --json "$(jq -n \
  --arg prompt "Verify and fix spec: {spec_path} — goal: {spec.meta.goal}" \
  --arg dod_file "$HOME/.hoyeon/$SESSION_ID/files/ralph-dod.md" \
  --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg spec_path "{spec_path}" \
  '{ralph: {prompt: $prompt, iteration: 0, max_iterations: 10, dod_file: $dod_file, created_at: $created_at, spec_path: $spec_path}}')"

print("Ralph verify initialized: {len(dod_items)} DoD items from spec sub-requirements")
print("Max iterations: 10 (circuit breaker)")
```

## Phase 3: Initial Verification Pass (verify-standard)

Run verify-standard as the first pass. Map results to DoD items.

```
# Dispatch verify-standard worker (same as standard recipe)
Agent(
  subagent_type="worker",
  description="Spec-based holistic verification (ralph initial pass)",
  prompt=VERIFY_STANDARD_PROMPT(spec_path, spec)
)
```

Parse the result and map to DoD items:

```
DOD_FILE = "$HOME/.hoyeon/$SESSION_ID/files/ralph-dod.md"

IF result.status == "VERIFIED":
  # All checks passed — check off ALL DoD items
  FOR EACH item in dod_items:
    Check off DoD item via Bash sed (Edit tool is blocked by ralph-dod-guard):
    Bash: sed -i '' 's/- \[ \] \[{item.id}\]/- [x] [{item.id}]/' "$DOD_FILE"
  # Ralph stop hook will see all items checked → allow exit
  print("All DoD items verified on first pass.")

ELIF result.status == "FAILED":
  # Map PASS results to checked DoD items
  # DoD edits MUST use Bash sed — the Edit tool is blocked by ralph-dod-guard.sh
  # ralph-dod-guard allows edits only when verify flag exists, but sed bypasses the guard entirely.
  IF result.goal_alignment.status == "PASS":
    Bash: sed -i '' 's/- \[ \] \[GOAL\]/- [x] [GOAL]/' "$DOD_FILE"

  FOR EACH constraint_result in result.constraints.results:
    IF constraint_result.status == "PASS":
      Bash: sed -i '' 's/- \[ \] \[{constraint_result.id}\]/- [x] [{constraint_result.id}]/' "$DOD_FILE"

  FOR EACH sub_req_result in result.sub_requirement_status.results:
    IF sub_req_result.status == "pass":
      Bash: sed -i '' 's/- \[ \] \[{sub_req_result.sub_requirement_id}\]/- [x] [{sub_req_result.sub_requirement_id}]/' "$DOD_FILE"

  # Count remaining
  unchecked = count items still "- [ ]" in DoD file
  print("Initial verify: {len(dod_items) - unchecked}/{len(dod_items)} passed. {unchecked} remaining.")
  print("Entering ralph loop for remaining items...")

  # Fix failures from this first pass
  FOR EACH failure in result (goal, constraints, requirements, deliverables):
    IF failure.status == "FAIL":
      # Create fix task via spec derive
      derive_result = Bash("""hoyeon-cli spec derive \
        --parent {failure.task_id ?? last_task_id} \
        --source verify-ralph \
        --trigger ralph_verify \
        --action "Fix: {failure.description}" \
        --reason "Ralph verify failure: {failure.reason}" \
        {spec_path}""")

      # Execute fix
      Agent(subagent_type="worker", prompt=WORKER_DESCRIPTION(derive_result.created))
      Bash("hoyeon-cli spec task {derive_result.created} --status done {spec_path}")

  # Commit fixes
  IF work_mode != "no-commit":
    Agent(subagent_type="git-master", prompt="Commit ralph verify fixes (iteration 1)")
```

After fixing, the orchestrator finishes its response. The **Stop hook takes over**:

## Phase 4: Ralph Loop (Stop Hook Driven)

The existing `ralph-stop.sh` handles the loop automatically:

1. Stop hook reads DoD file → finds unchecked items → blocks exit
2. Re-injects prompt with `systemMessage` instructing to spawn ralph-verifier
3. Orchestrator spawns `ralph-verifier` agent (FOREGROUND, not background)
4. Verifier independently checks each remaining DoD item against actual code/tests
5. Orchestrator marks PASS items as checked in DoD file
6. For FAIL items: create fix task via `spec derive`, execute fix, commit
7. Orchestrator finishes → Stop hook fires again → repeat until all checked

**On re-entry (after Stop hook blocks):**

```
# The systemMessage tells you to spawn ralph-verifier
Agent(
  subagent_type="ralph-verifier",
  description="Independent DoD verification",
  prompt="Verify the DoD checklist at: {DOD_FILE}\nOriginal task: Verify spec {spec_path}\nSpec goal: {spec.meta.goal}"
)

# Parse verifier results (JSON with status per criterion)
FOR EACH item in verifier_results:
  IF item.status == "PASS":
    # Use Bash sed — Edit tool blocked by ralph-dod-guard.sh
    Bash: sed -i '' "s/- \[ \] \[{item.sub_req_id}\]/- [x] [{item.sub_req_id}]/" "$DOD_FILE"
  ELIF item.status == "FAIL":
    # Fix the failure
    derive_result = Bash("""hoyeon-cli spec derive \
      --parent {find_task_for_sub_req(item.sub_req_id)} \
      --source verify-ralph \
      --trigger ralph_loop \
      --action "Fix: {item.criterion}" \
      --reason "{item.evidence}" \
      {spec_path}""")

    Agent(subagent_type="worker", prompt=WORKER_DESCRIPTION(derive_result.created))
    Bash("hoyeon-cli spec task {derive_result.created} --status done {spec_path}")

# Commit iteration fixes
IF work_mode != "no-commit":
  iteration = Read state.json → .ralph.iteration
  Agent(subagent_type="git-master", prompt="Commit ralph verify fixes (iteration {iteration})")

# Let the response end — Stop hook will re-check DoD file
```

## Phase 5: Completion

When all DoD items are checked (`- [x]`), `ralph-stop.sh` allows exit.

The orchestrator then:
1. Cleans up ralph state (stop hook handles this automatically)
2. Returns to the caller (dev.md / direct.md / team.md Phase 2b)
3. Caller marks `Finalize:Verify` task as completed
4. Proceeds to `Finalize:Report`

---

## Result Handling (for caller)

The ralph verify recipe does NOT return a result JSON like verify-standard.
Instead, completion itself IS the signal — if ralph loop exits normally,
all DoD items passed. The caller should treat this as `VERIFIED`.

```
# In dev.md / direct.md / team.md Phase 2b:
IF verify_depth == "ralph":
  Read and follow verify-ralph.md
  # If we reach here, ralph loop completed successfully
  TaskUpdate(taskId=fv, status="completed")
  # No FAIL handling needed — ralph loop handles all retries internally
```

---

## Differences from Standalone /ralph

| Aspect | Standalone /ralph | verify-ralph (in execute) |
|--------|-------------------|--------------------------|
| DoD source | User proposes + confirms | Auto-generated from spec sub-requirements |
| AskUserQuestion | Required (Phase 1) | Skipped (spec = pre-approved DoD) |
| Work phase | User's original task | Fix tasks from verify failures |
| First pass | None (goes straight to work) | verify-standard as initial check |
| Fix mechanism | Orchestrator fixes directly | `spec derive` + worker agents |
| Commits | Manual / per-iteration | Per-iteration via git-master |
| Circuit breaker | 10 iterations (default) | 10 iterations (same) |
| Goal misalignment | N/A (no spec) | Immediate HALT (same as verify-standard) |

## Goal Alignment Safety

If the initial verify-standard pass reports `goal_alignment.status == "FAIL"`:
- Do NOT enter ralph loop
- Immediately HALT (goal misalignment is unrecoverable)
- Print reason and stop

```
IF result.goal_alignment.status == "FAIL":
  # Clean up ralph state before halting
  Bash: jq 'del(.ralph)' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
  Bash: rm -f "$DOD_FILE"
  print("GOAL MISALIGNMENT — cannot auto-fix. HALT.")
  HALT
```
