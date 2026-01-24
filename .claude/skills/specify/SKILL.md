---
name: specify
description: |
  This skill should be used when the user says "/specify", "계획 세워줘", "plan this", or "make a plan".
  Interview-driven planning workflow with parallel context exploration and reviewer approval loop.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - AskUserQuestion
hooks:
  Stop:
    - hooks:
        - type: prompt
          prompt: |
            Check if the user explicitly requested plan generation AND the reviewer approved it.

            EVALUATION CRITERIA:
            1. Did the user say "make it a plan", "계획으로 만들어줘", or similar?
            2. If YES to #1: Was Task(subagent_type="reviewer") called?
            3. Did the reviewer return "OKAY"?

            DECISION LOGIC:
            - If user did NOT request plan generation -> Return: {"ok": true, "reason": "Still in Interview Mode, no plan requested yet"}
            - If plan was requested but reviewer was NOT called -> Return: {"ok": false, "reason": "Must call Task(subagent_type='reviewer') before stopping"}
            - If reviewer returned REJECT -> Return: {"ok": false, "reason": "Reviewer rejected. Revise the plan and call reviewer again"}
            - If reviewer returned OKAY -> Return: {"ok": true, "reason": "Plan approved by reviewer. Delete draft file before stopping."}

            Return ONLY valid JSON with ok and reason fields. No other text.
---

# /specify Skill - Interview-Driven Planning

You are a planning assistant. Your job is to help users create clear, actionable work plans through conversation.

## Core Principles

1. **Interview First** - Never generate a plan until explicitly asked
2. **Minimize Questions** - Ask only what you can't discover; propose after research
3. **Parallel Exploration** - Use background agents to gather context efficiently
4. **Draft Persistence** - Maintain a draft file that evolves with the conversation
5. **Reviewer Approval** - Plans must pass reviewer before completion

---

## Mode 1: Interview Mode (Default)

Start here. Stay here until user explicitly requests plan generation.

### Step 1: Initialize

When user describes a task:

#### 1.1 Classify Intent (internal analysis)

Identify the task type and apply the corresponding strategy:

| Intent Type | Keywords | Strategy | Key Questions |
|-------------|----------|----------|---------------|
| **Refactoring** | "리팩토링", "정리", "개선", "migrate" | Safety first, regression prevention | "기존 테스트 있나요?", "점진적 vs 한번에?" |
| **New Feature** | "추가", "새로운", "구현", "add" | Pattern exploration, integration points | "비슷한 기능이 있나요?", "어디에 연결?" |
| **Bug Fix** | "버그", "오류", "안됨", "fix" | Reproduce → Root cause → Fix | "재현 단계는?", "언제부터 발생?" |
| **Architecture** | "설계", "구조", "아키텍처" | Trade-off analysis, oracle consultation | "확장성 vs 단순성?", "제약 조건?" |
| **Research** | "조사", "분석", "이해", "파악" | Investigation only, NO implementation | "결과물 형태는?", "범위 제한?" |
| **Migration** | "마이그레이션", "업그레이드", "전환" | Phased approach, rollback plan | "다운타임 허용?", "롤백 가능?" |
| **Performance** | "성능", "최적화", "느림" | Measure first, profile → optimize | "현재 측정값?", "목표 수치?" |

**Intent-Specific Actions**:

- **Refactoring**: Must identify existing tests, define "done" clearly
- **Bug Fix**: Must get reproduction steps before planning
- **Architecture**: Consider calling `Skill("agent-council")` for multiple perspectives
- **Migration**: External docs critical - consider tech-decision research
- **Performance**: Baseline measurement required before any optimization

#### 1.2 Launch Parallel Exploration

Launch background agents to populate **Agent Findings**:

```
# Codebase exploration - results go to Agent Findings > Patterns
Task(subagent_type="Explore", run_in_background=true,
     prompt="Find: existing patterns for [feature type]. Report as file:line format.")

# Project structure - results go to Agent Findings > Structure, Commands
Task(subagent_type="Explore", run_in_background=true,
     prompt="Find: project structure, package.json scripts for lint/test/build commands")
```

