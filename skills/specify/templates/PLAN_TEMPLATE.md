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
    └── Worker Final → Verification (no Edit/Write, Bash allowed)
```

**Key Principles**:
- Each TODO must be **self-contained** (Worker sees only its TODO)
- **Inputs/Outputs** enable dependency between TODOs (with explicit types)
- Orchestrator handles **substitution**: `${todo-1.outputs.config_path}` → actual value
- Orchestrator handles **all commits** (Workers do NOT commit)
- **Verification** runs once after all TODOs complete (no Edit/Write, Bash for tests allowed)

### TODO Granularity Rules

Each TODO is executed by an isolated Worker agent (not a human). Agent call overhead (context transfer, result collection, verification) is significant, so TODO granularity directly impacts total execution time.

**Sizing Criterion**: One TODO = single purpose + single verifiable artifact + 1-5 files modified/created.

**One-Verb Rule**: A TODO description should have one primary verb ("implement", "refactor", "migrate"). If it contains two or more verbs joined by "and", consider splitting.

**When to Split**:
- Independent changes across different modules/layers (enables parallel execution)
- High-failure-risk sections (external API calls, complex algorithms) — isolate for targeted retry
- Different expertise domains mixed in one task (e.g., DB schema + UI component)

**When to Merge**:
- Atomicity would break if split (rename/refactor touching declaration + all call sites)
- High context overlap (repeated modifications to the same file/class)
- Intermediate output is consumed immediately without transformation by the next TODO
- Input description would be longer than the task description itself (context overhead > work)

**Default Policy**:
- Uncertain/exploratory work → split small, verify quickly
- Mechanical/deterministic work → merge large, minimize call count
- Prefer fewer TODOs over more — when in doubt, merge

---

## Required Sections

### 1. Header

```markdown
# {Plan Title}

> Brief description of what this plan accomplishes
> Mode: {depth}/{interaction} (omit if standard/interactive)
```

### 2. Assumptions (quick/autopilot modes)

> Include this section when the plan was generated with quick or autopilot mode. Omit for standard/interactive.

```markdown
## Assumptions

> Decisions made autonomously without explicit user confirmation.

| Decision Point | Assumed Choice | Rationale | Source |
|---------------|---------------|-----------|--------|
| [e.g. Auth method] | [e.g. JWT] | [e.g. Already installed] | [autopilot-rule/codebase-pattern] |

> **Note**: These assumptions were NOT confirmed by the user. If any assumption is incorrect, re-run with `--interactive` to get explicit confirmation.
```

### 3. Verification Summary

```markdown
## Verification Summary

### Auto (machine-verified)
| ID | Criterion | Method | Related TODO |
|----|-----------|--------|-------------|
| Auto-1 | [criterion] | command: `npm test` | TODO 2 |
| Auto-2 | [criterion] [sandbox] | e2e test | TODO Final |

### Agent [sandbox] (agent-verified, sandbox)

> Include when project has Tier 4 sandbox infrastructure (docker-compose, .feature files, sandbox fixtures).
> If no sandbox infra exists, omit this section and note in Verification Gaps.

| ID | Scenario | Agent | Method |
|----|----------|-------|--------|
| Agent-1 | [user-facing scenario] [sandbox] | sandbox-user (browser) + sandbox-admin (DB) | [action → verification] |

**Sandbox prerequisites**: `{sandbox-up-command}` must succeed before Agent [sandbox] items execute.

### Manual (human review)
| ID | Criterion | Reason | Review Material |
|----|-----------|--------|----------------|
| Manual-1 | [criterion] | Subjective judgment | [link/path] |

### Verification Gaps
- [environment constraints and alternatives]
```

### 4. External Dependencies Strategy

```markdown
## External Dependencies Strategy

### Pre-work (user prepares before AI work)
| Dependency | Action | Command/Step | Blocking? |
|------------|--------|-------------|-----------|
| PostgreSQL | Run local DB via docker-compose | `docker-compose up -d db` | Yes |
| Stripe API | Set test key env var | `export STRIPE_TEST_KEY=sk_test_...` | Yes |

