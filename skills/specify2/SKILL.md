---
name: specify2
description: |
  This skill should be used when the user says "/specify2", "plan this", or "make a plan".
  Interview-driven planning workflow with modular depth and interaction modes.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - Edit
  - AskUserQuestion
---

# /specify2 Skill - Modular Planning

Interview-driven planning with **two independent axes**:
- **Depth**: How thorough the process is (quick / standard / thorough)
- **Interaction**: How decisions are made (interactive / autopilot)

---

## Core Principles

1. **Interview First** - Never generate a plan until explicitly asked ("make it a plan", "플랜 만들어줘")
2. **Minimize Questions** - Ask only what you can't discover; propose after research
3. **Parallel Exploration** - Use parallel foreground agents to gather context efficiently
4. **Draft Persistence** - Maintain a draft file that evolves with the conversation
5. **Reviewer Approval** - Plans must pass reviewer before completion

---

## 1. Mode Selection

### 1.1 Depth Selection

| Signal | Depth | Use Case |
|--------|-------|----------|
| `--quick` flag | `quick` | 간단한 작업 (fix, typo, rename) |
| `--thorough` flag | `thorough` | 복잡한 작업 (architecture, migration) |
| Simple keywords (fix, typo, rename, bump) | `quick` | 자동 감지 |
| Complex keywords (architecture, migrate, security) | `thorough` | 자동 감지 |
| Default | `standard` | 일반 작업 |

### 1.2 Interaction Selection

| Signal | Interaction | Use Case |
|--------|-------------|----------|
| `--autopilot` flag | `autopilot` | 질문 없이 표준 선택으로 자동 |
| `--interactive` flag | `interactive` | 명시적 질문 모드 |
| `quick` depth default | `autopilot` | Quick은 기본 autopilot |
| `standard`/`thorough` default | `interactive` | 기본 interactive |

### 1.3 Combination Matrix

|  | Interactive | Autopilot |
|---|-------------|-----------|
| **Quick** | `--quick --interactive` | `--quick` (default) |
| **Standard** | (default) | `--autopilot` |
| **Thorough** | `--thorough` (default) | `--thorough --autopilot` |

**Common combinations:**
- `/specify2 add-auth` → standard + interactive (기본)
- `/specify2 add-auth --autopilot` → standard + autopilot
- `/specify2 fix-typo --quick` → quick + autopilot
- `/specify2 migrate-db --thorough` → thorough + interactive

### 1.4 Combination Priority Rules

두 축이 충돌할 때의 우선순위:

| 충돌 상황 | 우선 축 | 이유 |
|-----------|---------|------|
| Draft 구조 (Assumptions) | **Depth** | Quick은 Interview 스킵 → Assumptions 필수 |
| Review 동작 (user confirm) | **Interaction** | Autopilot의 본질은 무중단 진행 |

#### 특수 조합 동작

| 조합 | 주의사항 | 동작 |
|------|----------|------|
| **quick + interactive** | ⚠️ Interview 여전히 스킵됨 | Assumptions 자동 적용, Explore summary만 확인 대기 |
| **thorough + autopilot** | ⚠️ Review 자동화됨 | Cosmetic/Semantic 모두 auto-fix, scope 변경 시 halt |

> 상세: `modules/draft.md`, `modules/review.md` 참조

---

## 2. Module Reference

Each module receives `depth` and `interaction` as input.

### 2.1 Module Activation by Depth

| Module | Source | Quick | Standard | Thorough |
|--------|--------|-------|----------|----------|
| **Triage** | `modules/triage.md` | ✅ | ✅ | ✅ |
| **Explore** | `modules/explore.md` | lite (2 agents) | full (4 agents) | deep (4 agents, deeper prompts) |
| **Draft** | `modules/draft.md` | + Assumptions | ✅ | ✅ |
| **Interview** | `modules/interview.md` | ❌ skip | ✅ | deep (2+ rounds) |
| **Analysis** | `modules/analysis.md` | tradeoff-lite | full (4 agents) | strict |
| **Plan** | `modules/plan.md` | ✅ | ✅ | ✅ |
| **Review** | `modules/review.md` | 1x auto-fix | loop | strict loop |

