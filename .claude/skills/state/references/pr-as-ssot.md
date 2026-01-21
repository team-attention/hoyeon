# PR as Single Source of Truth

## Overview

**PR = Single Source of Truth** 원칙에 따라 모든 작업 상태는 PR에 기록된다.

### PR의 역할

| 역할 | 설명 |
|------|------|
| **구현의 컨테이너** | 하나의 작업(spec)에 대한 모든 코드 변경을 담음 |
| **상태 저장소** | 외부 DB 없이 GitHub PR 자체가 상태를 저장 |
| **히스토리 추적** | 모든 상태 변경이 Comments로 기록됨 |
| **협업 허브** | 리뷰, 논의, 승인이 PR에서 이루어짐 |

### 핵심 원칙

```
┌────────────────────────────────────────────────────────────┐
│  1 Spec = 1 PR = 1 Branch                                  │
│  PR = Single Source of Truth                               │
│  Commands = Environment-Agnostic (어디서든 동일)            │
│  Auto-execution = Optional Layer (있어도 되고 없어도 됨)    │
└────────────────────────────────────────────────────────────┘
```

### 라이프사이클

```
Spec 작성 → PR 생성 → 구현 → 완료 → 머지
              │
              ▼
     ┌─────────────────────────────────────────┐
     │  created → queued → executing → ready  │
     │                 ↓                       │
     │              blocked                    │
     └─────────────────────────────────────────┘
```

1. **Spec 작성**: `.dev/specs/<name>/PLAN.md` 문서 작성
2. **PR 생성**: Draft PR 생성, `feat/<name>` 브랜치
3. **구현**: 자동 또는 수동으로 spec 구현
4. **완료**: PR ready, 리뷰 요청
5. **머지**: 코드 병합

---

## Branch Naming

```
feat/<spec-name>
```

- Spec 이름과 동일한 브랜치명
- 예: `feat/user-auth`, `feat/payment-flow`
- 1 Spec = 1 Branch = 1 PR

---

## PR Data Structure

### 역할 분리

| 저장소 | 용도 | 특성 | 예시 |
|--------|------|------|------|
| **Labels** | 상태 + 자동실행 opt-in | 빠른 쿼리 | `state:queued`, `auto-execute` |
| **Body** | 정적 메타데이터 | YAML frontmatter | spec path |
| **Comments** | 히스토리 로그 | Append-only | 상태 변경 기록 |
| **Draft** | 작업중 vs 리뷰대기 | Boolean | `true` / `false` |

### 왜 이렇게 분리하나?

- **Labels**: 빠른 필터링/쿼리 (`gh pr list --label`) + 자동 실행 opt-in
- **Body**: 변경이 거의 없는 메타데이터 (수정 시 히스토리 남지 않음)
- **Comments**: 모든 변경 이력 추적 (append-only)
- **Draft**: 단순 boolean으로 "작업 완료 여부" 표현

### Run 정보

Comment에서 실행 환경을 식별하기 위해 `Run` 필드 사용:

| 환경 | 값 | 예시 |
|------|-----|------|
| **GitHub Actions** | Run URL | `https://github.com/owner/repo/actions/runs/12345` |
| **Local** | hostname | `macbook-pro` |

```bash
# Run 값 생성
if [ -n "$GITHUB_RUN_ID" ]; then
  RUN_INFO="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
else
  RUN_INFO="$(hostname -s)"
fi
```

---

## Labels

### Namespace

```
state:<status>
```

- Prefix `state:`로 네임스페이스 구분
- 다른 label과 충돌 방지
- 명확한 의미 전달

### 정의된 Labels

| Label | 의미 | 설명 |
|-------|------|------|
| `state:queued` | 대기 중 | 자동 실행 대기열에 있음 |
| `state:executing` | 실행 중 | 현재 구현 작업 진행 중 |
| `state:blocked` | 막힘 | 사람 개입 필요 (이슈 발생) |
| `auto-execute` | 자동 실행 opt-in | 이 라벨이 있어야 자동 실행 대상 |

### 규칙

1. **상태는 항상 1개만**: 교체 방식 (remove → add)
2. **created/ready/done은 label 불필요**: Draft 상태와 Merged 상태로 구분
3. **자동 실행 조건**: `state:queued` + `auto-execute` 둘 다 만족
4. **중복 실행 방지**: `state:executing`이 있으면 실행 안 함

