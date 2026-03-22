## L4: Tasks + External Dependencies + Plan Summary

**Output**: `tasks[]`, `external_dependencies`

### Step 1: Scaffold from requirements

```bash
hoyeon-cli spec derive-tasks .dev/specs/{name}/spec.json
```

Auto-generates task stubs with `fulfills[]` correctly linked to every requirement.
Output: `T1`...`Tn` (one per requirement) + `TF` (verification, depends on all).

**Coverage is 100% from the start.** No orphan requirements, no missing fulfills.

### Step 2: Customize tasks via --patch

The scaffold is a **starting point**. The 1:1 requirement→task mapping is rarely the final structure. Freely reorganize:

- **Merge**: Combine related tasks — one task can `fulfills: ["R1", "R2", "R3"]`
- **Split**: Break large tasks into smaller ones, distributing fulfills
- **Add**: Insert setup/config tasks that don't fulfill specific requirements
- **Reorder**: Add `depends_on` relationships for correct execution order

**Maximize parallelism.** Tasks without `depends_on` run concurrently. Only add dependencies when tasks genuinely share files or outputs. The goal is a wide, shallow DAG — not a linear chain.

- BAD: T1 → T2 → T3 → T4 (serial, slow)
- GOOD: T1, T2, T3 run in parallel → T4 depends on T1 only → TF depends on all

As long as `spec validate` passes (every requirement referenced by some task's fulfills), the structure is valid.

Run `hoyeon-cli spec guide tasks --schema v7` and `spec guide acceptance-criteria` to check fields.

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --stdin --patch << 'EOF'
{"tasks": [
  {"id": "T1", "action": "Implement login endpoint with JWT", "acceptance_criteria": {"checks": [{"type": "build", "run": "npm run build"}]}},
  {"id": "TF", "acceptance_criteria": {"checks": [{"type": "build", "run": "npm run build"}, {"type": "lint", "run": "npm run lint"}]}}
]}
EOF
```

**Task rules:**
- Every task: `fulfills[]` + `acceptance_criteria.checks[]`
- `depends_on[]` for ordering. No circular dependencies.
- TF checks must include at minimum: `{type: "build", run: "<build command>"}`
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
R1: {behavior} [P{priority}]
  R1.1: {sub behavior}
  R1.2: {sub behavior}

Known Gaps
────────────────────────────────────────
{known_gaps or "(none)"}

Pre-work
────────────────────────────────────────
{pre_work items or "(none)"}

Tasks
────────────────────────────────────────
T1: {action} — pending
T2: {action} — pending (depends: T1)
TF: Full verification — pending (depends: all)

Post-work
────────────────────────────────────────
{post_work items or "(none)"}
```

Run `hoyeon-cli spec plan` for DAG visualization.

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

On approval, merge `approved_by` and `approved_at` into meta via `--stdin`.

If user selected `/execute`:
```
Skill("execute", args="{name}")
```
