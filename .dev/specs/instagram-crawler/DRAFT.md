# Instagram Crawler System - DRAFT

## Intent Classification

**Type:** New Feature + Architecture
**Strategy:** Pattern exploration, external service integration, risk assessment
**Key Concerns:**
- Legal/ethical compliance (Instagram ToS)
- Rate limiting and authentication
- Data storage and privacy
- Error handling for API failures

---

## What & Why

### What
인스타그램 크롤링 시스템 구축 - 게시물 (이미지, 캡션) 수집

### Why
학술 연구 또는 개인 프로젝트를 위한 소규모 데이터 수집

---

## Boundaries

### Legal and Compliance
- ⚠️ **CRITICAL**: Instagram Terms of Service는 자동화된 데이터 수집을 금지합니다
- 공식 Instagram Graph API 사용 권한 필요 여부 확인 필요
- 개인정보 보호 및 데이터 사용 목적 명확화 필요

### Technical Constraints
- macOS bash 3.2 호환 (bash 4+ 기능 사용 불가)
- 네트워크 타임아웃 처리 (`env_error` 패턴)
- 크레덴셜은 git-ignore (환경변수 또는 별도 설정 파일)

### Performance
- Rate limiting 필수 (Instagram API 제한 준수)
- 타임아웃: 최대 5분 per TODO (프로젝트 표준)
- 재시도 로직: 최대 2회 (프로젝트 표준)

---

## Success Criteria

- 특정 개수의 인스타그램 게시물을 성공적으로 수집 (개수는 아직 미정)
- 각 게시물은 이미지와 캡션 데이터 포함
- JSON 형식으로 저장 (가정)
- 에러 핸들링 및 재시도 로직 동작 확인
- 샘플 데이터로 크롤링 성공 검증

---

## Open Questions

### Critical (Must resolve before planning)

(모든 Critical Questions 해결됨)

### Nice to Have (Can defer)
- 데이터 정제 및 후처리 필요 여부
- 스케줄링/자동화 필요 여부 (cron job 등)
- 모니터링 및 로깅 수준

---

## Agent Findings

### Patterns

**HTTP Request & Caching:**
- `.playground/lol-build/src/api/ddragon.js:3-9` - fetch() API 패턴, 인메모리 캐싱 (`cachedVersion`)
- `.playground/lol-build/src/api/ddragon.js:5` - 직접 GET 요청: `fetch(url).then(res => res.json())`

**Data Parsing & Transformation:**
- `.playground/data-pipeline/scripts/fetch-csv.sh:18-40` - CSV → JSON 변환 (awk)
- `.playground/data-pipeline/scripts/fetch-json.sh:11-15` - JSON 추출 및 집계 (jq)
- `.playground/data-pipeline/scripts/merge-report.sh:27-40` - 멀티소스 병합 (jq --slurpfile)

**Multi-Source Scraping:**
- `skills/dev-scan/SKILL.md:39-48` - 병렬 WebSearch 패턴 (4개 소스 동시 실행)
- `agents/external-researcher.md:70` - WebSearch site-specific 쿼리 패턴
- `agents/external-researcher.md:73-74` - WebFetch 사용 패턴

**Parallel Execution:**
- `.playground/data-pipeline/run-pipeline.sh:19-24` - 백그라운드 병렬 실행 + `wait` 패턴
- `skills/dev-scan/SKILL.md:51` - 단일 메시지에서 4개 WebSearch 동시 호출

**Rate Limiting:**
- `.playground/data-pipeline/scripts/fetch-api.sh:11` - `sleep 1` 네트워크 지연 시뮬레이션

**Error Handling:**
- `.playground/data-pipeline/scripts/merge-report.sh:12-25` - Pre-flight validation (파일 존재 확인)
- 프로젝트 표준: `env_error` (네트워크, API 키, 403/401), `code_error` (코드 오류)

### Structure

```
oh-my-claude-code/
├── .playground/               # 실험용 (git-ignored)
│   ├── data-pipeline/         # Bash script 파이프라인 샘플
│   │   ├── run-pipeline.sh    # 병렬 실행 오케스트레이터
│   │   ├── scripts/           # fetch-csv.sh, fetch-json.sh, merge-report.sh
│   │   └── data/              # 수집 데이터 저장 위치
│   └── lol-build/             # Node.js + fetch API 샘플
├── .dev/specs/{name}/         # 스펙 및 컨텍스트
│   ├── PLAN.md                # 실행 계획
│   └── context/
│       ├── outputs.json       # 태스크 출력 데이터
│       └── learnings.md       # 학습 내용
├── agents/                    # 전문 에이전트 (external-researcher 등)
├── skills/                    # 워크플로우 스킬
└── scripts/                   # Hook 스크립트 (bash)
```

