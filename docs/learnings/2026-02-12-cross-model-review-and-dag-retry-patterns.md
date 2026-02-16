---
pr_number: null
date: 2026-02-12
problem_type: architecture
tags: [codex, cross-model, agent-council, dag, task-system, retry, quality-gate]
plan_path: null
---

# Cross-Model Review and DAG Retry Patterns

## Context
> From v0.5.0 release (develop direct merge, no PR)

v0.5.0 introduced cross-model integration using OpenAI Codex CLI alongside Claude agents. Three codex agents were created (`codex-strategist`, `codex-code-reviewer`, `codex-risk-analyst`) following an orchestrator pattern. The `codex-code-reviewer` was integrated as a final quality gate in the Execute Finalize chain. An Agent Council (Codex + Gemini) was used to review the implementation for logical flaws.

NOTE: `codex-code-reviewer` was later refactored into `code-reviewer` (multi-model: Codex + Gemini + Claude in parallel with synthesis).

## Problem

1. **Per-TODO verification misses integration issues**: Individual TODO verification (Worker + Verify) catches per-file bugs but misses cross-cutting concerns (side effects, design inconsistency, API contract breaks) that only emerge when viewing all changes together.

2. **DAG task systems can't loop**: When Code Review returns NEEDS_FIXES, the natural instinct is to "re-run" the review after fixes. But completed tasks in a DAG cannot be re-dispatched — the system assumes tasks are terminal once completed.

3. **Silent failure modes**: When an external tool (codex CLI) is unavailable, returning a "SHIP" verdict conflates "reviewed and passed" with "review not performed."

## Solution

### 1. Codex Orchestrator Pattern
Lightweight haiku agent that calls `codex exec -p "..."` and returns the result as-is. Agent does NOT do the review itself — it's purely an orchestrator. Graceful degradation: SKIPPED (no CLI) / DEGRADED (call failed) / SHIP or NEEDS_FIXES (from Codex output).

### 2. Dynamic Fix Chain (New Task Instances)
Instead of re-running completed tasks, create NEW task instances for the retry cycle:

```
Code Review #1 (NEEDS_FIXES)
  → Fix:CR-001, Fix:CR-002 (max 3)
  → Finalize:Residual Commit (post-fix)   ← NEW instance
  → Finalize:Code Review (retry)          ← NEW instance
  → State Complete / Report
```

Key trick: Add CR2 as a blocker to State Complete BEFORE completing CR1. This way, when CR1 completes, State Complete is still blocked by CR2.

### 3. Explicit Status Distinction
Three distinct states instead of one:
- **SHIP** = code was reviewed and deemed acceptable
- **SKIPPED** = review was NOT performed (tool unavailable)
- **DEGRADED** = review was attempted but failed

All states are logged to `audit.md` with explicit Status field.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Haiku model for codex agents | Orchestrator-only — no analysis needed, just CLI invocation |
| Fix tasks are Worker-only (no Verify) | Code Review retry serves as integration verification; fixes are small targeted changes |
| Max 1 retry cycle | Prevents infinite loops; remaining issues logged to `issues.md` for human review |
| SHIP on failure (pass-through) | Code review is additive; per-TODO verification already provides baseline quality |
| Agent Council for design review | Cross-model review (Codex + Gemini reviewing Claude's work) catches blind spots |

## Learnings

1. **DAG task systems are append-only**: Never assume you can re-run a completed task. Always create new instances. Design state machines accordingly.

2. **Add blockers BEFORE completing the triggering task**: When dynamically extending a DAG, the new blocker must be registered BEFORE the predecessor completes, otherwise the successor becomes immediately runnable.

3. **Distinguish "passed" from "skipped"**: Any quality gate with external dependencies should have at least 3 states (pass/fail/skip), not just 2. Silent skips create false confidence.

4. **Agent Council is valuable for architectural review**: Two independent models (Codex, Gemini) converged on the same 2 Critical issues (task re-dispatch, fix verification). Cross-model consensus increases confidence in findings.

5. **Codex orchestrator pattern is reusable**: The `codex exec -p "..."` wrapper with SKIPPED/DEGRADED handling can be applied to any cross-model review use case. Keep the orchestrator thin (haiku) and the prompt rich.

6. **Graceful degradation should be visible, not silent**: Even when a system correctly degrades (continues without a feature), the degradation event should be logged and surfaced in reports.

## PR Feedback
> No PR — direct develop-to-main merge for v0.5.0 release.
> Agent Council review served as the peer review mechanism.

**Codex (Agent Council)**:
- Critical: Completed tasks cannot be re-dispatched — create new instances
- Critical: Fix tasks skip verification in Standard mode
- Warning: SHIP on failure is a silent failure mode

**Gemini (Agent Council)**:
- Critical: Re-running completed tasks violates DAG constraint
- Warning: Fix tasks should have verification for Standard mode consistency
- Warning: SKIPPED should be an explicit status, not disguised as SHIP

## Related
- [lessons-learned.md](lessons-learned.md) — Hook and tool behavior gotchas
