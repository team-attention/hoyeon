# Parallel Data Pipeline Sample Scripts

> `.playground/data-pipeline/`에 병렬 실행 가능한 Bash 데이터 파이프라인 샘플 스크립트 세트를 생성한다.

## Context

### Original Request
병렬 태스크로 구현될만한 간단한 샘플 스크립트 만들어줘

### Interview Summary
**Key Discussions**:
- **스크립트 종류**: Data Pipeline (3개 독립 fetch + 1개 merge)
- **언어**: Bash
- **위치**: `.playground/data-pipeline/` (git-ignored)

**Research Findings**:
- 기존 Bash 스크립트 패턴: `set -euo pipefail`, jq 활용 (`.claude/scripts/dev-worker-verify.sh`)
- `.playground/` 디렉토리는 git-ignored (실험용)
- macOS 환경 (bash 3.2 호환 필요)

## Work Objectives

### Core Objective
3개의 독립적인 데이터 소스(CSV, JSON, mock API)에서 데이터를 병렬로 수집/변환한 후, 결과를 병합하여 리포트를 생성하는 Bash 스크립트 세트 구현

### Concrete Deliverables
- `.playground/data-pipeline/data/sample.csv` - 샘플 CSV 데이터
- `.playground/data-pipeline/data/sample.json` - 샘플 JSON 데이터
- `.playground/data-pipeline/scripts/fetch-csv.sh` - CSV 파싱 스크립트
- `.playground/data-pipeline/scripts/fetch-json.sh` - JSON 변환 스크립트
- `.playground/data-pipeline/scripts/fetch-api.sh` - Mock API 처리 스크립트
- `.playground/data-pipeline/scripts/merge-report.sh` - 결과 병합 스크립트
- `.playground/data-pipeline/run-pipeline.sh` - 엔트리포인트

### Definition of Done
- [ ] 각 fetch 스크립트가 독립적으로 실행 가능 (`./scripts/fetch-csv.sh` 단독 실행 OK)
- [ ] `./run-pipeline.sh` 실행 시 `output/report.json` 생성
- [ ] 모든 스크립트에 `set -euo pipefail` 적용
- [ ] macOS bash 3.2 호환 (bash 4+ 전용 기능 미사용)
- [ ] jq 외 추가 도구 불필요

### Must NOT Do (Guardrails)
- 실제 네트워크 호출 금지 (curl 등으로 외부 API 호출 없음)
- `.playground/data-pipeline/` 외부 파일 생성/수정 금지
- bash 4+ 전용 기능 사용 금지 (associative arrays, `${var,,}` 등)
- 에러 핸들링 과도하게 복잡하게 하지 않기 (샘플이므로 간결하게)
- 기존 프로젝트 코드 수정 금지

---

## Task Flow

```
TODO-1 (data) ──┬── TODO-2 (csv)  ──┐
                ├── TODO-3 (json) ──┤── TODO-5 (merge) ── TODO-6 (entry) ── TODO-Final
                └── TODO-4 (api)  ──┘
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `data_dir` (file) | work |
| 2 | `todo-1.data_dir` | `fetch_csv_path` (file) | work |
| 3 | `todo-1.data_dir` | `fetch_json_path` (file) | work |
| 4 | `todo-1.data_dir` | `fetch_api_path` (file) | work |
| 5 | `todo-2.fetch_csv_path`, `todo-3.fetch_json_path`, `todo-4.fetch_api_path` | `merge_path` (file) | work |
| 6 | `todo-5.merge_path` | `entry_path` (file) | work |
| Final | all outputs | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| A | TODO 2, 3, 4 | 독립적인 fetch 스크립트 - 서로 의존성 없음 |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(sample): add pipeline sample data` | `.playground/data-pipeline/data/*` | always |
| 4 (after group A) | `feat(sample): add parallel fetch scripts` | `.playground/data-pipeline/scripts/fetch-*.sh` | always |
| 6 | `feat(sample): add merge and pipeline entry scripts` | `.playground/data-pipeline/scripts/merge-report.sh`, `.playground/data-pipeline/run-pipeline.sh` | always |

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `env_error` | jq not installed, permission denied | `/command not found\|Permission denied/i` |
| `code_error` | Script syntax error, jq parse error | `/syntax error\|parse error/i` |
| `unknown` | Other | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → Fix or halt |
| verification fails | Analyze immediately (no retry) → Report |

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Denied (mock data only) |
| Package Install | Denied |
| File Access | `.playground/data-pipeline/` only |
| Max Execution Time | 2 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## TODOs

