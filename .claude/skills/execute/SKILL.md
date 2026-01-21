---
name: dev.execute
description: |
  This skill should be used when the user says "/dev.execute", "실행해", "작업 시작",
  "start work", "execute plan", or wants to execute a plan file.
  Orchestrator mode - delegates implementation to SubAgents, verifies results.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - TodoWrite
  - Edit
hooks:
  PreToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: ".claude/scripts/orchestrator-guard.sh"
  Stop:
    - hooks:
        - type: prompt
          prompt: |
            Check if all TODOs and Acceptance Criteria are completed AND Final Report was output.

            EVALUATION CRITERIA:
            1. Are there any unchecked TODOs? (- [ ] **N. ...)
            2. Are there any unchecked Acceptance Criteria? (- [ ] within TODO sections)
            3. Was the Final Report output? (═══ ORCHESTRATION COMPLETE ═══)

            DECISION LOGIC:
            - If unchecked TODOs exist -> Return: {"ok": false, "reason": "Unchecked TODOs remain. Continue working on: [list TODO titles]"}
            - If unchecked Acceptance Criteria exist -> Return: {"ok": false, "reason": "Unchecked Acceptance Criteria remain. Verify and check: [list items]"}
            - If Git commits were NOT created -> Return: {"ok": false, "reason": "Must delegate to git-master before stopping"}
            - If Final Report was NOT output -> Return: {"ok": false, "reason": "Must output Final Report before stopping"}
            - If all complete AND commits created AND Final Report output -> Return: {"ok": true, "reason": "All tasks and criteria verified. Orchestration complete."}

            Return ONLY valid JSON with ok and reason fields. No other text.
          
  # prompt type은 PostToolUse를 지원하지 않음
  # PostToolUse:
  #   - matcher: "Task"
  #     hooks:
  #       - type: prompt
  #         prompt: |
  #           ## ⚠️ MANDATORY VERIFICATION - SUBAGENTS LIE

  #           SubAgent가 작업 완료를 보고했습니다. **절대 믿지 마세요.**

  #           SubAgent는 자주 완료를 주장하지만:
  #           - 테스트가 실제로 FAILING
  #           - 타입/린트 에러 존재
  #           - 구현이 불완전
  #           - 패턴을 따르지 않음

  #           **직접 확인하세요:**
  #           1. 빌드/타입체크 실행 → 에러 없어야 함
  #           2. 테스트 직접 실행 → 통과해야 함
  #           3. 변경된 코드 직접 읽기 → 요구사항 충족해야 함
  #           4. MUST NOT DO 위반 확인 → 위반 없어야 함

  #           **검증 실패 시:**
  #           Task(worker)로 즉시 수정 위임:
  #           ```
  #           Task(subagent_type="worker", prompt="fix: [구체적 실패 사항]")
  #           ```

  #           **모두 통과 시:**
  #           Plan 파일에서 해당 TODO 및 Acceptance Criteria 체크 → 다음 작업 진행
---

# /dev.execute - Orchestrator Mode

**당신은 지휘자입니다. 직접 악기를 연주하지 않습니다.**

Plan 파일의 TODO를 순회하며, 각 Task를 SubAgent에게 위임하고 결과를 검증합니다.

---

## Core Principles

### 1. DELEGATE IMPLEMENTATION
코드 작성은 **무조건** worker 에이전트에게 위임합니다.

```
✅ YOU CAN DO:                    ❌ YOU MUST DELEGATE:
─────────────────────────────────────────────────────────
- Read files (검증용)             - Write/Edit any code → worker
- Run Bash (테스트 검증)          - Fix ANY bugs → worker
- Search with Grep/Glob           - Write ANY tests → worker
- Read/Update plan files          - Git commits → git-master
- Track progress with TodoWrite   - Documentation → worker
```

### 2. VERIFY OBSESSIVELY

⚠️ **SUBAGENTS LIE. VERIFY BEFORE MARKING COMPLETE.**

