## L3: Requirements + Sub-requirements

**Output**: `requirements[]` with `sub[]`

### Step 1: Scaffold from decisions

```bash
hoyeon-cli spec derive-requirements .dev/specs/{name}/spec.json
```

This auto-generates requirement stubs with `source.ref` correctly linked to every decision.
Output: `R0` (from goal) + `R1`...`Rn` (one per decision), each with a `TODO` behavior and 1 `TODO` sub-req.

**Coverage is 100% from the start.** No source.ref errors, no orphan decisions.

### Step 2: Reshape + Fill behaviors via --patch

The scaffold is a **starting point, not a constraint**. The 1:1 decision→requirement mapping is rarely the final structure. Freely reorganize:

- **Split**: One decision often needs multiple requirements (e.g., D1:"JWT auth" → R1:login, R2:token refresh, R3:token expiry)
- **Merge**: Multiple decisions may combine into one requirement (e.g., D1+D2 → R1:password security)
- **Add**: Create new requirements with `source: {type: "implicit"}` for behaviors not tied to any single decision
- **Delete**: Remove scaffold requirements that are redundant after reorganization

As long as `spec validate` passes at the L3 gate (every decision referenced by at least one requirement), the structure is valid.

Run `hoyeon-cli spec guide requirements --schema v7` to check field types, then patch:

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --stdin --patch << 'EOF'
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

**Sub-requirement decomposition:**
- **Atomic** (single trigger, single outcome) → 1 sub-req
- **Compound** (multiple paths) → happy path + error + boundary conditions

**Coverage checks (agent self-check before approval):**
- Every decision has at least one requirement tracing back to it (guaranteed by derive)
- Sub-requirements together cover the full behavior of the parent
- No orphan decisions

### L3 Approval

Print ALL requirements and sub-requirements as text (show everything, do not truncate), then AskUserQuestion (Approve/Revise/Abort).

### L3 Gate

```bash
hoyeon-cli spec validate .dev/specs/{name}/spec.json --layer requirements
```

Pass → advance to L4.
