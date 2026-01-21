---
name: dev.publish
description: |
  "/dev.publish", "publish PR", "PR ready", "PR 퍼블리시", "Draft 해제"
  Draft PR을 Ready로 전환하여 리뷰 가능 상태로 만듦
allowed-tools:
  - Bash
  - Read
  - Glob
---

# dev.publish - PR Ready 처리

## Purpose

Draft PR을 Ready로 전환하여 리뷰 가능 상태로 만든다.

---

## Input

| Input | 동작 |
|-------|------|
| `/dev.publish` | 현재 브랜치에서 PR 자동 감지 |
| `/dev.publish 123` | PR #123 publish |
| `/dev.publish <PR URL>` | URL에서 PR# 추출 |

---

## 실행 조건

- PR이 `state:executing` 상태여야 함
- `state:blocked` 상태면 → `/dev.state continue` 먼저 실행 필요
- 이미 Ready 상태면 에러

**상태 검증**: `/dev.state status`로 확인

---

## Workflow

### STEP 1: PR 정보 확인

1. 인자 파싱 (없으면 현재 브랜치에서 PR 찾기)
2. `/dev.state status <PR#>`로 현재 상태 확인

### STEP 2: 상태 검증

| 조건 | 결과 |
|------|------|
| `state:executing` | ✅ 진행 |
| `state:blocked` | ❌ "Run '/dev.state continue' first" |
| Label 없음 (created) | ❌ "아직 execute 되지 않음" |
| isDraft = false | ❌ "이미 publish 됨" |

### STEP 3: Publish 실행

**`/dev.state complete <PR#>` 호출:**
- `state:executing` Label 제거
- Draft → Ready 전환
- "Published" Comment 기록

### STEP 4: 결과 출력

**성공**:
```
✅ PR #123 published successfully
   URL: https://github.com/owner/repo/pull/123
   Status: Ready for review
```

---

## Error Handling

| 에러 상황 | 메시지 |
|-----------|--------|
| PR 없음 | "No PR found for current branch" |
| created 상태 | "Run '/dev.execute {PR#}' first" |
| blocked 상태 | "Run '/dev.state continue {PR#}' first" |
| 이미 ready | "Already published (not a draft)" |

---

## State Transition

```
executing → ready  (via /dev.state complete)
```

**Note**: `blocked` 상태에서는 먼저 `/dev.state continue`로 `executing`으로 전이 필요
