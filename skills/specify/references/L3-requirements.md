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

Run `hoyeon-cli spec guide requirements --schema v1` to check field types, then patch:

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin --patch << 'EOF'
{"requirements": [
  {"id": "R1", "behavior": "User can log in with email and password", "sub": [
    {"id": "R1.1", "behavior": "Valid login returns JWT", "given": "A registered user with valid credentials", "when": "POST /login with correct email and password", "then": "Returns 200 with JWT in response body"},
    {"id": "R1.2", "behavior": "Wrong password returns 401", "given": "A registered user exists", "when": "POST /login with incorrect password", "then": "Returns 401 with error message 'Invalid credentials'"}
  ]}
]}
EOF
```

**GWT (Given/When/Then) rule:**

Every sub-requirement MUST include `given`, `when`, and `then` fields. The `behavior` field serves as a **one-line summary** of the GWT scenario. The GWT fields provide the **detailed, testable specification**.

- `behavior` — one-line summary (required, used as fallback display)
- `given` — precondition / initial state
- `when` — trigger / action performed
- `then` — observable outcome / expected result

**Behavior quality rules:**
- BANNED: "correctly", "properly", "works", "as expected", "handles" (without what)
- REQUIRED: trigger (who/what initiates) + observable outcome
- BAD: `"behavior": "Login works correctly"`
- GOOD: `"behavior": "Valid login returns JWT", "given": "Valid credentials exist", "when": "POST /login with those credentials", "then": "Returns 200 + JWT in body"`

**Sub-requirement = behavioral acceptance criterion (GWT format):**
- Each sub-req IS an acceptance criterion for the parent requirement
- The `behavior` field summarizes the criterion in one line
- The `given`/`when`/`then` fields provide the full testable specification
- Tasks that `fulfills` this requirement must satisfy ALL sub-req GWT scenarios
- **Atomic** (single trigger, single outcome) → 1 sub-req with 1 GWT
- **Compound** (multiple paths) → happy path + error + boundary conditions, each with its own GWT

**Boundary decomposition rule:**

When a single requirement spans multiple implementation boundaries (API↔UI, Service↔Consumer, Producer↔Subscriber), decompose sub-requirements **per boundary**. Each side of a boundary must have its own sub-req with its own GWT.

Principle: if an artifact exists on one side of a boundary, the counterpart that produces or consumes it on the other side MUST also exist as a sub-req (unless it is admin-only or internal-only).

BAD — mixed layers in one sub-req:
```json
{"id": "R1", "behavior": "Project CRUD", "sub": [
  {"id": "R1.1", "behavior": "User can create a project"},
  {"id": "R1.2", "behavior": "User can delete a project"}
]}
```

GOOD — boundary-separated (fullstack: API↔UI):
```json
{"id": "R1", "behavior": "Project CRUD", "sub": [
  {"id": "R1.1", "behavior": "Create project via API", "given": "Authenticated user with valid session", "when": "POST /api/projects with name and description", "then": "Returns 201 with created project JSON including id"},
  {"id": "R1.2", "behavior": "List projects via API", "given": "Two projects exist for the user", "when": "GET /api/projects", "then": "Returns 200 with array of 2 project objects"},
  {"id": "R1.3", "behavior": "Delete project via API", "given": "Project with id=42 exists", "when": "DELETE /api/projects/42", "then": "Returns 204 and project is removed from database"},
  {"id": "R1.4", "behavior": "Frontend renders project list", "given": "GET /api/projects returns 2 projects", "when": "User navigates to project list page", "then": "Page renders 2 project cards with name and description"},
  {"id": "R1.5", "behavior": "Frontend delete removes project", "given": "Project list page shows project id=42", "when": "User clicks delete button on project id=42", "then": "DELETE /api/projects/42 is called and project disappears from list"}
]}
```

GOOD — boundary-separated (API↔Worker):
```json
{"id": "R1", "behavior": "Order processing", "sub": [
  {"id": "R1.1", "behavior": "Create order returns job ID", "given": "Valid order payload with items", "when": "POST /orders", "then": "Returns 202 with job_id in response body"},
  {"id": "R1.2", "behavior": "Worker processes order event", "given": "order.created event is published to queue", "when": "Worker consumes the event", "then": "Order status transitions to 'processing' and inventory is decremented"},
  {"id": "R1.3", "behavior": "Order status is queryable", "given": "Order id=99 has been processed by worker", "when": "GET /orders/99", "then": "Returns 200 with status='completed'"}
]}
```

GOOD — boundary-separated (SDK↔CLI):
```json
{"id": "R1", "behavior": "Config management", "sub": [
  {"id": "R1.1", "behavior": "SDK persists config value", "given": "No prior config exists at ~/.config/app.json", "when": "ConfigStore.set('theme', 'dark') is called", "then": "~/.config/app.json contains {\"theme\": \"dark\"}"},
  {"id": "R1.2", "behavior": "CLI set command calls SDK", "given": "ConfigStore.set is available", "when": "User runs `app config set theme dark`", "then": "ConfigStore.set('theme', 'dark') is invoked and stdout prints 'Set theme = dark'"}
]}
```

**Coverage checks (agent self-check before approval):**
- Every decision has at least one requirement tracing back to it (guaranteed by derive)
- Sub-requirements together cover the full behavior of the parent
- No orphan decisions
- **Boundary check**: if a sub-req implies a cross-boundary dependency (e.g., an API endpoint), verify the other side has a matching sub-req
- **GWT completeness check**: every sub-req has all three GWT fields filled (given, when, then)

### L3 Approval

Print ALL requirements and sub-requirements as text (show everything, do not truncate), then AskUserQuestion (Approve/Revise/Abort).

### L3 Gate

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --layer requirements
```

Pass → advance to L4.
