---
name: simple-execute
description: |
  Lightweight executor driven by spec.json + state.json.
  Reads tasks from spec.json, delegates to workers, tracks progress via state.json.
  Use when: "/simple-execute", "간단한 실행", "simple execute", "spec 실행", "스펙 실행해줘"
validate_prompt: |
  All tasks in state.json must be status "done" at completion.
  dev-cli state check must pass (spec/state consistent).
---

# /simple-execute — Spec-Driven Lightweight Executor

Execute tasks defined in spec.json, track progress in state.json.

## When to Use

- After `/simple-specify` generated spec.json + state.json
- Simple tasks that don't need the full `/execute` orchestrator
- When you want spec.json as the source of truth (not PLAN.md)

## Flow

### Step 1: Find Spec

```
IF arg given:
  spec_path = ".dev/specs/{arg}/spec.json"
ELSE:
  # Find most recently modified spec.json
  spec_path = most recent .dev/specs/*/spec.json
```

Read spec.json and state.json from the same directory.

```
spec = Read(spec_path)
state_path = dirname(spec_path) + "/state.json"
state = Read(state_path)
```

If state.json doesn't exist, init it:
```bash
node dev-cli/bin/dev-cli.js state init --spec {spec_path} --output {state_path}
```

### Step 2: Build Execution Plan

Use `dev-cli spec plan` to get the DAG-based execution order:

```bash
plan_json = Bash("node dev-cli/bin/dev-cli.js spec plan {spec_path} --format json")
```

This returns rounds with parallel groups, critical path, etc.
Display the text plan to the user so they can see what will happen:

```bash
Bash("node dev-cli/bin/dev-cli.js spec plan {spec_path}")
```

Then filter out already-done tasks using state.json:

```
plan = JSON.parse(plan_json)
FOR EACH round in plan.rounds:
  round.tasks = round.tasks.filter(t => state.tasks[t.id].status != "done")
# Remove empty rounds
plan.rounds = plan.rounds.filter(r => r.tasks.length > 0)
```

### Step 3: Execute Rounds

Walk through rounds in order. Within each round, dispatch tasks sequentially (simple mode — no background agents).

```
FOR EACH round in plan.rounds:
  FOR EACH task in round.tasks:
    spec_task = find spec.tasks where id == task.id

    # Mark in-progress
    Bash("node dev-cli/bin/dev-cli.js state update {task.id} --status in_progress --state {state_path}")

    IF spec_task.type == "work":
      result = Task(subagent_type="worker", prompt="""
        ## TASK
        {spec_task.action}

        ## STEPS
        {spec_task.steps joined by newline, or "Implement as appropriate" if empty}

        ## FILE SCOPE
        {spec_task.file_scope joined by newline, or "Determine appropriate files"}

        ## MUST NOT DO
        - Do not run git commands
        - Do not modify files outside file_scope (if specified)

        ## OUTPUT FORMAT
        When done, respond with a JSON block:
        ```json
        {
          "status": "DONE" | "FAILED",
          "summary": "what was done",
          "files_modified": ["path1", "path2"]
        }
        ```
      """)

      IF result.status == "DONE":
        Bash("node dev-cli/bin/dev-cli.js state update {task.id} --status done --state {state_path}")
      ELSE:
        print("Task {task.id} failed: {result.summary}")
        HALT

    ELIF spec_task.type == "verification":
      Bash("node dev-cli/bin/dev-cli.js state check --spec {spec_path} --state {state_path}")
      IF exit_code == 0:
        Bash("node dev-cli/bin/dev-cli.js state update {task.id} --status done --state {state_path}")
      ELSE:
        print("Verification failed: state/spec mismatch")
        HALT
```

### Step 4: Commit

After all tasks complete, commit the changes:

```
Task(subagent_type="git-master", prompt="""
  Commit all changes from the spec: {spec.meta.goal}
  Spec name: {spec.meta.name}
""")
```

### Step 5: Report

Re-read state.json for final status, then report:

```
═══════════════════════════════════════════════════
              SIMPLE-EXECUTE COMPLETE
═══════════════════════════════════════════════════

SPEC: {spec_path}
GOAL: {spec.meta.goal}

PLAN: {plan.total_rounds} rounds, max {plan.max_parallel} parallel
CRITICAL PATH: {plan.critical_path joined by " → "}

TASKS:
  {task.id}: {task.action} — {status}
  ...

STATE: ✅ all tasks done | ⚠️ N tasks pending
═══════════════════════════════════════════════════
```

## Rules

- **No PLAN.md** — spec.json is the only input, state.json is the only tracker
- **No verify agent** — worker self-report trusted (like /execute --quick)
- **No reconciliation** — on failure, halt immediately
- **No parallel dispatch** — tasks run sequentially by ID order
- **Always update state** — every completed task updates state.json via dev-cli
- **Always commit** — use git-master at the end
- **Constraints check** — if spec has constraints, verify them before completing
