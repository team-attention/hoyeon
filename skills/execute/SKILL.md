---
name: execute
description: |
  This skill should be used when the user says "/execute", "execute".
  Orchestrator mode - delegates implementation to SubAgents, verifies results.
  Supports mode selection: standard (with full verification) and quick (lightweight, no independent verify).
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Edit
  - Write
---

# /execute - CLI-Orchestrated Execution

## Layer 1: Execution Flow (CLI-driven)

### Session Model

**Session vs. Spec** — same as specify:

| Concept | Directory | Contents |
|---------|-----------|----------|
| **Spec** | `.dev/specs/{name}/` | Deliverables: `PLAN.md`, `plan-content.json`, `context/`, `session.ref` |
| **Session** | `.dev/.sessions/{sessionId}/` | Work artifacts: `state.json` |

**Path resolution** is handled by dev-cli via `session.ref`. You do not compute paths manually.

### Rules
- **Conductor rule**: You do NOT edit code directly. Delegate to subagents via Task().
- Result passing: pipe JSON result via stdin to `step complete`.
- When context is compacted, call `node dev-cli/bin/dev-cli.js manifest {name}` to recover full state.

### Flow

1. Parse input (see Mode Selection below) → determine `{name}` and `{depth}`
2. `node dev-cli/bin/dev-cli.js init {name} --execute [--quick]`
3. Loop: call `node dev-cli/bin/dev-cli.js next {name}` → dispatch returned action → pass result back
4. Until CLI returns `{ "done": true }`

**Ping-pong loop detail:**
```
LOOP:
  response = Bash("node dev-cli/bin/dev-cli.js next {name}")
  IF response.done == true:
    IF response.halted: output error summary from response
    BREAK
  IF response.action == "engine-init":
    # No-op — engine already initialized, just call next again (no step complete needed)
    CONTINUE
  dispatch(response)  # see Action Dispatch Table
  # After subagent/direct action completes, pass result back:
  Bash("echo '<result_json>' | node dev-cli/bin/dev-cli.js step {name} complete --step {response.stepId}")
```

### Action Dispatch Table

| Engine Action | Substep | Dispatch |
|--------------|---------|----------|
| `engine-init` | — | No-op, call `next` again (no `step complete` — init has no stepId) |
| `engine-worker` | worker | `Task(subagent_type="worker", model="sonnet", prompt=response.instruction)` |
| `engine-verify` | verify | `Task(subagent_type="worker", model="sonnet", prompt=response.instruction)` (read-only) |
| `engine-wrapup` | wrapup | Direct: write context files + mark PLAN.md checkbox `[x]` per instruction |
| `engine-commit` | commit | `Task(subagent_type="git-master", model="sonnet", prompt=response.instruction)` |
| `engine-finalize` | residual-commit | `Task(subagent_type="git-master", model="sonnet", prompt=response.instruction)` |
| `engine-finalize` | code-review | `Task(subagent_type="code-reviewer", model="sonnet", prompt=response.instruction)` |
| `engine-finalize` | final-verify | `Task(subagent_type="worker", model="sonnet", prompt=response.instruction)` (read-only) |
| `engine-finalize` | state-complete | Direct: mark complete |
| `engine-finalize` | report | Direct: read `skills/execute/references/report-template.md`, fill in from context |

**Shortcut**: Use `response.dispatch` field to determine dispatch type:
- `{ type: "subagent", subagent_type, model }` → spawn via `Task(subagent_type, model, prompt=response.instruction)`
- `{ type: "direct" }` → main agent handles directly per instruction

---

## Layer 2: Judgment Rules

### Mode Selection

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | Sets depth = quick | depth = standard |

| Input | Mode | Behavior |
|-------|------|----------|
| `/execute` | Auto-detect | Branch → Draft PR check → PR mode if exists, else Local |
| `/execute --quick` | Auto-detect | Same, but quick depth |
| `/execute <name>` | Local | `.dev/specs/<name>/PLAN.md` |
| `/execute --quick <name>` | Local | Same, but quick depth |
| `/execute <PR#>` | PR | Parse spec path from PR body |

Auto-detect logic:
```bash
gh pr list --head $(git branch --show-current) --draft --json number
# PR exists → PR mode | No PR → infer spec from branch name
```

### Conductor Rule

**You are the conductor. You do not play instruments directly.**
- All code writing goes to `Task(subagent_type="worker")`.
- You may only Read, Grep, Glob, Bash (for CLI commands), Edit (for PLAN.md checkboxes and context files only).
- After each step completes: pipe result JSON to `step complete`, then call `next` again immediately.

### Wrapup Handling (Direct)

When `engine-wrapup` action is returned:
1. Parse the worker result from the previous step
2. Save outputs to `context/outputs.json` (merge with existing)
3. Append learnings to `context/learnings.md`
4. Append issues to `context/issues.md`
5. Mark PLAN.md TODO checkbox: `### [ ] TODO N:` → `### [x] TODO N:`

### Report Handling (Direct)

**Standard mode**: Read `skills/execute/references/report-template.md`, output verbatim with placeholders filled from context files.

**Quick mode**: Output abbreviated summary:
```
═══════════════════════════════════════════════════════════
                    ORCHESTRATION COMPLETE
═══════════════════════════════════════════════════════════
PLAN: {plan_path}
MODE: {Local | PR #N} (quick)
RESULT: {completed}/{total} TODOs completed
COMMITS: {count} commits created
FILES: {count} files modified
ISSUES: {from context/issues.md, or "None"}
═══════════════════════════════════════════════════════════
```

### Halted Handling

When engine returns `{ done: true, halted: true }`:
- Output error summary with failed TODOs and reasons
- If PR mode: `Skill("state", args="pause <PR#> <reason>")`
- If Local: log to `context/issues.md`, report to user