### 쿼리 예시

```bash
# 대기 중인 PR (자동 실행 대상)
gh pr list --label "state:queued" --label "auto-execute" --draft

# 블로킹된 PR (사람 개입 필요)
gh pr list --label "state:blocked"

# 작업 중인 PR
gh pr list --label "state:executing"

# 모든 dev workflow PR
gh pr list --label "state:queued,state:executing,state:blocked"

# 자동 실행 opt-in된 모든 PR
gh pr list --label "auto-execute"
```

### Label 확인 및 생성

Label을 사용하기 전에 레포지토리에 해당 Label이 존재하는지 확인하고, 없으면 생성해야 합니다.

#### 필수 Labels

| Label | Color | Description |
|-------|-------|-------------|
| `state:queued` | `#0E8A16` (green) | PR queued for auto-execution |
| `state:executing` | `#1D76DB` (blue) | PR currently being executed |
| `state:blocked` | `#D93F0B` (red) | PR blocked, needs human intervention |
| `auto-execute` | `#5319E7` (purple) | Opt-in for automatic execution |

#### Label 존재 확인

```bash
# 특정 Label 존재 여부 확인
gh label list --json name -q '.[].name' | grep -q "^state:queued$" && echo "exists" || echo "not found"

# 모든 state: Labels 확인
gh label list --json name -q '.[].name' | grep "^state:"
```

#### Label 생성

```bash
# state:queued 생성
gh label create "state:queued" --color "0E8A16" --description "PR queued for auto-execution"

# state:executing 생성
gh label create "state:executing" --color "1D76DB" --description "PR currently being executed"

# state:blocked 생성
gh label create "state:blocked" --color "D93F0B" --description "PR blocked, needs human intervention"

# auto-execute 생성
gh label create "auto-execute" --color "5319E7" --description "Opt-in for automatic execution"
```

#### 자동화: 확인 후 없으면 생성

```bash
# 함수 정의
ensure_label() {
  local name="$1"
  local color="$2"
  local desc="$3"

  if ! gh label list --json name -q '.[].name' | grep -q "^${name}$"; then
    echo "Creating label: $name"
    gh label create "$name" --color "$color" --description "$desc"
  else
    echo "Label exists: $name"
  fi
}

# 모든 필수 Label 확인/생성
ensure_label "state:queued" "0E8A16" "PR queued for auto-execution"
ensure_label "state:executing" "1D76DB" "PR currently being executed"
ensure_label "state:blocked" "D93F0B" "PR blocked, needs human intervention"
ensure_label "auto-execute" "5319E7" "Opt-in for automatic execution"
```

---

## Auto-Execute Label

### 목적

자동 실행 opt-in을 위한 명시적 라벨. `state:queued`만으로는 자동 실행되지 않음.

### 왜 별도 라벨이 필요한가?

- **실수 방지**: `state:queued`만 붙이면 자동 실행 안 됨
- **명시적 opt-in**: 자동 실행을 원할 때만 `auto-execute` 추가
- **GitHub App 제약**: Bot은 assignee로 지정 불가, 라벨로 대체

### 사용 예시

```bash
# 자동 실행 대기열에 추가 (수동 실행도 가능)
gh pr edit $PR --add-label "state:queued"

# 자동 실행 opt-in (remote worker가 자동으로 실행)
gh pr edit $PR --add-label "state:queued" --add-label "auto-execute"

# 자동 실행 opt-out (수동 실행만)
gh pr edit $PR --remove-label "auto-execute"
```

---

## Body (YAML Frontmatter)

### 목적

정적 메타데이터 저장. 자주 변경되지 않는 정보만.

### Why YAML Frontmatter?

1. **파싱 용이**: 표준 YAML 파서로 쉽게 읽기 가능
2. **확장성**: 필드 추가가 자유로움
3. **가독성**: 사람도 쉽게 읽을 수 있음
4. **호환성**: Jekyll, Hugo 등 정적 사이트 생성기와 같은 포맷

### Template Structure

```markdown
---
spec: .dev/specs/<name>
---

## Summary

<1-3 문장으로 작업 요약>

## Spec Reference

→ [PLAN.md](./.dev/specs/<name>/PLAN.md)
```

