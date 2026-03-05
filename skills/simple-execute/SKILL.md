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

### Step 2: Identify Pending Tasks

From state.json, find tasks with `status != "done"`.
From spec.json, read each task's `action`, `steps`, `file_scope`, `depends_on`.

Skip tasks whose `depends_on` are not all "done" in state.json.

```
pending = []
FOR EACH task in state.tasks:
  IF task.status != "done":
    spec_task = find spec.tasks where id == task.id
    IF spec_task.depends_on all "done" in state:
      pending.append(spec_task)
```

### Step 3: Execute Tasks (Sequential)

For each runnable task, dispatch a worker agent:

```
FOR EACH task in pending (ordered by id):
  IF task.type == "work":
    # Delegate to worker
    result = Task(subagent_type="worker", prompt="""
      ## TASK
      {task.action}

      ## STEPS
      {task.steps joined by newline, or "Implement as appropriate" if empty}

      ## FILE SCOPE
      {task.file_scope joined by newline, or "Determine appropriate files"}

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
      # Log failure, halt execution
      print("Task {task.id} failed: {result.summary}")
      HALT

  ELIF task.type == "verification":
    # Run verification directly (no worker needed)
    # Check that all work tasks are done
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

```
═══════════════════════════════════════════════════
              SIMPLE-EXECUTE COMPLETE
═══════════════════════════════════════════════════

SPEC: {spec_path}
GOAL: {spec.meta.goal}

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
