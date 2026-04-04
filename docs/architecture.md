# Architecture

## Overview

Hoyeon is a Claude Code plugin that implements a **specify-then-execute** development pipeline. The core idea: separate planning from implementation so that each phase can be independently validated, parallelized, and guarded by hooks.

1. **Specify** -- An interview-driven skill generates a `spec.json` (v5 schema) describing tasks, acceptance criteria, requirements, and constraints.
2. **Execute** -- A spec-driven orchestrator reads `spec.json`, dispatches worker agents in parallel (DAG-based), and runs verification after each task.
3. **Hooks** -- Shell scripts registered in `.claude/settings.json` enforce guardrails at every lifecycle event: blocking premature writes, validating outputs, and auto-advancing the pipeline.

The plugin also ships standalone skills (council, bugfix, ralph, scope, etc.) that can be invoked independently outside the specify/execute pipeline.

---

## Pipeline Diagram

```
  User Request
       |
       v
 +------------+     spec.json      +------------+
 |  /specify   | -----------------> |  /execute   |
 |             |   (v5 schema)      |             |
 | interview   |                    | read spec   |
 | research    |                    | route by    |
 | gap analysis|                    |  meta.type  |
 | AC quality  |                    |             |
 |   gate      |                    +------+------+
 +-------------+                           |
                                           v
                                  +--------+--------+
                                  | DAG Scheduler    |
                                  | (parallel rounds)|
                                  +--------+--------+
                                           |
                          +----------------+----------------+
                          |                |                |
                          v                v                v
                     +---------+     +---------+     +---------+
                     | worker  |     | worker  |     | worker  |
                     | agent   |     | agent   |     | agent   |
                     +----+----+     +----+----+     +----+----+
                          |                |                |
                          v                v                v
                     +---------+     +---------+     +---------+
                     | verify  |     | verify  |     | verify  |
                     +---------+     +---------+     +---------+
                          |                |                |
                          +--------+-------+-------+--------+
                                   |               |
                                   v               v
                            +------+------+  +-----+------+
                            | git-master  |  |Final Verify|
                            |  (commit)   |  | (holistic) |
                            +-------------+  +------------+
                                                    |
                                                    v
                                              Final Report

  /ultrawork = /specify --> Stop hook --> /execute (fully automated)
```

### Hook Lifecycle Within a Session