### Frontmatter Fields

| Field | Type | Required | 설명 |
|-------|------|----------|------|
| `spec` | string | ✅ | Spec 폴더 경로 |

### Body Sections

| Section | 설명 |
|---------|------|
| **Summary** | Spec의 핵심 내용 1-3 문장 요약 |
| **Spec Reference** | Spec 파일로의 링크 |

### 파싱

```bash
# sed로 spec path 추출
gh pr view $PR --json body -q '.body' | \
  sed -n '/^---$/,/^---$/p' | \
  grep '^spec:' | \
  sed 's/spec: //'

# yq로 파싱 (더 안정적)
gh pr view $PR --json body -q '.body' > /tmp/pr-body.md
sed -n '2,/^---$/p' /tmp/pr-body.md | head -n -1 | yq -r '.spec'
```

---

## Comments (히스토리)

### 목적

모든 상태 변경 이력을 append-only로 기록.

### 규칙

1. **Append-only**: 수정/삭제 없이 추가만
2. **자동 기록**: 모든 상태 변경 시 자동 추가
3. **디버깅 용도**: 문제 발생 시 히스토리 추적

---

### Comment Templates

> **Note**: Time과 Author는 GitHub이 자동 기록하므로 생략.
> **Run**만 추가하여 실행 환경 식별 (GitHub Actions면 run URL, 로컬이면 hostname).

---

#### 1. Created

**사용 시점**: PR 생성 시

```markdown
### 🤖 Created

**State**: `none` → `created`
**Run**: <run-info> 

PR created for spec: <spec-path>
```

---

#### 2. Queued

**사용 시점**: PR을 대기열에 추가할 때 (`/dev.state queue`)

```markdown
### 🤖 Queued

**State**: `created` → `queued`
**Run**: <run-info>

PR queued for auto-execution.
```

---

#### 3. Continued

**사용 시점**: 블로킹 해제하고 재개할 때

```markdown
### 🤖 Continued

**State**: `blocked` → `<queued|executing>`
**Run**: <run-info>

Resuming after: <이전 blocked 이유 요약>
```

---

#### 4. Execution Started

```markdown
### 🤖 Execution Started

**Plan**: <spec path>
**Run**: <run-info>
```

---

#### 5. Blocked

**사용 시점**: 실행 중 막힘 발생 시 (자동 pause)

```markdown
### 🚨 Blocked

**Run**: <run-info>
**Reason**: <구체적 실패 내용>
**Failed at**: TODO #<N> - <task title>
**Retry count**: <n>/3

다음 단계:
1. 문제 해결 후 `/dev.execute <PR#>` 재실행
2. 또는 `/dev.state continue <PR#>`
```

---

#### 6. Execution Complete

**사용 시점**: 모든 TODO 완료 시

```markdown
### 🤖 Execution Complete

**Plan**: <spec path>
**Tasks**: <completed>/<total>
**Run**: <run-info>
```

---

#### 7. Published

**사용 시점**: PR Ready 전환 시

```markdown
### 🤖 Published

**Run**: <run-info>

PR is now ready for review.
```

---

### 필드 설명

| 필드 | 형식 | 설명 |
|------|------|------|
| `Run` | URL 또는 hostname | GitHub Actions면 run URL, 로컬이면 hostname |
| `State` | `` `from` → `to` `` | 백틱으로 감싸서 표시 |
| `Reason` | 자유 형식 | pause/blocked 시 필수 |
| `Plan` | 경로 | `.dev/specs/<name>/PLAN.md` |

---

## Draft

### 목적

"작업 완료 여부"를 단순 boolean으로 표현.

### 규칙

| Draft | 의미 | 해당 상태 |
|-------|------|-----------|
| `true` | 작업 중 | created, queued, executing, blocked |
| `false` | 리뷰 대기 | ready |

### CLI

```bash
# Draft 해제 (ready 상태로 전환)
gh pr ready $PR

