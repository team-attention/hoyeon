# Draft Template

> Reference document for draft file structure during Interview Mode.
> DRAFT = Discovery (합의 과정) - What/Why 수집 + How 방향

**Schema Version**: 1.1

---

## File Location

`.dev/specs/{name}/DRAFT.md`

---

## Structure

```markdown
# Draft: {name}

## Intent Classification
- **Type**: [Refactoring|New Feature|Bug Fix|Architecture|Research|Migration|Performance]
- **Strategy**: [해당 타입에 맞는 전략]

## What & Why

### What (목표)
- [1-2문장: 무엇을 달성하려는지]

### Why (배경)
- [왜 이게 필요한지]
- [현재 문제점]

### Deliverables (산출물)
- [ ] [구체적 파일/기능 1]
- [ ] [구체적 파일/기능 2]

## Boundaries

### Must NOT Do
- [하면 안 되는 것]
- [범위 밖인 것]

### Constraints
- [기술적 제약]
- [비즈니스 제약]

## Success Criteria
- [ ] [검증 가능한 조건 1]
- [ ] [검증 가능한 조건 2]

## User Decisions

| 질문 | 결정 | 비고 |
|------|------|------|
| [질문 1] | [결정] | [근거/맥락] |

## Agent Findings

### Patterns
- `file:line` - 설명

### Structure
- [파일 구조 관련 발견]

### Project Commands
- Type check: `command`
- Lint: `command`
- Test: `command`

## Open Questions

### Critical (Plan 전 해결 필수)
- [ ] [미해결 질문]

### Nice-to-have (나중에 결정 가능)
- [ ] [있으면 좋지만 필수 아닌 것]

## Direction

### Approach (방향)
- [큰 그림의 구현 방향]

### Work Breakdown (초안)
1. [작업 1] → outputs: [산출물]
2. [작업 2] → depends on: 작업 1
3. [작업 3] → parallel with: 작업 2
```

---

## Field Descriptions

### Intent Classification

작업 유형을 식별하고 전략을 수립한다.

| Intent Type | Keywords | Strategy |
|-------------|----------|----------|
| **Refactoring** | "리팩토링", "정리", "개선", "migrate" | Safety first, regression prevention |
| **New Feature** | "추가", "새로운", "구현", "add" | Pattern exploration, integration points |
| **Bug Fix** | "버그", "오류", "안됨", "fix" | Reproduce → Root cause → Fix |
| **Architecture** | "설계", "구조", "아키텍처" | Trade-off analysis, oracle consultation |
| **Research** | "조사", "분석", "이해", "파악" | Investigation only, NO implementation |
| **Migration** | "마이그레이션", "업그레이드", "전환" | Phased approach, rollback plan |
| **Performance** | "성능", "최적화", "느림" | Measure first, profile → optimize |

### What & Why

**사용자 영역** - 대화를 통해 수집

- **What**: 무엇을 달성하려는지 (목표)
- **Why**: 왜 이게 필요한지 (배경, 문제점)
- **Deliverables**: 구체적으로 나와야 할 산출물

### Boundaries

**사용자 영역** - 반드시 물어봐야 함

- **Must NOT Do**: 명시적으로 하면 안 되는 것
- **Constraints**: 기술적/비즈니스 제약

### Success Criteria

**합의 영역** - 사용자와 합의 필요

- 검증 가능한 조건으로 작성
- PLAN의 Definition of Done으로 매핑됨

### User Decisions

**기록 영역** - 사용자가 결정한 사항 추적

| 컬럼 | 설명 |
|------|------|
| 질문 | 어떤 선택지가 있었는지 |
| 결정 | 사용자가 선택한 것 |
| 비고 | 선택 이유나 맥락 |

### Agent Findings

**Agent 영역** - 조사 결과 기록

- **Patterns**: 기존 코드 패턴 (`file:line` 형식 필수)
- **Structure**: 파일/디렉토리 구조
- **Project Commands**: lint, test 등 프로젝트 명령어

> PLAN의 References, Completion Protocol로 매핑됨

### Open Questions

**불확실성 관리** - Plan 전환 기준

| 우선순위 | 의미 | Plan 전환 |
|----------|------|-----------|
| **Critical** | 이거 모르면 Plan 못 만듦 | 해결 필수 |
| **Nice-to-have** | 나중에 결정해도 됨 | 해결 불필요 |

