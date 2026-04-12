---
name: execute
description: |
  Spec-driven orchestrator that reads spec.json via cli, routes by meta.type,
  and dispatches agents/skills accordingly.
  spec.json-native execution (no PLAN.md).
  Use when: "/execute", "execute", "실행해줘", "스펙 실행"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Edit
  - Write
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - TaskOutput
  - AskUserQuestion
  - EnterWorktree
  - ExitWorktree
  - TeamCreate
  - TeamDelete
  - SendMessage
validate_prompt: |
  Spec path must come from CLI argument (no session fallback).
  Phase 0 must normalize spec once via Read tool (not hoyeon-cli spec read commands).
  plan.json must be created in spec's directory unless --ephemeral is set.
  --ephemeral + --dispatch team combination must be rejected with error.
  If plan.json already exists, user must be prompted (resume/fresh/abort).
  All tasks in plan.json must have status "done" at completion.
  Verify recipe must run (all modes and types).
  Final report must be output.
  TDD mode is OFF by default (--tdd to enable). tdd flag must be passed to WORKER_DESCRIPTION.
---

# /execute — Spec-Driven Orchestrator

**You are the conductor. You do not play instruments directly.**
Delegate to worker agents or skills, manage parallelization.
Spec is read once via the Read tool (normalized_spec cache); task data lives in plan.json via `hoyeon-cli plan`.

## Core Principles

1. **DELEGATE** — In agent/team mode, all work goes to worker agents. In direct mode, the orchestrator executes tasks itself. In plain mode, the orchestrator may handle tasks directly or delegate. You only use Read, Grep, Glob, Bash (for orchestration), and Task tools for coordination.
2. **PARALLELIZE** — Run all unblocked tasks within a round simultaneously via `run_in_background: true`.
3. **plan.json is the task ledger** — Task status flows through `hoyeon-cli plan` commands; spec is read once by the orchestrator.
4. **Context flows forward** — Workers write learnings/issues to shared context files. In agent mode, after each round the orchestrator collects DONE summaries into `round-summaries.json`. Next-round workers read all context files including prior round summaries.

---

## Phase 0: Initialize

### 0.0 Parse CLI Arguments (R13)

Read the slash-command invocation (e.g. `/execute <spec-path> [flags]`).

**Required positional arg**: spec path. If missing → print and abort:

```
spec path required
Usage: /execute <spec-path> [--ephemeral] [--tdd]
```

**There is no `hoyeon-cli session` fallback** (D16). The user must pass the spec path explicitly.

**Flags**:

| Flag | Values | Default |
|------|--------|---------|
| `--ephemeral` | boolean | false |
| `--tdd` | boolean | false |

`work`, `dispatch`, and `verify` are **always** prompted via AskUserQuestion at Phase 0.6 (in that order). No flags.

**Mode exclusivity (R8.1, C6)**: If `--ephemeral` is set and the user picks `team` at the dispatch prompt → print error `"ephemeral and team modes are mutually exclusive"` and abort. **No files are written.**

### 0.1 Normalize Spec (R1, C1, C9)

Read the spec file **directly via the Read tool** — do NOT call `hoyeon-cli spec` read commands (C1).

Detect format:

| Extension | Detection | Handling |
|-----------|-----------|----------|
| `.json` with `schema_version: "v2"` | parse JSON as-is | use requirements / verification / constraints trees directly |
| `.md` | LLM interprets | look for `## Requirements`, `## Sub` or `### R1.1`-style headings, `## Verification Journeys`; extract into the canonical shape below |
| other | LLM best-effort | same three sections extracted if discoverable |

Canonical `normalized_spec` shape (stored in session memory):

```
{
  meta,
  requirements: [
    { id, behavior, sub: [{ id, behavior, given, when, then }] }
  ],
  verification: { journeys: [{ id, name, composes, given, when, then }] },
  constraints: [{ id, rule }]
}
```

**R1.3 fail-fast**: If extraction yields no `requirements` or parsing fails, print `"spec interpretation failed at <spec_path>: <reason>"` and abort **without** creating plan.json.

