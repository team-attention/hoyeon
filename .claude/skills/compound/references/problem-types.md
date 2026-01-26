# Problem Types

compound skill에서 사용하는 문제 유형 분류입니다.

## 유형 목록

### Architecture
코드 구조, 설계 패턴, 모듈화 관련

```yaml
problem_type: architecture
```

**예시:**
- 컴포넌트 분리 방법
- 디렉토리 구조 결정
- 레이어 간 의존성

### Error Handling
에러 처리, 예외 관리, 복구 전략

```yaml
problem_type: error-handling
```

**예시:**
- API 에러 응답 처리
- 예외 전파 방식
- 사용자 친화적 에러 메시지

### Performance
성능 최적화, 병목 해결

```yaml
problem_type: performance
```

**예시:**
- 쿼리 최적화
- 캐싱 전략
- 렌더링 성능

### Testing
테스트 전략, 테스트 작성법

```yaml
problem_type: testing
```

**예시:**
- 단위 테스트 범위
- 모킹 전략
- E2E 테스트 설계

### API Design
API 설계, 인터페이스 정의

```yaml
problem_type: api-design
```

**예시:**
- REST 엔드포인트 설계
- 요청/응답 스키마
- 버전 관리

### Data Modeling
데이터 구조, 스키마 설계

```yaml
problem_type: data-modeling
```

**예시:**
- DB 스키마 설계
- 타입 정의
- 상태 관리 구조

### Security
보안, 인증, 권한 관리

```yaml
problem_type: security
```

**예시:**
- 인증 흐름
- 입력 검증
- 권한 체크

### DevOps
배포, CI/CD, 인프라

```yaml
problem_type: devops
```

**예시:**
- 배포 파이프라인
- 환경 설정
- 모니터링

### Tooling
개발 도구, 빌드 설정

```yaml
problem_type: tooling
```

**예시:**
- 빌드 설정
- 린터 규칙
- 개발 환경 구성

### Integration
외부 서비스 연동, 서드파티 라이브러리

```yaml
problem_type: integration
```

**예시:**
- 외부 API 연동
- 라이브러리 사용법
- SDK 설정

### Documentation
문서화, 주석, 가이드

```yaml
problem_type: documentation
```

**예시:**
- API 문서화
- README 작성
- 코드 주석 규칙

### Refactoring
코드 개선, 리팩토링 패턴

```yaml
problem_type: refactoring
```

**예시:**
- 레거시 코드 개선
- 중복 제거
- 명명 규칙 통일

### Bug Fix
버그 수정, 디버깅

```yaml
problem_type: bug-fix
```

**예시:**
- 엣지 케이스 처리
- 레이스 컨디션 해결
- 메모리 릭 수정

### Convention
코딩 컨벤션, 스타일 가이드

```yaml
problem_type: convention
```

**예시:**
- 네이밍 컨벤션
- 파일 구조 규칙
- 코드 스타일

### Other
위 카테고리에 해당하지 않는 경우

```yaml
problem_type: other
```

---

## 분류 가이드

1. **가장 핵심적인 문제**에 해당하는 유형 선택
2. 여러 유형에 걸치면 **주된 학습 포인트** 기준
3. 확실하지 않으면 `other` 사용 후 태그로 보완
