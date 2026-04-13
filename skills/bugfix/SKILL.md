---
name: bugfix
description: |
  Root cause based one-shot bug fix. debugger diagnosis → spec.json generation → /execute.
  /bugfix "error description"
  Full investigation pipeline: debugger + gap-analyzer + standard verify.
  QA suggestion after successful fix.
allowed_tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Edit
  - Write
  - AskUserQuestion
  - Skill
validate_prompt: |
  Must complete with one of:
  1. Execute completed successfully (all plan.json tasks done)
  2. Circuit breaker triggered (max attempts exhausted, report saved)
  3. Escalated to /specify (with spec.json + debug report saved)
  Must NOT: skip root cause analysis, apply multiple fixes simultaneously,
  write tasks[] into spec.json, or call `hoyeon-cli spec task` (removed in v2).
---

# /bugfix Skill

Root cause based one-shot bug fix. Diagnose → generate spec.json → delegate to /execute for fix, verification, and commit.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
No completion claims without evidence
Must stop after 3 failed attempts
```

## Architecture

```
/bugfix "error description"

Phase 1: DIAGNOSE ─────────────────────────────────
  debugger + verification-planner + gap-analyzer (all parallel)
  → User confirmation

Phase 2: SPEC GENERATION ──────────────────────────
  Diagnosis results → spec.json (hoyeon-cli spec init + merge)

Phase 3: EXECUTE ──────────────────────────────────
  Skill("execute", args=spec_path)
  → Success: Phase 5
  → HALT: Phase 4

Phase 4: RESULT HANDLING (if HALT) ────────────────
  Retry (max 3) with stagnation detection → Phase 3
  Circuit breaker → .hoyeon/debug/{slug}.md → suggest /specify

Phase 5: CLEANUP & REPORT ─────────────────────────
  Save .hoyeon/debug/{slug}.md → final summary
```

## Execution Mode

Always runs the full investigation + execution pipeline. No SIMPLE/COMPLEX branching.

| Phase 1 | Retry |
|---------|-------|
| debugger + verification-planner + gap-analyzer | bugfix-managed (max 3) |

`/execute` will prompt for dispatch/work/verify via AskUserQuestion when invoked — bugfix does not pre-select these modes.

---

## Phase 1: DIAGNOSE

### Step 1.1: Parse Input

Extract from user input:
- **Bug description**: error message, symptoms, reproduction steps
- **Error output**: stack trace, test failure logs (if available)
- **Context**: related files, recent changes (if available)

**Initialize Debug State:**

```
SESSION_ID = [from hook — $CLAUDE_SESSION_ID]
slug = convert bug description to kebab-case (e.g. "null-pointer-in-auth")
DEBUG_STATE = "$HOME/.hoyeon/$SESSION_ID/debug-state.md"
hoyeon-cli session set --sid $SESSION_ID --skill bugfix --debug "$DEBUG_STATE"

Write(DEBUG_STATE):
# Debug: {bug description}
status: investigating

attempt: 0
slug: {slug}

## Symptoms (IMMUTABLE after Phase 1)
- expected: {from user input}
- actual: {from user input}
- error: {from user input}

## Diagnosis
root_cause: pending
spec_path: pending

## Attempts
```

### Step 1.2: Parallel Investigation

**Always dispatch 2 agents in parallel:**

```
Task(debugger):
  "Bug Description: {user input}
   Error Output: {error logs, if available}
   Context: {related files/recent changes, if available}

   Investigate this bug following your Investigation Protocol.
   Classify Bug Type, trace backward to root cause, assess Severity."

Task(verification-planner):
  "User's Goal: Fix the bug described below
   Current Understanding: {user input}
   Work Breakdown:
   - Reproduce bug with test
   - Apply minimal fix at root cause
   - Verify fix resolves the issue

   Focus on Auto items only (what commands prove the fix works).
   Keep it minimal — this is a bug fix, not a feature.

   Note: /bugfix uses Tier 1-3 (Auto items) only. Do not inline VERIFICATION.md.
   Tier 4 (sandbox items) are not needed. Mark sandbox section as 'bugfix mode — Tier 1-3 only'."
