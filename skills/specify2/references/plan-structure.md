# Plan Structure Reference

PLAN.md follows the **Orchestrator-Worker pattern**.

---

## Orchestrator Section

Only Orchestrator reads this section.

### Task Flow
```
TODO 1 → TODO 2 → TODO 3 → TODO Final
```

### Dependency Graph

| TODO | Requires | Outputs |
|------|----------|---------|
| 1 | - | `config_path` |
| 2 | `todo-1.config_path` | `middleware_path` |
| 3 | `todo-2.middleware_path` | `router_updated` |
| Final | all above | verification_report |

### Parallelization

| TODO | Can Parallel With |
|------|-------------------|
| 1, 3 | Yes (independent) |
| 2 | No (depends on 1) |

### Commit Strategy

| TODO | Commit |
|------|--------|
| 1 | ✅ Per-TODO |
| 2 | ✅ Per-TODO |
| 3 | ❌ (with Final) |
| Final | ✅ |

### Error Handling

| Failure Type | Action |
|--------------|--------|
| Worker fails | Retry up to 2x, then halt |
| Verification fails | Analyze → Create fix TODO |
| Scope violation | Halt immediately |

### Runtime Contract

- Workers see only their own TODO section
- Orchestrator substitutes `${todo-N.outputs.field}`
- Only Orchestrator commits to git

---

## TODO Section

Each TODO follows this structure:

```markdown
### [ ] TODO N: {title}

**Type:** `work` | `verification`

**Required Tools:** Read, Write, Bash, etc.

**Inputs:**
- `config_path`: string (from TODO 1)

**Outputs:**
- `middleware_path`: string

**Steps:**
- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

**Must NOT do:**
- Do not run git commands
- Do not modify files outside scope

**References:**
- `src/middleware/logging.ts:10-25` - Pattern to follow

**Acceptance Criteria:**

| Category | Criteria |
|----------|----------|
| Functional | Feature works as specified |
| Static | TypeScript compiles, lint passes |
| Runtime | Related tests pass |

**Verify:**
```yaml
acceptance:
  - given: ["user not authenticated"]
    when: "access /api/protected"
    then: ["returns 401"]
integration:
  - "Middleware calls next() on valid token"
commands:
  - run: "npm test -- auth.spec.ts"
    expect: "exit 0"
risk: MEDIUM
```
```

---

## Type Field

| Type | Retry on Fail | Can Modify Files | Use Case |
|------|---------------|------------------|----------|
| `work` | ✅ Up to 2x | ✅ Yes | Implementation |
| `verification` | ❌ No | ❌ Read-only | Testing, validation |

---

## Acceptance Criteria Categories

| Category | Required | Description |
|----------|----------|-------------|
| *Functional* | ✅ | Feature functionality (business logic) |
| *Static* | ✅ | Type check, lint pass |
| *Runtime* | ✅ | Related tests pass |
| *Cleanup* | ❌ | Unused imports/files (only if needed) |

**Completion:** `Functional ✅ AND Static ✅ AND Runtime ✅`

---

## Verify Block Format

```yaml
Verify:
  acceptance:  # Black-box (Given-When-Then)
    - given: ["precondition"]
      when: "action"
      then: ["expected result"]
  integration:  # Gray-box
    - "Module A calls Module B correctly"
  commands:  # Executable checks
    - run: "npm test -- file.spec.ts"
      expect: "exit 0"
  risk: LOW | MEDIUM | HIGH
```

---

## Risk Tagging

| Risk | Meaning | Requirements |
|------|---------|--------------|
| LOW | Reversible, isolated | Standard verification |
| MEDIUM | Multiple files, API changes | Verify block + scrutiny |
| HIGH | DB schema, auth, breaking API | Verify + rollback + approval |

---

## TODO Final

Special verification TODO at the end:

```markdown
### [ ] TODO Final: Verification

**Type:** `verification`

**Steps:**
- [ ] Run full test suite
- [ ] Verify all acceptance criteria
- [ ] Check for regressions

**Acceptance Criteria:**

| Category | Criteria |
|----------|----------|
| Functional | All features work |
| Static | Full project compiles |
| Runtime | All tests pass |

**Verify:**
```yaml
commands:
  - run: "npm test"
    expect: "exit 0"
  - run: "npm run build"
    expect: "exit 0"
```
```

---

## Key Principles

1. **Worker isolation** - Worker sees only its TODO
2. **Variable substitution** - `${todo-N.outputs.field}`
3. **Git prohibition** - Only Orchestrator commits
4. **Unified verification** - TODO Final uses same structure
