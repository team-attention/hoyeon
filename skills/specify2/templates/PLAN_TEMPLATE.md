# PLAN: {feature_name}

## Meta

- **Depth:** {depth}
- **Interaction:** {interaction}
- **Created:** {timestamp}
- **Draft:** `.dev/specs/{feature_name}/DRAFT.md`

---

## Context

### Original Request
{From DRAFT What & Why}

### Interview Summary
{From DRAFT User Decisions - or Assumptions for autopilot}

| Decision | Choice | Rationale |
|----------|--------|-----------|
| | | |

### Research Findings
{From DRAFT Agent Findings summary}

### Assumptions (autopilot only)
{From DRAFT Assumptions section}

> ⚠️ Autopilot mode: 표준 선택이 적용되었습니다.

---

## Work Objectives

### Concrete Deliverables
1. {Deliverable 1}
2. {Deliverable 2}

### Must NOT Do
- Do not modify unrelated files
- Do not change existing API contracts (unless specified)
- {From DRAFT Boundaries}
- {From Analysis gap-analyzer}

### Definition of Done
- [ ] {From DRAFT Success Criteria}
- [ ] All tests pass
- [ ] Code review approved

---

## Orchestrator Section

### Task Flow
```
TODO 1 → TODO 2 → TODO 3 → TODO Final
```

### Dependency Graph

| TODO | Requires | Outputs |
|------|----------|---------|
| 1 | - | `{output}` |
| 2 | `todo-1.{output}` | `{output}` |
| Final | all above | verification_report |

### Parallelization

| TODOs | Parallel |
|-------|----------|
| 1, 3 | ✅ |
| 2 | ❌ (depends on 1) |

### Commit Strategy

| TODO | Commit | Message Template |
|------|--------|------------------|
| 1 | ✅ | `feat({scope}): {description}` |
| 2 | ✅ | `feat({scope}): {description}` |
| Final | ✅ | `test({scope}): verify {feature}` |

### Error Handling

| Failure | Action |
|---------|--------|
| Worker fails | Retry 2x → halt |
| Verify fails | Analyze → fix TODO |
| Scope violation | Halt |

---

## TODOs

### [ ] TODO 1: {title}

**Type:** `work`

**Required Tools:** Read, Write, Edit

**Inputs:**
- (none)

**Outputs:**
- `{output_name}`: {type}

**Steps:**
- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

**Must NOT do:**
- Do not run git commands
- {specific prohibitions}

**References:**
- `{file:line}` - {description}

**Acceptance Criteria:**

| Category | Criteria |
|----------|----------|
| Functional | {feature works} |
| Static | TypeScript compiles |
| Runtime | Related tests pass |

**Verify:**
```yaml
acceptance:
  - given: ["{precondition}"]
    when: "{action}"
    then: ["{expected}"]
commands:
  - run: "npm test -- {file}.spec.ts"
    expect: "exit 0"
risk: {LOW|MEDIUM|HIGH}
```

---

### [ ] TODO 2: {title}

**Type:** `work`

**Inputs:**
- `{from todo-1}`: {type}

**Outputs:**
- `{output_name}`: {type}

**Steps:**
- [ ] Step 1
- [ ] Step 2

**Must NOT do:**
- Do not run git commands

**References:**
- `{file:line}` - {description}

**Acceptance Criteria:**

| Category | Criteria |
|----------|----------|
| Functional | {feature works} |
| Static | TypeScript compiles |
| Runtime | Related tests pass |

**Verify:**
```yaml
acceptance:
  - given: ["{precondition}"]
    when: "{action}"
    then: ["{expected}"]
commands:
  - run: "npm test -- {file}.spec.ts"
    expect: "exit 0"
risk: {LOW|MEDIUM|HIGH}
```

---

### [ ] TODO Final: Verification

**Type:** `verification`

**Required Tools:** Read, Bash

**Inputs:**
- All previous TODO outputs

**Steps:**
- [ ] Run full test suite
- [ ] Verify all acceptance criteria met
- [ ] Check for regressions
- [ ] Validate against Definition of Done

**Must NOT do:**
- Do not modify any files
- Do not run git commands

**Acceptance Criteria:**

| Category | Criteria |
|----------|----------|
| Functional | All features work as specified |
| Static | Full project compiles, lint passes |
| Runtime | All tests pass |

**Verify:**
```yaml
commands:
  - run: "npm test"
    expect: "exit 0"
  - run: "npm run build"
    expect: "exit 0"
  - run: "npm run lint"
    expect: "exit 0"
```

---

## Verification Summary

### Agent-Verifiable (A-items)
- A-1: {verification} (method: `{command}`)
- A-2: {verification} (method: `{test}`)

### Human-Required (H-items)
- H-1: {verification} (reason: {why human needed})

### Verification Gap
- {Any limitations or workarounds}

---

## External Dependencies (if applicable)

| Dependency | Type | Setup | Env Vars |
|------------|------|-------|----------|
| {service} | {DB/API/etc} | {how to set up} | `{VAR}` |

---

## Rollback Plan (HIGH risk items)

### TODO {N}: {title}
**Risk:** HIGH

**Rollback steps:**
1. {step 1}
2. {step 2}
3. {step 3}

**Verification after rollback:**
- {how to verify rollback worked}