**제안 위치:**
- 실험 코드: `.playground/instagram-crawler/`
- 스크립트: `.playground/instagram-crawler/scripts/`
- 수집 데이터: `.playground/instagram-crawler/data/` (git-ignored)
- 설정 파일: `.playground/instagram-crawler/.env.example` (템플릿), `.env` (git-ignored)

### Project Commands

**JSON 처리:**
```bash
jq '.field' input.json
jq --slurpfile other other.json '. + {merged: $other}' input.json
```

**병렬 실행:**
```bash
script1.sh &
script2.sh &
wait
```

**에러 핸들링:**
```bash
set -euo pipefail
if [ ! -f "$file" ]; then
  echo "Error: file not found" >&2
  exit 1
fi
```

### Documentation

**에러 처리 규칙:**
- `skills/specify/templates/PLAN_TEMPLATE.md:137` - 에러 분류:
  - `env_error`: API key 누락, 네트워크 타임아웃, 401/403 (패턴: `/EACCES|ECONNREFUSED|timeout|401|403/i`)
  - `code_error`: Type error, lint failure, test failure
- `skills/specify/templates/PLAN_TEMPLATE.md:145-156` - 재시도: work 태스크는 최대 2회, verification 태스크는 재시도 없음

**리스크 평가:**
- `agents/tradeoff-analyzer.md:36-49` - 리스크 레벨:
  - **LOW**: 격리된 변경, 되돌릴 수 있음
  - **MEDIUM**: API 변경, 새로운 의존성, 여러 파일 수정
  - **HIGH**: 인증 로직, 데이터 삭제, breaking API 변경 (사용자 승인 필요)
- 외부 API 통합은 일반적으로 **MEDIUM** 이상

**Bash 규칙:**
- `.dev/specs/sample-pipeline/PLAN.md:37-40` - macOS bash 3.2 호환, `set -euo pipefail`, jq 사용
- bash 4+ 기능 금지 (associative arrays, `${var,,}` 등)

**네트워크 접근:**
- `skills/specify/templates/PLAN_TEMPLATE.md:173` - Runtime Contract에 네트워크 접근 명시 필요
- `skills/specify/templates/PLAN_TEMPLATE.md:175` - 파일 접근은 레포지토리 내부만

**크레덴셜 관리:**
- `.gitignore:1-2` - `.playground/`, `.dev/state.local.json` git-ignored
- API 키는 환경변수 또는 git-ignored 설정 파일
- `env_error` 패턴으로 API 키 누락 감지

---

## User Decisions

| Question | Decision | Notes |
|----------|----------|-------|
| 크롤링 목적 | 학술 연구/개인 프로젝트 (소규모) | 교육 또는 개인 학습 목적 |
| 수집 데이터 타입 | 게시물 (이미지, 캡션) | 댓글, 프로필, 해시태그는 제외 |
| 완료 조건 | 특정 개수의 게시물 수집 | 10-50개 게시물 수집 완료 |
| 수집 스케일 | 소규모 (10-50개) | 테스트 및 학습에 적합한 규모 |
| 타겟 | 특정 계정의 게시물 | @username 지정 가능 |
| API 권한 | Instagram Graph API 사용 | 공식 API 사용 권한 있음 (가장 안전) |
| 기술 스택 | Bash + curl + jq | 프로젝트 표준 준수 |
| 접근 방식 승인 | 확인 완료 | 사용자 승인 완료 |

---

## Direction

### Approach

**확정된 접근 방식:**

1. **Instagram Graph API 사용** (공식, 합법적, 안전)
   - OAuth 2.0 인증 또는 장기 액세스 토큰 사용
   - Business Account 또는 Creator Account 필요
   - `/me/media` 또는 `/{user-id}/media` 엔드포인트 사용

