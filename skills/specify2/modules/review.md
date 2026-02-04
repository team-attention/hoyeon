# Module: Review

Reviewer approval loop (re-entrant).

## Input

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- feature_name: from Triage (for DRAFT deletion path)
- plan_path: from Plan module

## Output

- status: `approved` | `changes_requested` | `halted`
- rejection_type: `cosmetic` | `semantic` (if changes_requested)

---

## Logic

### 1. Call Reviewer

```
Task(subagent_type="reviewer",
     prompt="Review this plan: {plan_path}")
```

### 2. Handle Response

#### If OKAY (approved)

1. Delete draft file:
   ```
   Bash("rm .dev/specs/{feature_name}/DRAFT.md")
   ```

2. Output completion:
   ```
   ✅ 플랜이 승인되었습니다.
   Plan: {plan_path}
   ```

3. Guide to next steps (see below)

4. Return `status: approved`

#### If REJECT

Classify rejection type:

**Cosmetic** (auto-fixable):
- Formatting issues
- Missing fields
- Clarity improvements
- Typos

**Semantic** (requires decision):
- Work Objectives changes (scope, deliverables)
- TODO steps or acceptance criteria changes
- Risk level changes
- Must NOT Do changes

### 3. Handle Rejection

#### Cosmetic Rejection (all modes)

Auto-fix without user involvement:
1. Read specific issues
2. Edit plan to address each
3. Re-invoke reviewer
4. Repeat until OKAY or max iterations

#### Semantic Rejection

**Interactive mode:**
```
AskUserQuestion(
  question: "Reviewer가 플랜의 문제를 발견했습니다: {reason}. 어떻게 처리할까요?",
  options: [
    { label: "제안대로 수정", description: "{fix_summary}" },
    { label: "직접 수정", description: "플랜을 직접 편집하겠습니다" },
    { label: "인터뷰로 돌아가기", description: "요구사항을 다시 정리합니다" }
  ]
)
```

**Autopilot mode:**
- Attempt auto-fix with conservative choice
- If fix changes scope significantly → halt with warning
- Log attempted fix in plan

---

## Behavior by Depth

| Depth | Max Iterations | Cosmetic | Semantic |
|-------|---------------|----------|----------|
| quick | 1 | auto-fix | halt |
| standard | 5 | auto-fix | AskUser (interactive) / auto-fix (autopilot) |
| thorough | unlimited | user confirm | AskUser always |

## Combination Priority Rules

> **Interaction takes precedence over Depth for user-facing decisions.**

| Combination | Cosmetic Rejection | Semantic Rejection | Rationale |
|-------------|-------------------|-------------------|-----------|
| quick + interactive | auto-fix | halt | Quick 본질 유지, 1회 제한 |
| quick + autopilot | auto-fix | halt | 표준 케이스 |
| standard + interactive | auto-fix | AskUser | 표준 케이스 |
| standard + autopilot | auto-fix | auto-fix (halt if scope) | 표준 케이스 |
| thorough + interactive | user confirm | AskUser | 표준 케이스 |
| thorough + autopilot | **auto-fix** (interaction wins) | **auto-fix** (interaction wins) | Autopilot의 본질은 무중단. Thorough의 품질은 Analysis에서 확보. |

**thorough + autopilot 특수 처리:**
```
"⚠️ Thorough + Autopilot: 검토 단계가 자동화됩니다.
   Cosmetic/Semantic 모두 auto-fix 시도 후 scope 변경 시 halt."
```

### Quick Depth

- Single review attempt
- Cosmetic: auto-fix and approve
- Semantic: halt immediately
  ```
  ⚠️ Semantic rejection in quick mode.
  Recommend re-running with standard depth:
  /specify2 {name} --standard
  ```

### Thorough Depth

- Even cosmetic rejections shown to user:
  ```
  AskUserQuestion(
    question: "Reviewer가 형식 문제를 발견했습니다. 자동 수정할까요?",
    options: [
      { label: "자동 수정", description: "제안된 수정 적용" },
      { label: "직접 확인", description: "수정 내용 먼저 확인" }
    ]
  )
  ```

---

## Behavior by Interaction

| Interaction | Semantic Rejection |
|-------------|-------------------|
| interactive | Always AskUser |
| autopilot | Auto-fix attempt, halt if scope change |

### Autopilot Semantic Fix Rules

| Rejection Type | Auto-Fix Strategy |
|----------------|-------------------|
| Missing rollback | Add generic rollback step |
| Vague acceptance | Add specific test command |
| Missing dependency | Add to Dependency Graph |
| Scope concern | **HALT** - requires human decision |

---

## Next Steps (After Approval)

### Interactive Mode

```
AskUserQuestion(
  question: "플랜이 승인되었습니다. 다음 단계를 선택하세요.",
  options: [
    { label: "/open", description: "Draft PR 생성 (리뷰어 피드백 먼저)" },
    { label: "/execute", description: "바로 구현 시작 (현재 브랜치)" },
    { label: "/worktree create {name}", description: "워크트리에서 격리 작업" }
  ]
)
```

Based on selection:
- `/open` → `Skill("open", args="{name}")`
- `/execute` → `Skill("execute", args="{name}")`
- `/worktree` → `Skill("worktree", args="create {name}")`

### Autopilot Mode

Skip question, output plan location and stop:

```
✅ 플랜이 승인되었습니다.

Plan: .dev/specs/{name}/PLAN.md

다음 단계:
- /open {name} — Draft PR 생성
- /execute {name} — 구현 시작
```

---

## Loop Control

### Re-entry Trigger

If `status: changes_requested` and not halted:
- Orchestrator re-invokes this module
- Previous rejection context passed as input

### Exit Conditions

1. Reviewer returns OKAY → `approved`
2. Max iterations reached → `halted` with warning
3. Semantic rejection in quick mode → `halted`
4. Autopilot scope change detected → `halted`
