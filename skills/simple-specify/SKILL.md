---
name: simple-specify
description: |
  Lightweight spec generator that outputs spec.json v4 + state.json.
  Streamlined alternative to /specify — minimal interview, schema-validated output.
  Use when: "/simple-specify", "간단한 스펙", "simple spec", "스펙 만들어줘", "spec 만들어"
validate_prompt: |
  Must produce a valid spec.json that passes dev-cli spec validate.
  Must produce a matching state.json via dev-cli state init.
  Output files must be in .dev/specs/{name}/ directory.
---

# /simple-specify — Lightweight Spec Generator

Generate a schema-validated spec.json v4 + state.json with minimal friction.

## When to Use

- Quick tasks that don't need the full /specify interview pipeline
- Any task where you want structured, machine-readable spec
- When you want spec.json as the source of truth (not PLAN.md)

## Schema Reference

**Required fields only** (minimum valid spec):
```json
{
  "meta": { "name": "...", "goal": "..." },
  "tasks": [{ "id": "T1", "action": "...", "type": "work" }]
}
```

**Optional sections** (add as needed):
- `meta.deliverables[]` — concrete output files
- `context` — background, assumptions, known_gaps
- `requirements[]` — acceptance criteria with scenarios
- `tasks[].verify` — verification commands/assertions
- `tasks[].outputs[]` — expected output artifacts
- `tasks[].depends_on[]` — task dependencies
- `tasks[].risk` — low/medium/high
- `tasks[].file_scope[]` — files this task touches
- `tasks[].steps[]` — implementation steps
- `constraints[]` — must_not_do, preserve, scope_boundary

## Flow

### Step 1: Understand the Task

Read the user's request. If a file/doc is referenced, read it.

Quick codebase exploration (1 Explore agent max) — only if needed to understand existing patterns.

### Step 2: Draft spec.json

Generate spec.json with:
1. **Always fill**: `meta.name`, `meta.goal`, `tasks[]` (required)
2. **Fill when obvious**: `meta.deliverables`, `tasks[].file_scope`, `tasks[].verify`, `tasks[].outputs`, `tasks[].depends_on`
3. **Fill when user mentions**: `context`, `requirements`, `constraints`
4. **Skip unless asked**: `meta.approved_by`, `tasks[].checkpoint`, `tasks[].inputs`

**Naming convention**: `meta.name` = kebab-case, derived from goal (e.g., "fix-login-bug", "add-auth-middleware")

**Task ID convention**: `T1`, `T2`, ... with a final verification task `TF` (type: "verification")

### Step 3: Validate & Save

```bash
# Write spec.json
Write(".dev/specs/{name}/spec.json", spec_content)

# Validate against schema
Bash("node dev-cli/bin/dev-cli.js spec validate .dev/specs/{name}/spec.json")

# If validation fails: fix and retry (max 2 attempts)

# Generate state.json
Bash("node dev-cli/bin/dev-cli.js state init --spec .dev/specs/{name}/spec.json --output .dev/specs/{name}/state.json")
```

### Step 4: Present to User

Show a compact summary:

```
spec.json created: .dev/specs/{name}/spec.json
state.json created: .dev/specs/{name}/state.json

Tasks:
  T1: {action} [{type}]
  T2: {action} [{type}] → depends on T1
  TF: Verification [verification]

{If verify blocks exist:}
Verify: {count} commands

{If constraints exist:}
Constraints: {count} items
```

Then ask: "추가하거나 수정할 내용 있어?" — if user says no, done. If user wants changes, edit spec.json, re-validate, re-init state.

### Step 5: Iterate (if user requests changes)

- Edit spec.json based on feedback
- Re-validate: `dev-cli spec validate`
- Re-init state: `dev-cli state init` (overwrites previous)
- Show updated summary

Repeat until user is satisfied.

## Rules

- **No PLAN.md generation** — spec.json is the only output
- **No plan-reviewer** — validation is via schema only
- **No analysis agents** — keep it fast
- **Always validate** — every spec.json must pass `dev-cli spec validate`
- **Always init state** — every spec.json gets a state.json
- **Don't over-fill** — better to have a lean spec that's correct than a bloated one with guesses
