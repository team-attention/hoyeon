---
name: issue
description: |
  GitHub 이슈 생성 스킬. 사용자 요청을 받아 코드베이스 전체 영향 분석 후,
  AI 검증 완료/사람 판단 필요/주의사항을 구분한 구조화된 이슈를 생성한다.
  /issue "이슈 내용"
  Trigger: "/issue", "이슈 만들어", "issue 만들자", "깃헙 이슈"
allowed_tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Agent
  - AskUserQuestion
validate_prompt: |
  Must complete with one of:
  1. GitHub issue created (URL returned)
  2. User cancelled after preview
  Must NOT: create issue without user confirmation, skip impact analysis.
---

# /issue — Structured GitHub Issue Creator

사용자의 요청을 받아 코드베이스를 조사하고, 신뢰도 경계가 명확한 GitHub 이슈를 생성한다.

## Input

사용자가 `/issue` 뒤에 적은 텍스트가 원본 요청사항이다. 이것을 그대로 보존한다.

예시:
- `/issue YouTube 구독에서 Shorts URL이 중복 fetch되는 문제`
- `/issue Settings 페이지에 알림 설정 탭 추가`
- `/issue 스케줄러가 가끔 2번 실행됨`

입력이 너무 모호하면 (예: "버그 있음") ONE 질문으로 명확화한다. 그 외에는 바로 조사 시작.

## Phase 1: Impact Analysis

사용자 요청을 바탕으로 **전체 영향 분석**을 수행한다. Agent를 활용해 병렬로 조사한다.

### 조사 항목

Launch agents in parallel where possible:

1. **관련 코드 탐색** — 요청과 직접 관련된 파일, 함수, 모듈 식별
2. **의존성 분석** — 해당 코드를 참조하는 곳, 영향받는 모듈
3. **기존 테스트 확인** — 관련 테스트 존재 여부, 커버리지
4. **관련 이슈/히스토리** — git log에서 관련 변경 이력, 기존 Known Issues

### 조사 결과 분류

조사한 내용을 세 가지 신뢰도 레벨로 분류한다:

#### ✅ AI Verified (AI가 검증 완료)
코드 탐색으로 **객관적으로 확인한 팩트**. 사람이 다시 볼 필요 없음.
- 함수/파일 위치, 호출 관계
- 테스트 존재 여부
- 현재 동작 방식 (코드에서 직접 읽은 것)
- 관련 설정값, 환경변수

#### 🤔 Decision Required (사람 판단 필요)
AI가 대신할 수 없는 **의사결정 지점**.
- 트레이드오프 선택 (성능 vs 정확도, UX vs 보안 등)
- 비즈니스 로직 결정
- 스코프 결정 (어디까지 고칠 것인지)
- 우선순위 판단

#### ⚠️ Human Verify (사람 검증 필요)
AI가 놓쳤을 수 있는 **리스크와 주의사항**.
- 사이드이펙트 가능성
- 프로덕션 환경 차이로 인한 리스크
- 외부 서비스 의존성
- 데이터 마이그레이션 필요 여부
- AI가 확인할 수 없었던 영역 (외부 시스템, 실제 유저 데이터 등)

## Phase 2: Preview & Confirm

조사 완료 후, 이슈 본문 미리보기를 사용자에게 보여준다.

### 이슈 본문 템플릿

```markdown
## 요청사항

> {사용자가 /issue에 적은 원본 텍스트 그대로}

## 영향 분석

### 관련 코드
- `파일경로:라인` — 설명
- ...

### 영향 범위
- 영향받는 모듈/기능 목록

---

## ✅ AI Verified
> AI가 코드 탐색으로 확인한 팩트. 추가 검증 불필요.

- [ ] 확인된 사실 1
- [ ] 확인된 사실 2

## 🤔 Decision Required
> 사람의 판단이 필요한 의사결정 지점.

- [ ] 결정 포인트 1 — 선택지 A vs B, 고려사항
- [ ] 결정 포인트 2

## ⚠️ Human Verify
> AI가 놓쳤을 수 있는 리스크. 구현 전/후로 사람이 확인해야 함.

- [ ] 검증 포인트 1 — 왜 확인이 필요한지
- [ ] 검증 포인트 2
```

미리보기를 보여준 후 AskUserQuestion으로 확인:

```
AskUserQuestion(
  question: "이 내용으로 GitHub 이슈를 생성할까요?",
  header: "Issue Preview",
  options: [
    { label: "생성", description: "이대로 이슈 생성" },
    { label: "수정 후 생성", description: "내용을 수정하고 싶음" },
    { label: "취소", description: "이슈 생성하지 않음" }
  ]
)
```

- **생성** → Phase 3으로 진행
- **수정 후 생성** → 사용자 피드백 반영 후 다시 미리보기
- **취소** → "이슈 생성을 취소했습니다." → 종료

## Phase 3: Create Issue

`gh issue create`로 이슈를 생성한다.

```bash
gh issue create --title "이슈 제목" --body "$(cat <<'EOF'
이슈 본문
EOF
)"
```

### 제목 규칙
- 70자 이내
- prefix 사용: `feat:`, `fix:`, `refactor:`, `chore:` 등 (내용에 따라)
- 한국어 OK

### 라벨 자동 매핑

이슈 내용에 따라 아래 테이블에서 매칭되는 라벨을 `--label` 플래그로 추가한다.
복수 라벨 가능. 매칭되는 게 없으면 라벨 없이 생성.

| 이슈 성격 | 라벨 |
|-----------|------|
| 버그, 오류, 깨짐 | `bug` |
| 새 기능, 추가, 개선 | `enhancement` |
| 문서 관련 | `documentation` |
| 질문, 조사, 확인 필요 | `question` |

생성 후 이슈 URL을 사용자에게 반환한다.

## Hard Rules

1. **조사 먼저** — 절대 조사 없이 이슈를 만들지 않는다
2. **확인 먼저** — 절대 사용자 확인 없이 이슈를 생성하지 않는다
3. **원본 보존** — 사용자가 적은 요청사항은 "요청사항" 섹션에 그대로 포함
4. **팩트만** — AI Verified에는 코드에서 직접 확인한 것만 넣는다. 추측 금지.
5. **솔직하게** — 확인 못한 것은 Human Verify에 넣는다. 아는 척 금지.
6. **간결하게** — 이슈 본문이 불필요하게 길어지지 않도록 한다

## Checklist Before Stopping

- [ ] 코드베이스 영향 분석 수행됨
- [ ] 세 가지 신뢰도 레벨로 분류됨
- [ ] 사용자 원본 요청사항 포함됨
- [ ] 사용자가 미리보기 확인함
- [ ] `gh issue create` 실행되어 URL 반환됨 (또는 사용자가 취소함)
