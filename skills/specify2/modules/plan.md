# Module: Plan

PLAN.md generation with checkpoints.

## Input

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- feature_name: from Triage (for output path)
- draft_path: from Interview
- analysis_results: from Analysis

## Output

- plan_path: `.dev/specs/{feature_name}/PLAN.md`
- status: `created`

---

## Logic

### 1. Decision Summary Checkpoint (standard/thorough, interactive)

Before creating plan, present all decisions:

```
AskUserQuestion(
  question: "다음 결정 사항을 확인해주세요. 수정이 필요한 항목이 있나요?",
  options: [
    { label: "확인 완료", description: "모든 결정 사항이 맞습니다" },
    { label: "수정 필요", description: "일부 항목을 변경하고 싶습니다" }
  ]
)
```

**Summary content:**
```markdown
## 결정 요약

### 사용자 결정 (User Decisions)
- Auth method: JWT (사용자 선택)
- API format: REST (사용자 선택)

### 자동 결정 (Agent Decisions)
- [MED] Response format: JSON — 기존 패턴 따름
- [LOW] 파일 위치: src/services/auth/ — 기존 구조 따름

### 위험도 요약
- HIGH: 1건 (DB 스키마 변경)
- MEDIUM: 3건
- LOW: 5건

### Assumptions (autopilot only)
{from draft.assumptions}
```

**If "수정 필요":** Ask which items, update draft, re-run affected analysis.

### 2. Create Plan File

#### DRAFT → PLAN Mapping

| DRAFT Section | PLAN Section |
|---------------|--------------|
| What & Why | Context > Original Request |
| User Decisions | Context > Interview Summary |
| Agent Findings | Context > Research Findings |
| Boundaries | Work Objectives > Must NOT Do |
| Success Criteria | Work Objectives > Definition of Done |
| Agent Findings > Patterns | TODOs > References |
| Direction > Work Breakdown | TODOs + Dependency Graph |
| Assumptions | Context > Assumptions (autopilot only) |
| Analysis > A-items | Verification Summary + TODO Acceptance |
| Analysis > H-items | Verification Summary > Human-Required |

```
Write(".dev/specs/{feature_name}/PLAN.md", plan_content)
```

Follow `templates/PLAN_TEMPLATE.md`.

### 3. Required Sections

- **Context**
  - Original Request
  - Interview Summary (or Assumptions for autopilot)
  - Research Findings

- **Work Objectives**
  - Concrete Deliverables
  - Must NOT Do
  - Definition of Done

- **Orchestrator Section**
  - Task Flow
  - Dependency Graph
  - Commit Strategy

- **TODOs** (each with)
  - Type: `work` | `verification`
  - Inputs/Outputs
  - Steps (checkbox)
  - Must NOT do
  - References
  - Acceptance Criteria
  - Verify block (risk tag)

- **TODO Final: Verification**
  - Type: `verification`
  - Full project verification

- **Verification Summary**
  - A-items (agent-verifiable)
  - H-items (human-required)

### 4. Verification Summary Checkpoint (standard/thorough, interactive)

```
AskUserQuestion(
  question: "PLAN의 Verification Summary입니다. 이대로 진행할까요?",
  options: [
    { label: "확인", description: "검증 전략이 적절합니다" },
    { label: "수정 필요", description: "검증 항목을 변경하고 싶습니다" }
  ]
)
```

**If "수정 필요":** Update Verification Summary.

---

## Behavior by Depth

| Depth | Plan Detail |
|-------|-------------|
| quick | Minimal TODOs, relaxed Verify blocks |
| standard | Full TODOs with Verify blocks |
| thorough | Extended TODOs, strict Verify, rollback steps for MEDIUM+ |

### Quick Depth Simplifications

- Fewer TODO sections (combine related items)
- Simplified Acceptance Criteria
- No Dependency Graph (linear execution)
- No Commit Strategy (single commit at end)

### Thorough Depth Enhancements

- Detailed TODO sections
- Rollback steps for all MEDIUM+ risk items
- Explicit parallelization opportunities
- Per-TODO commit strategy

---

## Behavior by Interaction

| Interaction | Checkpoints |
|-------------|-------------|
| interactive | Decision Summary ✅, Verification Summary ✅ |
| autopilot | Skip both, log in plan |

### Autopilot Mode

Skip checkpoints, add note to plan:

```markdown
## Autopilot Mode Notice

이 플랜은 autopilot 모드로 생성되었습니다.
모든 결정은 표준 선택을 따랐으며, Assumptions 섹션에 기록되어 있습니다.

검토가 필요하면 `/specify2 {name} --interactive`로 다시 실행하세요.
```

---

## TODO Structure Reference

See `references/plan-structure.md` for detailed TODO field specifications:
- Type field (work vs verification)
- Acceptance Criteria categories
- Verify block format
- Risk tagging rules
