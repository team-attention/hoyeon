---
name: simple-execute
description: |
  Lightweight executor driven by unified spec.json (spec + state + history in one file).
  Uses dev-cli spec plan to build task DAG, creates tracking Tasks, dispatches workers.
  Use when: "/simple-execute", "간단한 실행", "simple execute", "spec 실행", "스펙 실행해줘"
validate_prompt: |
  All tasks in spec.json must have status "done" at completion.
  dev-cli spec check must pass (internal consistency).
  No state.json should be referenced or created.
---

# /simple-execute — Spec-Driven Lightweight Executor

Execute tasks defined in spec.json. Uses `dev-cli spec plan` to get task info, creates tracking Tasks, then dispatches worker agents.

## When to Use

- After `/simple-specify` generated a unified spec.json
- Simple tasks that don't need the full `/execute` orchestrator
- When you want spec.json as the single source of truth

## Flow

### Step 1: Find Spec

```
IF arg given:
  spec_path = ".dev/specs/{arg}/spec.json"
ELSE:
  # Find most recently modified spec.json
  spec_path = most recent .dev/specs/*/spec.json
```

### Step 1.5: Confirm Pre-work (if any)

```
spec = Read(spec_path) → parse JSON
pre_work = spec.external_dependencies?.pre_work ?? []
IF len(pre_work) > 0:
  print("Pre-work (human actions required before execution):")
  FOR EACH item in pre_work:
    print("  - {item.action} (blocking={item.blocking ?? false})")
  FOR EACH item in pre_work WHERE item.blocking == true:
    AskUserQuestion(
      question: "Have you completed this? → {item.action}",
      options: [
        { label: "Done" },
        { label: "Abort", description: "I need to do this first" }
      ]
    )
    IF answer == "Abort": HALT
```

### Step 2: Get Plan from dev-cli

Get the DAG-based execution plan with full task details:

```bash
plan_json = Bash("node dev-cli/bin/dev-cli.js spec plan {spec_path} --format json")
plan = JSON.parse(plan_json)
```

Display the text plan to the user:

```bash
Bash("node dev-cli/bin/dev-cli.js spec plan {spec_path}")
```

Each task in the plan contains: `id`, `action`, `type`, `status`, `steps[]`, `file_scope[]`, `depends_on[]`.

Filter out already-done tasks:

```
FOR EACH round in plan.rounds:
  round.tasks = round.tasks.filter(t => t.status != "done")
plan.rounds = plan.rounds.filter(r => r.tasks.length > 0)
```

### Step 3: Create Tracking Tasks

From the plan, create TaskCreate entries for visibility and progress tracking:

```
FOR EACH round in plan.rounds:
  FOR EACH task in round.tasks:
    TaskCreate(
      subject: "{task.id}: {task.action}",
      description: """
        Type: {task.type}
        Steps: {task.steps joined by newline}
        File scope: {task.file_scope joined by newline}
        Depends on: {task.depends_on joined by ", "}
      """,
      activeForm: "Executing {task.id}"
    )
```

Set up dependencies via TaskUpdate(addBlockedBy) matching the plan's depends_on.

### Step 4: Execute Tasks

Walk through rounds in order. For each task:

1. **TaskUpdate** → `in_progress`
2. **spec task** → mark `in_progress` in spec.json
3. **Dispatch** worker or run verification
4. **spec task** → mark `done` in spec.json
5. **TaskUpdate** → `completed`

```
FOR EACH round in plan.rounds:
  FOR EACH task in round.tasks:

    TaskUpdate(taskId, status: "in_progress")
    Bash("node dev-cli/bin/dev-cli.js spec task {task.id} --status in_progress {spec_path}")

    IF task.type == "work":
      result = Agent(subagent_type="worker", prompt="""
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
        Bash("node dev-cli/bin/dev-cli.js spec task {task.id} --status done --summary '{result.summary}' {spec_path}")
        TaskUpdate(taskId, status: "completed")
      ELSE:
        print("Task {task.id} failed: {result.summary}")
        HALT

    ELIF task.type == "verification":
      Bash("node dev-cli/bin/dev-cli.js spec check {spec_path}")
      IF exit_code == 0:
        Bash("node dev-cli/bin/dev-cli.js spec task {task.id} --status done {spec_path}")
        TaskUpdate(taskId, status: "completed")
      ELSE:
        print("Verification failed: spec consistency check failed")
        HALT
```

### Step 5: Commit

After all tasks complete, commit the changes:

```
Agent(subagent_type="git-master", prompt="""
  Commit all changes from the spec: {plan.goal}
  Spec name: {plan.name}
""")
```

### Step 6: Report

```
═══════════════════════════════════════════════════
              SIMPLE-EXECUTE COMPLETE
═══════════════════════════════════════════════════

SPEC: {spec_path}
GOAL: {plan.goal}

PLAN: {plan.total_rounds} rounds, max {plan.max_parallel} parallel
CRITICAL PATH: {plan.critical_path joined by " → "}

TASKS:
  {task.id}: {task.action} — {status}
  ...

STATE: ✅ all tasks done | ⚠️ N tasks pending

{post_work = spec.external_dependencies?.post_work ?? []}
{IF len(post_work) > 0:}
POST-WORK (human actions after completion):
  {FOR EACH item in post_work:}
  - {item.action}
    {IF item.command:} Run: `{item.command}`
═══════════════════════════════════════════════════
```

## Rules

- **Single file** — spec.json is both the spec and the state tracker (no state.json)
- **dev-cli is the source** — all task info comes from `spec plan --format json`
- **Dual tracking** — update both spec.json (via `spec task`) and TaskList (via TaskUpdate)
- **No verify agent** — worker self-report trusted
- **No reconciliation** — on failure, halt immediately
- **No parallel dispatch** — tasks run sequentially by round order
- **Always commit** — use git-master at the end
- **Constraints check** — if spec has constraints, verify them before completing
