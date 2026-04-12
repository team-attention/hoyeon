## L3: Requirements + Sub-requirements

**Output**: `requirements[]` with `sub[]` (every sub has required `given`, `when`, `then`)

### Step 1: Claude scaffolds requirements directly from decisions

There is no CLI scaffold helper in v2. Claude reads **all four context sources** and writes
the initial `requirements[]` structure inline via `hoyeon-cli spec merge --stdin` heredoc:

1. `context.confirmed_goal` → seeds R0 (overarching behavior).
2. `meta.non_goals` → **filter**: do NOT emit requirements for these; flag if a decision implies one.
3. `context.research` → **constraint injection**: existing patterns, file structures, and
   technical facts discovered in L1 must be reflected in sub-req `given`/`when` fields.
   Example: if research reports "orders table uses UUID PK", sub GWTs referencing order ids must
   use UUID examples, not integer `id=42`.
4. `context.decisions[]` → **1:N starting point** (reshape freely in Step 2; do not anchor on 1:1).

Scaffolding rules:

- Start with `R0` derived from `context.confirmed_goal` (the overarching behavior).
- Emit one requirement `R1..Rn` per decision as a **starting point** — you will reshape in Step 2.
- Cross-check each scaffolded sub-req against `context.research`: if a research finding
  constrains the sub's precondition or outcome, bake it into GWT from the first draft.
- Cross-check against `meta.non_goals`: if a scaffolded requirement restates a non-goal, drop it.
- Every requirement has at least one `sub[]` entry from the start (no empty `sub`).
- Every sub has all three GWT fields (`given`, `when`, `then`) filled with a real scenario.
  Do not use `TBD` — v2 validate rejects `TBD`/empty GWT strings.

Run `hoyeon-cli spec guide requirements --schema v2` and `hoyeon-cli spec guide sub --schema v2`
to confirm the exact field shape, then merge:

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin << 'EOF'
{"requirements": [
  {"id": "R0", "behavior": "<goal restated as observable behavior>", "sub": [
    {"id": "R0.1", "behavior": "<summary>", "given": "<precondition>", "when": "<trigger>", "then": "<outcome>"}
  ]},
  {"id": "R1", "behavior": "User can log in with email and password", "sub": [
    {"id": "R1.1", "behavior": "Valid login returns JWT", "given": "A registered user with valid credentials", "when": "POST /login with correct email and password", "then": "Returns 200 with JWT in response body"},
    {"id": "R1.2", "behavior": "Wrong password returns 401", "given": "A registered user exists", "when": "POST /login with incorrect password", "then": "Returns 401 with error message 'Invalid credentials'"}
  ]}
]}
EOF
```

(Use the default replace-merge for the initial scaffold, `--patch` for subsequent reshape edits.)

### Step 2: Reshape + Fill behaviors via --patch

The scaffold is a **starting point, not a constraint**. The 1:1 decision→requirement mapping is
rarely the final structure. Freely reorganize:

- **Split**: One decision often needs multiple requirements (e.g., D1:"JWT auth" → R1:login, R2:token refresh, R3:token expiry)
- **Merge**: Multiple decisions may combine into one requirement (e.g., D1+D2 → R1:password security)
- **Add**: Create new requirements for behaviors not tied to any single decision
- **Delete**: Remove scaffold requirements that are redundant after reorganization

As long as `spec validate` passes at the L3 gate (every requirement has at least one sub-req and
every sub has GWT filled), the structure is valid.

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

**GWT (Given/When/Then) rule — REQUIRED:**

Every sub-requirement MUST include `given`, `when`, and `then`. These are schema-level required
fields in v2. The `behavior` field is a **one-line summary** of the GWT scenario. The GWT fields
are the **detailed, testable specification**.

- `behavior` — one-line summary (required)
- `given` — precondition / initial state (required)
- `when` — trigger / action performed (required)
- `then` — observable outcome / expected result (required)

`spec validate` fails with a JSON-Pointer-style error if any GWT field is missing, empty, or the
literal string `TBD`.

**Behavior quality rules:**
- BANNED: "correctly", "properly", "works", "as expected", "handles" (without what)
- REQUIRED: trigger (who/what initiates) + observable outcome
- BAD: `"behavior": "Login works correctly"`
- GOOD: `"behavior": "Valid login returns JWT", "given": "Valid credentials exist", "when": "POST /login with those credentials", "then": "Returns 200 + JWT in body"`

**Sub-requirement = behavioral acceptance criterion (GWT format):**
- Each sub-req IS an acceptance criterion for the parent requirement
- The `behavior` field summarizes the criterion in one line
- The `given`/`when`/`then` fields provide the full testable specification
- L4 verification journeys compose multiple sub-reqs into end-to-end flows
- **Atomic** (single trigger, single outcome) → 1 sub-req with 1 GWT
- **Compound** (multiple paths) → happy path + error + boundary conditions, each with its own GWT

**Boundary decomposition rule:**

When a single requirement spans multiple implementation boundaries (API↔UI, Service↔Consumer, Producer↔Subscriber), decompose sub-requirements **per boundary**. Each side of a boundary must have its own sub-req with its own GWT.

Principle: if an artifact exists on one side of a boundary, the counterpart that produces or consumes it on the other side MUST also exist as a sub-req (unless it is admin-only or internal-only).

BAD — mixed layers in one sub-req:
```json
{"id": "R1", "behavior": "Project CRUD", "sub": [
  {"id": "R1.1", "behavior": "User can create a project", "given": "Authenticated user", "when": "User creates a project", "then": "Project exists"},
  {"id": "R1.2", "behavior": "User can delete a project", "given": "A project exists", "when": "User deletes it", "then": "Project is gone"}
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
- Every decision has at least one requirement tracing back to it
- Sub-requirements together cover the full behavior of the parent
- No orphan decisions
- **Research reflection**: each relevant finding in `context.research` (existing pattern, constraint, naming convention, data shape) appears in at least one sub-req's GWT — or is explicitly recorded in `known_gaps` with rationale
- **Non-goals respected**: no requirement restates or re-scopes an item from `meta.non_goals`
- **Boundary check**: if a sub-req implies a cross-boundary dependency (e.g., an API endpoint), verify the other side has a matching sub-req
- **GWT completeness check**: every sub-req has all three GWT fields filled with real, non-TBD values

### L3 Approval

Print ALL requirements and sub-requirements as text (show everything, do not truncate), then AskUserQuestion (Approve/Revise/Abort).

### L3 Gate

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --schema v2 --layer requirements
```

Pass → advance to L4 (Verification Journeys — see `references/L4-verification.md`).