# Draft 여부 확인
gh pr view $PR --json isDraft -q '.isDraft'
```

---

## State Machine

### 상태 정의

| 상태 | Draft | Label | auto-execute | 설명 |
|------|-------|-------|--------------|------|
| **created** | ✓ | (없음) | optional | PR 생성 직후 |
| **queued** | ✓ | `state:queued` | ✓ (자동실행 시) | 자동 실행 대기열 |
| **executing** | ✓ | `state:executing` | (유지) | 구현 진행 중 |
| **blocked** | ✓ | `state:blocked` | (유지) | 이슈 발생, 사람 개입 필요 |
| **ready** | ✗ | (없음) | (유지) | 구현 완료, 리뷰 대기 |
| **done** | - | - | - | Merged, 작업 완료 |

### 상태 다이어그램

```
                         ┌──────────────┐
                         │   created    │
                         │              │
                         │  Draft PR    │
                         │  no label    │
                         └──────┬───────┘
                                │
               ┌────────────────┴────────────────┐
               │                                 │
               ▼                                 │
        ┌──────────────┐                         │
        │   queued     │                         │
        │              │                         │
        │ state:queued │                         │
        │ +auto-execute│ (자동실행 시)            │
        └──────┬───────┘                         │
               │                                 │
               └────────────────┬────────────────┘
                                │
                                ▼
                         ┌──────────────┐
              ┌──────────│  executing   │──────────┐
              │          │              │          │
              │          │ state:       │          │
              │          │ executing    │          │
              │          └──────────────┘          │
              │                                    │
              ▼                                    ▼
       ┌──────────────┐                     ┌──────────────┐
       │   blocked    │                     │    ready     │
       │              │                     │              │
       │ state:blocked│                     │  Not Draft   │
       │              │                     │  no label    │
       └──────┬───────┘                     └──────┬───────┘
              │                                    │
              │                                    ▼
              │                             ┌──────────────┐
              │                             │    done      │
              │                             │   (Merged)   │
              │                             └──────────────┘
              │
              └─────────────────► queued 또는 executing
```

### 전이 경로

| From | To | 설명 |
|------|----|------|
| created | queued | 자동 실행 대기열에 추가 |
| created | executing | 직접 실행 |
| queued | executing | 실행 시작 |
| executing | blocked | 이슈 발생으로 중단 |
| executing | ready | 작업 완료 |
| blocked | queued | 재개 (대기열로) |
| blocked | executing | 재개 (바로 실행) |
| ready | done | PR 머지 |

### 상태 전이 방법

**권장: `/dev.state` 스킬 사용**

직접 Label/Draft를 조작하지 말고 `/dev.state` 스킬을 사용하세요:

| 전이 | 명령어 |
|------|--------|
| created → queued | `/dev.state queue <PR#>` |
| created/queued → executing | `/dev.state begin <PR#>` |
| executing → blocked | `/dev.state pause <PR#> "<reason>"` |
| blocked → queued | `/dev.state continue <PR#>` |
| blocked → executing | `/dev.state continue <PR#> --run` |
| executing → ready | `/dev.state complete <PR#>` |

이렇게 하면:
- 일관된 상태 관리
- 자동 Comment 기록
- 에러 처리 포함

---

## 자동 실행 조건

Daemon이 PR을 자동 실행하려면 **모든 조건** 만족 필요:

```bash
gh pr list \
  --label "state:queued" \
  --label "auto-execute" \
  --draft
```

1. `Label = state:queued` (대기열에 있음)
2. `Label = auto-execute` (자동 실행 opt-in)
3. `Draft = true` (작업 중 상태)
4. `Label != state:executing` (이미 실행 중이 아님)

### 왜 여러 조건?

- **state:queued만**: 수동 queue도 자동 실행될 수 있음 (의도치 않은 실행)
- **auto-execute 추가**: 명시적 opt-in으로 실수 방지
- **state:executing 체크**: 중복 실행 방지

---

## CLI 레퍼런스

### Label 조작

```bash
# Label 추가
gh pr edit $PR --add-label "state:queued"

# Label 교체 (remove → add)
gh pr edit $PR --remove-label "state:queued" --add-label "state:executing"

# Label 제거
gh pr edit $PR --remove-label "state:executing"
```

### Auto-execute 조작

```bash
# 자동 실행 opt-in
gh pr edit $PR --add-label "auto-execute"

# 자동 실행 opt-out
gh pr edit $PR --remove-label "auto-execute"
```

### Draft 조작

```bash
# Draft 해제
gh pr ready $PR

# Draft 상태 확인
gh pr view $PR --json isDraft -q '.isDraft'
```
