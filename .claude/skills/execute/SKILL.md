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
   - `### [ ] TODO N:` = 미완료 TODO (첫 번째 미완료 = 현재 작업)
   - `### [x] TODO N:` = 완료된 TODO
   - `- [ ]` / `- [x]` = Acceptance Criteria (TODO 내부)
   - 별도 상태 파일 불필요

5. **TodoWrite로 추적 시작**
   ```
   TodoWrite([{
     content: "Execute plan: {name}",
     status: "in_progress",
     activeForm: "Executing plan: {name}"
   }])
   ```

### STEP 2: Initialize or Resume Context

**Context 폴더 확인:**

```bash
CONTEXT_DIR=".dev/specs/{name}/context"
```

**첫 실행 vs 재개 판단:**

```
if context 폴더가 없으면:
    → 첫 실행: 폴더 생성 + 파일 초기화
else:
    → 재개: 기존 파일 유지 + outputs.json 로드
```

**첫 실행 시:**

```bash
mkdir -p "$CONTEXT_DIR"
```

| 파일 | 초기값 |
|------|--------|
| `outputs.json` | `{}` |
| `learnings.md` | 빈 파일 |
| `issues.md` | 빈 파일 |
| `decisions.md` | 빈 파일 |

**재개 시 (context 폴더가 이미 존재):**

1. `outputs.json` 읽어서 메모리에 로드 (3a 변수 치환용)
2. 다른 파일들은 그대로 유지 (append 방식이므로)
3. Plan 파일의 checkbox로 진행 상태 파악 (STEP 1에서 이미 수행)

> 📖 파일별 상세 용도는 하단 **Context System Details** 참조

### STEP 3: Task Execution Loop

**FOR EACH unchecked TODO (### [ ] TODO N:):**

#### 3a. Prepare Inputs (변수 치환)

Worker에게 Task를 위임하기 **전에**, Plan의 `Inputs` 필드에 정의된 `${...}` 변수를 실제 값으로 치환합니다.

**Outputs 저장소: `context/outputs.json`**

모든 TODO의 Output은 `context/outputs.json` 파일에 저장됩니다.

```json
// context/outputs.json
{
  "todo-1": { "config_path": "./config/app.json" },
  "todo-2": { "api_module": "src/api/index.ts" }
}
```

**변수 치환 예시:**
```
# Plan의 Inputs 필드:
**Inputs**:
- `config_path` (file): `${todo-1.outputs.config_path}`

# 치환 후 Worker에게 전달:
**Inputs**:
- `config_path` (file): `./config/app.json`
```

**치환 로직:**
1. `context/outputs.json` 파일 읽기
2. 현재 TODO의 `Inputs` 섹션에서 `${todo-N.outputs.field}` 패턴 찾기
3. JSON에서 해당 값 추출하여 대체
4. 치환된 값을 Worker 프롬프트에 포함

#### 3b. Delegate with Prompt Template

**PLAN → Prompt 매핑 테이블:**

| PLAN 필드 | Prompt 섹션 | 매핑 방법 |
|-----------|-------------|-----------|
| TODO 제목 + Steps | `## TASK` | 그대로 인용 |
| Outputs + Acceptance Criteria | `## EXPECTED OUTCOME` | 결합하여 체크리스트로 |
| Required Tools | `## REQUIRED TOOLS` | 그대로 인용 |
| Steps | `## MUST DO` | 체크박스 항목으로 |
| Must NOT do | `## MUST NOT DO` | 그대로 인용 |
| References | `## CONTEXT > References` | file:line 형식으로 |
| Inputs (치환 후) | `## CONTEXT > Dependencies` | 실제 값과 함께 |

```
Task(
  subagent_type="worker",
  description="Implement: {TODO 제목}",
  prompt="""
## TASK
[Plan의 TODO 제목 + Steps 섹션 정확히 인용]

예시:
### TODO 2: Add authentication middleware

**Steps**:
- [ ] Read JWT settings from config
- [ ] Create src/middleware/auth.ts
- [ ] Implement token validation
- [ ] Export middleware function

## EXPECTED OUTCOME
[Plan의 Outputs + Acceptance Criteria 결합]

When this task is DONE, the following MUST be true:

**Outputs** (반드시 생성해야 함):
- `middleware_path` (file): `src/middleware/auth.ts`

**Acceptance Criteria** (모두 통과해야 함):
- [ ] File exists: `src/middleware/auth.ts`
- [ ] File exports `authMiddleware` function
- [ ] Request without token → 401 Unauthorized

## REQUIRED TOOLS
[Plan의 Required Tools 그대로]
- Read: 기존 코드 참조
- Edit/Write: 코드 작성
- Bash: 빌드/테스트 실행

## MUST DO
[Plan의 Steps를 명령형으로]
- 이 Task만 수행
- 기존 코드 패턴 따르기 (아래 References 참조)
- Inherited Wisdom 활용 (아래 CONTEXT 참조)

## MUST NOT DO
[Plan의 Must NOT do 그대로]
- 다른 Task 수행 금지
- 허용 파일 외 수정 금지
- 새로운 의존성 추가 금지
- git 명령 실행 금지 (Orchestrator가 처리)

## CONTEXT
### References (from Plan)
[Plan의 References 섹션]
- `src/middleware/logging.ts:10-25` - Middleware pattern to follow
- `src/utils/jwt.ts:verify()` - Use this for token validation

### Dependencies (from Inputs - 치환된 값)
[3a에서 치환된 실제 값]
- `config_path`: `./config/app.json` (from TODO 1)

### Inherited Wisdom
⚠️ SubAgent는 이전 호출을 기억하지 못합니다.

**Conventions (from learnings.md):**
- [발견한 코딩 관례]

**Failed approaches to AVOID (from issues.md):**
- [실패한 접근법 - 반복하지 말 것]

**Key decisions (from decisions.md):**
- [내린 결정과 이유]
"""
)
```

#### 3c. Collect Worker Output (파싱만, 저장은 3e에서)

Worker가 반환한 JSON을 파싱합니다. **아직 저장하지 않습니다.**

**1. Worker 출력에서 JSON 추출:**

```
Worker 출력 텍스트에서 ```json ... ``` 블록을 찾아 파싱
```

**2. JSON 파싱 실패 시:**

Worker가 JSON을 반환하지 않았거나 형식이 잘못된 경우:
```
Task(
  subagent_type="worker",
  description="Fix: JSON 형식 오류",
  prompt="이전 작업은 완료되었으나 결과 JSON이 누락되었습니다.\n\n반드시 ```json 블록으로 결과를 반환하세요.\n\n[worker.md의 Output Format 참조]"
)
```

**3. 파싱 성공 시:**

JSON 객체를 메모리에 보관하고 다음 단계(VERIFY)로 진행합니다.

```json
{
  "outputs": {"config_path": "./config.json"},
  "learnings": ["ESM 사용"],
  "issues": ["타입 정의 불완전"],
  "acceptance_criteria": {"functional": "PASS", "static": "PASS", "runtime": "PASS", "cleanup": "SKIP"}
}
```

**⚠️ 중요**: VERIFY 통과 후에만 context에 저장합니다 (재시도 시 중복 방지).

#### 3d. VERIFY (직접 검증!)

**⚠️ SUBAGENTS LIE. Trust but verify.**

Plan 파일의 **Acceptance Criteria**를 카테고리별로 직접 검증합니다:

```bash
# *Functional:* (기능 동작 검증)
Read("path/to/expected/file.ts")  # 파일 존재 확인
# 기능 요구사항 직접 테스트