**R1.4 cache rule**: Downstream phases (derive-plan, dispatch recipes, verify recipes) MUST read from `normalized_spec` in session memory. They must NOT re-Read the spec file.

Optional: if spec is a hoyeon v2 `spec.json`, run `hoyeon-cli spec validate <spec_path>` to surface schema issues (this is a write/validation command, allowed under C1 which only forbids read-purpose calls).

### 0.2 Resolve plan.json Path and Handle Existing Plan (R2, R3)

```
plan_path = dirname(spec_path) + "/plan.json"
```

**Ephemeral mode (R2.2, C5)**:
- Skip plan.json creation entirely. Skip derive-plan.
- Do NOT create `learnings.json` or `issues.json`.
- Record `ephemeral: true` in session state for the Stop hook (R11.3):
  ```bash
  STATE_FILE="$HOME/.hoyeon/$CLAUDE_SESSION_ID/state.json"
  if [ -f "$STATE_FILE" ]; then
    jq '.ephemeral = true' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi
  ```
- Dispatch recipes must keep all task state in orchestrator memory (no file writes).
- Proceed to 0.5 (Dispatch routing) — skip 0.3 and 0.4.

**plan.json already exists (R3.1)**:

```
AskUserQuestion(
  question: "plan.json found at {plan_path}. What do you want to do?",
  options: [
    { label: "Resume",  description: "Continue from pending/in_progress tasks (skip done)" },
    { label: "Fresh",   description: "Overwrite existing plan.json and re-derive from spec" },
    { label: "Abort",   description: "Stop execution" }
  ]
)
```

- **Resume** → skip 0.3 (derive-plan). Proceed to 0.4 validation then 0.5 dispatch.
- **Fresh** → continue to 0.3 (derive-plan overwrites existing plan.json).
- **Abort** → HALT.

**plan.json does not exist**: proceed to 0.3.

### 0.3 Derive Plan (R6)

```
Read: ${baseDir}/references/derive-plan.md
Follow ALL instructions to populate plan.json from `normalized_spec`.
```

Pass forward: `normalized_spec`, `plan_path`, `spec_path`.

### 0.4 Validate Plan

```bash
hoyeon-cli plan list "$plan_path" --json
```

Confirm the file is readable and contains tasks (non-empty for non-ephemeral).

### 0.5 Sandbox Detection

Auto-detect sandbox capabilities from the project and system via 3-tier detection.

```
Read: ${baseDir}/references/sandbox-detection.md
Follow ALL instructions for tiered detection, reporting, and install recommendations.
```

Detection tiers: (1) project config files → (2) system CLI tools → (3) MCP tool probing.
Tier 3 (MCP) is critical — skipping it causes false negatives (e.g., computer-use MCP miss).

Install recommendations are shown only when `verify == "thorough"` AND tools are missing.

### 0.6 Work Mode

`ephemeral` comes from Phase 0.0 flag. `work`, `dispatch`, `verify` are **always** asked via AskUserQuestion (in this exact order):

```
# 1) Work
work = AskUserQuestion(
  question: "Work mode?",
  options: [
    { label: "Worktree",        description: ".worktrees/{name} branch, commit per round" },
    { label: "Branch + Commit", description: "Current branch, commit per round" },
    { label: "No Commit",       description: "Current branch, no commits" }
  ]
)

# 2) Dispatch
dispatch = AskUserQuestion(
  question: "Dispatch mode?",
  options: [
    { label: "Agent",  description: "Worker subagents with task grouping (Recommended)" },
    { label: "Direct", description: "Orchestrator executes tasks directly (no subagents)" },
    { label: "Team",   description: "TeamCreate persistent workers (requires plan.json; incompatible with --ephemeral)" }
  ]
)

# If --ephemeral set AND dispatch == "team" → abort (mode exclusivity, R8.1/C6).

# 3) Verify
verify = AskUserQuestion(
  question: "Verify depth?",
  options: [
    { label: "Standard", description: "sub-req FV + journey static coverage (Recommended)" },
    { label: "Light",    description: "build/lint/typecheck only (no sub or journey verification)" },
    { label: "Thorough", description: "standard + runtime journey execution via qa-verifier" },
    { label: "Ralph",    description: "DoD loop mode (iterative, not task-based)" }
  ]
)
```

