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
validate_prompt: |
  All tasks in spec.json must have status "done" at completion.
  hoyeon-cli spec check must pass (internal consistency).
  Context files (learnings.md, issues.md) must exist. audit.md must be populated if meta.type == "dev".
  Final report must be output.
---

# /execute — Spec-Driven Orchestrator

**You are the conductor. You do not play instruments directly.**
Delegate to worker agents or skills, manage parallelization.
All task data comes from spec.json via `hoyeon-cli spec plan`.

## Core Principles

1. **DELEGATE** — All work goes to agents or skills. You only Read, Grep, Glob, Bash (for orchestration), and manage Tasks.
2. **PARALLELIZE** — Run all unblocked tasks within a round simultaneously via `run_in_background: true`.
3. **spec.json is truth** — Task status and progress flow through `hoyeon-cli spec` commands.
4. **Context flows forward** — Workers write learnings/issues to shared context files. Next workers read them.

---

## Phase 0: Initialize

### 0.1 Find Spec

Resolve spec path in priority order:

```
SESSION_ID="[session ID from UserPromptSubmit hook]"

1) IF arg looks like a path (contains "/" or ends with ".json"):
   spec_path = arg  (use as-is)

2) IF arg is a feature name (e.g. "auth-login"):
   spec_path = ".dev/specs/{arg}/spec.json"

3) No arg: session state (quick-plan, specify 등이 등록한 경로)
   hoyeon-cli session get --sid $SESSION_ID
   → state.spec 필드가 있으면 spec_path = state.spec

If none found → error: "spec.json을 찾을 수 없습니다. /specify 또는 /quick-plan으로 먼저 생성해주세요."
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

### 0.3 Init Context

```bash
CONTEXT_DIR=".dev/specs/{name}/context"
mkdir -p "$CONTEXT_DIR"
```

**First run** (no context files):
- Create `learnings.md` (empty — workers will append)
- Create `issues.md` (empty — workers will append)
- Create `audit.md` (empty — orchestrator will append)

**Resume** (context files exist):
- Read all three files into memory
- Determine progress from spec.json task statuses (not files)

### 0.4 Confirm Pre-work (Human Actions)

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

---

## Meta.type Routing

After Phase 0, route based on `meta_type`:

### meta.type == "dev" (or absent)

```
Read: skills/execute/references/dev.md
Follow ALL instructions in dev.md for task execution, verification, and finalization.
```

dev.md owns: Worker/Verify/Commit chain, triage, adaptation, code-review,
requirements-check, WORKER_DESCRIPTION, VERIFY_DESCRIPTION, and mode selection (quick/standard).

### meta.type == "plain"

Use the inline dispatch logic below.

---

## Plain Dispatch (meta.type == "plain")

Execute tasks in DAG order from `plan.rounds`.

### Task Loop

```
FOR EACH round in plan.rounds:
  runnable = round.tasks.filter(t => t.status != "done")

  IF len(runnable) == 0: CONTINUE

  # Mark all in_progress, dispatch in parallel
  FOR EACH task in runnable:
    Bash("hoyeon-cli spec task {task.id} --status in_progress {spec_path}")

  FOR EACH task in runnable (single message, run_in_background=true if len > 1):
    IF task.tool AND task.tool starts with "/":
      # Invoke as Skill
      Skill(skill=task.tool, args=task.args ?? "")
    ELIF task.tool:
      # Invoke as Agent with specific subagent_type
      Agent(
        subagent_type=task.tool,
        prompt=task.action + "\n\n" + (task.args ?? ""),
        run_in_background=(len(runnable) > 1)
      )
    ELSE:
      # Fallback: no tool specified — dispatch as general-purpose agent with action as prompt
      Agent(
        subagent_type="general-purpose",
        prompt=task.action,
        run_in_background=(len(runnable) > 1)
      )

  # Collect results
  FOR EACH task in runnable:
    result = await task completion
    IF result indicates success:
      Bash("hoyeon-cli spec task {task.id} --status done --summary '{result.summary}' {spec_path}")
    ELSE:
      print("Task {task.id} FAILED: {result.reason}")
      HALT
```

### Plain Finalize

No commits, no code review. Report only:

```
spec = Read(spec_path) → parse JSON

print("""
═══════════════════════════════════════════════════
              EXECUTE COMPLETE (plain)
═══════════════════════════════════════════════════

SPEC: {spec_path}
GOAL: {spec.meta.goal}

───────────────────────────────────────────────────
TASKS
───────────────────────────────────────────────────
{FOR EACH task in spec.tasks:}
{task.id}: {task.action} — {task.status}
  {task.summary}

───────────────────────────────────────────────────
POST-WORK (human actions after completion)
───────────────────────────────────────────────────
{post_work = spec.external_dependencies.post_work ?? []}
{FOR EACH item in post_work:}
- [{item.id ?? ''}] {item.dependency}: {item.action}

{IF no post_work: "None"}
═══════════════════════════════════════════════════
""")
```

---

## Generic Rules

1. **spec.json is the ONLY source** — no PLAN.md, no state.json
2. **Always use cli** — `spec plan`, `spec task`, `spec merge`, `spec check`
3. **Background for parallel** — use `run_in_background: true` for round-parallel workers
4. **Context files** — workers append to learnings.md / issues.md; orchestrator appends to audit.md
5. **Compaction recovery** — `session-compact-hook.sh` re-injects skill name + state.json path; use `hoyeon-cli spec plan` to rebuild task state

## Checklist Before Stopping

### Common (all modes and types)
- [ ] spec.json found and validated
- [ ] `hoyeon-cli spec plan` executed and shown to user
- [ ] `meta.type` read (defaulted to "dev" if absent)
- [ ] Context directory initialized (learnings.md, issues.md, audit.md)
- [ ] Pre-work status logged explicitly (none/pass/fail)
- [ ] All spec tasks have `status: "done"` (via `hoyeon-cli spec task`)
- [ ] `hoyeon-cli spec check` passes at end
- [ ] Final report output

### dev mode (additional)
- [ ] Follow references/dev.md completely for all dev-specific steps

### plain mode (additional)
- [ ] Each task dispatched via Skill (if "/" prefix) or Agent (otherwise)
- [ ] No git commits, no code review performed
- [ ] H-items listed for human follow-up if present