# *Static:* (정적 분석)
Bash("tsc --noEmit src/modified/file.ts")  # 타입체크
Bash("eslint src/modified/file.ts")         # 린트

# *Runtime:* (테스트 실행)
Bash("npm test -- related.test.ts")  # 관련 테스트

# *Cleanup:* (정리 - 명시된 경우만)
# 미사용 import 확인, 삭제된 파일 확인

# MUST NOT DO 위반 확인
Read("files that should NOT be modified")
```

**완료 조건**: `Functional ✅ AND Static ✅ AND Runtime ✅ (AND Cleanup ✅ if specified)`

**검증 결과 기록**: 각 카테고리의 통과/실패를 기록해두고,
다음 단계(3f)에서 통과한 항목만 체크합니다.

---

**VERIFY Retry Loop (최대 3회):**

```
retry_count = 0

VERIFY_LOOP:
  검증 수행 (위 체크리스트)

  if 모두 통과:
      → 3e (Save to Context)로 진행
  else:
      retry_count++
      if retry_count < 3:
          Task(worker, "Fix: {실패 항목}")
          → 3c (Collect Worker Output)로 돌아가기
             (새 JSON 파싱 → VERIFY_LOOP 재진입)
      else:
          → VERIFY 실패 처리 (아래)
```

**흐름도:**
```
3b. Delegate → 3c. Collect → 3d. VERIFY
                    ↑              ↓
                    │         [통과] → 3e. Save
                    │              ↓
                    │         [실패, retry < 3]
                    │              ↓
                    │         Task(worker, "Fix...")
                    │              ↓
                    └────────── 3c로 복귀 (새 output 파싱)

                          [실패, retry >= 3]
                               ↓
                          VERIFY 실패 처리
```

---

**VERIFY 실패 처리 (3회 재시도 후):**

**로컬 모드:**
- `issues.md`에 미해결 항목으로 기록 (`- [ ] 문제 내용`)
- 사용자에게 보고: "TODO N 검증 실패. 수동 개입이 필요합니다."
- **선택지 제시**: 계속 진행 / 중단

**PR 모드 (자동 pause):**
- **`/dev.state pause <PR#> "<reason>"`** 호출
  - `state:executing` → `state:blocked` 전이
  - "Blocked" Comment 기록
- 실행 중단, 사용자 개입 대기

#### 3e. Save to Context (VERIFY 통과 시에만)

VERIFY를 통과한 경우에만 Worker JSON을 context 파일들에 저장합니다.

**저장 규칙:**