#### Save dispatch to session state

```bash
# Stop hook uses this to skip blocking when team workers are running
STATE_FILE="$HOME/.hoyeon/$CLAUDE_SESSION_ID/state.json"
IF file_exists(STATE_FILE):
  Bash("jq --arg d '{dispatch}' '.dispatch = $d' $STATE_FILE > $STATE_FILE.tmp && mv $STATE_FILE.tmp $STATE_FILE")
```

#### Worktree setup (only if work == "worktree")

```
IF work == "Worktree":
  spec_name = basename(dirname(spec_path))  # e.g. "auth-login"

  # Convert paths to absolute BEFORE entering worktree (CWD will change)
  spec_path = Bash("realpath {spec_path}").trim()
  CONTEXT_DIR = Bash("realpath {CONTEXT_DIR}").trim()

  # Use EnterWorktree to switch session CWD into the worktree
  EnterWorktree(name=spec_name)
  # Session CWD is now inside the worktree — all tools (Read, Edit, Write, Bash, Glob, Grep)
  # automatically operate in the worktree. No per-worker "cd" needed.

  print("Entered worktree: {spec_name}")
  print("spec_path (absolute): {spec_path}")
  print("CONTEXT_DIR (absolute): {CONTEXT_DIR}")
ELSE:
  # No worktree — work in current directory
```

**Variables forwarded to reference files:**
- `dispatch`: `"direct"` | `"agent"` | `"team"`
- `work`: `"worktree"` | `"branch-commit"` | `"no-commit"`
- `verify`: `"light"` | `"standard"` | `"thorough"` | `"ralph"`
- `spec_path`: absolute path (always — worktree mode converts it)
- `CONTEXT_DIR`: absolute path (always — worktree mode converts it)

### 0.8 Confirm Pre-work (Human Actions)

Pre-work items are **human tasks** that must be completed before execution begins. Read from `normalized_spec` (not spec file).

```
pre_work = normalized_spec.external_dependencies?.pre_work ?? []
IF len(pre_work) == 0:
  print("Pre-work: none found, skipping")
ELSE:
  print("Pre-work items (human actions required before execution):")
  FOR EACH item in pre_work:
    print("  - [{item.id ?? ''}] {item.dependency}: {item.action} (blocking={item.blocking})")

  FOR EACH item in pre_work WHERE item.blocking == true:
    AskUserQuestion(
      question: "Have you completed this pre-work? → {item.action}",
      options: [
        { label: "Done", description: "I've completed this" },
        { label: "Skip", description: "Proceed without this (may cause failures)" },
        { label: "Abort", description: "Stop execution — I need to do this first" }
      ]
    )
    IF answer == "Abort": HALT
```

### 0.7 Init Context (skip if --ephemeral)

If `--ephemeral` is set, skip this section entirely (C5: no plan/learnings/issues files on disk).

Otherwise, per D9/C4 `learnings.json` and `issues.json` live next to `plan.json` in the spec directory:

```bash
SPEC_DIR="$(dirname "$spec_path")"
CONTEXT_DIR="$SPEC_DIR"
mkdir -p "$CONTEXT_DIR"
```

**First run** (no context files):
- Create `$CONTEXT_DIR/audit.md` (empty — orchestrator will append)
- Create `$CONTEXT_DIR/learnings.json` with `[]` (workers append via `hoyeon-cli spec learning`)
- Create `$CONTEXT_DIR/issues.json` with `[]` (workers append via `hoyeon-cli spec issue`)

**Resume** (context files exist):
- Read all three files into memory
- Determine progress from **plan.json** task statuses via `hoyeon-cli plan list` (not spec.json — spec-v2 has no tasks[])

---

## Dispatch Routing

After Phase 0, route based on `dispatch` mode:

### dispatch == "direct"

