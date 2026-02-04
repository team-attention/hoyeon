# Module: Interview

Requirements gathering through conversation (re-entrant loop).

## Input

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- draft_path: from Draft module
- intent_type: from Explore
- user_request: from Triage (for tech-decision context)

## Output

- updated draft_path
- status: `ready_for_plan` | `needs_more`

## Variable Convention

> **IMPORTANT**: When invoking Skill/Task, replace all `{variable}` placeholders:
> - `{comparison_topic}` → Extract from user_request (e.g., "JWT vs Session", "React vs Vue")

## Behavior by Depth

| Depth | Behavior |
|-------|----------|
| quick | **SKIP** - Use Assumptions instead |
| standard | 1+ rounds until ready |
| thorough | 2+ rounds, deep probing required |

**If depth = quick:** Return immediately with `status: ready_for_plan`

---

## Logic (standard/thorough)

### 1. Question Principles

#### What to ASK (user knows, agent doesn't)

Use `AskUserQuestion` only for:
- **Boundaries**: "Any restrictions on what not to do?"
- **Trade-offs**: Only when multiple valid options exist
- **Success Criteria**: "When is this considered complete?"

#### What to DISCOVER (agent finds)

Agent explores (no questions):
- File locations
- Existing patterns to follow
- Integration points
- Project commands

#### What to PROPOSE (research first, then suggest)

```
"Based on my investigation, this approach should work:
- Middleware at src/middleware/auth.ts
- Following existing logging.ts pattern
- Using jwt.ts verify() function

Let me know if you prefer a different approach."
```

### 2. Intent-Based Branching

| Intent | Required Before Plan |
|--------|---------------------|
| **Refactoring** | Identify existing tests, define "done" |
| **Bug Fix** | Get reproduction steps |
| **Architecture** | Consider `Skill("agent-council")` |
| **Migration** | External docs, rollback plan |
| **Performance** | Baseline measurement |

### 3. Tech-Decision Trigger

**Trigger conditions:**
- Intent is Architecture or Migration
- User mentions: "vs", "versus", "비교", "which one", "뭐 쓸지"

**If triggered:**
```
AskUserQuestion(
  question: "기술 선택이 필요해 보입니다. tech-decision으로 깊이 분석할까요?",
  options: [
    { label: "예, 분석 진행", description: "여러 소스에서 비교 분석" },
    { label: "아니오, 빠르게 진행", description: "기존 패턴 기반으로 결정" }
  ]
)
```

**If user selects "예, 분석 진행":**
```
Skill("tech-decision", args="{comparison_topic}")
```

> Extract `{comparison_topic}` from user_request. Examples:
> - "JWT로 할지 Session으로 할지" → "JWT vs Session for authentication"
> - "React랑 Vue 중에" → "React vs Vue for frontend framework"

Then incorporate tech-decision results into DRAFT before continuing.

**If user selects "아니오, 빠르게 진행":** Skip and continue with interview.

### 4. Draft Update

After each user response, apply update rules from `modules/draft.md`:
1. Record in User Decisions table
2. Remove from Open Questions
3. Update Boundaries/Success Criteria if mentioned

### 5. Transition Check

**Ready for Plan when:**
- [ ] Critical Open Questions all resolved
- [ ] User Decisions has key decisions
- [ ] Success Criteria agreed
- [ ] User says "make it a plan" (or similar)

**Trigger phrases:**
- "Make it a plan"
- "Generate the plan"
- "플랜 만들어줘"
- "이제 됐어"

**DO NOT** generate a plan just because you think you have enough information. Wait for explicit user request.

**If not ready:** Continue loop (re-entrant)

---

## Behavior by Interaction

### Interactive Mode

Standard AskUserQuestion flow:

```
AskUserQuestion(
  question: "Which authentication method should we use?",
  options: [
    { label: "JWT (Recommended)", description: "jsonwebtoken already installed" },
    { label: "Session", description: "Requires server state management" }
  ]
)
```

Wait for user response, update draft.

### Autopilot Mode

Apply standard choices automatically:

```markdown
## Autopilot Decision Log

| Question | Auto-Choice | Rationale |
|----------|-------------|-----------|
| Auth method? | JWT | Already installed (package.json) |
| File location? | src/services/auth/ | Following existing structure |
| Error handling? | Use existing ErrorHandler | Pattern consistency |
```

All decisions logged in Draft's **Assumptions** section.

**Autopilot Decision Rules:**

| Decision Type | Standard Choice |
|---------------|-----------------|
| Tech choice | 기존 스택 유지 (이미 설치된 것) |
| File location | 기존 구조 따름 |
| Error handling | 기존 패턴 따름 |
| API format | 기존 API 스타일 |
| Test strategy | 기존 테스트 패턴 |

---

## Loop Control

### Max Iterations

| Depth | Max |
|-------|-----|
| standard | 10 |
| thorough | unlimited |

### Exit Conditions

1. User explicitly requests plan generation
2. All critical questions resolved AND direction agreed
3. Max iterations reached → **Must still ask for explicit confirmation**

### Max Iteration Handling

> **Core Principle: Never force transition without explicit user request.**

When max iterations reached (standard: 10):

```
AskUserQuestion(
  question: "인터뷰 라운드가 {max_iterations}회에 도달했습니다. 현재 상태로 플랜을 생성할까요?",
  options: [
    { label: "플랜 생성", description: "현재 수집된 정보로 플랜 작성" },
    { label: "계속 진행", description: "추가 질문/논의 (standard: +5회 연장)" },
    { label: "중단", description: "인터뷰 종료, 플랜 생성 안 함" }
  ]
)
```

**If "플랜 생성":** Return `status: ready_for_plan`
**If "계속 진행":** Extend max by 5, continue loop
**If "중단":** Return `status: halted`

**Autopilot mode:** Auto-select "플랜 생성" with warning logged

```
⚠️ Autopilot: Max iterations reached, proceeding to plan generation.
```

### Re-entry

If `status: needs_more`, orchestrator will re-invoke this module with updated context.