### [x] TODO 1: Create sample data files

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `data_dir` (file): `.playground/data-pipeline/data/` - 샘플 데이터 디렉토리

**Steps**:
- [ ] `.playground/data-pipeline/data/` 디렉토리 생성
- [ ] `.playground/data-pipeline/output/` 디렉토리 생성
- [ ] `.playground/data-pipeline/scripts/` 디렉토리 생성
- [ ] `data/sample.csv` 생성 - 사용자 데이터 (id, name, department, score) 10행
- [ ] `data/sample.json` 생성 - 프로젝트 데이터 (id, project, budget, status) JSON 배열 5항목

**Must NOT do**:
- `.playground/data-pipeline/` 외부에 파일 생성 금지
- Do not run git commands

**References**:
- `.claude/scripts/dev-worker-verify.sh:1-5` - Bash 스크립트 헤더 패턴

**Acceptance Criteria**:

*Functional:*
- [x] `test -f .playground/data-pipeline/data/sample.csv` → exit 0
- [x] `test -f .playground/data-pipeline/data/sample.json` → exit 0
- [x] `jq '.' .playground/data-pipeline/data/sample.json` → valid JSON
- [x] `wc -l < .playground/data-pipeline/data/sample.csv` → 11 (header + 10 rows)

*Static:*
- [x] CSV 첫 행이 헤더: `head -1 .playground/data-pipeline/data/sample.csv` → `id,name,department,score`

*Runtime:*
- [] (no tests - data files only)

---

### [x] TODO 2: Implement fetch-csv.sh

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `data_dir` (file): `${todo-1.outputs.data_dir}` - 샘플 데이터 디렉토리

**Outputs**:
- `fetch_csv_path` (file): `.playground/data-pipeline/scripts/fetch-csv.sh` - CSV 파싱 스크립트

**Steps**:
- [ ] `scripts/fetch-csv.sh` 생성 (shebang: `#!/usr/bin/env bash`)
- [ ] `set -euo pipefail` 적용
- [ ] SCRIPT_DIR 변수로 스크립트 상대 경로 설정: `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"`
- [ ] `data/sample.csv`를 읽어 부서별 평균 점수를 계산
- [ ] 결과를 `output/csv-result.json` (JSON 형식)으로 출력
- [ ] `chmod +x` 설정

**Must NOT do**:
- 외부 도구 사용 금지 (awk, sed는 허용, csvkit 등 금지)
- Do not run git commands

**References**:
- `.claude/scripts/dev-worker-verify.sh:1-15` - Bash 스크립트 헤더 패턴 (set -euo pipefail)

**Acceptance Criteria**:

*Functional:*
- [x] `test -x .playground/data-pipeline/scripts/fetch-csv.sh` → executable
- [x] `cd .playground/data-pipeline && ./scripts/fetch-csv.sh` → exit 0
- [x] `test -f .playground/data-pipeline/output/csv-result.json` → exit 0
- [x] `jq '.' .playground/data-pipeline/output/csv-result.json` → valid JSON

*Static:*
- [x] `head -1 .playground/data-pipeline/scripts/fetch-csv.sh` → `#!/usr/bin/env bash`
- [x] `grep -q 'set -euo pipefail' .playground/data-pipeline/scripts/fetch-csv.sh` → exit 0

*Runtime:*
- [] (script self-tests via execution)

---

### [x] TODO 3: Implement fetch-json.sh

**Type**: work

**Required Tools**: `jq`

**Inputs**:
- `data_dir` (file): `${todo-1.outputs.data_dir}` - 샘플 데이터 디렉토리

**Outputs**:
- `fetch_json_path` (file): `.playground/data-pipeline/scripts/fetch-json.sh` - JSON 변환 스크립트

**Steps**:
- [ ] `scripts/fetch-json.sh` 생성 (shebang: `#!/usr/bin/env bash`)
- [ ] `set -euo pipefail` 적용
- [ ] SCRIPT_DIR 변수로 스크립트 상대 경로 설정
- [ ] `data/sample.json`에서 상태별 프로젝트 수와 총 예산 집계
- [ ] 결과를 `output/json-result.json`으로 출력
- [ ] `chmod +x` 설정

**Must NOT do**:
- 외부 도구 사용 금지 (jq 외)
- Do not run git commands

**References**:
- `.claude/scripts/dev-worker-verify.sh:1-15` - Bash 스크립트 헤더 패턴