```
Read: ${baseDir}/references/direct.md
Follow ALL instructions for direct execution.
```

### dispatch == "agent"

```
Read: ${baseDir}/references/dev.md
Follow ALL instructions in dev.md for agent-based execution with grouping.
```

dev.md owns: Worker/Commit chain, adaptation, code-review,
verify recipe, WORKER_DESCRIPTION, TDD mode, and mode selection (quick/standard).

### dispatch == "team"

```
Read: ${baseDir}/references/team.md
Follow ALL instructions for team-based execution.
```

### meta.type == "plain" (override)

```
IF meta.type == "plain":
  Read: ${baseDir}/references/plain.md
  (plain mode ignores dispatch selection — has its own flexible dispatch)
```

plain.md owns: flexible dispatch (direct/Skill/Agent), verify recipe, and report.

---

## Generic Rules

1. **Spec is read once via Read tool** — `normalized_spec` is the session-cached truth (C1, C9). No `hoyeon-cli spec` read calls.
2. **plan.json is the task ledger** — all task CRUD via `hoyeon-cli plan` (init/get/status/list/merge). Never via `hoyeon-cli spec task` (removed) and never by direct file writes from workers (C8).
3. **TaskCreate for all modes** — create Claude Code tracking tasks before execution begins. Structure differs per mode (see each reference md).
4. **Background for parallel** — use `run_in_background: true` for round-parallel workers
5. **Context files live next to plan.json** — `learnings.json` / `issues.json` / `audit.md` in the spec directory (D9/C4). Skipped entirely in ephemeral mode (C5).
6. **Compaction recovery** — `session-compact-hook.sh` re-injects skill name + state.json path; use `hoyeon-cli plan list` to rebuild task state
7. **Dispatch mode comes from CLI flag** (Phase 0.0); **verify depth and work mode are always prompted** at 0.6
8. **Verify depth routes to verify-light.md, verify-standard.md, verify-thorough.md, or verify-ralph.md**

## Checklist Before Stopping

### Common (all modes and types)
- [ ] Spec path came from CLI arg; `--ephemeral` + `--dispatch team` rejected early if combined
- [ ] Spec normalized exactly once via Read (no `hoyeon-cli spec` reads); stored as `normalized_spec` in session memory
- [ ] plan.json handled: created via derive-plan, resumed via AskUserQuestion, or skipped (ephemeral)
- [ ] `hoyeon-cli plan list` confirmed readable (non-ephemeral) / `ephemeral: true` written to session state (ephemeral)
- [ ] Sandbox detection ran (Phase 0.5)
- [ ] Dispatch mode selected (flag or default) and routed correctly
- [ ] Verify depth selected (flag or default) and routed correctly
- [ ] Context files initialized in spec dir (skipped if ephemeral): audit.md, learnings.json, issues.json
- [ ] Pre-work status logged explicitly (none/pass/fail)
- [ ] TaskCreate entries created for all tasks + finalize steps (structure per mode reference)
- [ ] All plan tasks have `status: "done"` via `hoyeon-cli plan status` (skip for ephemeral)
- [ ] Final report output

### dispatch == "agent" (additional)
- [ ] Follow ${baseDir}/references/dev.md completely for all agent-specific steps
- [ ] Worker descriptions use WORKER_DESCRIPTION template with tdd flag
- [ ] Worker BLOCKED status handled (scope fix derived task + re-worker)
- [ ] Verify recipe ran (holistic spec verification)

### dispatch == "team" (additional)
- [ ] Follow ${baseDir}/references/team.md completely for all team-specific steps
- [ ] TeamCreate used with persistent workers
- [ ] Claim-based task assignment verified
- [ ] Verify recipe ran (holistic spec verification)

### dispatch == "direct" (additional)
- [ ] Follow ${baseDir}/references/direct.md completely for all direct-specific steps
- [ ] Orchestrator executed tasks without subagents
- [ ] Verify recipe ran (holistic spec verification)

### plain mode (additional)
- [ ] Follow ${baseDir}/references/plain.md completely for all plain-specific steps
