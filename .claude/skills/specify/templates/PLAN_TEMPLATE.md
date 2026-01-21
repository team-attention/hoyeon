# Plan Template

> Reference document for plan file structure. Use this as a guide when generating plans.

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

### 4. Task Flow

```markdown
## Task Flow

```
Task 1 → Task 2 → Task 3
              ↘ Task 4 (parallel)
```
```

### 5. Parallelization

```markdown
## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 2, 3 | Independent files |
| B | 4, 5 | No shared state |
```

### 6. TODOs

```markdown
## TODOs

- [ ] **1. {Task Title}**

  **What to do**:
  - [Clear implementation step]
  - [Another step]

  **Must NOT do**:
  - [Specific exclusion]

  **Parallelizable**: YES (with 2, 3) | NO (depends on 0)

  **References**:
  - `path/to/file.ts:45-78` - [Why this reference matters]
  - `docs/spec.md#section` - [What to extract from here]

  **Acceptance Criteria**:
  - [ ] [Verifiable condition]
  - [ ] [Test command] → [Expected result]

  **Commit**: YES | NO
  - Message: `type(scope): description`
```

### 7. Commit Strategy

```markdown
## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `feat(scope): add X` | `path/file.ts` |
| 2, 3 | `feat(scope): add Y and Z` | `path/y.ts`, `path/z.ts` |
```

### 8. Completion Protocol

> **Purpose**: Plan-level quality gate. Run after ALL TODOs are completed, before final submission.

```markdown
## Completion Protocol

> 모든 TODO 완료 후 실행. 전부 통과해야 "작업 완료".

### Quality Checks
- [ ] **Type Check**: `{type-check command}` → exit 0
- [ ] **Lint**: `{lint command}` → no errors
- [ ] **Test**: `{test command}` → all pass (or N/A if no tests)
- [ ] **Unused Files**: 변경으로 인해 미사용된 파일 확인 및 정리

### Final Commit
- [ ] 모든 Quality Checks 통과 후 최종 커밋
```

**Customize per project**:
- Type Check: `tsc --noEmit`, `npm run type-check`, etc.
- Lint: `npm run lint`, `eslint .`, etc.
- Test: `npm test`, `bun test`, `pytest`, etc.

### 9. Success Criteria

```markdown
## Success Criteria

### Verification Commands
```bash
command  # Expected: output
```

### Final Checklist
- [ ] All deliverables present
- [ ] All Acceptance Criteria met
- [ ] All Completion Protocol checks passed
- [ ] All "Must NOT Do" items absent
```

---

## Worker Completion Flow

Worker agent는 다음 흐름으로 작업을 완료합니다:

```
1. Task Loop: 각 TODO 순회
   ├─ 작업 수행
   ├─ Acceptance Criteria 검증 ("이 기능이 동작하나?")
   ├─ Commit (if marked YES)
   └─ 다음 TODO로 이동

2. Finalization: 모든 TODO 완료 후
   ├─ Completion Protocol 실행 ("머지해도 되나?")
   ├─ 모든 Quality Checks 통과
   └─ "작업 완료" 선언
```

**중요**: Acceptance Criteria와 Completion Protocol은 목적이 다릅니다.

| | Acceptance Criteria | Completion Protocol |
|---|---|---|
| **질문** | "이 기능이 동작하나?" | "머지해도 되나?" |
| **범위** | Task별 (개별 TODO) | Plan 전체 (공통) |
| **성격** | 기능적 검증 | 품질 검증 |
| **예시** | "401 반환", "더블클릭시 편집" | "type-check", "lint" |

---

## Parallelizable Field Values

Each TODO MUST include a `**Parallelizable**:` line with one of:

- `YES (with N, M)` - Can run in parallel with tasks N and M
- `YES (independent)` - Can run in parallel with any task
- `NO (depends on N)` - Must wait for task N to complete
- `NO (foundation)` - Other tasks depend on this

---

## Example TODO

```markdown
- [ ] **2. Add authentication middleware**

  **What to do**:
  - Create `src/middleware/auth.ts`
  - Implement JWT validation using existing pattern
  - Add to Express router chain

  **Must NOT do**:
  - Don't modify existing auth logic
  - Don't add new dependencies

  **Parallelizable**: YES (with 3)

  **References**:
  - `src/middleware/logging.ts:10-25` - Middleware pattern to follow
  - `src/utils/jwt.ts:verify()` - Use this for token validation

  **Acceptance Criteria**:
  - [ ] File exists: `src/middleware/auth.ts`
  - [ ] `bun test src/middleware/` → All tests pass
  - [ ] Unauthorized request returns 401

  **Commit**: YES
  - Message: `feat(auth): add JWT validation middleware`
```

---

## Example Completion Protocol

```markdown
## Completion Protocol

> 모든 TODO 완료 후 실행.

### Quality Checks
- [ ] **Type Check**: `npm run type-check` → exit 0
- [ ] **Lint**: `npm run lint` → no errors
- [ ] **Test**: `npm test` → all pass
- [ ] **Unused Files**: 미사용 파일 없음 확인

### Final Commit
- [ ] Quality Checks 통과 후 최종 정리 커밋 (필요시)
```
