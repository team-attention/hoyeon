---
name: bugfix
description: |
  Root cause based one-shot bug fix. debugger diagnosis → requirements.md generation → /execute.
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
  3. Escalated to /specify (with requirements.md + debug report saved)
  Must NOT: skip root cause analysis, apply multiple fixes simultaneously,
  or manually write plan.json (execute derives it from requirements.md).
---

# /bugfix Skill

Root cause based one-shot bug fix. Diagnose → generate requirements.md → delegate to /execute for fix, verification, and commit.

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

Phase 2: REQUIREMENTS GENERATION ──────────────────
  Diagnosis results → requirements.md (hoyeon-cli req init + Write)

Phase 3: EXECUTE ──────────────────────────────────
  Skill("execute", args=spec_dir)
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
hoyeon-cli session set --sid $SESSION_ID --json '{"skill":"bugfix","debug":"'"$DEBUG_STATE"'"}'

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
spec_dir: pending

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

## Phase 2: REQUIREMENTS GENERATION

Convert diagnosis results into requirements.md format. requirements.md is the standard format consumed by `/execute`, and serves as escalation context for `/specify` on failure.

### Step 2.1: Initialize

```
SPEC_DIR = "$HOME/.hoyeon/$SESSION_ID"

hoyeon-cli req init ${SPEC_DIR} --type bugfix --goal "Fix: {bug description}"
```

This creates `${SPEC_DIR}/requirements.md` with a stub template.

### Step 2.2: Write requirements content

Overwrite `${SPEC_DIR}/requirements.md` with the full requirements derived from diagnosis results. Use the Write tool directly.

**What to include:**

```markdown
---
type: bugfix
goal: "Fix: {bug description}"
non_goals:
  - "No refactoring beyond the fix"
  - "No unrelated feature changes"
---

# Requirements

## R-B1: {Bug fix requirement title — describes the broken behavior}
- behavior: {one-sentence description of what should work correctly after fix}

#### R-B1.1: {sub-requirement — the core bug scenario}
- given: {the precondition/state that triggers the bug}
- when: {the action that exercises the broken path}
- then: {the expected (post-fix) outcome — what "fixed" looks like}

#### R-B1.2: {sub-requirement — edge case or similar issue, if any}
- given: {precondition for the edge case}
- when: {action that triggers it}
- then: {expected outcome}

## R-T1: Minimal diff constraint
- behavior: Fix targets root cause only with minimal code changes

#### R-T1.1: Root cause targeting
- given: {root cause identified at file:line}
- when: the fix is applied
- then: only the root cause location is modified, no unrelated changes

## Constraints
- Minimal diff (<5% of codebase)
- Fix root cause, not symptom
- No refactoring beyond what the fix requires
```

**Mapping rules:**
- Convert debugger's reproduction steps into GWT (given/when/then) for each sub-requirement
- `given`: the precondition/state that triggers the bug
- `when`: the action that exercises the broken path
- `then`: the expected (post-fix) outcome
- If debugger identified edge cases / similar issues, add sub-requirements for each (one sub per scenario)
- Include a constraints section with fix-scope guardrails

### Step 2.3: Register

```bash
hoyeon-cli session set --sid $SESSION_ID --spec "$SPEC_DIR"
```

Update debug-state.md with `spec_dir: ${SPEC_DIR}`.

---

## Phase 3: EXECUTE

Hand off requirements.md to `/execute`. Execute2 reads `requirements.md` from the spec dir and derives `plan.json` internally.

```
Skill("execute", args="${SPEC_DIR}")
```

What execute handles:
- Prompts the user for dispatch / work / verify via AskUserQuestion
- Worker dispatch according to the chosen dispatch mode
- Round-level commit
- Verify recipe according to the chosen verify depth
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
CONTEXT_DIR = "${SPEC_DIR}/context"
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

### Step 4.4: Update Requirements & Re-execute

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

# 3. Add failure context to requirements.md
#    Read current requirements.md, append failure context to the Constraints
#    section or add a "## Known Issues" section with the failure info and
#    retry hint so the next worker has context.
#    Use Edit tool to append to requirements.md.

# 4. Re-invoke execute
#    /execute reads plan.json next to requirements.md. Do NOT touch plan.json
#    directly from bugfix — /execute handles task status and re-derivation.
#    If you need to reset failed tasks to pending so /execute will re-run them,
#    do it via the plan CLI:
#      hoyeon-cli plan list ${SPEC_DIR}
#      hoyeon-cli plan task ${SPEC_DIR} --status <task-id>=pending
#    In most cases /execute will resume on its own from the existing plan.json.

# 5. Re-invoke execute
→ Phase 3
```

Execute2 handles resume naturally:
- Reads existing plan.json and skips done tasks
- Context files (learnings.json, issues.json — in the context dir) retain previous failure info for the new worker
- Known Issues section in requirements.md carries failure context and retry_hint for the worker

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
  Spec Dir: {SPEC_DIR}

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
    → "requirements.md and debug report are available:
       Spec Dir: {SPEC_DIR}
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
  Spec Dir: {SPEC_DIR}

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
**Spec Dir**: {SPEC_DIR}
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
/bugfix (diagnose + requirements.md + execute)
   ↓ circuit breaker (3 failures)
   ↓ requirements.md + .hoyeon/debug/{slug}.md saved
/specify (requirements.md enrichment, leveraging existing diagnosis context)
   ↓
/execute (enriched requirements execution)
```

Since requirements.md is the standard format, `/specify` can read and enrich the existing requirements on escalation. All diagnosis context (constraints, known issues, GWT scenarios) is preserved.

---

## Agent Summary

| Phase | Agent | Status | Condition | Role |
|-------|-------|--------|-----------|------|
| 1 | **debugger** | existing | always | Root cause analysis, Bug Type classification |
| 1 | **verification-planner** | existing | always | Generate Auto items list (verification commands) |
| 1 | **gap-analyzer** | existing | always | Check for missed factors, risk assessment |
| 3 | **/execute** (Skill) | existing | always | requirements.md-based execution (worker, verify, commit, review) |
| 5 | **/qa** (Skill) | existing | user opts in | Browser/app QA verification of the fix |

Phase 2 (REQUIREMENTS GENERATION) and Phase 4 (RESULT HANDLING) are handled directly by bugfix without agents (hoyeon-cli calls + Write tool + judgment logic).

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
| Minimal diff (<5%) | oh-my-claudecode (executor/build-fixer) | requirements constraint |
| Circuit breaker (3 attempts) | oh-my-claudecode (debugger) + superpowers | Phase 4 |
| requirements.md as universal format | internal (specify/execute unification) | Phase 2 |
| Execute reuse | internal (single execution engine) | Phase 3 |