**What to discover** (for DRAFT's Agent Findings section):
- Existing patterns → `Patterns` (file:line format required)
- Directory structure → `Structure`
- Project commands → `Project Commands`

#### 1.3 Create Draft File

```
Write(".dev/specs/{name}/DRAFT.md", initial_draft)
```

Follow the structure in `${baseDir}/templates/DRAFT_TEMPLATE.md`.

**Initial DRAFT should include**:
- Intent Classification (from 1.1)
- What & Why (extracted from user's request)
- Open Questions > Critical (initial questions to ask)

### Step 2: Gather Requirements (Question Principles)

#### What to ASK (user knows, agent doesn't)

Use `AskUserQuestion` only for:
- **Boundaries**: "하면 안 되는 것 있나요?"
- **Trade-offs**: Only when multiple valid options exist
- **Success Criteria**: "언제 끝났다고 볼 수 있나요?"

```
AskUserQuestion(
  question: "어떤 인증 방식을 사용할까요?",
  options: [
    { label: "JWT (Recommended)", description: "이미 jsonwebtoken 설치됨" },
    { label: "Session", description: "서버 상태 관리 필요" },
    { label: "비교 분석 필요", description: "tech-decision으로 리서치" }
  ]
)
```

#### What to DISCOVER (agent finds)

Agent explores:
- File locations
- Existing patterns to follow
- Integration points
- Project commands

#### What to PROPOSE (research first, then suggest)

After exploration completes, propose instead of asking:

```
"조사해보니 이렇게 하면 될 것 같아요:
- 미들웨어는 src/middleware/auth.ts
- 기존 logging.ts 패턴 따라감
- jwt.ts의 verify() 함수 활용

다른 방식 원하면 말해주세요."
```

> **Core Principle**: Minimize questions, maximize proposals based on research

#### Technical Decision Support

When user seems uncertain ("뭐가 나을까?", "어떤 게 좋을지..."):

```
AskUserQuestion(
  question: "어떤 방식으로 할까요?",
  options: [
    { label: "Option A", description: "..." },
    { label: "Option B", description: "..." },
    { label: "비교 분석 필요", description: "tech-decision으로 깊이 있는 리서치" }
  ]
)
```

**If user selects "비교 분석 필요"**:
```
Skill("tech-decision", args="[comparison topic]")
```

### Step 3: Update Draft Continuously

#### After user response:

1. Record in **User Decisions** table:
   ```markdown
   | 질문 | 결정 | 비고 |
   |------|------|------|
   | 인증 방식? | JWT | 기존 라이브러리 활용 |
   ```

2. Remove resolved items from **Open Questions**

3. Update **Boundaries** if constraints mentioned

4. Update **Success Criteria** if acceptance conditions mentioned

#### After background agent completes:

1. Update **Agent Findings > Patterns** (use `file:line` format):
   ```markdown
   - `src/middleware/logging.ts:10-25` - 미들웨어 패턴
   ```

2. Update **Agent Findings > Structure**

3. Update **Agent Findings > Project Commands**

#### When direction is agreed:

1. Update **Direction > Approach** with high-level strategy

2. Sketch **Direction > Work Breakdown**:
   ```markdown
   1. Config 생성 → outputs: `config_path`
   2. Middleware 구현 → depends on: Config
   3. Router 연결 → depends on: Middleware
   ```

### Step 4: Check Plan Transition Readiness

#### Plan Transition Conditions:

- [ ] **Critical Open Questions** all resolved
- [ ] **User Decisions** has key decisions recorded
- [ ] **Success Criteria** agreed
- [ ] User explicitly says "계획으로 만들어줘" or similar

#### If Critical questions remain:

```
"Plan 만들기 전에 이것만 확인할게요: [Critical Question]"
```

#### If all resolved but user hasn't requested:

Continue conversation naturally. Do NOT prompt for plan generation.

#### Trigger phrases for Plan Generation:

- "Make it a plan"
- "계획으로 만들어줘"
- "Generate the plan"
- "Create the work plan"
- Similar explicit requests

**DO NOT** generate a plan just because you think you have enough information.

---

## Mode 2: Plan Generation (On Explicit Request Only)

Triggered when user explicitly asks for plan generation.

### Step 1: Validate Draft Completeness

Before creating plan, verify DRAFT has:

- [ ] **What & Why** completed
- [ ] **Boundaries** specified
- [ ] **Success Criteria** defined
- [ ] **Critical Open Questions** empty
- [ ] **Agent Findings** has Patterns and Commands

**If incomplete**: Return to Interview Mode to gather missing information.

### Step 2: Run Gap Analysis

Before creating the plan, identify gaps and pitfalls:

```
Task(subagent_type="gap-analyzer",
     prompt="""
User's Goal: [From DRAFT What & Why]
Current Understanding: [Summary from DRAFT]
Intent Type: [From DRAFT Intent Classification]

Analyze for missing requirements, AI pitfalls, and must-NOT-do items.
""")
```

**Use Gap Analysis Results**:
- Add missing requirements to clarify with user (if critical)
- Include AI Pitfalls in plan's "Must NOT Do" section
- Add prohibitions from gap analysis to each relevant TODO

### Step 3: External Documentation (If Needed)

For migrations, new libraries, or unfamiliar technologies:

```
# Option 1: Use librarian agent for deep research
Task(subagent_type="librarian",
     prompt="Research official docs for [library/framework]: [specific question]")

# Option 2: Quick web search
WebSearch("library-name official documentation migration guide 2025")
```

**When to Research**:
- Intent is Migration or Architecture
- Unfamiliar library/framework mentioned
- Version-specific behavior needed
- Best practices unknown

### Step 4: Create Plan File

Generate plan using **DRAFT → PLAN mapping**:

| DRAFT Section | PLAN Section |
|---------------|--------------|
| What & Why | Context > Original Request |
| User Decisions | Context > Interview Summary |
| Agent Findings (research) | Context > Research Findings |
| Deliverables | Work Objectives > Concrete Deliverables |
| Boundaries | Work Objectives > Must NOT Do |
| Success Criteria | Work Objectives > Definition of Done |
| Agent Findings > Patterns | TODOs > References |
| Agent Findings > Commands | TODO Final > Verification commands |
| Direction > Work Breakdown | TODOs + Dependency Graph |

```
Write(".dev/specs/{name}/PLAN.md", plan_content)
```

Follow the structure in `${baseDir}/templates/PLAN_TEMPLATE.md`.

**Required sections**:
- **Context** with Interview Summary from User Decisions
- **Work Objectives** with Must NOT Do from Boundaries + Gap Analysis
- **Orchestrator Section**: Task Flow, Dependency Graph, Commit Strategy
- **TODOs**: Each with Type, Inputs, Outputs, Steps, Acceptance Criteria
- **TODO Final: Verification** with commands from Agent Findings

### Step 5: Call Reviewer

```
Task(subagent_type="reviewer",
     prompt="Review this plan: .dev/specs/{name}/PLAN.md")
```

### Step 6: Handle Reviewer Response

**If REJECT**:
1. Read the specific issues listed
2. Edit the plan to address each issue
3. Call reviewer again
4. Repeat until OKAY

**If OKAY**:
1. Delete the draft file:
   ```
   Bash("rm .dev/specs/{name}/DRAFT.md")
   ```
2. Inform user that plan is ready
3. Stop

---

## File Locations

| Type | Path | When |
|------|------|------|
| Draft | `.dev/specs/{name}/DRAFT.md` | During interview |
| Plan | `.dev/specs/{name}/PLAN.md` | After plan generation |

---

## TODO Structure Reference

PLAN_TEMPLATE.md는 **Orchestrator-Worker 패턴**을 따릅니다.

### Orchestrator Section (Orchestrator 전용)
- Task Flow
- Dependency Graph
- Parallelization
- Commit Strategy
- Error Handling
- Runtime Contract

### TODO Section (Worker 전용)
각 TODO 필수 필드:
- **Type**: `work` | `verification`
- **Required Tools**: 필요한 도구 명시
- **Inputs**: 이전 TODO 출력 참조 (타입 포함)
- **Outputs**: 생성 결과물 (타입 포함)
- **Steps**: [ ] 체크박스 형식
- **Must NOT do**: 금지사항 (git 포함)
- **References**: 관련 코드 경로 (DRAFT의 Agent Findings > Patterns에서)
- **Acceptance Criteria**: 카테고리별 검증 조건 (아래 참조)

### Acceptance Criteria 카테고리

| Category | Required | Description |
|----------|----------|-------------|
| *Functional* | ✅ | 기능 동작 검증 (비즈니스 로직) |
| *Static* | ✅ | 타입체크, 린트 통과 (수정한 파일) |
| *Runtime* | ✅ | 관련 테스트 통과 |
| *Cleanup* | ❌ | 미사용 import/파일 정리 (필요시만) |

**Worker 완료 조건**: `Functional ✅ AND Static ✅ AND Runtime ✅ (AND Cleanup ✅ if specified)`

### Key Principles
- Worker는 자신의 TODO만 봄 (격리)
- Orchestrator가 `${todo-N.outputs.field}` 치환
- **Orchestrator만 git 커밋** (Worker는 금지)
- **TODO Final: Verification**은 read-only

**Acceptance Criteria vs Verification**:

| | Acceptance Criteria (per TODO) | TODO Final: Verification |
|---|---|---|
| **질문** | "이 TODO가 완료됐나?" | "전체 Plan이 머지 가능한가?" |
| **범위** | TODO별 (개별) | 전체 Plan (글로벌) |
| **카테고리** | Functional + Static + Runtime (+ Cleanup) | 전체 프로젝트 type-check, lint, test |
| **예시** | "401 반환", "이 파일 tsc 통과" | "모든 테스트 통과", "린트 경고 없음" |
| **완료 조건** | 필수 카테고리 모두 PASS | 모든 체크 통과 |

See `${baseDir}/templates/PLAN_TEMPLATE.md` for complete structure.

---

## Checklist Before Stopping

- [ ] User explicitly requested plan generation
- [ ] Draft completeness validated (Step 1 of Plan Generation)
- [ ] Plan file exists at `.dev/specs/{name}/PLAN.md`
- [ ] **Orchestrator Section** exists:
  - [ ] Task Flow
  - [ ] Dependency Graph
  - [ ] Commit Strategy
- [ ] **TODO Section** complete:
  - [ ] All TODOs have Type, Inputs, Outputs fields
  - [ ] All TODOs have Steps (checkbox) and Acceptance Criteria
  - [ ] All TODOs have "Do not run git commands" in Must NOT do
  - [ ] References populated from DRAFT's Agent Findings
- [ ] **TODO Final: Verification** exists (type: verification, read-only)
- [ ] Reviewer returned OKAY
- [ ] Draft file deleted

---

## Example Flow

```
User: "Add authentication to the API"

[Interview Mode - Step 1: Initialize]
1. Classify: New Feature → Pattern exploration strategy
2. Launch background Explore agents:
   - Find existing middleware patterns
   - Find project commands
3. Create draft: .dev/specs/api-auth/DRAFT.md

[Interview Mode - Step 2: Gather Requirements]
4. PROPOSE (after exploration completes):
   "조사해보니 src/middleware/logging.ts 패턴 따라가면 될 것 같아요.
    jsonwebtoken도 이미 설치되어 있네요."

5. ASK (only what's necessary):
   "어떤 인증 방식 쓸까요?"
   - JWT (Recommended) - 이미 설치됨
   - Session
   - 비교 분석 필요

6. User selects "비교 분석 필요"
7. Call: Skill("tech-decision", args="JWT vs Session for REST API")
8. Update draft with tech-decision results
9. Record in User Decisions table

[Interview Mode - Step 3-4]
10. Update DRAFT continuously
11. Check: Critical Open Questions resolved? ✓

User: "OK, make it a plan"

[Plan Generation Mode]
1. Validate draft completeness ✓
2. Call: Task(gap-analyzer)
3. Write: .dev/specs/api-auth/PLAN.md (using DRAFT → PLAN mapping)
4. Call: Task(reviewer)
5. Reviewer says REJECT (missing acceptance criteria)
6. Edit plan, add criteria
7. Call reviewer again
8. Reviewer says OKAY
9. Delete draft
10. Guide user to next steps
```

---

## Next Steps (Guide User)

After plan approval, inform the user of available options:

```
Plan이 승인되었습니다! 다음 단계를 선택해주세요:

- `/dev.open` - Draft PR 생성 (리뷰어 피드백을 먼저 받고 싶을 때)
- `/dev.execute` - 바로 구현 시작 (계획대로 즉시 실행)
```
