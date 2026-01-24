# Plan Template

> Reference document for plan file structure. Designed for Orchestrator-Worker pattern where each TODO is executed by an isolated Worker agent.

**Schema Version**: 1.1

---

## Architecture Overview

```
Orchestrator (reads full PLAN)
    │
    ├── Worker 1 → TODO 1 only (isolated)
    ├── Worker 2 → TODO 2 only (isolated)
    │   ...
    └── Worker Final → Verification (read-only)
```

**Key Principles**:
- Each TODO must be **self-contained** (Worker sees only its TODO)
- **Inputs/Outputs** enable dependency between TODOs (with explicit types)
- Orchestrator handles **substitution**: `${todo-1.outputs.config_path}` → actual value
- Orchestrator handles **all commits** (Workers do NOT commit)
- **Verification** runs once after all TODOs complete (read-only)

---

## Required Sections

### 1. Header

```markdown
# {Plan Title}

> Brief description of what this plan accomplishes
```

### 2. Context

```markdown
## Context

### Original Request
[User's initial description]

### Interview Summary
**Key Discussions**:
- [Point 1]: [User's decision/preference]
- [Point 2]: [Agreed approach]

**Research Findings**:
- [Finding 1]: [Implication]
```

### 3. Work Objectives

```markdown
## Work Objectives

### Core Objective
[1-2 sentences: what we're achieving]

### Concrete Deliverables
- [Exact file/endpoint/feature]

### Definition of Done
- [ ] [Verifiable condition with command]

### Must NOT Do (Guardrails)
- [Explicit exclusion]
- [Scope boundary]
```

---

## Orchestrator Section

> **For Orchestrator only** - Workers do not see this section.

### 4. Task Flow

```markdown
## Task Flow

```
TODO-1 → TODO-2 → TODO-Final
```
```

### 5. Dependency Graph

```markdown
## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `config_path` (file) | work |
| 2 | `todo-1.config_path` | `api_module` (file) | work |
| Final | all outputs | - | verification |
```

### 6. Parallelization

```markdown
## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | (define if parallel tasks exist) |
```

### 7. Commit Strategy

> **Orchestrator commits on behalf of Workers** - Workers do NOT touch git.