```

**After receiving debugger results, update debug-state.md:**

```
Update DEBUG_STATE:
  ## Diagnosis section:
  root_cause: {debugger's Root Cause — 1 line}
  bug_type: {classification}
  proposed_fix: {proposed fix — 1 line}
```

### Step 1.3: Gap Analysis

Always run gap-analyzer after debugger results:

```
Task(gap-analyzer):
  "User's Goal: Fix the bug below
   Current Understanding: {debugger's full Bug Analysis Report}
   Intent Type: Bug Fix

   Focus on:
   - Whether root cause vs symptom distinction is correct
   - Whether proposed fix could break other areas
   - Whether similar bugs exist with the same pattern"
```

### Step 1.4: User Confirmation

Present debugger results summary for user confirmation:

```
AskUserQuestion:
  header: "Root Cause"
  question: "Is the debugger's Root Cause analysis correct?"

  Display:
  - Bug Type: [classification]
  - Root Cause: [file:line + 1-line description]
  - Proposed Fix: [change description — 1 line]
  - Verification: [verification commands from verification-planner]
  - Assumptions: [debugger's Assumptions section]
  - Key warnings from Gap Analysis

  options:
  - "Correct, proceed" → Phase 2
  - "Root cause is different" → Re-run Step 1.2 with user's additional info
  - "Not sure" → Suggest "/discuss to explore first", then exit
```

---

## Phase 2: SPEC GENERATION

Convert diagnosis results into spec.json format. spec.json is the standard format consumed by `/execute`, and serves as escalation context for `/specify` on failure.

### Step 2.1: Initialize

```
SPEC_DIR = "$HOME/.hoyeon/$SESSION_ID"
SPEC_PATH = "$SPEC_DIR/spec.json"

hoyeon-cli spec init fix-{slug} \
  --goal "Fix: {bug description}" \
  --type dev \
  --schema v2 \
  ${SPEC_PATH}
```

### Step 2.2: Merge diagnosis into spec

> **⚠️ Merge Convention**: When calling `spec merge`:
> 1. **Always run `hoyeon-cli spec guide <section>` before constructing merge JSON** to verify field names and types
> 2. **Always use file-based passing**: write JSON to `/tmp/spec-merge.json` via `<< 'EOF'` heredoc, then pass via `--json "$(cat /tmp/spec-merge.json)"`, then `rm /tmp/spec-merge.json`
> 3. **On merge failure**: run `spec guide <failed-section>`, fix JSON to match schema, retry once

Use `hoyeon-cli spec merge` to populate the spec from diagnosis results. Single merge call.

**What to include (spec v2 — do NOT merge `tasks[]`; /execute derives plan.json separately):**

- **meta**: `schema_version: "v2"`, `non_goals` (no refactoring, no unrelated features)
- **context**: `confirmed_goal` (original bug description), `research` (debugger analysis summary as string array), `decisions` (root cause location + rationale), `known_gaps` (from debugger's assumptions/unknowns)
- **constraints**: minimal diff rule, root cause targeting rule (id + rule). Encode fix-scope guardrails here (e.g. "minimal diff <5%", "no refactoring", "fix root cause not symptom") — these are the must-not-do constraints that were previously inlined in task actions
- **requirements**: Generate from debugger diagnosis. Each requirement describes a behavior that was broken:
  1. Run `hoyeon-cli spec guide requirements` and `hoyeon-cli spec guide sub` to check field structure
  2. Construct JSON with `requirements[]` (id, behavior, sub[])
     - Convert debugger's reproduction steps → behavior description for each sub-requirement
     - **GWT is mandatory on every sub** (given/when/then). Map the bug scenario:
       - `given`: the precondition/state that triggers the bug
       - `when`: the action that exercises the broken path
       - `then`: the expected (post-fix) outcome — what "fixed" looks like
     - If debugger identified edge cases / similar issues, add sub-requirements for each (one sub per scenario)
  3. Merge via `hoyeon-cli spec merge ${SPEC_PATH} --json "$(cat /tmp/spec-merge.json)"`
  - Final Verify uses sub GWT to check regression coverage
- **verification.journeys[]** (optional): If the bug spans multiple sub-requirements end-to-end (e.g. auth + redirect + session), add an integration journey with `composes: [sub-ids]` + GWT. Omit entirely for single-surface bugs.

> **Do NOT merge `tasks[]` into spec.json.** v2 rejects it. `/execute` derives `plan.json` from requirements+sub in Phase 0.

### Step 2.3: Validate & Register

```bash
hoyeon-cli spec validate ${SPEC_PATH}
hoyeon-cli session set --sid $SESSION_ID --spec "$SPEC_PATH"
```

If validation fails, fix the JSON and retry once.

Update debug-state.md with `spec_path: ${SPEC_PATH}`.

---

## Phase 3: EXECUTE

Hand off spec.json to `/execute`. Execute routes by `meta.type: dev` and follows the dev.md pipeline.

```
Skill("execute", args="${SPEC_PATH}")
```

What execute handles:
- Prompts the user for dispatch / work / verify via AskUserQuestion (no meta.mode pre-selection; see `/execute` Phase 0.6)
- Worker dispatch (self-read pattern) according to the chosen dispatch mode
- Round-level commit (git-master)
- Verify recipe (light/standard/thorough/ralph) according to the chosen verify depth
- Final report

**Result judgment:**

```
IF execute completed successfully (all tasks done, report output):
  → Phase 5

IF execute HALTED:
  → Phase 4
```

---

## Phase 4: RESULT HANDLING

When execute HALTs.

### Step 4.1: Read Failure Context

```
# Extract failure reason from execute's HALT output
# or read from context dir's audit.md, issues.json
CONTEXT_DIR = ".hoyeon/specs/fix-{slug}/context"
failure_reason = {execute HALT output or last triage result from audit.md}
```

### Step 4.2: Retry

```
# Read current attempt from debug-state.md
attempt = debug_state.attempt + 1
MAX_ATTEMPTS = 3

IF attempt >= MAX_ATTEMPTS:
  → Step 4.5 (Circuit Breaker)

```

**Stagnation Detection (attempt >= 2):**

```
# Compare with previous attempt failure info
previous = debug_state.Attempts[-1]
current_reason = failure_reason

SPINNING:    same file/component fails consecutively
OSCILLATION: A fails → B fails → A fails (circular)
NO_PROGRESS: different failures each time, previous fixes cause regressions

Pattern-specific retry_hint:
  SPINNING    → "Different root cause likely. Consider: previous root cause
                 was wrong — trace further back from the symptom."
  OSCILLATION → "Circular dependency. Fix both sides simultaneously."
  NO_PROGRESS → "Fundamental misunderstanding. Re-read error output.
                 Consider: multiple independent bugs? Missing dependency?"
  (no pattern) → "Different approach needed. Do NOT repeat previous attempt."
```

### Step 4.4: Update Spec & Re-execute

```
# 1. Record attempt in debug-state.md
Append to DEBUG_STATE ## Attempts section:
  ### Attempt {attempt}
  result: FAIL
  reason: {failure_reason}
  pattern: {detected pattern or "none"}
  hint: {retry_hint}

# 2. Update attempt counter
Update DEBUG_STATE: attempt: {attempt}

# 3. Add failure context to spec.json
#    Run `hoyeon-cli spec guide context` to check known_gaps structure
#    Construct JSON with `context.known_gaps[]` (gap, severity, mitigation)
#    Merge via:
hoyeon-cli spec merge ${SPEC_PATH} --json "$(cat /tmp/spec-merge.json)"

# 4. Re-invoke execute (spec v2)
#    /execute reads plan.json next to spec.json. Do NOT touch plan.json directly
#    from bugfix — /execute handles task status and re-derivation.
#    If you need to reset failed tasks to pending so /execute will re-run them,
#    do it via the plan CLI (NOT `spec task`, which was removed in v2):
#      hoyeon-cli plan list <PLAN_PATH>
#      hoyeon-cli plan status <task-id> <PLAN_PATH> --status pending --summary "bugfix retry"
#    where PLAN_PATH = $(dirname ${SPEC_PATH})/plan.json
#    In most cases /execute will resume on its own from the existing plan.json.

# 5. Re-invoke execute
→ Phase 3
```

Execute handles resume naturally:
- Reads existing plan.json and skips done tasks
- Context files (learnings.json, issues.json — now alongside plan.json) retain previous failure info for the new worker
- `known_gaps` carry failure context and retry_hint for the worker

### Step 4.5: Circuit Breaker

Max attempts exceeded. Present escalation options to user.

**First, save attempt records:**

```
Bash: mkdir -p .hoyeon/debug

Write to .hoyeon/debug/{slug}.md:
  # Bugfix Report: {description}
  Date: {timestamp}
  Status: ESCALATED
  Attempts: {attempt count}
  Spec: {SPEC_PATH}

  ## Debugger Analysis
  {debugger's full Bug Analysis Report}

  ## Attempt History
  {full ## Attempts section from debug-state.md}

  ## Assessment
  "{attempt} attempts failed. Architecture-level issue likely."

Update DEBUG_STATE:
  status: escalated
```

```
AskUserQuestion:
  header: "Circuit Breaker"
  question: "Fix attempts have failed. This may be an architecture-level issue."
  options:
  - "Switch to /specify (full planning)"
    → "spec.json and debug report are available:
       Spec: {SPEC_PATH}
       Report: .hoyeon/debug/{slug}.md
       /specify can reference this context for deeper analysis."
  - "Try once more"
    → attempt += 1, go to Phase 3 (no circuit breaker reset)
  - "Stop"
```

---

## Phase 5: CLEANUP & REPORT

After execute completes successfully.

### Step 5.1: Save Debug Report

```
Bash: mkdir -p .hoyeon/debug

Write to .hoyeon/debug/{slug}.md:
  # Bugfix Report: {description}
  Date: {timestamp}
  Status: RESOLVED
  Attempts: {attempt count + 1}
  Spec: {SPEC_PATH}

  ## Root Cause
  {debugger's Root Cause analysis}

  ## Fix
  {proposed fix from debugger + result summary from /execute's final report}

  ## Verification
  {verification results from execute's final report}

Update DEBUG_STATE:
  status: resolved
```

### Step 5.2: Final Summary

```
print("""
## Bugfix Complete

**Bug**: {description}
**Root Cause**: {file:line — 1-line description}
**Attempts**: {count}
**Spec**: {SPEC_PATH}
**Report**: .hoyeon/debug/{slug}.md
""")
```

### Step 5.3: QA Suggestion

After successful fix, offer QA verification via browser/app:

```
AskUserQuestion:
  header: "QA"
  question: "Fix complete. Run QA to verify in browser/app?"
  options:
  - "Yes — run /qa"
    → Skill("qa", args="Verify bugfix: {description}. Root cause was at {file:line}. Check that the fix works and no regressions.")
  - "No — done"
    → End
```

---

## Escalation Path

```
/bugfix (diagnose + spec.json + execute)
   ↓ circuit breaker (3 failures)
   ↓ spec.json + .hoyeon/debug/{slug}.md saved
/specify (spec.json enrichment, leveraging existing diagnosis context)
   ↓
/execute (enriched spec execution)
```

Since spec.json is the standard format, `/specify` can read and enrich the existing spec on escalation. All diagnosis context (`context.research`, `context.assumptions`, `context.known_gaps`) is preserved.

---

## Agent Summary

| Phase | Agent | Status | Condition | Role |
|-------|-------|--------|-----------|------|
| 1 | **debugger** | existing | always | Root cause analysis, Bug Type classification |
| 1 | **verification-planner** | existing | always | Generate Auto items list (verification commands) |
| 1 | **gap-analyzer** | existing | always | Check for missed factors, risk assessment |
| 3 | **/execute** (Skill) | existing | always | spec.json-based execution (worker, verify, commit, review) |
| 5 | **/qa** (Skill) | existing | user opts in | Browser/app QA verification of the fix |

Phase 2 (SPEC GENERATION) and Phase 4 (RESULT HANDLING) are handled directly by bugfix without agents (hoyeon-cli calls + judgment logic).

---

## Design Principles

This skill combines core patterns from 3 proven open-source projects:

| Principle | Source | Application |
|-----------|--------|-------------|
| Root cause before fix | superpowers (systematic-debugging) | Entire Phase 1 |
| Backward call stack tracing | superpowers (root-cause-tracing) | debugger's Step 3 |
| Defense-in-depth after fix | superpowers (defense-in-depth) | Optional worker application |
| Anti-pattern rationalizations | superpowers (common rationalizations) | debugger's checklist |
| Bug Type → Tool routing | oh-my-opencode (Metis intent classification) | debugger's tool table |
| Full investigation | oh-my-opencode (Momus "80% is good enough") | Always gap-analyzer + standard verify |
| Minimal diff (<5%) | oh-my-claudecode (executor/build-fixer) | spec constraint C1 |
| Circuit breaker (3 attempts) | oh-my-claudecode (debugger) + superpowers | Phase 4 |
| spec.json as universal format | internal (specify/execute unification) | Phase 2 |
| Execute reuse | internal (single execution engine) | Phase 3 |