**Acceptance Criteria**:

*Functional:*
- [x] `test -x .playground/data-pipeline/scripts/fetch-json.sh` → executable
- [x] `cd .playground/data-pipeline && ./scripts/fetch-json.sh` → exit 0
- [x] `test -f .playground/data-pipeline/output/json-result.json` → exit 0
- [x] `jq '.' .playground/data-pipeline/output/json-result.json` → valid JSON

*Static:*
- [x] `head -1 .playground/data-pipeline/scripts/fetch-json.sh` → `#!/usr/bin/env bash`
- [x] `grep -q 'set -euo pipefail' .playground/data-pipeline/scripts/fetch-json.sh` → exit 0

*Runtime:*
- [] (script self-tests via execution)

---

### [x] TODO 4: Implement fetch-api.sh

**Type**: work

**Required Tools**: `jq`

**Inputs**:
- `data_dir` (file): `${todo-1.outputs.data_dir}` - 샘플 데이터 디렉토리

**Outputs**:
- `fetch_api_path` (file): `.playground/data-pipeline/scripts/fetch-api.sh` - Mock API 스크립트

**Steps**:
- [ ] `scripts/fetch-api.sh` 생성 (shebang: `#!/usr/bin/env bash`)
- [ ] `set -euo pipefail` 적용
- [ ] SCRIPT_DIR 변수로 스크립트 상대 경로 설정
- [ ] Mock API 응답을 스크립트 내 heredoc으로 생성 (서버 상태 데이터: hostname, uptime, cpu_usage, memory_usage 등)
- [ ] `sleep 1`로 네트워크 지연 시뮬레이션
- [ ] 결과를 `output/api-result.json`으로 출력
- [ ] `chmod +x` 설정

**Must NOT do**:
- 실제 네트워크 호출 금지 (curl, wget 등)
- Do not run git commands

**References**:
- `.claude/scripts/dev-worker-verify.sh:1-15` - Bash 스크립트 헤더 패턴

**Acceptance Criteria**:

*Functional:*
- [x] `test -x .playground/data-pipeline/scripts/fetch-api.sh` → executable
- [x] `cd .playground/data-pipeline && ./scripts/fetch-api.sh` → exit 0
- [x] `test -f .playground/data-pipeline/output/api-result.json` → exit 0
- [x] `jq '.' .playground/data-pipeline/output/api-result.json` → valid JSON

*Static:*
- [x] `head -1 .playground/data-pipeline/scripts/fetch-api.sh` → `#!/usr/bin/env bash`
- [x] `grep -q 'set -euo pipefail' .playground/data-pipeline/scripts/fetch-api.sh` → exit 0
- [x] `! grep -q 'curl\|wget' .playground/data-pipeline/scripts/fetch-api.sh` → no network calls

*Runtime:*
- [] (script self-tests via execution)

---

### [x] TODO 5: Implement merge-report.sh

**Type**: work

**Required Tools**: `jq`

**Inputs**:
- `fetch_csv_path` (file): `${todo-2.outputs.fetch_csv_path}` - CSV fetch 스크립트
- `fetch_json_path` (file): `${todo-3.outputs.fetch_json_path}` - JSON fetch 스크립트
- `fetch_api_path` (file): `${todo-4.outputs.fetch_api_path}` - API fetch 스크립트

**Outputs**:
- `merge_path` (file): `.playground/data-pipeline/scripts/merge-report.sh` - 병합 스크립트

**Steps**:
- [ ] `scripts/merge-report.sh` 생성 (shebang: `#!/usr/bin/env bash`)
- [ ] `set -euo pipefail` 적용
- [ ] SCRIPT_DIR 변수로 스크립트 상대 경로 설정
- [ ] `output/csv-result.json`, `output/json-result.json`, `output/api-result.json` 3개 파일 존재 확인
- [ ] jq로 3개 결과를 하나의 JSON 객체로 병합: `{"csv_summary": ..., "json_summary": ..., "api_summary": ..., "generated_at": "timestamp"}`
- [ ] 결과를 `output/report.json`으로 출력
- [ ] `chmod +x` 설정

**Must NOT do**:
- 입력 파일이 없으면 에러로 exit (silent fail 금지)
- Do not run git commands

**References**:
- `.claude/scripts/dev-worker-verify.sh:1-15` - Bash 스크립트 헤더 패턴

**Acceptance Criteria**:

*Functional:*
- [x] `test -x .playground/data-pipeline/scripts/merge-report.sh` → executable
- [x] `cd .playground/data-pipeline && ./scripts/merge-report.sh` → exit 0 (3개 input 파일 존재 시)
- [x] `test -f .playground/data-pipeline/output/report.json` → exit 0
- [x] `jq '.csv_summary' .playground/data-pipeline/output/report.json` → not null
- [x] `jq '.json_summary' .playground/data-pipeline/output/report.json` → not null
- [x] `jq '.api_summary' .playground/data-pipeline/output/report.json` → not null

*Static:*
- [x] `head -1 .playground/data-pipeline/scripts/merge-report.sh` → `#!/usr/bin/env bash`
- [x] `grep -q 'set -euo pipefail' .playground/data-pipeline/scripts/merge-report.sh` → exit 0

*Runtime:*
- [] (script self-tests via execution)

---

### [x] TODO 6: Implement run-pipeline.sh

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `merge_path` (file): `${todo-5.outputs.merge_path}` - 병합 스크립트

**Outputs**:
- `entry_path` (file): `.playground/data-pipeline/run-pipeline.sh` - 파이프라인 엔트리포인트

**Steps**:
- [ ] `run-pipeline.sh` 생성 (shebang: `#!/usr/bin/env bash`)
- [ ] `set -euo pipefail` 적용
- [ ] `output/` 디렉토리 초기화 (기존 결과 삭제)
- [ ] 3개 fetch 스크립트를 백그라운드(`&`)로 병렬 실행
- [ ] `wait`으로 전체 완료 대기
- [ ] merge-report.sh 실행
- [ ] 최종 결과 경로 출력
- [ ] `chmod +x` 설정

**Must NOT do**:
- bash 4+ 전용 기능 사용 금지
- Do not run git commands

**References**:
- `.claude/scripts/dev-worker-verify.sh:1-15` - Bash 스크립트 헤더 패턴

**Acceptance Criteria**:

*Functional:*
- [x] `test -x .playground/data-pipeline/run-pipeline.sh` → executable
- [x] `cd .playground/data-pipeline && ./run-pipeline.sh` → exit 0
- [x] `test -f .playground/data-pipeline/output/report.json` → exit 0 (end-to-end)

*Static:*
- [x] `head -1 .playground/data-pipeline/run-pipeline.sh` → `#!/usr/bin/env bash`
- [x] `grep -q 'set -euo pipefail' .playground/data-pipeline/run-pipeline.sh` → exit 0
- [x] `grep -q 'wait' .playground/data-pipeline/run-pipeline.sh` → uses parallel wait

*Runtime:*
- [] (full pipeline test via execution)

---

### [x] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `jq`, `bash`

**Inputs**:
- `entry_path` (file): `${todo-6.outputs.entry_path}`

**Outputs**: (none)

**Steps**:
- [ ] 모든 스크립트 파일 존재 확인 (7개)
- [ ] 모든 스크립트 실행 가능 확인 (`-x`)
- [ ] `run-pipeline.sh` 실행하여 end-to-end 테스트
- [ ] `output/report.json` 유효성 검증
- [ ] 모든 스크립트에 `set -euo pipefail` 포함 확인
- [ ] curl/wget 등 네트워크 호출 없음 확인

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [x] `test -f .playground/data-pipeline/run-pipeline.sh` → exit 0
- [x] `test -f .playground/data-pipeline/scripts/fetch-csv.sh` → exit 0
- [x] `test -f .playground/data-pipeline/scripts/fetch-json.sh` → exit 0
- [x] `test -f .playground/data-pipeline/scripts/fetch-api.sh` → exit 0
- [x] `test -f .playground/data-pipeline/scripts/merge-report.sh` → exit 0
- [x] `cd .playground/data-pipeline && ./run-pipeline.sh` → exit 0
- [x] `jq '.' .playground/data-pipeline/output/report.json` → valid JSON
- [x] `jq '.csv_summary' .playground/data-pipeline/output/report.json` → not null
- [x] `jq '.json_summary' .playground/data-pipeline/output/report.json` → not null
- [x] `jq '.api_summary' .playground/data-pipeline/output/report.json` → not null

*Static:*
- [x] 모든 .sh 파일에 `set -euo pipefail` 포함
- [x] `! grep -r 'curl\|wget' .playground/data-pipeline/scripts/` → no network calls

*Runtime:*
- [x] End-to-end pipeline 실행 성공