### During (AI work strategy)
| Dependency | Dev Strategy | Rationale |
|------------|-------------|-----------|
| PostgreSQL | Use `pg-mem` in-memory mock | Testable without real DB |
| Stripe API | Use stub response files | Existing pattern in `tests/fixtures/stripe/` |
| S3 | Use localstack container | Already included in docker-compose |

### Post-work (user actions after completion)
| Task | Related Dependency | Action | Command/Step |
|------|--------------------|--------|-------------|
| DB migration | PostgreSQL | Apply schema to real DB | `npm run migrate` |
| Staging validation | Stripe API | Verify test payment flow | Manual - check Stripe dashboard |
| Env var registration | All | Add to production env | Request from DevOps |

> **Note**: Pre-work items with Blocking=Yes must be completed before AI work begins.
> If no external dependencies exist, mark this section as "(none)".
```

### 5. Context

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

### 6. Work Objectives

```markdown
## Work Objectives

### Core Objective
[1-2 sentences: what we're achieving]

### Non-goals (out of scope)
- [What this project is NOT trying to achieve]

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

### 7. Task Flow

```markdown
## Task Flow

```
TODO-1 → TODO-2 → TODO-Final
```
```

### 8. Dependency Graph

```markdown
## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `config_path` (file) | work |
| 2 | `todo-1.config_path` | `api_module` (file) | work |
| Final | all outputs | - | verification |
```

### 9. Parallelization

```markdown
## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | (define if parallel tasks exist) |
```

### 10. Commit Strategy

> **Orchestrator commits on behalf of Workers** - Workers do NOT touch git.

```markdown
## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `chore(setup): initialize config` | `config/*` | always |
| 2 | `feat(api): add main module` | `src/api/*` | always |

> **Note**: No commit after Final (Verification does not modify source code). Final cleanup commit only if Orchestrator detects uncommitted changes before verification.
```

### 11. Error Handling

```markdown
## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `env_error` | API key missing, permission denied, network timeout | `/EACCES\|ECONNREFUSED\|timeout\|401\|403/i` |
| `code_error` | Type error, lint failure, test failure | `/TypeError\|SyntaxError\|lint\|test failed/i` |
| `scope_internal` | Missing prerequisite, schema mismatch, dependency conflict | Verify Worker `suggested_adaptation` present |
| `unknown` | Unclassifiable errors | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → (see below) |
| verification fails | Analyze immediately (no retry) → (see below) |
| Worker times out | Halt and report |
| Missing Input | Skip dependent TODOs, halt |

### After Analyze

| Category | Action |
|----------|--------|
| `env_error` | Halt + log to `issues.md` |
| `code_error` | Create Fix Task (depth=1 limit) |
| `scope_internal` | Adapt → Dynamic TODO (depth=1, delegates to Fix Task mechanism) |
| `unknown` | Halt + log to `issues.md` |

### Fix Task Rules

- Fix Task type is always `work`
- Fix Task failure → Halt (no further Fix Task creation)
- Max depth = 1 (prevents infinite loop)

### Adapt Rules

- Adapt uses Fix Task mechanism (delegation)
- Scope check: DoD match OR file allowlist → adapt; both NO + non-destructive → adapt (OUT_OF_SCOPE tag); both NO + destructive → halt
- depth=1 (dynamic TODO cannot adapt)
- Dynamic TODO added to PLAN.md with (ADDED) marker + logged to amendments.md (audit trail)
```

### 12. Runtime Contract

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

### 13. TODOs

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

*Scenarios:* (requirement scenario IDs this task fulfills)
- R1-S1, R1-S2

*Checks:*
- [ ] `cat ./config/app.json` → Valid JSON (parseable) `[static]`
- [ ] (no build/lint/format checks for config-only task)

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

*Scenarios:* (requirement scenario IDs this task fulfills)
- R2-S1, R2-S2

*Checks:*
- [ ] `tsc --noEmit src/api/index.ts` → exit 0 `[static]`
- [ ] `npm test -- api.test.ts` → passes `[build]`

---

### [ ] TODO Final: Verification

**Type**: verification

**Required Tools**: (from DRAFT's Agent Findings > Project Commands)

**Inputs**:
- `config_path` (file): `${todo-1.outputs.config_path}`
- `api_module` (file): `${todo-2.outputs.api_module}`

**Outputs**: (none)

**Steps**:
- [ ] Run type check (if applicable)
- [ ] Run lint (if applicable)
- [ ] Run tests
- [ ] Verify all deliverables exist
- [ ] Boot and run sandbox E2E tests (if Agent [sandbox] items exist in Verification Summary)

**Must NOT do**:
- Do not use Edit or Write tools (source code modification forbidden)
- Do not add new features or fix errors (report only)
- Do not run git commands
- Bash is allowed for: running tests, builds, type checks, and booting test infrastructure (e.g., `sandbox:up`, `docker-compose up`)
- Do not modify repo files via Bash (no `sed -i`, `echo >`, etc.)

**Acceptance Criteria**:

> Scenarios from requirements; checks from DRAFT's Agent Findings > Project Commands + Auto items

*Scenarios:* (all requirement scenario IDs this verification task covers)
- R1-S1, R1-S2, R2-S1, R2-S2

*Checks:*
- [ ] `{type-check-command}` → exit 0 (e.g., `tsc --noEmit`, `mypy .`, `go vet ./...`) `[static]`
- [ ] `{lint-command}` → no errors (e.g., `eslint .`, `ruff check .`, `golangci-lint run`) `[lint]`
- [ ] `{test-command}` → all pass (e.g., `npm test`, `pytest`, `go test ./...`) `[build]`
```

---

## Worker Output Protocol

> How Workers report results to Orchestrator.

Worker outputs **JSON** in a ```json code block. The Verify Worker independently re-executes each `command` in `acceptance_criteria` to verify Worker's report.

### Output Schema

```json
{
  "outputs": {
    "config_path": "./config/app.json",
    "exported_name": "configLoader"
  },
  "acceptance_criteria": {
    "scenarios": ["R1-S1", "R1-S2"],
    "checks": [
      { "type": "static", "run": "tsc --noEmit ./config/app.json" },
      { "type": "lint", "run": "eslint ./config/app.json" },
      { "type": "build", "run": "npm test -- config.test.ts" }
    ]
  },
  "learnings": ["Config uses JSON schema validation"],
  "issues": ["Existing type definitions incomplete (out of scope)"],
  "decisions": ["Used standard JSON format over YAML for simplicity"]
}
```

### Field Specifications

| Field | Required | Description |
|-------|----------|-------------|
| `outputs` | ✅ | Key-value pairs matching TODO's **Outputs** field |
| `acceptance_criteria` | ✅ | Array of verification items (see below) |
| `learnings` | ❌ | Patterns discovered and **applied** (tips for next Worker) |
| `issues` | ❌ | Problems found but **not resolved** (out of scope) |
| `decisions` | ❌ | Decisions made and why |

### acceptance_criteria Structure (v5)

| Field | Required | Description |
|-------|----------|-------------|
| `scenarios` | ✅ | Array of scenario IDs from `requirements[].scenarios[].id` this task fulfills |
| `checks` | ✅ | Array of automated checks (`{ type, run }`) |

### Check Types

| Type | What to Verify |
|------|----------------|
| `static` | Type checking (`tsc --noEmit`) |
| `build` | Compilation and tests (`npm test`) |
| `lint` | Linting (`eslint`) |
| `format` | Formatting (`prettier --check`) |

**Completion Rule**: All referenced scenarios verified AND all checks pass

### Verification Flow

```
Worker completes TODO
        ↓
Worker outputs JSON with acceptance_criteria
        ↓
Orchestrator dispatches Verify Worker
        ↓
Verify Worker re-executes each command in acceptance_criteria
        ↓
Verify Worker outputs: VERIFIED (all pass) or FAILED (mismatch detected)
        ↓
Orchestrator receives Verify Worker result
        ↓
[VERIFIED] → Mark TODO complete    [FAILED] → Retry Worker
```

⚠️ **Hook re-verifies Worker's claims.** Worker saying "PASS" is not trusted—the command is re-executed.

---

## Field Specifications

### Type Field

Declares the nature of the TODO.

| Type | Description | Edit/Write Tools | Bash for Testing |
|------|-------------|------------------|------------------|
| `work` | Implementation task | ✅ Yes | ✅ Yes |
| `verification` | Quality gate | ❌ Forbidden | ✅ Yes (tests, builds, sandbox boot) |

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

Verifiable conditions that prove the TODO is complete. **Scenarios + Checks must all pass for completion.**

**Structure (v5):**

| Field | Required | Description |
|-------|----------|-------------|
| *Scenarios* | ✅ | Requirement scenario IDs (`requirements[].scenarios[].id`) this task fulfills |
| *Checks* | ✅ | Runnable commands tagged by type: `[static]`, `[build]`, `[lint]`, `[format]` |

**Worker Completion Rule**: All scenarios verified AND all checks pass

```markdown
**Acceptance Criteria**:

*Scenarios:*
- R1-S1, R2-S1

*Checks:*
- [ ] `tsc --noEmit` passes for modified files `[static]`
- [ ] `eslint` passes for modified files `[lint]`
- [ ] `npm test -- <related-test>` passes `[build]`
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

5. Verify Acceptance Criteria (scenarios verified AND all checks pass)
   ├─ Scenarios: All referenced requirement scenario IDs are fulfilled
   └─ Checks: All static/build/lint/format checks pass

6. Report Results
   └─ Output JSON to stdout (success or failure)

Completion Rule: Scenarios verified AND all Checks pass
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

*Scenarios:* (requirement scenario IDs this task fulfills)
- R1-S1, R1-S2, R1-S3

*Checks:*
- [ ] `tsc --noEmit src/middleware/auth.ts` → exit 0 `[static]`
- [ ] `eslint src/middleware/auth.ts` → no errors `[lint]`
- [ ] `npm test -- auth.test.ts` → passes `[build]`
```

---

## Example: TODO Final

> This example uses Node.js commands. Replace with project-specific commands from DRAFT's Agent Findings > Project Commands.

```markdown
### [ ] TODO Final: Verification

**Type**: verification

**Required Tools**: (per project - e.g., npm, cargo, go, pytest)

**Inputs**:
- `middleware_path` (file): `${todo-2.outputs.middleware_path}`
- `routes_path` (file): `${todo-3.outputs.routes_path}`

**Outputs**: (none)

**Steps**:
- [ ] Run type check (if applicable)
- [ ] Run lint (if applicable)
- [ ] Run tests
- [ ] Verify middleware is imported in routes file
- [ ] Boot and run sandbox E2E tests (if Agent [sandbox] items exist in Verification Summary)

**Must NOT do**:
- Do not use Edit or Write tools (source code modification forbidden)
- Do not add new features or fix errors (report only)
- Do not run git commands
- Bash is allowed for: running tests, builds, type checks, and booting test infrastructure (e.g., `sandbox:up`, `docker-compose up`)
- Do not modify repo files via Bash (no `sed -i`, `echo >`, etc.)

**Acceptance Criteria**:

*Scenarios:* (all requirement scenario IDs covered by this verification)
- R1-S1, R1-S2, R1-S3, R2-S1

*Checks:*
- [ ] Type check passes (e.g., `tsc --noEmit`, `mypy .`, `go vet ./...`) `[static]`
- [ ] Lint passes (e.g., `eslint .`, `ruff check .`, `golangci-lint run`) `[lint]`
- [ ] Tests pass (e.g., `npm test`, `pytest`, `go test ./...`, `cargo test`) `[build]`
```
