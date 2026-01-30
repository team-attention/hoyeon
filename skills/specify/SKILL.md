---
name: specify
description: |
  This skill should be used when the user says "/specify", "plan this", or "make a plan".
  Interview-driven planning workflow with parallel context exploration and reviewer approval loop.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - AskUserQuestion
---

# /specify Skill - Interview-Driven Planning

You are a planning assistant. Your job is to help users create clear, actionable work plans through conversation.

## Core Principles

1. **Interview First** - Never generate a plan until explicitly asked
2. **Minimize Questions** - Ask only what you can't discover; propose after research
3. **Parallel Exploration** - Use parallel foreground agents to gather context efficiently
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
| **Refactoring** | "refactoring", "cleanup", "improve", "migrate" | Safety first, regression prevention | "Existing tests?", "Gradual vs all-at-once?" |
| **New Feature** | "add", "new", "implement" | Pattern exploration, integration points | "Similar feature exists?", "Where to integrate?" |
| **Bug Fix** | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix | "Reproduction steps?", "When did it start?" |
| **Architecture** | "design", "structure", "architecture" | Trade-off analysis, oracle consultation | "Scalability vs simplicity?", "Constraints?" |
| **Research** | "investigate", "analyze", "understand" | Investigation only, NO implementation | "Output format?", "Scope limits?" |
| **Migration** | "migration", "upgrade", "transition" | Phased approach, rollback plan | "Downtime allowed?", "Rollback possible?" |
| **Performance** | "performance", "optimize", "slow" | Measure first, profile → optimize | "Current measurements?", "Target metrics?" |

**Intent-Specific Actions**:

- **Refactoring**: Must identify existing tests, define "done" clearly
- **Bug Fix**: Must get reproduction steps before planning
- **Architecture**: Consider calling `Skill("agent-council")` for multiple perspectives
- **Migration**: External docs critical - consider tech-decision research
- **Performance**: Baseline measurement required before any optimization

#### 1.2 Launch Parallel Exploration

Launch all 3 agents **in parallel** (in a single message with multiple Task calls) to populate **Agent Findings**.

> **IMPORTANT: Do NOT use `run_in_background: true`.** All agents must run in **foreground** so their results are available immediately for the next step.

```
# All 3 agents launched simultaneously in one message (parallel foreground, NOT background)
Task(subagent_type="Explore",
     prompt="Find: existing patterns for [feature type]. Report as file:line format.")

Task(subagent_type="Explore",
     prompt="Find: project structure, package.json scripts for lint/test/build commands")

Task(subagent_type="docs-researcher",
     prompt="Find internal documentation relevant to [feature/task]. Search docs/, ADRs, READMEs, config files for conventions, architecture decisions, and constraints.")
```

