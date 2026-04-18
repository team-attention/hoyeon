# Architecture

## Overview

Hoyeon is a Claude Code plugin that implements a **specify-blueprint-execute** development pipeline. The core idea: separate requirements, planning, and implementation into distinct phases so each can be independently validated, parallelized, and guarded by hooks.

1. **Specify** -- An interview-driven skill derives structured requirements, outputting `requirements.md`.
2. **Blueprint** -- A contract-first planner reads `requirements.md` and produces `plan.json` (task graph with dependencies) and `contracts.md` (interface contracts between tasks).
3. **Execute** -- A plan-driven orchestrator reads `plan.json`, dispatches worker agents using one of three dispatch modes (direct/agent/team), and runs verification at configurable depth.
4. **Hooks** -- Shell scripts registered in `.claude/settings.json` enforce guardrails at every lifecycle event: blocking premature writes, validating outputs, and auto-advancing the pipeline.

The plugin also ships standalone skills (council, bugfix, ralph, scope, etc.) that can be invoked independently outside the main pipeline.

---

## Pipeline Diagram

```
  User Request
       |
       v
 +------------+   requirements.md   +------------+   plan.json        +------------+
 |  /specify   | -----------------> | /blueprint  | ----------------> |  /execute   |
 |             |                    |             |  contracts.md     |             |
 | interview   |                    | contract    |                   | 3-axis cfg  |
 | requirements|                    |  derivation |                   | dispatch:   |
 | derivation  |                    | task graph  |                   |  direct /   |
 |             |                    | verify plan |                   |  agent /    |
 +-------------+                    +-------------+                   |  team       |
                                                                      +------+------+
                                                                             |
                                                          +------------------+------------------+
                                                          |                  |                  |
                                                          v                  v                  v
                                                     +---------+       +---------+       +---------+
                                                     | worker  |       | worker  |       | worker  |
                                                     | agent   |       | agent   |       | agent   |
                                                     +----+----+       +----+----+       +----+----+
                                                          |                  |                  |
                                                          +--------+---------+--------+--------+
                                                                   |                  |
                                                                   v                  v
                                                            +------+------+    +------+------+
                                                            | git-master  |    |   Verify    |
                                                            |  (commit)   |    | (light /    |
                                                            +-------------+    | standard /  |
                                                                               | thorough)   |
                                                                               +------+------+
                                                                                      |
                                                                                      v
                                                                                Final Report

  /ultrawork = /specify --> /blueprint --> /execute (fully automated via Stop hooks)
```

### Hook Lifecycle Within a Session

```
  SessionStart
       |  cli-version-sync.sh, session-compact-hook.sh
       v
  UserPromptSubmit
       |  ultrawork-init-hook.sh, skill-session-init.sh,
       |  rv-detector.sh
       v
  PreToolUse
       |  [Skill]  skill-session-init.sh, rulph-init.sh
       |  [Edit|Write]  skill-session-guard.sh, ralph-dod-guard.sh
       v
  PostToolUse
       |  [Task|Skill]  validate-output.sh
       |  [Grep|Glob|WebFetch|Bash]  tool-output-truncator.sh
       v
  PostToolUseFailure
       |  [Edit|Write]  edit-error-recovery.sh
       |  [Read]  large-file-recovery.sh
       |  [*]  tool-failure-tracker.sh
       v
  Stop
       |  ultrawork-stop-hook.sh, skill-session-stop.sh,
       |  rv-validator.sh, rulph-stop.sh, ralph-stop.sh
       v
  SessionEnd
       |  skill-session-cleanup.sh
       v
  (done)
```

---

## Skills

| Skill | Description |
|-------|-------------|
| `specify` | Interview-driven requirements derivation; outputs `requirements.md` |
| `blueprint` | Contract-first task graph and verify plan from `requirements.md`; outputs `plan.json` + `contracts.md` |
| `execute` | Plan-driven orchestrator (direct/agent/team dispatch, light/standard/thorough verify) |
| `ultrawork` | Full specify -> blueprint -> execute pipeline (automated via Stop hooks) |
| `bugfix` | Root-cause diagnosis -> `requirements.md` -> `/execute` |
| `scaffold` | Greenfield architecture -> `requirements.md` -> `/execute` |
| `council` | Multi-perspective decision committee with Team Mode debate and step-back judge |
| `ralph` | Iterative DoD loop with Stop hook re-injection |
| `rulph` | Rubric-based evaluation loop with multi-model scoring |
| `scope` | Fast parallel change-scope analyzer |
| `discuss` | Socratic discussion (supports `--scored` for deep interview mode) |
| `mirror` | Echo back understanding for mutual confirmation |
| `check` | Pre-push validation against project rule checklists |
| `tribunal` | Three-way adversarial review (risk, value, feasibility) |
| `issue` | Structured GitHub issue creation with codebase impact analysis |
| `qa` | Systematic QA testing (browser/native/CLI/shell) |
| `browser-work` | Recon-first browser automation with chromux |
| `deep-interview` | Deep requirements interview (merged into `discuss --scored`) |

---

## Agents

| Agent | Role |
|-------|------|
| `worker` | Implementation agent; code writing, bug fixes, test writing |
| `git-master` | Atomic commit specialist; detects project commit style |
| `code-reviewer` | Cross-cutting diff review for integration issues |
| `qa-verifier` | Spec-driven QA verification (browser/cli/desktop/shell) |
| `verification-planner` | 2-axis verification strategy (auto/agent/manual x host/sandbox) |
| `verifier` | Independent sub-requirement verifier |
| `spec-coverage` | GWT citation enforcement for gate-2 double review |
| `debugger` | Root cause analysis; traces bugs backward through call stacks |
| `gap-analyzer` | Missing requirements detection before plan generation |
| `code-explorer` | Read-only codebase search specialist |
| `contract-deriver` | Blueprint Phase 1: derives interface contracts from requirements |
| `taskgraph-planner` | Blueprint Phase 2: builds task graph with dependencies |
| `verify-planner` | Blueprint Phase 4: creates verification plan |