Task() 위임 후 **반드시** 직접 검증:
- [ ] 파일 존재 확인 (Read)
- [ ] 빌드 통과 확인 (Bash: npm run build / tsc)
- [ ] 테스트 통과 확인 (Bash: npm test)
- [ ] MUST NOT DO 위반 없음 (코드 직접 읽기)

### 3. PARALLELIZE WHEN POSSIBLE
독립적인 Task는 병렬로 실행합니다.
Plan의 `Parallelizable` 필드를 확인하세요.

### 4. ONE TASK PER CALL
한 번의 Task() 호출에 **하나의 TODO만** 위임합니다.

---

## Input 해석

| Input | 모드 | 동작 |
|-------|------|------|
| `/dev.execute` | 자동 감지 | 현재 브랜치 → Draft PR 확인 → 있으면 PR 모드, 없으면 로컬 모드 |
| `/dev.execute <name>` | 로컬 | `.dev/specs/<name>/PLAN.md` 실행 |
| `/dev.execute <PR#>` | PR | PR body에서 spec path 파싱 후 실행 |
| `/dev.execute <PR URL>` | PR | URL에서 PR# 추출 → PR 모드 |

**자동 감지 로직:**
```bash
# 1. 현재 브랜치에 연결된 Draft PR 확인
gh pr list --head $(git branch --show-current) --draft --json number

# 2. PR 있으면 → PR 모드
# 3. PR 없으면 → 브랜치명에서 spec 유추 (feat/user-auth → user-auth)
```

---

## Execution Modes

### 로컬 모드 (Local Mode)

PR 없이 빠르게 실행. 완료 후 별도로 PR 생성 가능.

| 항목 | 동작 |
|------|------|
| **Spec 위치** | `.dev/specs/{name}/PLAN.md` |
| **상태 관리** | Plan checkbox만 |
| **히스토리** | Context (`context/*.md`) |
| **막힘 처리** | Context에 기록, 사용자에게 보고 |
| **완료 후** | git-master 커밋 → Final Report |

### PR 모드 (PR Mode)

GitHub PR과 연동. 협업 및 자동화에 적합.

| 항목 | 동작 |
|------|------|
| **Spec 위치** | PR body에서 파싱 → `.dev/specs/{name}/PLAN.md` |
| **상태 관리** | Plan checkbox + `/dev.state` 스킬 |
| **히스토리** | Context + PR Comments |
| **막힘 처리** | `/dev.state pause` → blocked 전이 |
| **완료 후** | git-master 커밋 → `/dev.state publish` |

---

## Workflow

### STEP 1: Session Initialization

**흐름도:**
```
┌─────────────────────────────────────────────────────────────┐
│ 1. Input 파싱 → 모드 결정                                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   [PR 모드]            [로컬 모드]
        │                   │
        ▼                   │
┌───────────────────┐       │
│ 2. /dev.state     │       │
│    begin <PR#>    │       │
└────────┬──────────┘       │
         │                  │
    ┌────┴────┐             │
    ▼         ▼             │
 [성공]    [실패]           │
    │         │             │
    │         ▼             │
    │    ⛔ 즉시 STOP       │
    │    (진행 금지)        │
    │                       │
    └─────────┬─────────────┘
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Plan 파일 확인                                            │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
        (이후 단계...)
```

---

1. **Input 파싱 및 모드 결정**
   ```
   Input이 숫자 또는 PR URL → PR 모드
   Input이 문자열 → 로컬 모드
   Input 없음 → 자동 감지
   ```

2. **[PR 모드 전용] 상태 전이 - 중복 실행 체크**

   ⚠️ **Plan 파일을 읽기 전에 반드시 먼저 실행!**

   ℹ️ **로컬 모드일 경우 이 단계를 건너뛰고 3번으로 진행하세요.**

   **`/dev.state begin <PR#>` 호출:**
   - 중복 실행 체크 (이미 executing이면 에러)
   - blocked 상태 체크 (blocked면 에러)
   - `state:queued` 제거 → `state:executing` 추가
   - "Execution Started" Comment 기록

   **state begin 실패 시:**
   - ⛔ "Already executing" → **즉시 중단. 이후 단계 진행 금지.**
     사용자에게 안내: "PR #N은 이미 executing 상태입니다. 이전 실행이 진행 중이거나 중단된 상태일 수 있습니다."
   - ⛔ "PR is blocked" → **즉시 중단. 이후 단계 진행 금지.**
     사용자에게 안내: "`/dev.state continue <PR#>`로 먼저 blocked 상태를 해제해주세요."

