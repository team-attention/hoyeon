---
name: simple-specify
description: |
  Lightweight spec generator that outputs a unified spec.json v4 (spec + state + history in one file).
  Streamlined alternative to /specify — minimal interview, schema-validated output.
  Use when: "/simple-specify", "간단한 스펙", "simple spec", "스펙 만들어줘", "spec 만들어"
validate_prompt: |
  Must produce a valid spec.json that passes dev-cli spec validate.
  spec.json must include status: "pending" on all tasks and a history array.
  Output files must be in .dev/specs/{name}/ directory.
  No state.json should be generated (unified into spec.json).
---

# /simple-specify — Lightweight Spec Generator

Generate a schema-validated spec.json v4 with unified state tracking.

## When to Use

- Quick tasks that don't need the full /specify interview pipeline
- Any task where you want structured, machine-readable spec
- When you want spec.json as the single source of truth

## Schema Reference

**Required fields only** (minimum valid spec):
```json
{
  "meta": { "name": "...", "goal": "..." },
  "tasks": [{ "id": "T1", "action": "...", "type": "work", "status": "pending" }],
  "history": [{ "ts": "...", "type": "spec_created" }]
}
```

**Optional sections** (add as needed):
- `meta.deliverables[]` — concrete output files
- `context` — background, assumptions, known_gaps
- `requirements[]` — acceptance criteria with scenarios
- `tasks[].outputs[]` — expected output artifacts
- `tasks[].depends_on[]` — task dependencies
- `tasks[].risk` — low/medium/high
- `tasks[].file_scope[]` — files this task touches
- `tasks[].steps[]` — implementation steps
- `tasks[].required_tools[]` — tools the Worker agent must have access to
- `tasks[].must_not_do[]` — explicit prohibitions for the Worker agent
- `tasks[].acceptance_criteria` — {functional[], static[], runtime[], cleanup[]} each item: {description, command?, status?}
- `meta.non_goals[]` — strategic scope exclusions (what this project is NOT trying to achieve)
- `constraints[]` — must_not_do, preserve
- `orchestrator` — execution policy:
  - `commit_strategy[]` — {after_task, message, files?, condition?}
  - `error_handling` — {failure_categories[], max_retries}
  - `runtime_contract` — {working_dir, network_access, package_install, file_access, max_execution_time, git_operations}
  - `parallelization[]` — {group, task_ids[], reason?}
- `verification_summary` — structured verification plan:
  - `agent_items[]` — A-items: {id, criterion, method, related_task?}
  - `human_items[]` — H-items: {id, criterion, reason, review_material?}
  - `sandbox_items[]` — S-items: {id, scenario, agent, method}
  - `gaps[]` — string array of verification gaps
- `external_dependencies` — external blockers and actions:
  - `pre_work[]` — {dependency, action, command?, blocking?}
  - `during[]` — {dependency, strategy, rationale?}
  - `post_work[]` — {task, dependency, action, command?}

## Flow

### Step 1: Understand the Task

Read the user's request. If a file/doc is referenced, read it.

Quick codebase exploration (1 Explore agent max) — only if needed to understand existing patterns.

### Step 2: Draft spec.json

Generate spec.json with:
1. **Always fill**: `meta.name`, `meta.goal`, `tasks[]` (required), `tasks[].status` (always "pending"), `history` (with spec_created event)
2. **Fill when obvious**: `meta.deliverables`, `tasks[].file_scope`, `tasks[].outputs`, `tasks[].depends_on`
3. **Fill when user mentions**: `context`, `requirements`, `constraints`
4. **Skip unless asked**: `meta.approved_by`, `tasks[].checkpoint`, `tasks[].inputs`

**Naming convention**: `meta.name` = kebab-case, derived from goal (e.g., "fix-login-bug", "add-auth-middleware")

**Task ID convention**: `T1`, `T2`, ... with a final verification task `TF` (type: "verification")

### Step 3: Validate & Save

```bash
# Write spec.json (includes status + history)
Write(".dev/specs/{name}/spec.json", spec_content)

# Validate against schema
Bash("node dev-cli/bin/dev-cli.js spec validate .dev/specs/{name}/spec.json")

# If validation fails: fix and retry (max 2 attempts)
```

No state.json generation needed — state is unified into spec.json.

### Step 4: Present to User

Show a compact summary:

```
spec.json created: .dev/specs/{name}/spec.json

Tasks:
  T1: {action} [{type}] — pending
  T2: {action} [{type}] → depends on T1 — pending
  TF: Verification [verification] — pending

{If verify blocks exist:}
Verify: {count} commands

{If constraints exist:}
Constraints: {count} items
```

Then ask: "추가하거나 수정할 내용 있어?" — if user says no, done. If user wants changes, edit spec.json, re-validate.

### Step 5: Iterate (if user requests changes)

- Edit spec.json based on feedback
- Re-validate: `dev-cli spec validate`
- Show updated summary

Repeat until user is satisfied.

## Rules

- **No PLAN.md generation** — spec.json is the only output
- **No state.json** — state is unified into spec.json (status field on tasks, history array)
- **No plan-reviewer** — validation is via schema only
- **No analysis agents** — keep it fast
- **Always validate** — every spec.json must pass `dev-cli spec validate`
- **Always include status** — every task must have `status: "pending"` at creation
- **Always include history** — spec.json must have `history: [{ ts, type: "spec_created" }]`
- **Don't over-fill** — better to have a lean spec that's correct than a bloated one with guesses
