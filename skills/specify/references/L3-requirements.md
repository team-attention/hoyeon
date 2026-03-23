## L3: Requirements + Sub-requirements

**Output**: `requirements[]` with `sub[]`

### Step 1: Scaffold from decisions

```bash
hoyeon-cli spec derive-requirements .hoyeon/specs/{name}/spec.json
```

This auto-generates requirement stubs linked to every decision.
Output: `R0` (from goal) + `R1`...`Rn` (one per decision), each with 1 `TODO` sub-req.

**Coverage is 100% from the start.** No orphan decisions.

### Step 2: Reshape + Fill behaviors via --patch

The scaffold is a **starting point, not a constraint**. The 1:1 decision→requirement mapping is rarely the final structure. Freely reorganize:

- **Split**: One decision often needs multiple requirements (e.g., D1:"JWT auth" → R1:login, R2:token refresh, R3:token expiry)
- **Merge**: Multiple decisions may combine into one requirement (e.g., D1+D2 → R1:password security)
- **Add**: Create new requirements for behaviors not tied to any single decision
- **Delete**: Remove scaffold requirements that are redundant after reorganization

As long as `spec validate` passes at the L3 gate (every requirement has at least one sub-req), the structure is valid.

Run `hoyeon-cli spec guide requirements --schema v7` to check field types, then patch:

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin --patch << 'EOF'
{"requirements": [
  {"id": "R1", "behavior": "User can log in with email and password", "sub": [
    {"id": "R1.1", "behavior": "POST /login with valid credentials returns 200 + JWT"},
    {"id": "R1.2", "behavior": "POST /login with wrong password returns 401"}
  ]}
]}
EOF
```

**Behavior quality rules:**
- BANNED: "correctly", "properly", "works", "as expected", "handles" (without what)
- REQUIRED: trigger (who/what initiates) + observable outcome
- BAD: "Login works correctly"
- GOOD: "POST /login with valid credentials returns 200 + JWT in body"

**Sub-requirement = behavioral acceptance criterion:**
- Each sub-req IS an acceptance criterion for the parent requirement
- Tasks that `fulfills` this requirement must satisfy ALL sub-req behaviors
- **Atomic** (single trigger, single outcome) → 1 sub-req
- **Compound** (multiple paths) → happy path + error + boundary conditions

**Boundary decomposition rule:**

When a single requirement spans multiple implementation boundaries (API↔UI, Service↔Consumer, Producer↔Subscriber), decompose sub-requirements **per boundary**. Each side of a boundary must have its own sub-req.

Principle: if an artifact exists on one side of a boundary, the counterpart that produces or consumes it on the other side MUST also exist as a sub-req (unless it is admin-only or internal-only).

BAD — mixed layers in one sub-req:
```
R1: "Project CRUD"
  R1.1: "User can create a project"
  R1.2: "User can delete a project"
```

GOOD — boundary-separated (fullstack: API↔UI):
```
R1: "Project CRUD"
  R1.1: "POST /api/projects → 201 + project JSON"
  R1.2: "GET /api/projects → project list"
  R1.3: "DELETE /api/projects/:id → 204"
  R1.4: "Frontend project list page renders projects from GET /api/projects"
  R1.5: "Frontend delete button calls DELETE /api/projects/:id and removes item"
```

GOOD — boundary-separated (API↔Worker):
```
R1: "Order processing"
  R1.1: "POST /orders → 202 + job_id"
  R1.2: "Worker consumes order.created event → processes order"
  R1.3: "GET /orders/:id → returns processing status"
```

GOOD — boundary-separated (SDK↔CLI):
```
R1: "Config management"
  R1.1: "SDK ConfigStore.set(key, value) persists to ~/.config/app.json"
  R1.2: "CLI `app config set KEY VALUE` calls ConfigStore.set and prints confirmation"
```

**Coverage checks (agent self-check before approval):**
- Every decision has at least one requirement tracing back to it (guaranteed by derive)
- Sub-requirements together cover the full behavior of the parent
- No orphan decisions
- **Boundary check**: if a sub-req implies a cross-boundary dependency (e.g., an API endpoint), verify the other side has a matching sub-req

### L3 Approval

Print ALL requirements and sub-requirements as text (show everything, do not truncate), then AskUserQuestion (Approve/Revise/Abort).

### L3 Gate

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --layer requirements
```

Pass → advance to L4.