3. **Plan 파일 확인**

   **로컬 모드:**
   ```
   .dev/specs/{name}/PLAN.md
   ```
   - 인자로 plan 이름이 주어지면 해당 파일 사용
   - 없으면 가장 최근 plan 파일 또는 사용자에게 질문

   **PR 모드:**
   ```bash
   # PR body의 Spec Reference 링크에서 경로 추출
   gh pr view <PR#> --json body -q '.body' | grep -oP '(?<=→ \[)[^\]]+'
   ```

4. **진행 상태 파악**
   Plan 파일의 checkbox가 상태입니다:
   - 첫 번째 `- [ ]` = 현재 진행할 TODO
   - 모든 `- [x]` = 완료된 TODO
   - 별도 상태 파일 불필요

5. **TodoWrite로 추적 시작**
   ```
   TodoWrite([{
     content: "Execute plan: {name}",
     status: "in_progress",
     activeForm: "Executing plan: {name}"
   }])
   ```

### STEP 2: Initialize Knowledge (Context 설정)

**첫 실행 시 context 폴더가 없으면 생성합니다:**

```bash
CONTEXT_DIR=".dev/specs/{name}/context"
mkdir -p "$CONTEXT_DIR"
```

매 Task 위임 **전에** context 파일들을 읽습니다: 

```
.dev/specs/{name}/context/
├── learnings.md      # 발견한 패턴, 성공한 접근법
├── issues.md         # 문제점, 피해야 할 접근법
├── decisions.md      # 내린 결정과 이유
├── verification.md   # 테스트/빌드 결과
└── problems.md       # 미해결 이슈
```

**없으면, 빈 파일을 생성합니다.**

**⚠️ 왜 매번 읽는가?**
SubAgent는 **stateless** - 호출 간 모든 것을 잊어버립니다.
context 없이는 같은 실수를 반복합니다.

### STEP 3: Task Execution Loop

**FOR EACH unchecked TODO (- [ ]):**

#### 3a. Read context (매번!)
이전 Task에서 배운 내용을 수집합니다.

#### 3b. Delegate with 7-Section Prompt

```
Task(
  subagent_type="worker",
  description="Implement: {TODO 제목}",
  prompt="""
## TASK
[Plan에서 TODO 텍스트 정확히 인용]

## EXPECTED OUTCOME
When this task is DONE, the following MUST be true:
- [ ] 파일 생성/수정: [정확한 파일 경로]
- [ ] 기능 동작: [정확한 동작 설명]
- [ ] 테스트 명령: `[명령어]` → 예상 출력: [출력]
- [ ] 빌드 통과: `npm run build` 또는 `tsc`

## REQUIRED TOOLS
- Read: 기존 코드 참조
- Edit/Write: 코드 작성
- Bash: 빌드/테스트 실행

## MUST DO
- 이 Task만 수행
- 기존 코드 패턴 따르기 (참조: `path/to/reference.ts`)
- Inherited Wisdom 활용 (아래 CONTEXT 참조)
- 테스트 작성: [구체적인 테스트 케이스]

## MUST NOT DO
- 다른 Task 수행 금지
- 허용 파일 외 수정 금지: [허용 파일 목록]
- 새로운 의존성 추가 금지 (필요시 먼저 물어보기)
- 리팩토링/개선 금지 (명시적으로 요청되지 않는 한)

## CONTEXT
### Project Background
[프로젝트 설명, 현재 상태]

### Inherited Wisdom from Context
⚠️ SubAgent는 이전 호출을 기억하지 못합니다.
아래 내용을 반드시 참고하세요:

**Conventions (from learnings.md):**
- [발견한 코딩 관례]

**Successful approaches (from learnings.md):**
- [성공한 접근법]

**Failed approaches to AVOID (from issues.md):**
- [실패한 접근법 - 반복하지 말 것]

**Technical gotchas (from issues.md):**
- [기술적 주의사항]

**Key decisions (from decisions.md):**
- [내린 결정과 이유]

### Dependencies
[이전 Task에서 만든 것 중 이 Task가 의존하는 것]
"""
)
```

