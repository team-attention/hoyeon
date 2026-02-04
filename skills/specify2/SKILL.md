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

---

## 2. Module Reference

Each module receives `depth` and `interaction` as input.

### 2.1 Module Activation by Depth

| Module | Source | Quick | Standard | Thorough |
|--------|--------|-------|----------|----------|
| **Triage** | `modules/triage.md` | ✅ | ✅ | ✅ |
| **Explore** | `modules/explore.md` | lite (2 agents) | full (4 agents) | deep (6 agents) |
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

**Enhanced:** 6 agents in Explore, 2+ Interview rounds, strict Review

---

## 4. Loop Handling

### 4.1 Interview Loop (standard, thorough)

| Aspect | Rule |
|--------|------|
| **Trigger** | User input received |
| **Exit** | All critical questions resolved OR "make it a plan" |
| **Max iterations** | 10 (standard), unlimited (thorough) |
| **Autopilot behavior** | Apply standard choices, log decisions |

### 4.2 Review Loop (all depths)

| Aspect | Quick | Standard | Thorough |
|--------|-------|----------|----------|
| **Max iterations** | 1 | 5 | unlimited |
| **Cosmetic rejection** | auto-fix | auto-fix | user confirm |
| **Semantic rejection** | halt | AskUser (interactive) / auto-fix (autopilot) | AskUser always |

---

## 5. Execution Flow

### Step 0: Parse Input

```python
# Parse flags
depth = "quick" if "--quick" in args else "thorough" if "--thorough" in args else "standard"
interaction = "autopilot" if "--autopilot" in args else "interactive" if "--interactive" in args else None

# Apply defaults
if interaction is None:
    interaction = "autopilot" if depth == "quick" else "interactive"
```

### Step 1: Run Triage

```
Load: modules/triage.md
Execute: Validate depth/interaction, extract feature name
Output: { depth, interaction, feature_name }
```

### Step 2: Generate Tasks

Based on `depth`, create task graph:

```markdown
# Quick: 6 tasks
T1:Triage → T2:Explore(lite) → T3:Draft → T4:Analysis(lite) → T5:Plan → T6:Review

# Standard: 7 tasks
T1:Triage → T2:Explore → T3:Draft → T4:Interview → T5:Analysis → T6:Plan → T7:Review

# Thorough: 7 tasks (same structure, deeper execution)
T1:Triage → T2:Explore(deep) → T3:Draft → T4:Interview(deep) → T5:Analysis(strict) → T6:Plan → T7:Review(strict)
```

### Step 3: Execute Tasks

```
WHILE pending tasks exist:
    task = next runnable task (no blockers)
    Load: modules/{task.module}.md
    Execute with: { depth, interaction, inputs from previous tasks }
    Handle re-entrant loops if needed
```

### Step 4: Finalize

- Delete DRAFT.md (if Plan approved)
- Output completion message
- Guide to next steps (/open, /execute)

---

## 6. Module Interface Contract

Each module file follows this structure:

```markdown
# Module: {Name}

## Input
- depth: quick | standard | thorough
- interaction: interactive | autopilot
- {other inputs from previous modules}

## Output
- {outputs for next modules}
- status: success | needs_more | error

## Behavior by Depth
| Depth | Behavior |
|-------|----------|
| quick | ... |
| standard | ... |
| thorough | ... |

## Behavior by Interaction
| Interaction | Behavior |
|-------------|----------|
| interactive | ... |
| autopilot | ... |

## Logic
1. ...
2. ...
```

---

## 7. Autopilot Decision Rules

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

## 8. File Locations

| Type | Path | When |
|------|------|------|
| Draft | `.dev/specs/{name}/DRAFT.md` | During interview |
| Plan | `.dev/specs/{name}/PLAN.md` | After plan generation |
| Context | `.dev/specs/{name}/context/` | During execution |

---

## 9. Quick Reference

| I want to... | Read |
|--------------|------|
| Understand modes | Section 1 (Mode Selection) |
| See module activation | Section 2 (Module Reference) |
| See the flow | Section 3 (Task Graphs) |
| Handle loops | Section 4 (Loop Handling) |
| Implement a module | Section 6 (Module Interface) |
| Check autopilot rules | Section 7 (Autopilot Decision Rules) |

---

## 10. Next Steps (After Plan Approval)

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

---

## Example Flow

### Standard + Interactive (Default)

```
User: "Add authentication to the API"

[Triage]
1. Parse: No flags → standard + interactive
2. Extract: feature_name = "api-auth"

[Explore - 4 agents in parallel]
3. Launch agents (single message, parallel foreground):
   - Explore #1: Find existing middleware patterns
   - Explore #2: Find project structure + commands
   - docs-researcher: Find ADRs, conventions, constraints
   - ux-reviewer: Evaluate UX impact
4. Classify intent: New Feature → Pattern exploration strategy
5. Present exploration summary, wait for user confirmation

[Draft]
6. Create: .dev/specs/api-auth/DRAFT.md
7. Populate Agent Findings from exploration results

[Interview]
8. Detect: "authentication" → Potential tech choice needed
   Ask: "기술 선택이 필요해 보입니다. tech-decision으로 깊이 분석할까요?"
   → User selects "예, 분석 진행"
9. Call: Skill("tech-decision", args="JWT vs Session for REST API auth")
10. Update draft with tech-decision results
11. PROPOSE based on exploration:
    "Based on tech-decision analysis, JWT recommended. jsonwebtoken already installed."
12. Wait for user: "make it a plan"

[Analysis]
13. Run tradeoff-analyzer, gap-analyzer, verification-planner
14. Present HIGH risk decision_points if any

[Plan]
15. Generate PLAN.md from DRAFT
16. Present Decision Summary checkpoint

[Review]
17. Submit to reviewer agent
18. If REJECT (cosmetic): auto-fix and resubmit
19. If OKAY: Delete DRAFT, output plan location
20. Guide to next steps: /open, /execute, /worktree
```

### Quick + Autopilot

```
User: "/specify2 fix-typo --quick"

[Triage]
1. Parse: --quick → quick + autopilot (default for quick)
2. Extract: feature_name = "fix-typo"

[Explore - 2 agents]
3. Launch 2 Explore agents (lite exploration)
4. Classify intent: Bug Fix

[Draft]
5. Create DRAFT with Assumptions section populated

[Interview: SKIPPED]

[Analysis - lite]
6. Run tradeoff-analyzer only
7. No AskUserQuestion (autopilot)

[Plan]
8. Generate PLAN.md with Assumptions notice

[Review - 1x]
9. Single review attempt, auto-fix if cosmetic
10. Output plan location and stop
```