---

## CLI

The plugin ships `hoyeon-cli2` (npm: `@team-attention/hoyeon-cli`) for structured data management.

| Command Group | Purpose |
|---------------|---------|
| `req` | Requirements management (read/merge `requirements.md`) |
| `plan` | Plan management (read/update `plan.json`, task status) |
| `learning` | Structured learnings (record, search via BM25) |
| `issue` | Structured issue tracking |
| `session` | Session state management |

Key conventions:
- File-based JSON passing via heredoc (`<< 'EOF'`) to avoid shell glob issues
- Task status updates: `hoyeon-cli plan status <task-id> <plan-path> --status <state>`
- Monotonic done-lock prevents re-opening completed tasks

---

## Hooks

| Script | Type | Purpose |
|--------|------|---------|
| `cli-version-sync.sh` | SessionStart | Auto-sync hoyeon-cli npm version with plugin version |
| `session-compact-hook.sh` | SessionStart | Recover skill name and state.json path after compaction |
| `ultrawork-init-hook.sh` | UserPromptSubmit | Initialize ultrawork pipeline state when `/ultrawork` is typed |
| `skill-session-init.sh` | UserPromptSubmit + PreToolUse[Skill] | Initialize session state for specify/execute skills |
| `rv-detector.sh` | UserPromptSubmit | Detect `!rv` keyword to trigger re-validation loop |
| `rulph-init.sh` | PreToolUse[Skill] | Initialize rulph loop state on skill invocation |
| `skill-session-guard.sh` | PreToolUse[Edit\|Write] | Plan guard (specify) / orchestrator guard (execute) |
| `ralph-dod-guard.sh` | PreToolUse[Edit\|Write] | Enforce DoD before allowing writes in /ralph loop |
| `validate-output.sh` | PostToolUse[Task\|Skill] | Validate agent/skill output against `validate_prompt` frontmatter |
| `tool-output-truncator.sh` | PostToolUse[Grep\|Glob\|WebFetch\|Bash] | Truncate oversized tool output (50K/10K limits) |
| `edit-error-recovery.sh` | PostToolUseFailure[Edit\|Write] | Detect Edit failures and inject recovery guidance |
| `large-file-recovery.sh` | PostToolUseFailure[Read] | Suggest chunked read or Grep for large/binary files |
| `tool-failure-tracker.sh` | PostToolUseFailure[*] | Track repeated failures per tool; escalate at 3/5 in 60s |
| `ultrawork-stop-hook.sh` | Stop | Advance ultrawork pipeline to next stage |
| `skill-session-stop.sh` | Stop | Block exit if execute has incomplete tasks (circuit breaker: 30 iter) |
| `rv-validator.sh` | Stop | Run re-validation pass on stop |
| `rulph-stop.sh` | Stop | Handle rulph loop termination |
| `ralph-stop.sh` | Stop | Ralph loop DoD verification and prompt re-injection |
| `skill-session-cleanup.sh` | SessionEnd | Clean up session directory (`~/.hoyeon/{session_id}/`) |

---

## Patterns

### Requirements-Driven Development

All implementation flows through `requirements.md` -- a structured document containing requirements with sub-requirements expressed in GWT (Given/When/Then) format. The CLI (`hoyeon-cli2`) manages requirements and plan state. `/blueprint` transforms requirements into an executable `plan.json` with `contracts.md` defining interface boundaries between tasks.

### 3-Axis Configuration (Execute)

The execute orchestrator supports three independent configuration axes:
- **Dispatch**: `direct` (orchestrator implements), `agent` (worker subagents with module grouping), `team` (TeamCreate persistent workers with claim-based assignment)
- **Work**: `worktree` (git worktree isolation), `branch` (branch-per-task), `no-commit` (in-place)
- **Verify**: `light` (build/lint only), `standard` (spec-based + code review), `thorough` (standard + cross-task + QA sandbox)

### Hook-Guarded Writes

The `skill-session-guard.sh` hook intercepts every `Edit` and `Write` tool call during specify and execute sessions. During specify, it prevents the orchestrator from writing code (planning only). During execute, it prevents the orchestrator from writing implementation directly (must delegate to worker agents). This enforces the separation of concerns between planning, orchestrating, and implementing.

### Contract-First Planning

`/blueprint` derives interface contracts (`contracts.md`) before building the task graph. Each task declares which contracts it produces and consumes. Workers receive contract paths and IDs in their charter -- never inlined content -- ensuring clean separation between orchestrator and worker concerns.

### DAG-Based Parallel Execution

Tasks in `plan.json` declare dependencies via `depends_on`. The execute orchestrator resolves these into a DAG and runs independent tasks in parallel. In agent mode, tasks are grouped by module for round-level commits. In team mode, workers claim tasks longest-deps-first.

### Stop Hook Re-injection (Ralph Pattern)

The `/ralph` skill uses the Stop hook to re-inject prompts into the session. When the agent tries to stop, `ralph-stop.sh` checks whether the Definition of Done is satisfied. If not, it outputs a continuation prompt that keeps the agent working. A circuit breaker (max iterations) prevents infinite loops.

### Validate-on-Complete

The `validate-output.sh` PostToolUse hook fires after every Task or Skill completion. It reads the `validate_prompt` from the agent/skill frontmatter and outputs it as a reminder, prompting the orchestrator to verify the output meets stated criteria before proceeding.