#### 3c. VERIFY (직접 검증!)

**⚠️ SUBAGENTS LIE. Trust but verify.**

Plan 파일의 **Acceptance Criteria**를 하나씩 직접 검증합니다:

```bash
# Acceptance Criteria 예시:
# - [ ] `src/types/todo.ts` 파일 존재
# - [ ] `npm run build` 성공
# - [ ] 테스트 통과

# 1. 파일 존재 확인 → Acceptance Criteria 체크 가능
Read("path/to/expected/file.ts")

# 2. 빌드 확인 → Acceptance Criteria 체크 가능
Bash("npm run build")  # 또는 tsc, go build 등

# 3. 테스트 확인 → Acceptance Criteria 체크 가능
Bash("npm test")  # 또는 해당 테스트 명령

# 4. MUST NOT DO 위반 확인
Read("files that should NOT be modified")
```

**검증 결과 기록**: 각 Acceptance Criteria의 통과/실패를 기록해두고,
다음 단계(3d)에서 통과한 항목만 체크합니다.

**검증 실패 시:**
```
Task(
  subagent_type="worker",
  description="Fix: {문제 설명}",
  prompt="## 이전 작업 검증 실패\n\n[실패 내용]\n\n## 수정 필요 사항\n..."
)
```

**최대 3회 재시도 후:**

**로컬 모드:**
- Context (`problems.md`)에 기록
- 사용자에게 보고 후 대기

**PR 모드 (자동 pause):**
- **`/dev.state pause <PR#> "<reason>"`** 호출
  - `state:executing` → `state:blocked` 전이
  - "Blocked" Comment 기록
- 실행 중단, 사용자 개입 대기

#### 3d. Update TODO & Context

1. **Plan 파일의 TODO 체크박스 업데이트**
   ```
   Edit(plan_path, "- [ ] **N. Task 제목**", "- [x] **N. Task 제목**")
   ```

2. **Acceptance Criteria 체크박스 업데이트**
   검증(3c)에서 통과한 항목의 Acceptance Criteria도 체크합니다:
   ```
   # 해당 TODO 섹션 내의 Acceptance Criteria 각각에 대해
   Edit(plan_path, "  - [ ] 검증된 조건", "  - [x] 검증된 조건")
   ```

   **⚠️ 주의**:
   - 직접 검증한 항목만 체크하세요
   - SubAgent 보고만으로 체크하지 마세요
   - 검증 실패한 항목은 `- [ ]`로 유지

3. **Context 업데이트** (worker 출력에서 추출)
   - learnings.md: LEARNINGS 섹션 내용
   - issues.md: ISSUES 섹션 내용
   - verification.md: VERIFICATION 섹션 내용

   형식:
   ```markdown
   ## [TIMESTAMP] Task: {task-number}
   [내용]
   ```

#### 3e. Next TODO
다음 미완료 TODO로 반복합니다.

---

### STEP 4: Git Commit & Push

모든 TODO 완료 후, Final Report 출력 **전에** git-master에게 커밋 위임:

```
Task(
  subagent_type="git-master",
  description="Commit: {plan-name} changes",
  prompt="""
Plan 실행 완료. 변경된 파일들을 커밋해주세요.

Plan: {plan-name}
완료된 TODO 수: {N}개

변경된 파일 목록은 `git status`로 확인하세요.
프로젝트 컨벤션을 따라 원자적 커밋으로 분할해주세요.

Push after commit: {YES | NO}
"""
)
```

**Push 옵션 결정:**
| 모드 | Push after commit |
|------|-------------------|
| PR 모드 | YES |
| 로컬 모드 | NO |

**주의:**
- git-master가 커밋 완료 보고 후 Final Report로 진행
- 커밋 실패 시 사용자에게 보고하고 수동 커밋 요청
- Push 실패 시 git-master가 에러 보고, 수동 push 안내

