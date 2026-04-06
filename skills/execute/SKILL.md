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
  All tasks in spec.json must have status "done" at completion.
  hoyeon-cli spec check must pass (internal consistency).
  Context files (learnings.json, issues.json, audit.md) are created at init for meta.type == "dev".
  Verify recipe must run (all modes and types).
  Final report must be output.
  TDD mode is OFF by default (--tdd to enable). tdd flag must be passed to WORKER_DESCRIPTION.
---

# /execute — Spec-Driven Orchestrator

**You are the conductor. You do not play instruments directly.**
Delegate to worker agents or skills, manage parallelization.
All task data comes from spec.json via `hoyeon-cli spec plan`.

## Core Principles

1. **DELEGATE** — In agent/team mode, all work goes to worker agents. In direct mode, the orchestrator executes tasks itself. In plain mode, the orchestrator may handle tasks directly or delegate. You only use Read, Grep, Glob, Bash (for orchestration), and Task tools for coordination.
2. **PARALLELIZE** — Run all unblocked tasks within a round simultaneously via `run_in_background: true`.
3. **spec.json is truth** — Task status and progress flow through `hoyeon-cli spec` commands.
4. **Context flows forward** — Workers write learnings/issues to shared context files. In agent mode, after each round the orchestrator collects DONE summaries into `round-summaries.json`. Next-round workers read all context files including prior round summaries.

---

## Phase 0: Initialize

### 0.1 Find Spec

Resolve spec path in priority order:

```
SESSION_ID="[session ID from UserPromptSubmit hook]"

1) IF arg looks like a path (contains "/" or ends with ".json"):
   spec_path = arg  (use as-is)

2) IF arg is a feature name (e.g. "auth-login"):
   spec_path = ".hoyeon/specs/{arg}/spec.json"

3) No arg: session state (path registered by quick-plan, specify, etc.)
   hoyeon-cli session get --sid $SESSION_ID
   → if state.spec field exists, spec_path = state.spec

If none found → error: "spec.json not found. Please generate one first with /specify or /quick-plan."
```

Read spec.json and validate:

```bash
hoyeon-cli spec validate {spec_path}
hoyeon-cli spec check {spec_path}
```

**Read `spec.meta.type`** (default `"dev"` if absent):

```
meta_type = spec.meta.type ?? "dev"
```

### 0.2 Get Execution Plan

```bash
plan_text = Bash("hoyeon-cli spec plan {spec_path}")
plan_json = Bash("hoyeon-cli spec plan {spec_path} --format slim")
plan = JSON.parse(plan_json)
```

Display plan_text to user. Filter out already-done tasks:

```
FOR EACH round in plan.rounds:
  round.tasks = round.tasks.filter(t => t.status != "done")
plan.rounds = plan.rounds.filter(r => r.tasks.length > 0)
```

### 0.3 Plan Analysis

Analyze the execution plan to generate recommendations for the user.

```
parallel_tasks = count tasks in round 1 (or largest round)
total_tasks = plan.total_tasks
solo_candidates = tasks where action implies single-file change (config, rename, simple edit)
groupable = find tasks touching same directory/module (no dependency between them)

Print analysis:
  ═══ ANALYSIS ═══
  Tasks: {total_tasks} | Rounds: {plan.total_rounds} | Max parallelism: {parallel_tasks}
  Solo candidates: {solo_candidates or "none"}
  Groupable: {groupable or "none"}
```

### 0.4 Sandbox Detection

Auto-detect sandbox capabilities from the project and system via 3-tier detection.

```
Read: ${baseDir}/references/sandbox-detection.md
Follow ALL instructions for tiered detection, reporting, and install recommendations.
```

Detection tiers: (1) project config files → (2) system CLI tools → (3) MCP tool probing.
Tier 3 (MCP) is critical — skipping it causes false negatives (e.g., computer-use MCP miss).

Install recommendations are shown only when `verify == "thorough"` AND tools are missing.

### 0.5 Configuration

#### Resolve from CLI flags first

```
dispatch = --dispatch flag ?? null
work = --work flag ?? null
verify = --verify flag ?? null
```

#### Recommendations