```markdown
## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `chore(setup): initialize config` | `config/*` | always |
| 2 | `feat(api): add main module` | `src/api/*` | always |

> **Note**: No commit after Final (Verification is read-only). Final cleanup commit only if Orchestrator detects uncommitted changes before verification.
```

### 8. Error Handling

```markdown
## Error Handling

| Scenario | Action |
|----------|--------|
| Worker fails Acceptance Criteria | Retry up to 2 times, then halt |
| Worker times out | Halt and report |
| Verification fails | Report failures, do NOT auto-fix |
| Missing Input (previous TODO failed) | Skip dependent TODOs, halt |
```

### 9. Runtime Contract

```markdown
## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Allowed (for API calls, downloads) |
| Package Install | Denied (use existing deps only) |
| File Access | Repository only (no system files) |
| Max Execution Time | 5 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |
```

---

## TODO Section

> **For Workers** - Each Worker receives only its assigned TODO.

### 10. TODOs

```markdown
## TODOs

### [ ] TODO 1: {Task Title}

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `config_path` (file): `./config/app.json` - Application configuration file

**Steps**:
- [ ] Create config directory structure
- [ ] Generate initial configuration file
- [ ] Validate config schema

**Must NOT do**:
- Do not modify existing configs
- Do not add external dependencies
- Do not run git commands

**References**:
- `src/types/config.ts:10-30` - Config type definitions
- `docs/config-spec.md` - Configuration requirements

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `./config/app.json`
- [ ] Config contains required fields: `name`, `version`

*Static:*
- [ ] `cat ./config/app.json` → Valid JSON (parseable)

*Runtime:*
- [ ] (no tests for config-only task)

---

### [ ] TODO 2: {Task Title}

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `config_path` (file): `${todo-1.outputs.config_path}` - Configuration file from TODO 1

**Outputs**:
- `api_module` (file): `src/api/index.ts` - Main API module

**Steps**:
- [ ] Read configuration from `${config_path}`
- [ ] Create API module structure at `src/api/`
- [ ] Implement endpoints based on config
- [ ] Export module

**Must NOT do**:
- Do not hardcode config values (read from input)
- Do not modify the input config file
- Do not install new packages
- Do not run git commands

**References**:
- `src/api/template.ts:1-50` - API pattern to follow

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `src/api/index.ts`
- [ ] Module exports `api` function

*Static:*
- [ ] `tsc --noEmit src/api/index.ts` → exit 0

*Runtime:*
- [ ] `npm test -- api.test.ts` → passes

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `npm` (for type-check, lint, test)

**Inputs**:
- `config_path` (file): `${todo-1.outputs.config_path}`
- `api_module` (file): `${todo-2.outputs.api_module}`

**Outputs**: (none - verification only)

**Steps**:
- [ ] **Type Check**: `npm run type-check` → exit 0
- [ ] **Lint**: `npm run lint` → no errors
- [ ] **Test**: `npm test` → all pass
- [ ] **Deliverables Check**: Verify all outputs from previous TODOs exist

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:
- [ ] All commands exit with code 0
- [ ] No new lint warnings introduced
- [ ] All deliverables from Work Objectives exist
```

---

## Worker Output Protocol

> How Workers report results to Orchestrator.

### Success Report

Worker outputs to **stdout** (JSON format):

```json
{
  "status": "success",
  "todo_id": "todo-1",
  "outputs": {
    "config_path": "./config/app.json"
  },
  "acceptance_criteria": {
    "functional": "PASS",
    "static": "PASS",
    "runtime": "SKIP",
    "cleanup": "SKIP"
  },
  "learnings": ["Config uses JSON schema validation"],
  "issues": [],
  "decisions": ["Used standard JSON format over YAML"]
}
```

### Failure Report

```json
{
  "status": "failure",
  "todo_id": "todo-1",
  "outputs": {
    "config_path": "./config/app.json"
  },
  "acceptance_criteria": {
    "functional": "PASS",
    "static": "FAIL",
    "runtime": "SKIP",
    "cleanup": "SKIP"
  },
  "failed_category": "static",
  "error": {
    "category": "static",
    "message": "tsc --noEmit failed: Type error in config.json",
    "details": "..."
  },
  "learnings": [],
  "issues": ["Type definition incomplete"]
}
```

---

## Field Specifications

### Type Field

Declares the nature of the TODO.

| Type | Description | Can Modify Files? |
|------|-------------|-------------------|
| `work` | Implementation task | Yes |
| `verification` | Quality gate (read-only) | No |

### Required Tools Field

Explicit declaration of environment dependencies.

```markdown
**Required Tools**: `npm`, `jq`, `curl`
```

If a tool is not available, Worker should fail immediately with clear error.

### Inputs Field

Declares dependencies on outputs from previous TODOs. **Keys must match output names exactly.**

```markdown
**Inputs**:
- `{output_name}` ({type}): `${todo-N.outputs.output_name}` - Description
```

**Types**:
- `file` - File path
- `json` - JSON object/value
- `string` - Plain string
- `list` - Array of values

**Examples**:
```markdown
**Inputs**:
- `config_path` (file): `${todo-1.outputs.config_path}` - Config file path
- `api_spec` (json): `${todo-1.outputs.api_spec}` - API specification object
```

### Outputs Field

Declares what this TODO produces. **Orchestrator collects these after Worker completes.**

```markdown
**Outputs**:
- `{output_name}` ({type}): `{value}` - Description
```

**Examples**:
```markdown
**Outputs**:
- `config_path` (file): `./config/app.json` - Generated config file
- `test_report` (json): `coverage/report.json` - Test coverage data
- `files_created` (list): `["src/a.ts", "src/b.ts"]` - List of created files
```

### Steps Field

Actionable items the Worker must complete. **All items must be checkboxes.**

```markdown
**Steps**:
- [ ] Clear action 1
- [ ] Clear action 2
- [ ] Clear action 3
```

### Acceptance Criteria Field

Verifiable conditions that prove the TODO is complete. **All required categories must pass for completion.**

**Categories:**

| Category | Required | Description |
|----------|----------|-------------|
| *Functional* | ✅ | Feature works as expected (business logic) |
| *Static* | ✅ | Type check, lint pass for modified files |
| *Runtime* | ✅ | Related tests pass |
| *Cleanup* | ❌ | Unused imports/files removed (when applicable) |

**Worker Completion Rule**: `Functional ✅ AND Static ✅ AND Runtime ✅ (AND Cleanup ✅ if specified)`

```markdown
**Acceptance Criteria**:

*Functional:*
- [ ] Feature behavior check (e.g., "Returns 401 without token")
- [ ] Output exists and is valid

*Static:*
- [ ] `tsc --noEmit` passes for modified files
- [ ] `eslint` passes for modified files

*Runtime:*
- [ ] `npm test -- <related-test>` passes

*Cleanup:* (optional)
- [ ] No unused imports in modified files
- [ ] Removed deprecated files listed in Outputs
```

---

## Worker Execution Flow

Each Worker follows this flow for its assigned TODO:

```
1. Validate Environment
   └─ Check Required Tools are available

2. Receive TODO
   └─ Orchestrator has already substituted ${...} references

3. Validate Inputs
   └─ Check all input files/values exist

4. Execute Steps
   ├─ Work through each checkbox
   └─ Mark completed as done

5. Verify Acceptance Criteria (ALL required categories must pass)
   ├─ Functional: Feature works as specified
   ├─ Static: tsc, eslint pass for modified files
   ├─ Runtime: Related tests pass
   └─ Cleanup (if specified): Unused code removed

6. Report Results
   └─ Output JSON to stdout (success or failure)

Completion Rule: Functional ✅ AND Static ✅ AND Runtime ✅ (AND Cleanup ✅)
(Worker does NOT commit - Orchestrator handles git)
```

---

## Orchestrator Execution Flow

```
1. Parse PLAN
   └─ Validate Dependency Graph consistency

2. For each TODO (respecting dependencies):
   ├─ Substitute ${...} references with actual values
   ├─ Dispatch to Worker
   ├─ Collect Worker output (stdout JSON)
   ├─ If success: store outputs, commit if specified
   └─ If failure: apply Error Handling rules

3. After all work TODOs:
   └─ Dispatch TODO Final (verification)

4. If verification passes:
   └─ Report success

5. If verification fails:
   └─ Report failures (do NOT auto-fix)
```

---

## Verification Details

The final TODO runs after all work TODOs complete.

| Aspect | Description |
|--------|-------------|
| **Purpose** | Quality gate - "Is this mergeable?" |
| **Type** | `verification` (read-only) |
| **Timing** | After ALL work TODOs complete |
| **Scope** | Entire project, not individual features |
| **On Failure** | Report to Orchestrator, do NOT auto-fix |

### Quality Checks (customize per project)

| Check | Common Commands |
|-------|-----------------|
| Type Check | `tsc --noEmit`, `npm run type-check`, `mypy .` |
| Lint | `npm run lint`, `eslint .`, `ruff check .` |
| Test | `npm test`, `bun test`, `pytest`, `go test ./...` |
| Build | `npm run build`, `go build ./...` |

---

## Acceptance Criteria vs Verification

| | Acceptance Criteria (per TODO) | Verification (TODO Final) |
|---|---|---|
| **Question** | "Is this TODO complete?" | "Is the entire plan mergeable?" |
| **Scope** | Per TODO (individual) | Entire Plan (global) |
| **Categories** | Functional + Static + Runtime (+ Cleanup) | Full project type-check, lint, test |
| **Examples** | "Returns 401", "tsc passes for this file" | "All tests green", "No lint warnings" |
| **When** | After each TODO | After ALL TODOs |
| **Completion Rule** | All required categories must pass | All checks must pass |

---

## Example: Complete TODO

```markdown
### [ ] TODO 2: Add authentication middleware

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `config_path` (file): `${todo-1.outputs.config_path}` - JWT configuration

**Outputs**:
- `middleware_path` (file): `src/middleware/auth.ts` - Auth middleware module

**Steps**:
- [ ] Read JWT settings from `${config_path}`
- [ ] Create `src/middleware/auth.ts`
- [ ] Implement token validation using existing pattern from references
- [ ] Add middleware to Express router chain
- [ ] Export middleware function

**Must NOT do**:
- Do not modify existing auth logic in other files
- Do not add new npm dependencies
- Do not change the JWT secret handling
- Do not run git commands

**References**:
- `src/middleware/logging.ts:10-25` - Middleware pattern to follow
- `src/utils/jwt.ts:verify()` - Use this for token validation

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `src/middleware/auth.ts`
- [ ] File exports `authMiddleware` function
- [ ] Request without token → 401 Unauthorized
- [ ] Request with valid token → Passes to next handler

*Static:*
- [ ] `tsc --noEmit src/middleware/auth.ts` → exit 0
- [ ] `eslint src/middleware/auth.ts` → no errors

*Runtime:*
- [ ] `npm test -- auth.test.ts` → passes
```

---

## Example: Verification

```markdown
### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `npm`

**Inputs**:
- `middleware_path` (file): `${todo-2.outputs.middleware_path}`
- `routes_path` (file): `${todo-3.outputs.routes_path}`

**Outputs**: (none)

**Steps**:
- [ ] **Type Check**: `npm run type-check` → exit 0
- [ ] **Lint**: `npm run lint` → no errors
- [ ] **Test**: `npm test` → all pass
- [ ] **Integration**: Verify middleware is imported in routes file

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix lint errors (report only)
- Do not run git commands

**Acceptance Criteria**:
- [ ] All commands exit with code 0
- [ ] No new lint warnings introduced
- [ ] All deliverables from Work Objectives exist
```