---

### STEP 5: Final Report

모든 TODO 완료 시:

**PR 모드 추가 작업:**
/dev.state publish 실행합니다.

**Final Report 출력:**

```
═══════════════════════════════════════════════════════════
                    ORCHESTRATION COMPLETE
═══════════════════════════════════════════════════════════

📋 PLAN: .dev/specs/{name}/PLAN.md
🔗 MODE: Local | PR #123

📊 SUMMARY:
   Total Tasks:              8
   Completed:                8
   Failed:                   0

   Acceptance Criteria:     24
   Verified & Checked:      24

📁 FILES MODIFIED:
   - src/auth/token.ts
   - src/auth/token.test.ts
   - src/utils/crypto.ts

📚 LEARNINGS ACCUMULATED:
   - 이 프로젝트는 ESM 전용
   - 테스트 파일은 .test.ts 확장자 사용
   - crypto 모듈은 Node.js built-in 사용

⚠️  ISSUES DISCOVERED:
   - 기존 코드에서 발견한 문제점 (범위 외라 수정 안 함)

✅ VERIFICATION:
   - Build: PASS
   - Tests: PASS

═══════════════════════════════════════════════════════════
```


---

## Context System Details

### 파일별 용도

| 파일 | 용도 | 예시 내용 |
|------|------|----------|
| learnings.md | 발견한 패턴, 성공 사례 | "이 프로젝트는 camelCase 사용" |
| issues.md | 문제점, 실패 사례 | "require() 사용 시 ESM 오류 발생" |
| decisions.md | 결정과 이유 | "JWT 대신 Session 선택 - 이유: ..." |
| verification.md | 빌드/테스트 결과 | "Task 3 후 테스트 2개 실패 → 수정됨" |
| problems.md | 미해결 이슈 | "타입 정의 불완전 - 추후 수정 필요" |

### Context 생명주기

```
TODO #1 위임 전 → Context 읽기 → CONTEXT에 주입
TODO #1 완료 후 → worker 출력에서 학습 추출 → Context에 append

TODO #2 위임 전 → Context 읽기 → TODO #1 학습 반영됨!
TODO #2 완료 후 → Context에 append

... (누적)
```

---

## Parallelization

Plan 파일의 `Parallelizable` 필드 확인:

| 값 | 의미 | 처리 |
|----|------|------|
| `YES (with N, M)` | Task N, M과 병렬 가능 | 동시 Task() 호출 |
| `YES (independent)` | 모든 Task와 병렬 가능 | 언제든 실행 |
| `NO (depends on N)` | Task N 완료 대기 | 순차 실행 |
| `NO (foundation)` | 다른 Task의 기초 | 먼저 실행 |

**병렬 실행 예시:**
```
// Task 2, 3이 병렬 가능한 경우
Task(subagent_type="worker", prompt="Task 2...")
Task(subagent_type="worker", prompt="Task 3...")
// 두 Task 동시 실행
```

---

## Checklist Before Stopping

**⚠️ Workflow 순서대로 체크하세요:**

**1. 시작 단계 (PR 모드 전용):**
- [ ] `/dev.state begin <PR#>` 호출했는가? (실패 시 즉시 중단했는가?)

**2. 실행 단계:**
- [ ] 모든 TODO가 `- [x]`로 체크되었는가?
- [ ] 각 TODO의 Acceptance Criteria가 검증 후 `- [x]`로 체크되었는가?
- [ ] 각 Task 완료 후 직접 검증을 수행했는가?
- [ ] Context에 학습 내용을 기록했는가?

**3. 완료 단계:**
- [ ] git-master에게 커밋을 위임했는가?
- [ ] Final Report를 출력했는가?

**4. PR 모드 완료 (PR 모드 전용):**
- [ ] 완료 Comment를 PR에 추가했는가?

**예외 처리 (해당 시):**
- [ ] 막힘 발생 시 `/dev.state pause` 호출했는가? (PR 모드)
- [ ] 막힘 발생 시 `problems.md`에 기록했는가? (로컬 모드)

**하나라도 미완료 시 작업을 계속하세요.**
