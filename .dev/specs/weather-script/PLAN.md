# Weather Script - Work Plan

## Context

### Goal
간단한 날씨 확인 Python 스크립트 만들기

### Background
- 실험/학습 목적의 간단한 스크립트
- `.playground/` 디렉토리에 위치 (git-ignored)

### Gap Analysis Summary
- 에러 처리: 간단한 메시지 출력으로 충분
- 출력 형식: plain text
- 네트워크 타임아웃: 10초 설정
- 위치 인자: 공백 포함 도시명 지원 필요 ("New York")

---

## Work Objectives

### Must Do
- [ ] wttr.in API로 현재 날씨 조회
- [ ] CLI 인자로 위치 받기
- [ ] 온도, 날씨 상태, 습도 출력
- [ ] 기본 에러 처리 (네트워크 오류, 위치 없음)

### Must NOT Do
- requirements.txt, setup.py 생성 금지
- 캐싱, 저장 기능 추가 금지
- Click, Typer 등 CLI 프레임워크 사용 금지 (sys.argv 사용)
- 설정 파일, 환경 변수 의존성 추가 금지
- logging, metrics 등 프로덕션 기능 추가 금지
- 예보, 다중 위치 등 scope 외 기능 추가 금지

---

## Technical Approach

### API
- Endpoint: `https://wttr.in/{location}?format=j1`
- JSON 응답에서 `current_condition` 파싱

### Dependencies
- `requests` (pip install requests)

### File Structure
```
.playground/
└── weather.py    # 단일 파일
```

---

## Work Items

### TODO-1: weather.py 스크립트 작성

**What**: wttr.in API를 사용하여 현재 날씨를 조회하는 Python 스크립트 작성

**Implementation**:
1. sys.argv로 위치 인자 받기
2. requests로 wttr.in API 호출 (timeout=10)
3. JSON 응답에서 current_condition 파싱
4. 온도(°C), 날씨 상태, 습도(%) 출력
5. 에러 시 친절한 메시지 출력

**Must NOT Do**:
- argparse 사용 금지 (sys.argv 직접 사용)
- retry 로직, exponential backoff 추가 금지
- 예보 데이터 파싱 금지

**Parallelizable**: No (단일 작업)

**References**:
- wttr.in API: https://wttr.in/:help

**Acceptance Criteria**:
- [ ] `python .playground/weather.py Seoul` 실행 시 현재 날씨 출력
- [ ] `python .playground/weather.py "New York"` 공백 포함 도시 동작
- [ ] 인자 없이 실행 시 사용법 안내 출력
- [ ] 잘못된 위치 입력 시 에러 메시지 출력
- [ ] 네트워크 오류 시 에러 메시지 출력

**Commit**: `feat: add weather script using wttr.in API`

---

## Task Flow

```
[TODO-1] weather.py 작성
    ↓
  완료
```

## Parallelization

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | TODO-1 | 스크립트 작성 및 테스트 |

---

## Completion Protocol

### Quality Checks
- [ ] 스크립트 실행: `python .playground/weather.py Seoul` → 날씨 출력
- [ ] 에러 케이스: 인자 없음, 잘못된 위치, 네트워크 오류 테스트
- [ ] 공백 포함 위치: `python .playground/weather.py "New York"` → 정상 동작

### Final Commit
- [ ] Quality Checks 통과 후 커밋: `feat: add weather script using wttr.in API`
