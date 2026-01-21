---
name: dev.state
description: |
  "/dev.state", "dev.state", "PR 상태", "상태 변경", "queue", "pause", "continue", "status", "list"
  PR 상태 관리 통합 스킬 - 대기열 추가, 중단, 재개, 상태 조회, 목록 확인
allowed-tools:
  - Bash
  - Read
  - Glob
context: fork
---

# dev.state - PR 상태 관리

## Purpose

PR의 상태를 관리하는 통합 스킬. 대기열 추가, 중단, 재개, 상태 조회, 목록 확인을 하나의 스킬로 처리한다.

---

## 필수 참조 문서

**실행 전 반드시 `${baseDir}/references/pr-as-ssot.md`를 읽어야 한다.**

이 문서에서 참조할 섹션:
- **Labels** → 상태별 Label 정의 및 규칙
- **Comments (히스토리)** → 상태 변경 기록 포맷
- **State Machine** → 상태 전이 규칙
- **CLI 레퍼런스** → gh 명령어

---

## Label 초기화 (모든 action 전에 실행)

**모든 action 실행 전**, 필요한 Label이 레포에 존재하는지 확인하고 없으면 생성한다.

### 필수 Labels

| Label | Color | Description |
|-------|-------|-------------|
| `state:queued` | `#0E8A16` (green) | PR queued for auto-execution |
| `state:executing` | `#1D76DB` (blue) | PR currently being executed |
| `state:blocked` | `#D93F0B` (red) | PR blocked, needs human intervention |
| `auto-execute` | `#5319E7` (purple) | Opt-in for automatic execution |

### 확인 및 생성 로직

```bash
# 함수 정의
ensure_label() {
  local name="$1"
  local color="$2"
  local desc="$3"

  if ! gh label list --json name -q '.[].name' | grep -q "^${name}$"; then
    gh label create "$name" --color "$color" --description "$desc"
  fi
}

# 모든 필수 Label 확인/생성
ensure_label "state:queued" "0E8A16" "PR queued for auto-execution"
ensure_label "state:executing" "1D76DB" "PR currently being executed"
ensure_label "state:blocked" "D93F0B" "PR blocked, needs human intervention"
ensure_label "auto-execute" "5319E7" "Opt-in for automatic execution"
```

---

## Input

```
/dev.state <action> [PR#] [options]

actions:
  queue <PR#>                  # 대기열 추가
  begin <PR#>                  # 실행 시작
  pause <PR#> <reason>         # 블로킹
  continue <PR#> [--run]       # 재개 (--run: 바로 실행)
  complete <PR#>               # 실행 완료 → ready
  status [PR#]                 # 상태 확인 (생략 시 현재 브랜치)
  list [--queued|--executing|--blocked|--all]  # 목록
```

---

## Actions

### queue

**목적**: PR을 자동 실행 대기열에 추가

**전제조건**: `created` 상태 (Label 없음, Draft)

**상태 전이**: `created → queued`

**Workflow**:
1. 현재 상태 검증 (Label 없어야 함)
2. SSOT 참조하여 실행:
   - **Labels** → `state:queued` 추가 (없으면 생성)
   - **Comments** → "Queued" 템플릿 사용

**Output**: `✅ PR #123 queued for auto-execution`

---

### begin

**목적**: 구현 실행 시작

**전제조건**: `created` 또는 `queued` 상태

**상태 전이**: `created/queued → executing`

**Workflow**:
1. 현재 상태 검증 (Label 없거나 `state:queued`여야 함)
2. 중복 실행 체크 (`state:executing`이 아니어야 함)
3. SSOT 참조하여 실행:
   - **Labels** → `state:queued` 제거 (있으면), `state:executing` 추가 (없으면 생성)
   - **Comments** → "Execution Started" 템플릿 사용

**Output**: `✅ PR #123 execution started`

---

### pause

**목적**: 이슈 발생 시 작업 중단

**전제조건**: `executing` 상태

**상태 전이**: `executing → blocked`

**Workflow**:
1. 현재 상태 검증 (`state:executing` Label 있어야 함)
2. SSOT 참조하여 실행:
   - **Labels** → `state:executing` 제거, `state:blocked` 추가
   - **Comments** → "Blocked" 템플릿 사용

**Output**: `✅ PR #123 paused (reason: ...)`

---

### continue

**목적**: 중단된 작업 재개

**전제조건**: `blocked` 상태

**상태 전이**:
- 기본: `blocked → queued`
- `--run`: `blocked → executing`

**Workflow**:
1. 현재 상태 검증 (`state:blocked` Label 있어야 함)
2. SSOT 참조하여 실행:
   - **Labels** → `state:blocked` 제거, 대상 상태 Label 추가
   - **Comments** → "Continued" 템플릿 사용

**Output**: `✅ PR #123 continued → queued` (또는 `executing`)

---

### complete

**목적**: 구현 완료, PR Ready 처리

**전제조건**: `executing` 상태

**상태 전이**: `executing → ready`

**Workflow**:
1. 현재 상태 검증 (`state:executing` Label 있어야 함)
2. SSOT 참조하여 실행:
   - **Labels** → `state:executing` 제거 (`auto-execute`는 유지 - opt-in 설정이므로)
   - **Draft** → Ready 전환 (`gh pr ready`)
   - **Comments** → "Published" 템플릿 사용

**Output**: `✅ PR #123 completed → ready for review`

---

### status

**목적**: PR 상태 확인

**Input**: PR# 생략 시 현재 브랜치의 PR 자동 감지

**Workflow**:
1. PR 정보 조회 (`gh pr view`)
2. SSOT의 **State Machine** 섹션 기준으로 상태 판별
3. 정보 출력

**Output**:
```
PR #123: feat/user-auth
State: executing
Spec: .dev/specs/user-auth
Assignee: claude-worker
Draft: true
Updated: 10 minutes ago
```

**상태 판별**: SSOT의 "상태 정의" 테이블 참조

---

### list

**목적**: PR 목록 조회

**Input**:
- `--queued`: 대기 중인 PR
- `--executing`: 실행 중인 PR
- `--blocked`: 막힌 PR
- `--all` 또는 생략: 모든 워크플로우 PR

**Workflow**:
1. SSOT의 **Labels** 섹션의 쿼리 예시 참조
2. 필터에 맞는 PR 목록 조회
3. 테이블 형식 출력

**Output**:
```
STATE       PR#    NAME              UPDATED
executing   #123   user-auth         5 min ago
blocked     #456   payment-flow      1 hour ago
queued      #789   email-template    2 hours ago
```

---

## Error Handling

| Action | 에러 상황 | 메시지 |
|--------|-----------|--------|
| queue | 이미 state Label 있음 | "Not in 'created' state" |
| begin | 이미 `state:executing` | "Already executing" |
| begin | `state:blocked` 상태 | "PR is blocked - use 'continue' first" |
| pause | `state:executing` 아님 | "Not executing - nothing to pause" |
| continue | `state:blocked` 아님 | "Not blocked - nothing to continue" |
| complete | `state:executing` 아님 | "Not executing - nothing to complete" |
| complete | 이미 Ready (Draft=false) | "Already published" |
| status | PR 없음 | "No PR found" |

---

## Related Commands

| Command | 설명 |
|---------|------|
| `/dev.specify <name>` | Spec 문서 작성 |
| `/dev.open <name>` | Spec 기반 PR 생성 |
| `/dev.execute <PR#>` | 구현 실행 |
| `/dev.publish <PR#>` | PR Ready 처리 |
