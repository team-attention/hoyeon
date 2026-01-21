# PR Body Template

## Overview

PR body는 작업 요약과 Spec 참조를 담는 곳이다. 단순한 마크다운 형식으로 작성한다.

## Template Structure

```markdown
## Summary

<1-3 문장으로 작업 요약>

## Spec Reference

→ [.dev/specs/<name>/PLAN.md](.dev/specs/<name>/PLAN.md)

## Checklist

- [ ] Spec reviewed
- [ ] Implementation complete
- [ ] Tests passing
```

## Sections

### Summary

Spec의 핵심 내용을 1-3 문장으로 요약.

### Spec Reference

Spec 파일로의 마크다운 링크. 클릭하면 바로 spec을 볼 수 있도록.

### Checklist

기본 체크리스트. 필요에 따라 확장 가능.

## Example

### Input: `.dev/specs/user-auth/PLAN.md`

```markdown
# User Authentication

> 사용자 인증 기능을 구현한다. JWT 기반으로 로그인/로그아웃을 처리한다.
```

### Output: PR Body

```markdown
## Summary

사용자 인증 기능을 구현한다. JWT 기반으로 로그인/로그아웃을 처리한다.

## Spec Reference

→ [.dev/specs/user-auth/PLAN.md](.dev/specs/user-auth/PLAN.md)

## Checklist

- [ ] Spec reviewed
- [ ] Implementation complete
- [ ] Tests passing
```

## Spec 경로 파싱

```bash
# Spec Reference 링크에서 경로 추출
gh pr view $PR_NUMBER --json body -q '.body' | grep -oP '(?<=→ \[)[^\]]+'
# 결과: .dev/specs/user-auth/PLAN.md
```

## 메타데이터 관리

| 정보 | 저장 위치 | 조회 방법 |
|------|----------|----------|
| 상태 | Labels | `gh pr view --json labels` |
| 태그 | Labels | `gh pr view --json labels` |
| 생성자 | PR 메타데이터 | `gh pr view --json author` |
| 생성 시간 | PR 메타데이터 | `gh pr view --json createdAt` |

### Labels 예시

| Category | Labels |
|----------|--------|
| 상태 | `state:queued`, `state:executing`, `state:blocked` |
| 레이어 | `backend`, `frontend`, `infra` |
| 도메인 | `auth`, `payment`, `notification` |
| 타입 | `feature`, `bugfix`, `refactor` |
