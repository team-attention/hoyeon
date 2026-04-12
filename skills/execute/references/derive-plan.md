# derive-plan.md

Goal: From `normalized_spec` (cached in Phase 0), derive a DAG of tasks and persist to `plan.json` via `hoyeon-cli plan`.

## Inputs

- `normalized_spec` — session-memory object from Phase 0.1 with shape:
  ```
  { meta, requirements: [{id, behavior, sub: [{id, behavior, given, when, then}]}],
    verification: { journeys: [...] }, constraints: [...] }
  ```
- `plan_path` — absolute path to target plan.json (e.g. `.hoyeon/specs/foo/plan.json`)
- `spec_path` — absolute path to the source spec file (used as `--spec-ref`)

## Step 1 — Derive tasks from sub-requirements

Iterate every `requirement.sub[]` in `normalized_spec.requirements`. For each sub-req, create one task:

| Field | Value |
|-------|-------|
| `id` | `T<N>` — sequential, starting at 1, in flat iteration order |
| `action` | short imperative derived from `sub.behavior` (drop leading "Should/The system/When ...", keep as actionable verb phrase) |
| `status` | `"pending"` |
| `fulfills` | `[sub.id]` — **sub-requirement IDs only** (never journey IDs — per C7) |
| `depends_on` | inferred per Step 2 below |

**R6.3 / C7 guard**: `verification.journeys[]` is NOT used for task creation. No task.fulfills may contain a journey ID. Journeys are consumed only by verify recipes.

## Step 2 — Dependency inference (R6.2)

For each sub-req, read its `given` clause and look for references to outputs produced by another sub-req's `then` (same noun, entity name, ID, or resource).

Heuristics:
- If `given` mentions an artifact, state, or entity that appears as an output in another sub's `then`, add the earlier sub's task ID to `depends_on`.
- If `given` explicitly names another sub-req ID (e.g. "R1.1 이후"), map to its task ID.
- Otherwise, leave `depends_on: []`.

Keep `depends_on` minimal — only concrete data/state flow. Do not add dependencies based on numeric ID ordering alone.

## Step 3 — Initialize plan.json

```bash
hoyeon-cli plan init "$plan_path" --spec-ref "$spec_path"
```

This creates an empty plan.json with `tasks: []`, `history: []`, and `spec_ref` set. **Do not** add `schema_version` — the CLI owns plan.json shape (D15).

## Step 4 — Merge derived tasks

Write the tasks array to `/tmp/plan-derive.json` via heredoc, then merge:

```bash
cat > /tmp/plan-derive.json << 'EOF'
{
  "tasks": [
    { "id": "T1", "action": "...", "status": "pending", "fulfills": ["R1.1"], "depends_on": [] },
    { "id": "T2", "action": "...", "status": "pending", "fulfills": ["R1.2"], "depends_on": ["T1"] }
  ]
}
EOF

hoyeon-cli plan merge "$plan_path" --stdin < /tmp/plan-derive.json
```

## Step 5 — Validate

```bash
hoyeon-cli plan list "$plan_path"
```

Confirm task count matches sub-requirement count and all IDs appear.

## Step 6 — Report to user

Print a short summary:

```
Derived plan: <N> tasks from <M> sub-requirements
  T1 [R1.1] → <action>     depends_on: []
  T2 [R1.2] → <action>     depends_on: [T1]
  ...
Plan written to: <plan_path>
```

## Example

Given `normalized_spec` with:

```
R1.1 — "user can submit email"    given: "login page loaded"                 then: "email stored in session"
R1.2 — "verification link sent"   given: "email stored in session"           then: "email sent via SMTP"
R2.1 — "link opens success page"  given: "verification email received"       then: "user marked verified"
```

Derived plan.json tasks:

```json
[
  { "id": "T1", "action": "accept email submission on login page", "status": "pending", "fulfills": ["R1.1"], "depends_on": [] },
  { "id": "T2", "action": "send verification link via SMTP",        "status": "pending", "fulfills": ["R1.2"], "depends_on": ["T1"] },
  { "id": "T3", "action": "mark user verified on link click",       "status": "pending", "fulfills": ["R2.1"], "depends_on": ["T2"] }
]
```

T2 depends on T1 because R1.2.given ("email stored in session") matches R1.1.then. T3 depends on T2 because R2.1.given ("verification email received") matches R1.2.then. Journeys, if any, are ignored here.