| 필드 | 파일 | 저장 형식 |
|------|------|----------|
| `outputs` | `outputs.json` | `existing["todo-N"] = outputs` 후 Write |
| `learnings` | `learnings.md` | `## TODO N\n- 항목1\n- 항목2` append |
| `issues` | `issues.md` | `## TODO N\n- [ ] 항목1` append (미해결) |
| `decisions` | `decisions.md` | `## TODO N\n- 항목1` append |
| `acceptance_criteria` | (저장 안함) | Orchestrator 검증용으로만 사용, context에 저장하지 않음 |

**주의사항:**
- 현재 처리 중인 TODO 번호(N)를 사용
- 빈 배열(`[]`)인 필드는 스킵 (헤더만 추가하지 않음)
- **병렬 실행 시 outputs.json은 순차 저장** (동시 쓰기 금지)

**저장 예시:**

→ `outputs.json`:
```json
{"todo-1": {"config_path": "./config.json"}}
```

→ `learnings.md`:
```markdown
## TODO 1
- ESM 사용
```

#### 3f. Update Plan Checkboxes

1. **Plan 파일의 TODO 체크박스 업데이트**
   ```
   Edit(plan_path, "### [ ] TODO N: Task 제목", "### [x] TODO N: Task 제목")
   ```

2. **Acceptance Criteria 체크박스 업데이트**
   검증(3d)에서 통과한 항목의 Acceptance Criteria도 체크합니다:
   ```
   # 해당 TODO 섹션 내의 Acceptance Criteria 각각에 대해
   Edit(plan_path, "  - [ ] 검증된 조건", "  - [x] 검증된 조건")
   ```

   **⚠️ 주의**:
   - 직접 검증한 항목만 체크하세요
   - SubAgent 보고만으로 체크하지 마세요
   - 검증 실패한 항목은 `- [ ]`로 유지

#### 3g. Next TODO
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

✅ ACCEPTANCE CRITERIA:
   - Functional: PASS (all TODOs)
   - Static: PASS (all TODOs)
   - Runtime: PASS (all TODOs)

═══════════════════════════════════════════════════════════
```


---

## Context System Details

### 파일별 용도

| 파일 | 작성자 | 용도 | 예시 |
|------|--------|------|------|
| **outputs.json** | Worker → Orchestrator 저장 | TODO의 Output 값 (다음 TODO의 Input) | `{"todo-1": {"config_path": "./config.json"}}` |
| learnings.md | Worker → Orchestrator 저장 | 발견하고 **적용한** 패턴 | `- 이 프로젝트는 ESM 사용` |
| issues.md | Worker → Orchestrator 저장 | **미해결** 문제 (항상 `- [ ]`로 저장) | `- [ ] 타입 정의 불완전` |
| decisions.md | Worker → Orchestrator 저장 | 결정과 이유 | `- JWT 대신 Session 선택` |

### Context 생명주기

```
TODO #1 위임 전 → Context 읽기 (outputs.json 포함) → 프롬프트에 주입
TODO #1 완료 후 → outputs.json에 Output 저장 + learnings/issues에 학습 저장

TODO #2 위임 전 → outputs.json 읽기 → ${todo-1.outputs.X} 치환
TODO #2 완료 후 → outputs.json 업데이트 + Context에 학습 append

... (누적, 세션 끊겨도 파일에 보존됨)
```

---

## Parallelization

Plan 파일의 **Parallelization** 섹션과 **Dependency Graph**를 확인합니다.

### Dependency Graph 해석

```markdown
## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `config_path` (file) | work |
| 2 | `todo-1.config_path` | `api_module` (file) | work |
| 3 | - | `utils` (file) | work |
| Final | all outputs | - | verification |
```

- **Requires가 비어있으면** (`-`) → 독립적, 병렬 가능
- **Requires에 다른 TODO가 있으면** → 해당 TODO 완료 대기

### Parallelization 테이블 해석

```markdown
## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| A | 1, 3 | 독립적인 설정 작업 |
| - | 2 | TODO 1 의존 |
```

- **같은 Group의 TODO들** → 동시 Task() 호출 가능
- **Group이 `-`인 TODO** → 순차 실행

**병렬 실행 예시:**
```
// Group A의 TODO 1, 3이 병렬 가능한 경우
Task(subagent_type="worker", prompt="TODO 1...")
Task(subagent_type="worker", prompt="TODO 3...")
// 두 Task 동시 실행

// TODO 2는 TODO 1 완료 후 순차 실행
```

---

## Checklist Before Stopping

**⚠️ Workflow 순서대로 체크하세요:**

**1. 시작 단계 (PR 모드 전용):**
- [ ] `/dev.state begin <PR#>` 호출했는가? (실패 시 즉시 중단했는가?)

**2. 실행 단계:**
- [ ] 모든 TODO가 `### [x] TODO N:`로 체크되었는가?
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
- [ ] 막힘 발생 시 `issues.md`에 미해결 항목으로 기록했는가? (로컬 모드)

**하나라도 미완료 시 작업을 계속하세요.**
