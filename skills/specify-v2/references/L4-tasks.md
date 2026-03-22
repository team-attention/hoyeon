## L4: Tasks + External Dependencies + Plan Summary

**Output**: `tasks[]`, `external_dependencies`

### Step 1: Scaffold from requirements

```bash
hoyeon-cli spec derive-tasks .dev/specs/{name}/spec.json
```

Auto-generates task stubs with `fulfills[]` correctly linked to every requirement.
Output: `T1`...`Tn` (one per requirement) + `TF` (verification, depends on all).

**Coverage is 100% from the start.** No orphan requirements, no missing fulfills.

### Step 2: Restructure into Vertical Slices

The scaffold is a **starting point**. Restructure into **vertical slices** — each task delivers a user-visible feature end-to-end (BE + FE + connection verification).

#### Splitting Principle: Vertical Slice First

A task = BE endpoint + FE UI + the connection between them.
One task must **complete the interface internally** — the producer and consumer of an API live in the same task.

Horizontal splits (BE-only / FE-only) are allowed ONLY for **shared infrastructure**:
- DB schema, common middleware, adapter patterns, shared utilities
- These have no 1:1 mapping to a specific UI

```
BAD (horizontal — interface mismatch risk):
  T1: All backend APIs (projects CRUD + lyrics + generate + export)
  T2: All frontend pages
  → Parallel execution → schema mismatch between T1 and T2

GOOD (vertical slices):
  T1: Scaffolding (DB, router, common config)           ← horizontal, infra
  T2: Adapter pattern (ABC + Factory + rate limiter)     ← horizontal, infra
  T3: Project creation flow (POST /projects + new page)  ← vertical slice
  T4: Lyrics pipeline (WhisperX + LRC parser, internal)  ← BE-only service, no UI yet
  T5: Sync editor (PATCH /projects/:id + editor UI + Save roundtrip) ← vertical slice
  T6: Video generation + progress (BE pipeline + FE progress + WS)   ← vertical slice
  T7: Preview + Export (BE composition + FE preview/export + download) ← vertical slice
  TF: E2E journey verification
```

#### Parallelism Rule

Two tasks can run in parallel ONLY when ALL three conditions hold:
1. **No file overlap**: they don't modify the same files or directories
2. **No interface dependency**: one's output is not the other's input
3. **No model dependency**: they don't produce+consume the same DB table or API endpoint

If any condition is violated → `depends_on` is mandatory.

**Maximize parallelism** within these constraints — don't add false dependencies.
The goal is a wide DAG of independent vertical slices, not a linear chain.

```
GOOD parallelism:
  T3: Project creation flow     ]
  T4: Lyrics pipeline (service) ] → parallel (no shared interface)
  T5: Sync editor → depends_on: [T3, T4] (uses Project model + lyrics data)

BAD parallelism:
  T3: Backend project API  ]
  T4: Frontend project UI  ] → parallel but SHARE the same API contract
```

#### When Horizontal Split Is Acceptable

A task may be BE-only or FE-only when:
- **Pure infrastructure**: DB models, adapter patterns, shared config (no UI counterpart)
- **Internal service**: processing logic not yet exposed via API (e.g., WhisperX extraction)
- **Pure UI component**: a component that calls an API already built and verified in a prior task

In the third case, the task must have `depends_on` pointing to the task that built the API.

### Step 3: Patch via merge

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --stdin --patch << 'EOF'
{"tasks": [
  {"id": "T1", "action": "Scaffolding: DB + router + common config", "fulfills": ["R0"], "depends_on": []},
  {"id": "T2", "action": "Project creation flow: POST /projects + new page + redirect", "fulfills": ["R1"], "depends_on": ["T1"]},
  {"id": "TF", "action": "E2E journey verification", "type": "verification", "depends_on": ["T1", "T2"]}
]}
EOF
```

**Task rules:**
- Every work task: `fulfills[]` linking to requirements
- `depends_on[]` for ordering. No circular dependencies.
- Acceptance criteria = sub-req behaviors from `fulfills[]` (no separate AC field — Worker reads requirements directly)
- Build/lint/typecheck = Worker runs these automatically
- Agent may consolidate: merge T1+T2 into one task that fulfills both R1 and R2

### External Dependencies

Scan tasks and decisions for actions outside of code.
Run `hoyeon-cli spec guide external --schema v7`, then merge.
If none: merge `{"external_dependencies": {"pre_work": [], "post_work": []}}`.

### L4 Gate

```bash
hoyeon-cli spec validate .dev/specs/{name}/spec.json --layer tasks
```

### Plan Summary

After gate passes, present the full plan:

```
spec.json ready! .dev/specs/{name}/spec.json

Goal
────────────────────────────────────────
{context.confirmed_goal}

Non-goals
────────────────────────────────────────
{non_goals or "(none)"}

Key Decisions ({n} total)
────────────────────────────────────────
D1: {decision}
D2: {decision}

Requirements ({n} total, {m} sub-requirements)
────────────────────────────────────────
R1: {behavior}
  R1.1: {sub behavior}
  R1.2: {sub behavior}

Known Gaps
────────────────────────────────────────
{known_gaps or "(none)"}

Pre-work
────────────────────────────────────────
{pre_work items or "(none)"}

Tasks (DAG)
────────────────────────────────────────
T1: {action} [infra] — pending
T2: {action} [vertical] — pending (depends: T1)
T3: {action} [vertical] — pending (depends: T1)    ← parallel with T2
T4: {action} [vertical] — pending (depends: T2, T3)
TF: E2E journey verification — pending (depends: all)

Post-work
────────────────────────────────────────
{post_work items or "(none)"}
```

Run `hoyeon-cli spec plan` for DAG visualization.

### TF: Verification Task

TF is not a build re-check. It verifies **cross-slice user journeys** — the connections between vertical slices that no individual task tested.

```json
{
  "id": "TF",
  "action": "E2E journey verification",
  "type": "verification",
  "depends_on": ["T2", "T3", "T4", "T5"],
  "steps": [
    "Build: frontend build + backend tests",
    "Happy path: Landing → New Project → upload + lyrics → Create → Sync Editor → edit → Save → Generate → progress → Preview → Export → download MP4",
    "Failure + recovery: Generate → partial failure → Retry with edited prompt → success → Preview auto-refreshes"
  ]
}
```

**Journey rules:**
- At least one happy-path journey that touches all vertical slice tasks
- At least one failure/recovery journey if error handling is in scope
- TF Worker reads all `fulfills[]` requirements from completed tasks and verifies sub-req behaviors

### Final Approval

```
AskUserQuestion(
  question: "Review the plan above.",
  options: [
    { label: "/execute", description: "Start implementation" },
    { label: "Revise requirements (L3)", description: "Go back to L3" },
    { label: "Revise tasks (L4)", description: "Adjust task breakdown" },
    { label: "Abort", description: "Stop" }
  ]
)
```

On approval, run `/execute`.
