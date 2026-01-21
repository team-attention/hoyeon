---
name: dev.open
description: |
  "dev.open", "PR 생성", "PR 열기", "spec 기반 PR 만들어", "Draft PR 생성"
  Spec 기반 Draft PR 생성. SDD (Spec Driven Development) 워크플로우의 시작점.
allowed-tools:
  - Bash
  - Read
  - Glob
---

# dev.open - Spec 기반 Draft PR 생성

## Purpose

Spec 문서를 기반으로 Draft PR을 생성한다. **PR = Single Source of Truth** 원칙에 따라 PR이 모든 작업 상태의 중심이 된다.

---

## 참조 문서

- **PR Body 템플릿**: `${baseDir}/references/pr-body-template.md`

---

## Input

| Input | 동작 |
|-------|------|
| `/dev.open user-auth` | `specs/user-auth.md` 기반 PR 생성 |
| `/dev.open` | 가장 최근 spec 또는 사용자에게 질문 |

---

## Prerequisites

1. Spec 파일 존재: `specs/<name>.md`
2. gh CLI 인증: `gh auth status`

---

## Workflow

### Step 1: Spec 존재 확인

```
specs/<name>.md 파일이 존재하는지 확인
없으면 → Error: "Spec not found. Run '/specify <name>' first."
```

### Step 2: 기존 PR 확인

```
feat/<name> 브랜치로 열린 PR이 있는지 확인
있으면 → Error: "PR already exists for feat/<name>"
```

### Step 3: 브랜치 생성 및 푸시

```
main에서 feat/<name> 브랜치 생성 → 원격에 푸시
```

### Step 4: Draft PR 생성

`pr-body-template.md` 참조하여 Draft PR 생성:
- **Body** → YAML frontmatter + Summary + Spec Reference
- **Draft** → true

---

## Output

**성공**:
```
✅ PR #123 created successfully
   View: gh pr view 123 --web
```

**실패**:
```
Error: Spec not found at specs/user-auth.md
```
또는
```
Error: PR already exists for feat/user-auth
```

---

## Related Commands

| Command | 설명 |
|---------|------|
| `/dev.specify <name>` | Spec 문서 작성 (open 전에 실행) |
| `/dev.state queue <PR#>` | 자동 실행 대기열에 추가 |
| `/dev.execute <PR#>` | 구현 시작 |