### Direction

**How의 방향** - 상세는 PLAN에서

- **Approach**: 큰 그림의 구현 방향
- **Work Breakdown**: TODO 분할 초안 (의존성 포함)

---

## PLAN 매핑 관계

| DRAFT 섹션 | PLAN 섹션 |
|------------|-----------|
| What & Why | Context > Original Request |
| User Decisions | Context > Interview Summary |
| Agent Findings (일부) | Context > Research Findings |
| Deliverables | Work Objectives > Concrete Deliverables |
| Boundaries | Work Objectives > Must NOT Do |
| Success Criteria | Work Objectives > Definition of Done |
| Agent Findings > Patterns | TODOs > References |
| Agent Findings > Commands | TODO Final > Verification commands |
| Direction > Work Breakdown | TODOs + Dependency Graph |

---

## 질문 원칙

### 물어봐야 할 것 (사용자만 알 수 있음)
- Boundaries (하면 안 되는 것)
- Trade-off 결정 (A vs B)
- 비즈니스 제약

### 조사할 것 (Agent가 알아냄)
- 기존 패턴, 파일 구조
- 프로젝트 명령어
- 영향 범위

### 제안할 것 (조사 후 확인만)
- "이렇게 하면 될 것 같아요" → Y/N
- 기존 패턴 기반 추천

> **핵심**: 질문은 최소화, 조사 후 제안은 최대화

---

## Usage

### 생성 시점
- 사용자가 작업 요청 시

### 업데이트 시점
- 사용자 응답 후
- Background agent 완료 후
- 결정 사항 변경 시

### Plan 전환 조건
- [ ] Critical Open Questions 모두 해결
- [ ] User Decisions에 핵심 결정 기록됨
- [ ] Success Criteria 합의됨
- [ ] 사용자가 "계획으로 만들어줘" 요청

### 삭제 시점
- Plan이 reviewer 승인 후

---

## Example

```markdown
# Draft: api-auth

## Intent Classification
- **Type**: New Feature
- **Strategy**: Pattern exploration, integration points

## What & Why

### What (목표)
- API 엔드포인트에 JWT 기반 인증 추가

### Why (배경)
- 현재 모든 API가 public으로 노출됨
- 사용자별 데이터 접근 제어 필요

### Deliverables (산출물)
- [ ] `src/middleware/auth.ts` - 인증 미들웨어
- [ ] `src/config/auth.json` - JWT 설정 파일

## Boundaries

### Must NOT Do
- 기존 public 엔드포인트 수정 금지
- 새 npm 패키지 설치 금지

### Constraints
- 기존 jsonwebtoken 라이브러리 사용
- Express 미들웨어 패턴 준수

## Success Criteria
- [ ] 토큰 없는 요청 → 401 Unauthorized
- [ ] 유효한 토큰 → 다음 핸들러로 통과
- [ ] 기존 테스트 모두 통과

## User Decisions

| 질문 | 결정 | 비고 |
|------|------|------|
| 인증 방식? | JWT | 기존 라이브러리 활용 |
| 토큰 만료 처리? | 401 반환 | refresh token 없음 |
| 보호할 라우트? | /api/users/* | public 제외 |

## Agent Findings

### Patterns
- `src/middleware/logging.ts:10-25` - 미들웨어 패턴
- `src/middleware/error.ts:5-15` - 에러 핸들링 패턴
- `src/utils/jwt.ts:verify()` - 토큰 검증 함수 (기존)

### Structure
- 미들웨어: `src/middleware/`
- 설정: `src/config/`
- 라우터: `src/routes/`

### Project Commands
- Type check: `npm run type-check`
- Lint: `npm run lint`
- Test: `npm test`

## Open Questions

### Critical (Plan 전 해결 필수)
- (없음)

### Nice-to-have (나중에 결정 가능)
- [ ] 토큰 만료 시간 설정값?

## Direction

### Approach (방향)
- 기존 logging.ts 미들웨어 패턴 따라서 auth.ts 생성
- Express router에 미들웨어 체인으로 연결
- 기존 jwt.ts의 verify() 함수 활용

### Work Breakdown (초안)
1. JWT 설정 파일 생성 → outputs: `config_path`
2. 인증 미들웨어 구현 → depends on: 설정 파일
3. 라우터에 미들웨어 연결 → depends on: 미들웨어
4. Verification → depends on: 전체 완료
```