```
  SessionStart
       |  session-compact-hook.sh (recover state after compaction)
       v
  UserPromptSubmit
       |  skill-hint-hook.sh, ultrawork-init-hook.sh,
       |  skill-session-init.sh, rv-detector.sh
       v
  PreToolUse
       |  [Skill]  skill-session-init.sh, rulph-init.sh
       |  [Edit|Write]  skill-session-guard.sh, ralph-dod-guard.sh
       v
  PostToolUse
       |  [Task|Skill]  validate-output.sh
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
| `specify` | Interview-driven spec generator; outputs spec.json v5 via CLI |
| `execute` | Spec-driven orchestrator; routes by meta.type, dispatches worker agents |
| `ultrawork` | Automated end-to-end pipeline chaining specify then execute via Stop hooks |
| `quick-plan` | Lightweight task planning with DAG output and optional spec.json generation |
| `bugfix` | Root-cause-based one-shot bug fix: debugger diagnosis, spec generation, execute |
| `council` | Multi-perspective decision committee with Team Mode debate and step-back judge |
| `ralph` | Iterative task loop with Definition of Done verification and Stop hook re-injection |
| `rulph` | Rubric-based evaluation and self-improvement loop with multi-model scoring |
| `scope` | Fast parallel change-scope analyzer (5+ concurrent agents) |
| `check` | Verification skill for validating changes (runs in fork context) |
| `tribunal` | Three-way adversarial review: risk, value, and feasibility perspectives |
| `discuss` | Free-form problem exploration and idea discussion |
| `mirror` | Paraphrase-back skill for confirming mutual understanding |
| `stepback` | One-shot perspective reset that surfaces blind spots mid-work |
| `deep-interview` | Multi-round Socratic interview for requirement clarification |
| `deep-research` | Parallel web research with browser-explorer and WebSearch agents |
| `google-search` | Google search via real Chrome browser (chromux) |
| `browser-work` | Recon-first browser automation with chromux and browser-explorer agent |
| `reference-seek` | Find reference implementations and similar open-source projects |
| `dev-scan` | Aggregate developer community opinions (Reddit, HN, Dev.to, etc.) |
| `tech-decision` | Systematic multi-source research for technical decisions (A vs B) |
| `compound` | Document learnings and insights after completing work |
| `issue` | Structured GitHub issue creation with codebase impact analysis |
| `skill-session-analyzer` | Analyze and evaluate past skill session logs |

---

## Agents

| Agent | Role |
|-------|------|
| `worker` | Implementation agent; handles code writing, bug fixes, and test writing |
| `code-explorer` | Read-only codebase search specialist; finds files, patterns, and relationships |
| `code-reviewer` | Multi-model code reviewer (Gemini, Codex, Claude in parallel) |
| `debugger` | Root cause analysis specialist; traces bugs backward through call stacks |
| `git-master` | Git commit specialist; enforces atomic commits and detects project style |
| `verification-planner` | Builds verification strategy with A-items (Agent), H-items (Human), S-items (Sandbox) |
| `gap-analyzer` | Identifies missing requirements and potential pitfalls before plan generation |
| `interviewer` | Socratic interviewer; questions only, no code |
| `browser-explorer` | Controls real Chrome browser via chromux (CDP); parallel-safe with isolated tabs |
| `docs-researcher` | Searches project internal docs for architecture decisions and conventions |
| `external-researcher` | Researches external libraries and best practices via web search |
| `tradeoff-analyzer` | Evaluates changes for risk level, simpler alternatives, and over-engineering |
| `ux-reviewer` | Evaluates how proposed changes affect existing user experience |
| `ralph-verifier` | Independent DoD verifier for /ralph; runs in separate context to avoid self-verification bias |
| `codex-risk-analyst` | Codex-powered risk analyst for /tribunal |
| `codex-strategist` | Codex-powered strategist; synthesizes multiple analysis reports |
| `feasibility-checker` | Feasibility evaluator for /tribunal |
| `value-assessor` | Value/impact assessor for /tribunal |

---

## Hooks

| Script | Type | Matcher | Purpose |
|--------|------|---------|---------|
| `session-compact-hook.sh` | SessionStart | `compact` | Recover skill name and state.json path after context compaction |
| `skill-session-cleanup.sh` | SessionEnd | (all) | Clean up session directory (`~/.hoyeon/{session_id}/`) |
| `skill-hint-hook.sh` | UserPromptSubmit | (all) | Surface relevant skill suggestions based on user input |
| `ultrawork-init-hook.sh` | UserPromptSubmit | (all) | Initialize ultrawork pipeline state when `/ultrawork` is typed |
| `skill-session-init.sh` | UserPromptSubmit + PreToolUse | (all) / `Skill` | Initialize session state for specify/execute skills |
| `rv-detector.sh` | UserPromptSubmit | (all) | Detect `!rv` keyword to trigger re-validation loop |
| `rulph-init.sh` | PreToolUse | `Skill` | Initialize rulph loop state on skill invocation |
| `skill-session-guard.sh` | PreToolUse | `Edit\|Write` | Plan guard (specify) / orchestrator guard (execute) -- blocks direct writes |
| `ralph-dod-guard.sh` | PreToolUse | `Edit\|Write` | Enforce Definition of Done before allowing writes in /ralph loop |
| `validate-output.sh` | PostToolUse | `Task\|Skill` | Validate agent/skill output against `validate_prompt` frontmatter |
| `ultrawork-stop-hook.sh` | Stop | (all) | Advance ultrawork pipeline to next stage on session stop |
| `skill-session-stop.sh` | Stop | (all) | Block exit if execute has incomplete tasks (circuit breaker: 30 iterations) |
| `rv-validator.sh` | Stop | (all) | Run re-validation pass on stop |
| `rulph-stop.sh` | Stop | (all) | Handle rulph loop termination |
| `ralph-stop.sh` | Stop | (all) | Ralph loop DoD verification and prompt re-injection |

---

## Patterns

### Spec-Driven Development

All implementation flows through `spec.json` -- a schema-validated contract that contains tasks, acceptance criteria, requirements, constraints, and verification strategy. The CLI (`hoyeon-cli`) owns spec creation and mutation; skills never hand-write JSON. This guarantees structural validity and enables machine-readable task orchestration.

### Hook-Guarded Writes

The `skill-session-guard.sh` hook intercepts every `Edit` and `Write` tool call during specify and execute sessions. During specify, it prevents the orchestrator from writing code (planning only). During execute, it prevents the orchestrator from writing implementation directly (must delegate to worker agents). This enforces the separation of concerns between planning, orchestrating, and implementing.

### DAG-Based Parallel Execution

Tasks in `spec.json` declare dependencies. The execute orchestrator resolves these into a DAG and runs independent tasks in parallel rounds using `run_in_background: true`. Each round waits for all tasks to complete before starting the next round of unblocked tasks.

### Worktree Isolation

Parallel worker agents can operate in separate git worktrees (via `EnterWorktree`/`ExitWorktree` tools) to avoid file conflicts. Each worker gets an isolated copy of the repository, and changes are merged back after task completion.

### Stop Hook Re-injection (Ralph Pattern)

The `/ralph` skill uses the Stop hook to re-inject prompts into the session. When the agent tries to stop, `ralph-stop.sh` checks whether the Definition of Done is satisfied. If not, it outputs a continuation prompt that keeps the agent working. A circuit breaker (max iterations) prevents infinite loops.

### Multi-Model Parallel Review

Several skills (council, code-reviewer, rulph, tribunal) dispatch the same artifact to multiple models (Claude, Codex, Gemini) in parallel, then synthesize the results. This provides diverse perspectives and reduces single-model blind spots.

### Validate-on-Complete

The `validate-output.sh` PostToolUse hook fires after every Task or Skill completion. It reads the `validate_prompt` from the agent/skill frontmatter and outputs it as a reminder, prompting the orchestrator to verify the output meets stated criteria before proceeding.
