---
name: bugfix
description: |
  Root cause based one-shot bug fix. debugger diagnosis → spec.json generation → /execute.
  /bugfix "error description"
  Adaptive mode: auto-routes by debugger's Severity assessment (SIMPLE/COMPLEX).
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
  1. Execute completed successfully (spec.json all tasks done)
  2. Circuit breaker triggered (max attempts exhausted, report saved)
  3. Escalated to /specify (with spec.json + debug report saved)
  Must NOT: skip root cause analysis, apply multiple fixes simultaneously.
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
  debugger + verification-planner (always parallel)
  + gap-analyzer (COMPLEX only)
  → User confirmation

Phase 2: SPEC GENERATION ──────────────────────────
  Diagnosis results → spec.json (hoyeon-cli spec init + merge)

Phase 3: EXECUTE ──────────────────────────────────
  Skill("execute", args=spec_path)
  → Success: Phase 5
  → HALT: Phase 4

Phase 4: RESULT HANDLING (if HALT) ────────────────
  SIMPLE: retry (max 3) with stagnation detection → Phase 3
  COMPLEX: escalate immediately (execute already retried)
  Circuit breaker → .dev/debug/{slug}.md → suggest /specify

Phase 5: CLEANUP & REPORT ─────────────────────────
  Save .dev/debug/{slug}.md → final summary
```

## Adaptive Mode

Mode is never asked from the user. Auto-routes based on debugger's **Severity** assessment:

| Severity | spec depth | Phase 1 | Phase 3 (execute) | Retry |
|----------|-----------|---------|-------------------|-------|
| **SIMPLE** | quick | debugger + verification-planner | worker → commit → final verify | bugfix-managed (max 3) |
| **COMPLEX** | standard | + gap-analyzer | worker → verify → commit → code review → requirements | execute-internal (max 2), then escalate |

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
severity: pending
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

   Focus on A-items only (what commands prove the fix works).
   Keep it minimal — this is a bug fix, not a feature.

   Note: /bugfix uses Tier 1-3 (A-items) only. Do not inline TESTING.md.
   Tier 4 (S-items) are not needed. Mark S-items section as 'bugfix mode — Tier 1-3 only'."
```

**After receiving debugger results, update debug-state.md:**

```
Update DEBUG_STATE:
  severity: {SIMPLE/COMPLEX}

  ## Diagnosis section:
  root_cause: {debugger's Root Cause — 1 line}
  bug_type: {classification}
  proposed_fix: {proposed fix — 1 line}
```

### Step 1.3: Evaluate Severity & Conditional Gap Analysis

Check **Severity** from debugger results:

- **SIMPLE** → Proceed directly to Step 1.4
- **COMPLEX** → Run gap-analyzer, then Step 1.4:

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
  - Severity: [SIMPLE/COMPLEX]
  - Verification: [verification commands from verification-planner]
  - Assumptions: [debugger's Assumptions section]
  [COMPLEX only] Key warnings from Gap Analysis

  options:
  - "Correct, proceed" → Phase 2
  - "Root cause is different" → Re-run Step 1.2 with user's additional info
  - "Not sure" → Suggest "/discuss to explore first", then exit
```

---

## Phase 2: SPEC GENERATION

Convert diagnosis results into spec.json v4 format. spec.json is the standard format consumed by `/execute`, and serves as escalation context for `/specify` on failure.

### Step 2.1: Paths

```
SPEC_DIR = "$HOME/.hoyeon/$SESSION_ID"
SPEC_PATH = "$SPEC_DIR/spec.json"
```

### Step 2.2: Initialize spec.json

```bash
depth = "quick"     # SIMPLE
depth = "standard"  # COMPLEX

hoyeon-cli spec init fix-{slug} \
  --goal "Fix: {bug description}" \
  --type dev \
  --depth {depth} \
  --interaction autopilot \
  ${SPEC_PATH}
```

### Step 2.3: Merge diagnosis into spec

Single merge call with all fields. The `tasks` array replaces the placeholder T1 created by `spec init`.

```bash
hoyeon-cli spec merge ${SPEC_PATH} --json '{
  "meta": {
    "non_goals": [
      "Do not refactor surrounding code",
      "Do not add unrelated features"
    ],
    "deliverables": [
      {"path": ".dev/debug/{slug}.md", "description": "Bugfix report"}
    ]
  },
  "context": {
    "request": "{original bug description + error output}",
    "research": "{debugger root cause analysis — 1-2 paragraph summary}",
    "assumptions": [
      {FOR EACH assumption from debugger:}
      {"id": "A{n}", "belief": "{assumption text}", "if_wrong": "{impact if wrong}", "impact": "major"}
    ],
    "decisions": [
      {"id": "D1", "decision": "Root cause at {file:line}: {description}", "rationale": "{debugger rationale}"}
    ]
  },
  "tasks": [
    {
      "id": "T1",
      "action": "{debugger proposed fix — 1 line description}",
      "type": "work",
      "status": "pending",
      "file_scope": ["{affected files from debugger}"],
      "steps": [
        "Write regression test that reproduces the bug (RED)",
        "Apply minimal fix at root cause: {file:line} (GREEN)",
        "Verify all acceptance criteria pass"
      ],
      "must_not_do": [
        "Change more than necessary (<5% of affected file)",
        "Refactor surrounding code",
        "Add features not related to the bug",
        "Fix at symptom location if root cause is elsewhere",
        "Do not run git commands"
      ],
      "acceptance_criteria": {
        "functional": [
          {FOR EACH A-item from verification-planner:}
          {"description": "{criterion}", "command": "{verification command}"}
        ],
        "static": [],
        "runtime": []
      }
    }
    {IF debugger.similar_issues not empty:}
    ,{
      "id": "T2",
      "action": "Fix similar issues at: {locations list}",
      "type": "work",
      "status": "pending",
      "depends_on": ["T1"],
      "file_scope": ["{similar issue files}"],
      "steps": ["Apply same fix pattern to similar locations"],
      "must_not_do": ["Do not run git commands"],
      "acceptance_criteria": {
        "functional": [{"description": "Similar issue locations fixed and verified"}]
      }
    }
  ],
  "constraints": [
    {
      "id": "C1",
      "type": "must_not_do",
      "rule": "Changes must be minimal (<5% of affected file)",
      "verified_by": "agent",
      "verify": {"type": "assertion", "checks": ["Diff is focused on root cause only, no extraneous changes"]}
    },
    {
      "id": "C2",
      "type": "must_not_do",
      "rule": "Fix must target root cause, not symptoms",
      "verified_by": "agent",
      "verify": {"type": "assertion", "checks": ["Fix location matches debugger-identified root cause"]}
    }
  ]
}'
```

**Field mapping:**

| Debugger output | → | spec.json field |
|---|---|---|
| Root Cause | → | `context.decisions[0]`, `tasks[0].steps` |
| Proposed Fix | → | `tasks[0].action` |
| Bug Type | → | `context.research` |
| Assumptions | → | `context.assumptions` |
| Affected Files | → | `tasks[0].file_scope` |
| Similar Issues | → | `tasks[1]` (optional T2) |
| Severity | → | `meta.mode.depth` (quick/standard) |

**verification-planner output:**

| Output | → | spec.json field |
|---|---|---|
| A-items | → | `tasks[0].acceptance_criteria.functional` |

### Step 2.4: Validate & Register

```bash
hoyeon-cli spec validate ${SPEC_PATH}
hoyeon-cli session set --sid $SESSION_ID --spec "$SPEC_PATH"
```

If validation fails, fix the JSON and retry once.

**Update debug-state.md:**

```
Update DEBUG_STATE:
  spec_path: ${SPEC_PATH}
```

---

## Phase 3: EXECUTE

Hand off spec.json to `/execute`. Execute routes by `meta.type: dev` and follows the dev.md pipeline.

```
Skill("execute", args="${SPEC_PATH}")
```

What execute handles:
- Worker dispatch (self-read pattern)
- Per-task verify (standard only)
- Per-task commit (git-master)
- Retry/Adaptation (standard only, max 2)
- Code Review (standard only)
- Requirements Check (standard only) / Final Verify (quick only)
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

When execute HALTs. Handling differs by severity.

### Step 4.1: Read Failure Context

```
# Extract failure reason from execute's HALT output
# or read from context dir's audit.md, issues.md
CONTEXT_DIR = ".dev/specs/fix-{slug}/context"
failure_reason = {execute HALT output or last triage result from audit.md}
```

### Step 4.2: Route by Severity

```
IF severity == "COMPLEX":
  # Execute standard mode already retried internally (max 2)
  # No further retries — go straight to Circuit Breaker
  → Step 4.5 (Circuit Breaker)

