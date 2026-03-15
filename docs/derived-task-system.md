# Derived Task System

Runtime task tracking for the `/execute` pipeline. When planned tasks fail verification, code review, or final verify, the system creates **derived tasks** to fix the issues — all tracked in `spec.json` via a single CLI command.

## Core Concept

```
Plan Time (specify)          Runtime (execute)
──────────────────          ─────────────────
T1 (planned)    ──────→    Worker → Verify → FAIL
T2 (planned)                                  │
T3 (planned)                            triage decision
                                              │
                                    spec derive → T1.retry-1 (derived)
                                              │
                                        Worker fix → re-verify → PASS
```

**Problem**: No plan survives first contact with reality. Verification catches issues that weren't anticipated at plan time.

**Solution**: `spec derive` creates derived tasks in spec.json with full provenance tracking. A single CLI command + a shared helper function keeps both DAGs (spec.json and Claude Code TaskList) in sync.

## Design Principles

| Principle | Rule | Why |
|-----------|------|-----|
| **Append-only** | Never modify/delete existing tasks | Zero side effects |
| **Depth-1** | Derived parent must be a planned task | Prevents chain explosion |
| **Circuit breaker** | Max 2 attempts per path | Prevents infinite loops |

## Schema

### New fields on task object (`dev-spec-v5.schema.json`)

```json
{
  "id": "T1.retry-1",
  "action": "Fix billing calc",
  "type": "work",
  "origin": "derived",           // "planned" | "derived" | "adapted"
  "derived_from": {
    "parent": "T1",              // must be a planned task (depth-1)
    "trigger": "retry",          // "retry" | "adapt" | "code_review" | "final_verify"
    "source": "verify",          // who detected the issue
    "reason": "AC failed: off by 1"
  },
  "depends_on": ["T1"]
}
```

- `origin` defaults to `"planned"` — backward compatible
- `derived_from` required when `origin` is `"derived"` or `"adapted"` (enforced by schema `if/then`)
- `adapted` = human-adjusted derived task (trusted, but cannot be a derive parent)

### ID Convention

```
{parent_id}.{trigger}-{sequence}

T1.retry-1        first retry of T1
T1.retry-2        second retry of T1
T2.adapt-1        first adaptation of T2
T1.code_review-1  first code review fix for T1
T3.final_verify-1 first final verify fix for T3
```

## CLI Commands

### `spec derive` — Create a derived task

```bash
hoyeon-cli spec derive \
  --parent T1 \
  --source verify \
  --trigger retry \
  --action "Fix billing calc" \
  --reason "AC failed: off by 1" \
  spec.json
```

**What it does internally:**
1. Validates parent exists and has `origin=planned` (depth-1 enforcement)
2. Auto-generates collision-safe ID (`T1.retry-1`)
3. Builds task with `origin=derived`, `derived_from`, `depends_on=[parent]`
4. Appends to `spec.json` tasks array
5. Rebuilds DAG (topological sort)
6. Outputs `{"created": "T1.retry-1"}`

**Depth-1 enforcement:**
```bash
hoyeon-cli spec derive --parent T1.retry-1 ...
# → Error: Parent must be a planned task (depth-1 enforcement)
```

### `spec drift` — Analyze plan vs reality

```bash
hoyeon-cli spec drift spec.json
```

```json
{
  "planned": 3,
  "derived": 3,
  "drift_ratio": 1.0,
  "by_trigger": {"retry": 1, "code_review": 1, "final_verify": 1},
  "by_source": {"verify": 1, "code-reviewer": 1, "final-verify": 1}
}
```

### Enhanced existing commands

| Command | Enhancement |
|---------|-------------|
| `spec status` | Shows `planned: {done: 3, total: 3}, derived: {done: 2, total: 4}` |
| `spec check` | Validates `derived_from.parent` references exist |
| `spec plan --format slim` | Adds `derived: true` boolean field on derived tasks |

## Triage Decision Tree

When a failure is detected, the system classifies it and routes to the appropriate action:

### Per-Task Verify Failure (standard mode)

```
Verify result → triage function
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      HALT        ADAPT       RETRY
   (highest)    (middle)     (lowest)

HALT conditions:
  - must_not_do violation with severity == "critical"
  - env_error (permission, API key, network)

ADAPT conditions:
  - suggested_adaptation present (scope blocker)
  - verification-type task with AC failure

RETRY conditions:
  - AC failure on work-type task (code error)
  - Max 2 attempts, then HALT
```

### Code Review Failure

```
code-reviewer → NEEDS_FIXES
                     │
               FOR EACH fix:
                 spec derive --trigger code_review
                 dispatch_derived_task(...)
                     │
               Re-review (max 1 round)
```

### Final Verify Failure

```
Final Verify → FAIL
                 │
          goal_alignment?
         ┌───────┴───────┐
       FAIL            PASS
         │               │
       HALT          other failures
    (unrecoverable)      │
                   FOR EACH failure:
                     spec derive --trigger final_verify
                     dispatch_fv_fix(...)
                         │
                   FV re-run (max 2)
                         │
                   ┌─────┴─────┐
                 PASS        FAIL
                  OK        HALT
```

## DAG Sync: spec.json ↔ TaskList

Two DAGs must stay in sync:

| DAG | Owner | Purpose |
|-----|-------|---------|
| spec.json | `hoyeon-cli` | Source of truth — task definitions, status, provenance |
| TaskList | Claude Code | Execution tracking — dispatching workers, blocking/unblocking |

`spec derive` updates spec.json automatically. The orchestrator must create corresponding TaskCreate/TaskUpdate entries. Two shared helper functions handle this:

### `dispatch_derived_task(derive_result, spec_path, depth)`

Used by: RETRY, ADAPT, CODE_REVIEW

```
1. TaskCreate worker + verify (standard) or worker only (quick) + commit
2. Set Worker → Verify → Commit dependency chain
3. Dispatch worker immediately
4. Mark spec task done on completion
```

### `dispatch_fv_fix(derive_result, spec_path)`

Used by: FINAL_VERIFY

```
1. TaskCreate worker only (no verify, no commit)
2. Dispatch worker
3. Mark spec task done
4. (Caller commits all FV fixes together)
```

## Complete Flow

```
/specify → spec.json (planned tasks T1, T2, T3)
              │
/execute
  │
  Phase 0: Load spec, init context
  │
  Phase 0.5: TaskCreate for all tasks
  │
  Phase 1: Execute loop
  │   │
  │   Worker → Verify → PASS → Commit → next task
  │                │
  │              FAIL → triage
  │                │
  │          HALT: stop execution
  │          ADAPT: spec derive → dispatch_derived_task → continue
  │          RETRY: spec derive → dispatch_derived_task → re-verify
  │
  Phase 2: Finalize
  │   │
  │   Residual Commit
  │   │
  │   Code Review (standard only)
  │   │  NEEDS_FIXES → spec derive → dispatch_derived_task → re-review
  │   │
  │   Final Verify (all modes)
  │   │  goal_alignment FAIL → HALT
  │   │  other FAIL → spec derive → dispatch_fv_fix → FV re-run (max 2)
  │   │
  │   Report
  │
  spec drift → "planned: 3, derived: 2, drift_ratio: 0.667"
```

## Summary

Every runtime failure follows the same pattern:

```
detect failure → classify → spec derive → helper dispatch → re-verify
```

Three possible outcomes at every decision point:

| Outcome | Meaning | Action |
|---------|---------|--------|
| **HALT** | Human must intervene | Stop execution |
| **DERIVE + FIX** | Machine can fix | `spec derive` → helper → re-verify |
| **SKIP** | Human-verified item | Log to report |