### 2.2 AskUserQuestion by Interaction

| Module | Checkpoint | Interactive | Autopilot |
|--------|------------|-------------|-----------|
| **Explore** | Exploration Summary | ✅ 확인 대기 | 출력만 (진행) |
| **Interview** | Requirements | ✅ AskUser | 표준 선택 자동 |
| **Interview** | Tech-Decision Proposal | ✅ AskUser | 스킵 (기존 스택) |
| **Analysis** | HIGH Risk Decision Points | ✅ AskUser | 보수적 선택 |
| **Plan** | Decision Summary Checkpoint | ✅ AskUser | 스킵 (로깅만) |
| **Plan** | Verification Summary | ✅ AskUser | 스킵 |
| **Review** | Semantic Rejection | ✅ AskUser | auto-fix 시도 |

---

## 3. Task Graphs by Depth

### 3.1 Quick Depth

```
Triage → Explore(lite) → Draft(+Assumptions) → Analysis(tradeoff-lite) → Plan → Review(1x)
                                                        │
                                                   [HIGH 감지?]
                                                        ↓
                                                  ⚠️ "standard 권장"
```

**Skipped:** Interview (replaced by Assumptions)

### 3.2 Standard Depth (Default)

```
Triage → Explore(+Intent) → Draft → Interview ←──┐ → Analysis → Plan → Review ←──┐
                                       ↑         │                         ↑       │
                                  [needs more] ──┘                    [changes] ───┘
```

**Re-entrant loops:** Interview, Review

### 3.3 Thorough Depth

```
Triage → Explore(deep,+Intent) → Draft → Interview(deep) ←──┐ → Analysis(strict) → Plan → Review(strict) ←──┐
                                                   ↑         │                                        ↑        │
                                              [needs more] ──┘                                   [changes] ────┘
```

**Enhanced:** 4 agents with deeper prompts, 2+ Interview rounds, strict Review

> **Loop 상세:** `modules/interview.md`, `modules/review.md` 참조

---

## 4. Execution Summary

```
1. Parse Input → depth, interaction 결정
2. Load modules/{module}.md 순차 실행
3. Re-entrant loops 처리 (Interview, Review)
4. Finalize → DRAFT 삭제, 다음 단계 안내
```

> **상세 Flow:** `references/example-flows.md` 참조

---

## 5. Autopilot Decision Rules

When `interaction = autopilot`, use these standard choices:

| Decision Type | Autopilot Choice | Rationale |
|---------------|------------------|-----------|
| **Tech choice** | 기존 스택 유지 | 이미 설치된 라이브러리 우선 |
| **File location** | 기존 구조 따름 | 패턴 일관성 |
| **Error handling** | 기존 패턴 따름 | 코드 일관성 |
| **API format** | 기존 API 스타일 | Breaking change 방지 |
| **Test strategy** | 기존 테스트 패턴 | 인프라 재사용 |

All autopilot decisions are logged in **Assumptions** section of DRAFT/PLAN.

---

## 6. File Locations

| Type | Path | When |
|------|------|------|
| Draft | `.dev/specs/{name}/DRAFT.md` | During interview |
| Plan | `.dev/specs/{name}/PLAN.md` | After plan generation |
| Context | `.dev/specs/{name}/context/` | During execution |

---

## 7. Quick Reference

| I want to... | Read |
|--------------|------|
| Understand modes | Section 1 (Mode Selection) |
| See module activation | Section 2 (Module Reference) |
| See the flow | Section 3 (Task Graphs) |
| Check autopilot rules | Section 5 (Autopilot Decision Rules) |
| See detailed examples | `references/example-flows.md` |
| Understand a module | `modules/{module}.md` |

---

## 8. Next Steps (After Plan Approval)

```
AskUserQuestion(
  question: "플랜이 승인되었습니다. 다음 단계를 선택하세요.",
  options: [
    { label: "/open", description: "Draft PR 생성" },
    { label: "/execute", description: "바로 구현 시작" },
    { label: "/worktree create {name}", description: "워크트리에서 격리 작업" }
  ]
)
```

**Autopilot behavior:** Skip this question, output plan location and stop.