IF severity == "SIMPLE":
  → Step 4.3 (Retry)
```

### Step 4.3: Retry (SIMPLE only)

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
hoyeon-cli spec merge ${SPEC_PATH} --json '{
  "context": {
    "known_gaps": [
      {"gap": "Attempt {attempt} failed: {failure_reason}", "severity": "high", "mitigation": "{retry_hint}"}
    ]
  }
}'

# 4. Reset task status
hoyeon-cli spec task T1 --status pending ${SPEC_PATH}
{IF T2 exists AND T2 not done:}
hoyeon-cli spec task T2 --status pending ${SPEC_PATH}

# 5. Re-invoke execute
→ Phase 3
```

Execute handles resume naturally:
- Skips done tasks
- Context files (learnings.md, issues.md) retain previous failure info for the new worker
- `known_gaps` carry failure context and retry_hint for the worker

### Step 4.5: Circuit Breaker

Max attempts exceeded or COMPLEX mode HALT. Present escalation options to user.

**First, save attempt records:**

```
Bash: mkdir -p .dev/debug

Write to .dev/debug/{slug}.md:
  # Bugfix Report: {description}
  Date: {timestamp}
  Status: ESCALATED
  Severity: {SIMPLE/COMPLEX}
  Attempts: {attempt count}
  Spec: {SPEC_PATH}

  ## Debugger Analysis
  {debugger's full Bug Analysis Report}

  ## Attempt History
  {full ## Attempts section from debug-state.md}

  ## Assessment
  {SIMPLE: "{attempt} attempts failed. Likely not a simple bug."}
  {COMPLEX: "Execute standard mode failed including internal retries. Architecture-level issue."}

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
       Report: .dev/debug/{slug}.md
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
Bash: mkdir -p .dev/debug

Write to .dev/debug/{slug}.md:
  # Bugfix Report: {description}
  Date: {timestamp}
  Status: RESOLVED
  Severity: {SIMPLE/COMPLEX}
  Attempts: {attempt count + 1}
  Spec: {SPEC_PATH}

  ## Root Cause
  {debugger's Root Cause analysis}

  ## Fix
  {spec.json T1.action + result summary}

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
**Severity**: {SIMPLE/COMPLEX}
**Attempts**: {count}
**Spec**: {SPEC_PATH}
**Report**: .dev/debug/{slug}.md
""")
```

---

## Escalation Path

```
/bugfix (diagnose + spec.json + execute)
   ↓ circuit breaker (SIMPLE: 3 failures, COMPLEX: execute HALT)
   ↓ spec.json + .dev/debug/{slug}.md saved
/specify (spec.json enrichment, leveraging existing diagnosis context)
   ↓
/execute (enriched spec execution)
```

Since spec.json is the standard format, `/specify` can read and enrich the existing spec on escalation. All diagnosis context (`context.research`, `context.assumptions`, `context.known_gaps`) is preserved.

---

## Agent Summary

| Phase | Agent | Status | Condition | Role |
|-------|-------|--------|-----------|------|
| 1 | **debugger** | existing | always | Root cause analysis, Bug Type classification, Severity assessment |
| 1 | **verification-planner** | existing | always | Generate A-items list (verification commands) |
| 1 | **gap-analyzer** | existing | COMPLEX only | Check for missed factors, risk assessment |
| 3 | **/execute** (Skill) | existing | always | spec.json-based execution (worker, verify, commit, review) |

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
| Adaptive severity | oh-my-opencode (Momus "80% is good enough") | SIMPLE/COMPLEX auto-routing |
| Minimal diff (<5%) | oh-my-claudecode (executor/build-fixer) | spec constraint C1 |
| Circuit breaker (3 attempts) | oh-my-claudecode (debugger) + superpowers | Phase 4 |
| spec.json as universal format | internal (specify/execute unification) | Phase 2 |
| Execute reuse | internal (single execution engine) | Phase 3 |