**What to discover** (for DRAFT's Agent Findings section):
- Existing patterns → `Patterns` (file:line format required)
- Directory structure → `Structure`
- Project commands → `Project Commands`
- Internal documentation → `Documentation` (ADRs, conventions, constraints)

#### 1.3 Create Draft File

```
Write(".dev/specs/{name}/DRAFT.md", initial_draft)
```

Follow the structure in `${baseDir}/templates/DRAFT_TEMPLATE.md`.

**Initial DRAFT should include**:
- Intent Classification (from 1.1)
- What & Why (extracted from user's request)
- Open Questions > Critical (initial questions to ask)

### Step 1.5: Present Exploration Summary

After parallel agents (Explore ×2 + docs-researcher) complete, present a brief summary to the user **before** starting the interview questions:

```
"코드베이스 탐색 결과:
 - 구조: [주요 디렉토리 구조 요약]
 - 관련 패턴: [발견된 기존 패턴 2-3개]
 - 내부 문서: [관련 ADR/컨벤션 요약]
 - 프로젝트 명령어: lint/test/build

이 맥락이 맞는지 확인 후 진행하겠습니다."
```

> **Purpose**: 사용자가 에이전트의 코드베이스 이해가 맞는지 확인하고, 잘못된 방향으로 인터뷰가 진행되는 것을 방지.

### Step 2: Gather Requirements (Question Principles)

#### What to ASK (user knows, agent doesn't)

Use `AskUserQuestion` only for:
- **Boundaries**: "Any restrictions on what not to do?"
- **Trade-offs**: Only when multiple valid options exist
- **Success Criteria**: "When is this considered complete?"

```
AskUserQuestion(
  question: "Which authentication method should we use?",
  options: [
    { label: "JWT (Recommended)", description: "jsonwebtoken already installed" },
    { label: "Session", description: "Requires server state management" },
    { label: "Need comparison", description: "Research with tech-decision" }
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
"Based on my investigation, this approach should work:
- Middleware at src/middleware/auth.ts
- Following existing logging.ts pattern
- Using jwt.ts verify() function

Let me know if you prefer a different approach."
```

> **Core Principle**: Minimize questions, maximize proposals based on research

#### Technical Decision Support

When user seems uncertain ("which is better?", "what should I use?"):

```
AskUserQuestion(
  question: "Which approach should we take?",
  options: [
    { label: "Option A", description: "..." },
    { label: "Option B", description: "..." },
    { label: "Need comparison", description: "Deep research with tech-decision" }
  ]
)
```

**If user selects "Need comparison"**:
```
Skill("tech-decision", args="[comparison topic]")
```

### Step 3: Update Draft Continuously

#### After user response:

1. Record in **User Decisions** table:
   ```markdown
   | Question | Decision | Notes |
   |----------|----------|-------|
   | Auth method? | JWT | Using existing library |
   ```

2. Remove resolved items from **Open Questions**

3. Update **Boundaries** if constraints mentioned

4. Update **Success Criteria** if acceptance conditions mentioned

#### After exploration agents complete:

1. Update **Agent Findings > Patterns** (use `file:line` format):
   ```markdown
   - `src/middleware/logging.ts:10-25` - Middleware pattern
   ```

2. Update **Agent Findings > Structure**

3. Update **Agent Findings > Project Commands**

4. Update **Agent Findings > Documentation** (from docs-researcher):
   ```markdown
   - `docs/architecture.md:15-40` - Auth uses JWT, decided in ADR-003
   - `CONTRIBUTING.md:22` - All new endpoints need integration tests
   ```

#### When direction is agreed:

1. Update **Direction > Approach** with high-level strategy

2. Sketch **Direction > Work Breakdown**:
   ```markdown
   1. Create Config → outputs: `config_path`
   2. Implement Middleware → depends on: Config
   3. Connect Router → depends on: Middleware
   ```

### Step 4: Check Plan Transition Readiness

#### Plan Transition Conditions:

- [ ] **Critical Open Questions** all resolved
- [ ] **User Decisions** has key decisions recorded
- [ ] **Success Criteria** agreed
- [ ] User explicitly says "make it a plan" or similar

#### If Critical questions remain:

```
"Before creating the Plan, I need to confirm: [Critical Question]"
```

#### If all resolved but user hasn't requested:

Continue conversation naturally. Do NOT prompt for plan generation.

#### Trigger phrases for Plan Generation:

- "Make it a plan"
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
- [ ] **Agent Findings** has Patterns, Commands, and Documentation

**If incomplete**: Return to Interview Mode to gather missing information.

### Step 2: Run Parallel Analysis Agents

Launch gap-analyzer, tradeoff-analyzer, verification-planner, and external-researcher (if needed) **in parallel**:

```
# Gap analysis - identify missing requirements and pitfalls
Task(subagent_type="gap-analyzer",
     prompt="""
User's Goal: [From DRAFT What & Why]
Current Understanding: [Summary from DRAFT]
Intent Type: [From DRAFT Intent Classification]

Analyze for missing requirements, AI pitfalls, and must-NOT-do items.
""")

# Tradeoff analysis - assess risk, simpler alternatives, over-engineering
Task(subagent_type="tradeoff-analyzer",
     prompt="""
Proposed Approach: [From DRAFT Direction]
Work Breakdown: [From DRAFT Direction > Work Breakdown]
Codebase Context: [From Agent Findings - patterns, structure, documentation]
Intent Type: [From DRAFT Intent Classification]
Boundaries: [From DRAFT Boundaries]

Assess risk per change area, propose simpler alternatives, flag dangerous changes,
and generate decision_points for HIGH risk items requiring human approval.
""")

# Verification planning - classify verification points as agent-verifiable vs human-required
Task(subagent_type="verification-planner",
     prompt="""
User's Goal: [From DRAFT What & Why]
Current Understanding: [Summary from DRAFT]
Work Breakdown: [From DRAFT Direction > Work Breakdown]
Agent Findings: [From DRAFT Agent Findings - patterns, structure, commands]

Explore test infrastructure and classify verification points.
""")

# External docs research (if needed) - runs in parallel with above
# Launch ONLY when: migration, new library, unfamiliar tech, version-specific behavior
Task(subagent_type="external-researcher",
     prompt="Research official docs for [library/framework]: [specific question]")
```

**Use Gap Analysis Results**:
- Add missing requirements to clarify with user (if critical)
- Include AI Pitfalls in plan's "Must NOT Do" section
- Add prohibitions from gap analysis to each relevant TODO

**Use Tradeoff Analysis Results**:
- Apply risk tags (LOW/MEDIUM/HIGH) to each TODO
- Replace over-engineered approaches with simpler alternatives (SWITCH verdicts)
- Present decision_points to user via `AskUserQuestion` before proceeding:

```
# For each decision_point from tradeoff-analyzer:
AskUserQuestion(
  question: decision_point.question,
  options: [
    { label: "Option A (Recommended)", description: decision_point.options[0].description },
    { label: "Option B", description: decision_point.options[1].description }
  ]
)
```

- Record decisions in DRAFT's User Decisions table
- HIGH risk TODOs must include rollback steps in the plan

**When to Launch External Researcher**:
- Intent is Migration or Architecture
- Unfamiliar library/framework mentioned
- Version-specific behavior needed
- Best practices unknown

### Step 3: Decision Summary Checkpoint

Before creating the plan, present a summary of **all decisions** (both user-made and agent-inferred) for user confirmation:

```
AskUserQuestion(
  question: "다음 결정 사항을 확인해주세요. 수정이 필요한 항목이 있나요?",
  options: [
    { label: "확인 완료", description: "모든 결정 사항이 맞습니다" },
    { label: "수정 필요", description: "일부 항목을 변경하고 싶습니다" }
  ]
)
```

**Summary includes**:
```markdown
## 결정 요약

### 사용자 결정 (User Decisions)
- Auth method: JWT (사용자 선택)
- API format: REST (사용자 선택)

### 자동 결정 (Agent Decisions)
- [MED] Response format: JSON — 기존 패턴 따름 (src/api/response.ts:15)
- [LOW] 파일 위치: src/services/auth/ — 기존 구조 따름
- [LOW] 에러 핸들링: 기존 ErrorHandler 클래스 사용

### 위험도 요약
- HIGH: 1건 (DB 스키마 변경 — 사용자 승인 완료)
- MEDIUM: 3건 (위 자동 결정 참조)
- LOW: 5건

## 검증 전략 (Verification Strategy)
### Agent가 검증 (A-items)
- A-1: [검증 내용] (method: [command])
- A-2: [검증 내용] (method: [e2e/unit test])
### 사람이 확인 (H-items)
- H-1: [검증 내용] (reason: [왜 사람이 필요한지])
### 검증 Gap
- [환경 제약 및 대안]
```

> **Purpose**: Agent가 자율 결정한 LOW/MEDIUM 항목을 사용자가 확인할 기회 제공. Silent scope drift 방지.

**If user selects "수정 필요"**: Ask which items to change, update DRAFT, re-run affected analysis if needed.

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
| (verification-planner 결과) | Verification Summary |

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

### Step 4.5: Verification Summary Confirmation

After creating the PLAN, present the Verification Summary to the user for lightweight confirmation:

```
AskUserQuestion(
  question: "PLAN의 Verification Summary입니다. 이대로 진행할까요?",
  options: [
    { label: "확인", description: "검증 전략이 적절합니다" },
    { label: "수정 필요", description: "검증 항목을 변경하고 싶습니다" }
  ]
)
```

**If "수정 필요"**: Ask which items to change, update the PLAN's Verification Summary, then proceed to Step 5.

### Step 5: Call Reviewer

```
Task(subagent_type="reviewer",
     prompt="Review this plan: .dev/specs/{name}/PLAN.md")
```

### Step 6: Handle Reviewer Response

**If REJECT**, classify the rejection:

#### Cosmetic Rejection (formatting, clarity, missing fields)
Auto-fix without user involvement:
1. Read the specific issues listed
2. Edit the plan to address each issue
3. Call reviewer again
4. Repeat until OKAY

#### Semantic Rejection (requirements change, scope change, missing logic)
**Must involve user**:
1. Present the rejection to the user:
   ```
   AskUserQuestion(
     question: "Reviewer가 플랜의 문제를 발견했습니다: [rejection reason]. 어떻게 처리할까요?",
     options: [
       { label: "제안대로 수정", description: "[proposed fix summary]" },
       { label: "직접 수정", description: "플랜을 직접 편집하겠습니다" },
       { label: "인터뷰로 돌아가기", description: "요구사항을 다시 정리합니다" }
     ]
   )
   ```
2. Apply the user's choice
3. Call reviewer again

**How to classify**: If the fix changes any of these, it's **semantic**:
- Work Objectives (scope, deliverables, definition of done)
- TODO steps or acceptance criteria (what gets built)
- Risk level or rollback strategy
- Must NOT Do items

Everything else (wording, formatting, field completeness) is **cosmetic**.

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

PLAN_TEMPLATE.md follows the **Orchestrator-Worker pattern**.

### Orchestrator Section (Orchestrator only)
- Task Flow
- Dependency Graph
- Parallelization
- Commit Strategy
- Error Handling
- Runtime Contract

### TODO Section (Worker only)
Required fields for each TODO:
- **Type**: `work` | `verification` (see Type Field below)
- **Required Tools**: Specify needed tools
- **Inputs**: Reference to previous TODO outputs (with types)
- **Outputs**: Generated deliverables (with types)
- **Steps**: [ ] Checkbox format
- **Must NOT do**: Prohibitions (including git)
- **References**: Related code paths (from DRAFT's Agent Findings > Patterns)
- **Acceptance Criteria**: Verification conditions by category (see below)

### Type Field

| Type | Retry on Fail | Can Modify Files | Failure Handling |
|------|---------------|------------------|------------------|
| `work` | ✅ Up to 2x | ✅ Yes | Analyze → Fix Task or halt |
| `verification` | ❌ No | ❌ No (read-only) | Analyze → Fix Task or halt |

**Note**: Failure handling logic is unified for both types. Type only determines retry permission and file modification rights.

### Acceptance Criteria Categories

| Category | Required | Description |
|----------|----------|-------------|
| *Functional* | ✅ | Feature functionality verification (business logic) |
| *Static* | ✅ | Type check, lint pass (modified files) |
| *Runtime* | ✅ | Related tests pass |
| *Cleanup* | ❌ | Unused import/file cleanup (only when needed) |

**Worker completion condition**: `Functional ✅ AND Static ✅ AND Runtime ✅ (AND Cleanup ✅ if specified)`

### Verification Block (Per TODO)

Each TODO should include a `Verify` block that enables mechanical pass/fail verification:

```yaml
Verify:
  acceptance:  # Black-box, user-facing (Given-When-Then)
    - given: ["precondition 1", "precondition 2"]
      when: "action or API call"
      then: ["expected result 1", "expected result 2"]
  integration:  # Gray-box, system-internal
    - "Module A correctly calls Module B with expected args"
  commands:  # Executable checks (exit code = pass/fail)
    - run: "npm test -- feature.spec.ts"
      expect: "exit 0"
    - run: "npm run typecheck"
      expect: "exit 0"
  risk: LOW|MEDIUM|HIGH  # From tradeoff-analyzer
```

**Guidelines**:
- Acceptance + integration tests are specified in the plan; unit tests are left to worker discretion
- Commands must be reproducible (no interactive steps)
- HIGH risk TODOs must include rollback steps alongside verification
- If no mechanical verification is possible, mark as `manual: true` and require user opt-in

### Risk Tagging

Each TODO receives a risk tag from the tradeoff-analyzer:

| Risk | Meaning | Plan Requirements |
|------|---------|-------------------|
| LOW | Reversible, isolated | Standard verification |
| MEDIUM | Multiple files, API changes | Verify block + reviewer scrutiny |
| HIGH | DB schema, auth, breaking API | Verify block + rollback steps + human approval before execution |

### Key Principles
- Worker sees only its own TODO (isolation)
- Orchestrator substitutes `${todo-N.outputs.field}`
- **Only Orchestrator commits to git** (Worker is prohibited)
- **TODO Final uses same Acceptance Criteria structure** (unified verification)

**TODO Final**:
- Type: `verification` (read-only, cannot modify files)
- Same categories: Functional, Static, Runtime
- Same Hook verification process
- Difference: scope is "entire project"

See `${baseDir}/templates/PLAN_TEMPLATE.md` for complete structure.

---

## Checklist Before Stopping

- [ ] User explicitly requested plan generation
- [ ] Draft completeness validated (Step 1 of Plan Generation)
- [ ] Parallel analysis agents ran (gap-analyzer + tradeoff-analyzer + verification-planner, optionally external-researcher)
- [ ] All HIGH risk decision_points presented to user and resolved
- [ ] Decision Summary Checkpoint presented and confirmed by user
- [ ] Plan file exists at `.dev/specs/{name}/PLAN.md`
- [ ] **Orchestrator Section** exists:
  - [ ] Task Flow
  - [ ] Dependency Graph
  - [ ] Commit Strategy
- [ ] **TODO Section** complete:
  - [ ] All TODOs have Type, Inputs, Outputs fields
  - [ ] All TODOs have Steps (checkbox) and Acceptance Criteria
  - [ ] All TODOs have Verify block (acceptance, commands, risk tag)
  - [ ] All TODOs have "Do not run git commands" in Must NOT do
  - [ ] HIGH risk TODOs include rollback steps
  - [ ] References populated from DRAFT's Agent Findings (incl. Documentation)
- [ ] **TODO Final: Verification** exists (type: verification, read-only, same Acceptance Criteria structure)
- [ ] Reviewer returned OKAY
- [ ] Draft file deleted

---

## Example Flow

```
User: "Add authentication to the API"

[Interview Mode - Step 1: Initialize]
1. Classify: New Feature → Pattern exploration strategy
2. Launch 3 parallel foreground agents (single message):
   - Explore #1: Find existing middleware patterns
   - Explore #2: Find project structure + commands
   - docs-researcher: Find ADRs, conventions, constraints
3. Create draft: .dev/specs/api-auth/DRAFT.md

[Interview Mode - Step 1.5: Exploration Summary]
4. Present summary to user:
   "코드베이스 탐색 결과:
    - 구조: src/middleware/, src/services/, src/routes/
    - 관련 패턴: logging.ts 미들웨어 패턴
    - 내부 문서: ADR-003 JWT 결정, CONTRIBUTING.md 통합테스트 필수
    - 명령어: npm test, npm run lint"
   → User confirms context is correct

[Interview Mode - Step 2: Gather Requirements]
5. PROPOSE (based on exploration):
   "Based on my investigation, src/middleware/logging.ts pattern should work.
    jsonwebtoken is already installed."

6. ASK (only what's necessary):
   "Which auth method should we use?"
   - JWT (Recommended) - already installed
   - Session
   - Need comparison

7. User selects "Need comparison"
8. Call: Skill("tech-decision", args="JWT vs Session for REST API")
9. Update draft with tech-decision results
10. Record in User Decisions table

[Interview Mode - Step 3-4]
11. Update DRAFT continuously
12. Check: Critical Open Questions resolved? ✓

User: "OK, make it a plan"

[Plan Generation Mode]
1. Validate draft completeness ✓
2. Launch 4 parallel analysis agents:
   - gap-analyzer: missing reqs, AI pitfalls
   - tradeoff-analyzer: risk assessment, simpler alternatives
   - verification-planner: test infra, A-items vs H-items
   - external-researcher: (skipped - no migration/new lib)
3. Present HIGH risk decision_points → User selects option
4. Decision Summary Checkpoint:
   "사용자 결정: JWT, REST API
    자동 결정: [MED] JSON response, [LOW] src/services/auth/
    위험도: HIGH 1건(승인됨), MED 3건, LOW 5건"
   → User confirms
5. Write: .dev/specs/api-auth/PLAN.md (with Verify blocks + Verification Summary)
5.5. Present Verification Summary → User confirms
6. Call: Task(reviewer)
7. Reviewer says REJECT (semantic: missing rollback for DB change)
   → Present rejection to user → User selects "제안대로 수정"
8. Edit plan, add rollback steps
9. Call reviewer again
10. Reviewer says OKAY
11. Delete draft
12. Guide user to next steps: /open or /execute
```

---

## Next Steps (Guide User)

After plan approval, inform the user of available options:

```
Plan has been approved! Please select next steps:

- `/open` - Create Draft PR (when you want reviewer feedback first)
- `/execute` - Start implementation immediately (execute plan as-is)
```