2. **기술 스택**
   - **언어**: Bash 스크립트 (프로젝트 표준 준수)
   - **HTTP 클라이언트**: `curl` (`.claude/settings.local.json:16`에서 허용됨)
   - **JSON 파싱**: `jq` (프로젝트 표준)
   - **실험 위치**: `.playground/instagram-crawler/` (git-ignored)

3. **데이터 파이프라인**
   - 인증 토큰 검증 → 사용자 ID 조회 → 미디어 목록 조회 → 상세 정보 수집 → JSON 저장
   - 페이지네이션 처리 (최대 10-50개)
   - Rate limiting: 요청당 1초 대기 (Instagram 권장)

4. **에러 처리**
   - `env_error` 패턴: 네트워크 타임아웃, 401/403 인증 실패, API 키 누락
   - 재시도: 최대 2회 (프로젝트 표준)
   - 에러 로그 → stderr 출력

5. **데이터 저장**
   - 형식: JSON (구조화된 데이터)
   - 위치: `.playground/instagram-crawler/data/posts.json`
   - 각 게시물: `{id, caption, media_type, media_url, timestamp, permalink}`

6. **보안 및 크레덴셜**
   - `.env` 파일로 액세스 토큰 관리 (git-ignored)
   - `.env.example` 템플릿 제공
   - 토큰 누락 시 명확한 에러 메시지

### Work Breakdown

1. **Instagram Graph API 공식 문서 조사** → outputs: `api_research.md`
   - 인증 방법 (액세스 토큰 발급)
   - 미디어 조회 엔드포인트 및 필드
   - Rate limit 정책
   - 에러 코드 및 처리 방법

2. **프로젝트 구조 및 환경 설정** → outputs: `.env.example`, `config.json` (선택)
   - `.playground/instagram-crawler/` 디렉토리 생성
   - `scripts/`, `data/` 서브디렉토리 생성
   - `.env.example` 템플릿: `INSTAGRAM_ACCESS_TOKEN=your_token_here`
   - README 초안 (사용 방법)

3. **인증 및 사용자 조회 스크립트** → outputs: `scripts/auth.sh`
   - depends on: 환경 설정
   - 액세스 토큰 검증
   - 사용자 ID 조회 (username → user_id)
   - 에러 핸들링: 토큰 누락, 401/403

4. **미디어 수집 스크립트** → outputs: `scripts/fetch_posts.sh`
   - depends on: 인증 스크립트
   - `/me/media` 또는 `/{user-id}/media` API 호출
   - 페이지네이션 처리 (최대 50개 limit)
   - Rate limiting: 요청당 1초 `sleep`
   - JSON 파싱 (jq) 및 저장
   - 에러 핸들링: 네트워크 타임아웃, rate limit exceeded

5. **오케스트레이션 스크립트** → outputs: `run.sh`
   - depends on: 인증 스크립트, 미디어 수집 스크립트
   - 전체 파이프라인 실행: auth → fetch → save
   - Pre-flight 검증 (`.env` 파일 존재 확인)
   - 최종 결과 출력 (수집된 게시물 수)

6. **검증 및 테스트** → outputs: 샘플 데이터 `data/posts.json`
   - depends on: 모든 이전 단계
   - 실제 Instagram Graph API로 10-50개 게시물 수집
   - JSON 형식 검증 (jq 파싱 성공)
   - 에러 시나리오 테스트 (토큰 누락, 잘못된 사용자명)

---

## Deliverables

- [ ] `.playground/instagram-crawler/` 프로젝트 구조
- [ ] `scripts/auth.sh` - 인증 및 사용자 조회 스크립트
- [ ] `scripts/fetch_posts.sh` - 미디어 수집 스크립트
- [ ] `run.sh` - 오케스트레이션 스크립트 (전체 파이프라인 실행)
- [ ] `.env.example` - 환경변수 템플릿 (액세스 토큰)
- [ ] `data/posts.json` - 수집된 게시물 샘플 데이터 (10-50개)
- [ ] `README.md` - 사용 방법 문서 (설정, 실행, 에러 처리)
- [ ] `api_research.md` - Instagram Graph API 조사 결과

---

## Next Steps

1. 사용자로부터 Critical Open Questions 답변 받기
2. Legal/compliance 확인
3. 접근 방식 확정 (공식 API vs 대안)
4. 외부 문서 조사 (Instagram Graph API 공식 문서)
5. 플랜 생성