```
recommend_dispatch =
  IF total_tasks <= 2 AND all solo_candidates: "Direct"
  ELIF total_tasks >= 3 AND parallel_tasks >= 3: "Team"
  ELSE: "Agent"

recommend_verify =
  IF total_tasks <= 2: "Light"
  ELIF total_tasks >= 5 OR any task touches auth/crypto/security: "Thorough"
  ELSE: "Standard"
```

#### AskUserQuestion (skip if CLI flag provided)

```
IF dispatch is null:
  dispatch = AskUserQuestion(
    question: "Dispatch mode?",
    options: [
      { label: "Direct", description: "Orchestrator executes directly, no subagents" },
      { label: "Agent", description: "Worker subagents with task grouping" },
      { label: "Team", description: "TeamCreate persistent workers, claim-based" }
    ]
    # Mark recommended with "(Recommended)" in label
  )

IF work is null:
  work = AskUserQuestion(
    question: "Work mode?",
    options: [
      { label: "Worktree", description: ".worktrees/{name} branch, commit per round" },
      { label: "Branch + Commit", description: "Current branch, commit per round" },
      { label: "No Commit", description: "Current branch, no commits" }
    ]
  )

IF verify is null:
  verify = AskUserQuestion(
    question: "Verify depth?",
    options: [
      { label: "Light", description: "Build/lint + spec check only" },
      { label: "Standard", description: "Full spec verification (goal, constraints, sub-reqs)" },
      { label: "Thorough", description: "Standard + Code Review + cross-task + sandbox" },
      { label: "Ralph", description: "Standard verify + persistent DoD loop until all sub-reqs pass" }
    ]
    # If no sandbox detected: add "(no sandbox)" to Thorough description
  )
```

#### Save to spec.json

```bash
Bash("hoyeon-cli spec merge {spec_path} --json '{\"meta\": {\"mode\": {\"dispatch\": \"{dispatch}\", \"work\": \"{work}\", \"verify\": \"{verify}\"}}}'")
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

### 0.6 Confirm Pre-work (Human Actions)

Pre-work items are **human tasks** that must be completed before execution begins.

```
pre_work = spec.external_dependencies.pre_work ?? []
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

### 0.7 Init Context

```bash
CONTEXT_DIR=".hoyeon/specs/{name}/context"
mkdir -p "$CONTEXT_DIR"
```

**First run** (no context files):
- Create `audit.md` (empty — orchestrator will append)
- Create `learnings.json` with `[]` (empty array — workers append via CLI)
- Create `issues.json` with `[]` (empty array — workers append via CLI)

**Resume** (context files exist):
- Read all three files into memory
- Determine progress from spec.json task statuses (not files)

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

1. **spec.json is the ONLY source** — no PLAN.md, no state.json
2. **Always use cli** — `spec plan`, `spec task`, `spec merge`, `spec check`
3. **TaskCreate for all modes** — create Claude Code tracking tasks before execution begins. Structure differs per mode (see each reference md).
4. **Background for parallel** — use `run_in_background: true` for round-parallel workers
5. **Context files (dev only)** — in dev mode, workers write to learnings.json / issues.json via CLI; orchestrator appends to audit.md. Plain mode does not use context files.
6. **Compaction recovery** — `session-compact-hook.sh` re-injects skill name + state.json path; use `hoyeon-cli spec plan` to rebuild task state
7. **Dispatch mode, work mode, and verify depth saved to spec.json meta.mode**
8. **Verify depth routes to verify-light.md, verify-standard.md, verify-thorough.md, or verify-ralph.md**

## Checklist Before Stopping

### Common (all modes and types)
- [ ] spec.json found and validated
- [ ] `hoyeon-cli spec plan` executed and shown to user
- [ ] `meta.type` read (defaulted to "dev" if absent)
- [ ] Plan analysis ran (parallelism, solo candidates, groupable)
- [ ] Sandbox detection ran (Phase 0.4)
- [ ] Dispatch mode selected and routed correctly
- [ ] Verify depth selected and routed correctly
- [ ] `meta.mode` saved to spec.json (dispatch, work, verify)
- [ ] Context directory initialized (audit.md, learnings.json, issues.json, round-summaries.json)
- [ ] Pre-work status logged explicitly (none/pass/fail)
- [ ] TaskCreate entries created for all tasks + finalize steps (structure per mode reference)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
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
