# spec.json Schema Design

> Date: 2026-03-05
> Status: v4 — spec/state 분리 + 모호함 해소 (Document v2)

## Background

기존 PLAN.md (마크다운 자유 텍스트) 기반의 spec을 JSON 구조화 포맷으로 전환하는 설계.
Worker/Observer/Coordinator 3-agent 루프에서 Observer가 프로그래매틱하게 파싱, 검증, 업데이트할 수 있는 형태를 목표로 함.

### 참고 자료
- `.references/OpenSpec/` — Fission AI의 spec framework (behavior contract, delta specs, RFC 2119)
- `.references/spec-kit/` — GitHub의 spec-driven development toolkit (user stories, tasks template)
- 기존 `/specify` skill 산출물: DRAFT.md → PLAN.md 흐름

### 설계 원칙

1. **모호하면 안 된다** — 모든 필드가 하나의 해석만 허용
2. **검증/재현 가능해야 한다** — human/agent/machine 구분
3. **작업 단위가 atomic해야 한다** — 하나의 task = 하나의 action (steps 3개 이하)
4. **제약 사항이 명확해야 한다** — 금지/보존을 타입으로 구분
5. **계약과 현황을 분리한다** — spec.json은 불변 계약, state.json은 런타임 현황

---

## Architecture: spec.json + state.json 분리

### 왜 분리하는가

v3까지 spec.json 안에 `status`, `verified` 같은 **런타임 상태**가 섞여 있었음.
이로 인해:
- 계약(spec)과 현황(state)의 경계가 모호
- spec 변경과 상태 변경이 같은 파일에서 발생 → diff 오염
- Worker가 spec을 직접 수정해야 하는 위험

### 분리 구조

```
spec.json  (immutable after approval — 계약서)
├── meta, context, requirements, tasks, constraints
├── status 필드 없음
└── 변경 = Coordinator만 가능 (Observer feedback 반영 시)

state.json  (mutable — 진행 현황)
├── spec_ref: "spec.json"
├── spec_hash: "sha256:..."           ← spec 변경 감지
├── tasks: { "T1": { status, owner, started_at, completed_at } }
├── verifications: { "R1.S1": { passed, evidence, at } }
├── assumptions: { "A1": { verified, verified_at } }
└── history: [ { action, by, at, detail } ]
```

### 소유권 모델

| 파일 | 성격 | 읽기 | 쓰기 | 변경 시점 |
|------|------|------|------|----------|
| spec.json | 계약서 | 모든 agent | Coordinator만 | feedback 반영 시 (드물게) |
| state.json | 진행 대장 | 모든 agent | Worker, Observer (cli 경유) | 매 task 완료마다 |
| feedback/*.json | Observer 의견 | Coordinator | Observer | 검증 후 |

### Drift 방지 규칙

| 규칙 | 설명 | 강제 방법 |
|------|------|----------|
| **Hash lock** | state.json의 `spec_hash`가 현재 spec.json 해시와 불일치 시 경고/중단 | cli가 매 조작 시 검증 |
| **Key 정합성** | state.json에 있는 task/requirement ID는 반드시 spec.json에 존재 | cli가 orphan key 거부 |
| **단일 진입점** | spec/state 직접 수정 금지, 반드시 cli 경유 | pre-commit hook으로 raw edit 차단 |

### spec 변경 흐름 (Observer feedback → Coordinator amend)

```
1. Observer: cli feedback create "R1.S2 시나리오 누락"
   → feedback/fb-001.json 생성

2. Coordinator: cli spec amend --reason "fb-001"
   → spec.json 수정 (requirement 추가 등)
   → spec_hash 변경

3. cli state sync
   → spec에서 삭제된 task → state에서 archived
   → spec에서 추가된 task → state에 pending으로 추가
   → hash 갱신, 기존 완료 상태 보존
```

### 파일 배치

```
.dev/specs/{spec-name}/
├── spec.json              ← 계약 (Coordinator 소유)
├── state.json             ← 현황 (Worker/Observer, cli 경유)
├── feedback/
│   ├── fb-001.json        ← Observer 피드백
│   └── fb-002.json
└── (git이 spec.json 이력 관리)
```

---

## Schema Structure (5 sections)

```
spec.json
├── meta          — 이게 뭔가? (identity + provenance + strategic scope)
│   ├── goal        — 무엇을 달성하는가 (전략)
│   └── non_goals   — 무엇을 달성하지 않는가 (전략적 범위 제외)
├── context       — 왜, 어떤 전제 위에? (background + rationale)
├── requirements  — 어떤 행동이 있어야 하는가? (behavior contract)
├── tasks         — 어떤 작업을 해야 하는가? (atomic work units)
└── constraints   — 어떤 경계를 넘으면 안 되는가? (boundary guards)
```

### Orthogonality 검증

| Section | 질문 | 시간축 | 소유 agent |
|---------|------|--------|-----------|
| meta | 이게 뭔가? + 뭘 안 하는가? | — | 생성자 |
| context | 왜, 어떤 전제 위에? | 과거 → 현재 | 모두 읽기, Coordinator 수정 |
| requirements | 어떤 행동이 있어야 하는가? | 현재 → 미래 | Observer 검증 |
| tasks | 어떤 작업을 해야 하는가? | 현재 | Worker 수행 |
| constraints | 어떤 경계를 넘으면 안 되는가? | 과거 보호 + 미래 금지 | Observer 감시 |

---

## 기존 PLAN.md 대비 매핑

| Old PLAN.md Section | New spec.json | 비고 |
|---------------------|---------------|------|
| Context.Original Request | `context.request` | 분리 |
| Context.Interview Summary | `context.interview[]` | **v4** 배열 + 구조화 |
| Context.Research Findings | `context.research` | v3 신규 |
| Context.Assumptions | `context.assumptions[]` | 구조화 (belief + if_wrong + impact) |
| Work Objectives.Goal | `meta.goal` | 1문장 |
| Work Objectives.Deliverables | `meta.deliverables[]` | **v4** 객체화 {path, description} |
| Work Objectives.DoD | `requirements[].scenarios` | DoD = scenarios 집합 |
| Non-goals | `meta.non_goals[]` | 전략적 범위 제외 |
| Must NOT Do (글로벌) | `constraints[]` (typed) | must_not_do/preserve |
| Must NOT Do (TODO별) | `tasks[].task_constraints[]` | **v4** typed object |
| TODOs.Steps | `tasks[].steps[]` | 3개 이하 권장 |
| TODOs.Inputs/Outputs | `tasks[].inputs[]` / `tasks[].outputs[]` | artifact 흐름 |
| TODOs.References | `tasks[].references[]` | **v4** 객체화 {path, start_line, end_line} |
| TODOs.Type (Work/Verification) | `tasks[].type` | work/verification 정의 명시 |
| TODOs.Risk | `tasks[].risk` | **v4** 판단 기준 명시 |
| TODOs.Acceptance Criteria | `requirements.scenarios` (via fulfills) | AC 중복 제거 |
| Verification (A-items, H-items) | `requirements.scenarios[].verified_by` | 내장 |
| Verification Gaps | `context.known_gaps[]` | **v4** 객체화 {gap, severity, mitigation} |
| Dependency Graph | `tasks[].depends_on` + `tasks[].outputs` | 내장 + artifact 흐름 |
| Commit Strategy | `tasks[].checkpoint{}` | **v4** condition enum화 |
| Key Decisions | `context.decisions[]` | **v4** alternatives_rejected 객체화 |
| Plan Approval Summary | `meta.approved_by/at` (optional) | 경량 |
| **진행 현황** | **→ state.json으로 분리** | **v4 핵심 변경** |

### 핵심 개선: 3중 중복 제거 (v3에서 해결, v4 유지)

```
OLD:  success_criteria + acceptance_criteria + a_items  (3곳에서 검증 중복)
NEW:  requirements.scenarios (유일한 검증 소스)
```

---

## verify 필드 타입 시스템

`verified_by`와 `verify.type`이 1:1 매핑 (JSON Schema if/then으로 강제):

| verified_by | verify.type | verify 내용 | 판정 방식 |
|-------------|-------------|-------------|----------|
| `machine` | `command` | `run` + `expect` | exit code + optional regex |
| `agent` | `assertion` | `checks[]` | Observer가 체크리스트 순회 |
| `human` | `instruction` | `ask` | 사람 확인 |

### expect 필드 (v4 확장)

v3의 `"exit_0"` 문자열 → v4에서 객체화:

```json
"expect": {
  "exit_code": 0,
  "stdout_contains": "dispatched",
  "stderr_empty": true
}
```

모든 하위 필드는 optional. 최소 `exit_code` 하나는 필수.

### assertion checks[] (v4 신규)

v3의 `"check": "자유 텍스트"` → v4에서 체크리스트화:

```json
"verify": {
  "type": "assertion",
  "checks": [
    "unknown type이 case문에서 default로 빠지는지 확인",
    "exit 0이 명시적으로 호출되는지 확인",
    "stderr에 warning 메시지가 출력되는지 확인"
  ]
}
```

---

## Constraint Types

| Type | 의미 | 예시 |
|------|------|------|
| `must_not_do` | 새 행동 금지 | "block reason 텍스트 변경 금지" |
| `preserve` | 기존 행동 보호 (regression guard) | "execute hook 동작 유지" |

> **Note:** `scope_boundary`는 v4.1에서 제거됨. 전략적 범위 제외는 `meta.non_goals[]`로, 물리적 파일 범위는 `tasks[].file_scope[]`로 표현. 글로벌 파일 접근 제한이 필요하면 `must_not_do` + `verify` command로 대체.

### 글로벌 vs task-local 제약 규칙

- `constraints[]` = **글로벌** (전 task에 적용)
- `tasks[].task_constraints[]` = **task-local** (해당 task에만 적용)
- 2개 이상 task에 동일 제약 필요 → `constraints[]`로 승격
- `tasks[].file_scope[]` 중복 시 cli가 warning 출력 (교차 검증)

### task_constraints 구조화 (v4)

v3의 자유 텍스트 → v4에서 typed object:

```json
"task_constraints": [
  { "type": "no_modify", "target": "loop-state.js" },
  { "type": "no_modify", "target": "chain-state.js" },
  { "type": "preserve_string", "target": "blockReason values" }
]
```

---

## 모호함 해소 목록 (v3→v4)

### 치명적 (v4에서 해결)

| # | 필드 | v3 문제 | v4 해결 |
|---|------|--------|---------|
| 1 | `behavior` + `strength` | 같은 정보 이중 인코딩 | **`strength` 제거**. behavior의 RFC2119 키워드(SHALL/MUST/SHOULD)가 유일 소스 |
| 2 | `checkpoint.condition` | 자유 텍스트 ("all acceptance criteria pass") | enum: `"always"` \| `"on_fulfill"` \| `"manual"` |
| 3 | `expect` | 문자열 `"exit_0"` | 객체: `{exit_code, stdout_contains?, stderr_empty?}` |
| 4 | `references[]` | 문자열 `"file:40-75"` 포맷 미정의 | 객체: `{path, start_line?, end_line?}` |
| 5 | `task_constraints[]` | 자유 텍스트 | typed: `{type, target}` |

### 중간 (v4에서 해결)

| # | 필드 | v3 문제 | v4 해결 |
|---|------|--------|---------|
| 6 | `status` (tasks/requirements) | 런타임 상태가 spec에 혼재 | **state.json으로 이동**. spec에서 제거 |
| 7 | `risk` | 판단 기준 없음 | 정의: low=단일파일+reversible, medium=다중파일 or side-effect, high=삭제/외부연동/비가역 |
| 8 | `type` | "테스트 코드 작성"이 work인지 verification인지 | 정의: work=artifact 생성/변경, verification=read-only 검증만 (파일 생성/수정 금지) |
| 9 | `priority` | 숫자 범위/방향 미정의 | 정의: 1=highest, 5=lowest (정수). 동일 우선순위 허용 |
| 10 | `inputs[].artifact` | artifact ID가 outputs에 존재해야 함이 암묵적 | lint 규칙: 모든 `inputs[].artifact`는 해당 `from_task`의 `outputs[].id`에 존재해야 함 |
| 11 | `scenarios given/when/then` | Gherkin 강제 여부 불명 | 규칙: Gherkin 형식 필수. 각 필드 1문장 |
| 12 | `context.interview` | 단일 문자열에 여러 결정 압축 | 배열로 전환: `[{topic, decision}]` |

### 경미 (v4에서 해결)

| # | 필드 | v3 문제 | v4 해결 |
|---|------|--------|---------|
| 13 | `meta.source` | 의미 불명확 | 필드명 변경: `derived_from` |
| 14 | `meta.deliverables[]` | path + 설명 혼합 문자열 | 객체: `{path, description}` |
| 15 | `constraints[].verify.check` | agent마다 다르게 수행 | `checks[]` 체크리스트로 분해 |
| 16 | `known_gaps[]` | 문자열, 심각도 없음 | 객체: `{gap, severity, mitigation}` |
| 17 | `decisions[].alternatives_rejected` | 거부 사유 없음 | 객체: `[{option, reason}]` |
| 18 | `meta.workflow_notes` | 정의만 있고 용도 불명 | 제거. 필요 시 `context.research`에 포함 |
| 19 | `assumptions[].if_wrong` | 영향도 불명 | `impact` 필드 추가: `"minor"` \| `"major"` \| `"critical"` |

---

## Field Definitions (v4 신규)

모든 enum/타입의 정확한 정의:

### task.type

| 값 | 정의 | 허용 action |
|----|------|------------|
| `work` | artifact를 생성하거나 변경하는 작업 | 파일 생성, 수정, 삭제 |
| `verification` | read-only 검증만 수행 | 파일 읽기, 명령 실행. **Edit/Write 금지** |

### task.risk

| 값 | 기준 | 예시 |
|----|------|------|
| `low` | 단일 파일, reversible, side-effect 없음 | 함수 1개 추가 |
| `medium` | 다중 파일, 또는 side-effect 있음 | settings.json + script 동시 수정 |
| `high` | 파일 삭제, 외부 연동, 비가역적 변경 | 기존 hook 삭제, API endpoint 변경 |

### checkpoint.condition

| 값 | 의미 |
|----|------|
| `always` | task 완료 즉시 커밋 |
| `on_fulfill` | fulfills에 명시된 requirement가 모두 pass일 때 커밋 |
| `manual` | Coordinator/사람이 명시적으로 지시할 때 커밋 |

### requirement.priority

1=highest, 5=lowest. 동일 우선순위 가능. Worker는 낮은 숫자부터 처리.

### task_constraints.type

| 값 | 정의 | target 예시 |
|----|------|------------|
| `no_modify` | 해당 파일/모듈 수정 금지 | `"loop-state.js"` |
| `no_delete` | 해당 파일/심볼 삭제 금지 | `"chain-stop-hook.sh"` |
| `preserve_string` | 특정 문자열 값 변경 금지 | `"blockReason values"` |
| `read_only` | 읽기만 허용 (verification task용) | `"all files"` |

확장 시 이 테이블에 추가하고 JSON Schema 업데이트 필수.

---

## Final Schema (v4)

```json
{
  "$schema": "dev-spec/v4",

  "meta": {
    "name": "stop-router",
    "goal": "chain/rv/rph 3개 Stop hook을 단일 stop-router로 통합",
    "non_goals": [
      "execute hook 통합 (별도 유지)",
      "hook 테스트 자동화 프레임워크 구축"
    ],
    "deliverables": [
      { "path": "scripts/stop-router.sh", "description": "단일 Stop hook entry point" },
      { "path": "cli/src/handlers/stop-evaluate.js", "description": "통합 평가 핸들러" },
      { "path": ".claude/settings.json", "description": "Stop hook 등록 업데이트" }
    ],
    "derived_from": ".dev/specs/stop-router/PLAN.md",
    "created_at": "2026-03-04T10:00:00Z",
    "updated_at": "2026-03-05T00:00:00Z"
  },

  "context": {
    "request": "Stop hook 4개를 단일 stop-router.sh + dev-cli stop-evaluate로 통합",
    "interview": [
      { "topic": "crash safety", "decision": "accept risk" },
      { "topic": "execute hook", "decision": "제외 (별도 유지)" },
      { "topic": "priority", "decision": "execute > chain > rv > rph" },
      { "topic": "old scripts", "decision": "chain/rv/rph 삭제" }
    ],
    "research": "3개 hook(chain/rv/rph)은 이미 dev-cli 얇은 래퍼(34-75줄). execute hook만 155줄 직접 shell. ARCHITECTURE_REVIEW.md에서 단일 디스패처 이미 제안됨.",
    "assumptions": [
      {
        "id": "A1",
        "belief": "기존 Stop hook들은 exit code로 성공/실패를 판단한다",
        "if_wrong": "handler 인터페이스 재설계 필요",
        "impact": "major"
      },
      {
        "id": "A2",
        "belief": "settings.json Stop 블록에 여러 hook 등록 가능",
        "if_wrong": "단일 dispatcher 필수",
        "impact": "minor"
      }
    ],
    "decisions": [
      {
        "id": "D1",
        "decision": "case문 기반 dispatcher",
        "rationale": "handler 추가 시 1줄 추가, 가독성 높음",
        "alternatives_rejected": [
          { "option": "if-else chain", "reason": "handler 수 증가 시 가독성 저하" },
          { "option": "JSON lookup table", "reason": "과도한 추상화, 디버깅 어려움" }
        ]
      }
    ],
    "known_gaps": [
      {
        "gap": "자동 통합 테스트 없음",
        "severity": "medium",
        "mitigation": "hooks는 manual Claude session으로 테스트. 향후 sandbox 자동화 검토"
      }
    ]
  },

  "requirements": [
    {
      "id": "R1",
      "behavior": "stop-router SHALL dispatch to correct handler based on hook type",
      "priority": 1,
      "scenarios": [
        {
          "id": "R1.S1",
          "given": "hook type is 'chain'",
          "when": "stop-router.sh is invoked",
          "then": "chain handler executes and returns its exit code",
          "verified_by": "machine",
          "verify": {
            "type": "command",
            "run": "bash stop-router.sh chain",
            "expect": { "exit_code": 0 }
          }
        },
        {
          "id": "R1.S2",
          "given": "hook type is unknown (e.g. 'foo')",
          "when": "stop-router.sh is invoked",
          "then": "exits 0 without error, logs warning to stderr",
          "verified_by": "agent",
          "verify": {
            "type": "assertion",
            "checks": [
              "unknown type이 case문에서 default/*)로 빠지는지 확인",
              "exit 0이 명시적으로 호출되는지 확인",
              "stderr에 warning 메시지가 출력되는지 확인"
            ]
          }
        }
      ]
    },
    {
      "id": "R2",
      "behavior": "Each handler MUST be independently testable as a standalone script",
      "priority": 2,
      "scenarios": [
        {
          "id": "R2.S1",
          "given": "chain-handler.sh exists",
          "when": "bash -n is run against it",
          "then": "syntax check passes (exit 0)",
          "verified_by": "machine",
          "verify": {
            "type": "command",
            "run": "bash -n scripts/handlers/chain-handler.sh",
            "expect": { "exit_code": 0 }
          }
        }
      ]
    }
  ],

  "tasks": [
    {
      "id": "T1",
      "action": "Create stop-evaluate handler in dev-cli",
      "type": "work",
      "risk": "low",
      "file_scope": [
        "cli/src/handlers/stop-evaluate.js",
        "cli/dist/cli.js"
      ],
      "fulfills": ["R1"],
      "depends_on": [],
      "steps": [
        "Read existing chain-stop-hook.sh, rv-validator.sh, rph-loop.sh to extract exact logic",
        "Create stop-evaluate.js with evaluateChain/evaluateRv/evaluateRph functions",
        "Register 'stop-evaluate' in SUBCOMMANDS in dev-cli.js"
      ],
      "references": [
        { "path": "scripts/chain-stop-hook.sh", "start_line": 40, "end_line": 75 },
        { "path": "scripts/rv-validator.sh", "start_line": 23, "end_line": 36 },
        { "path": "scripts/rph-loop.sh", "start_line": 23, "end_line": 33 },
        { "path": "cli/src/handlers/chain-status.js" },
        { "path": "cli/dist/cli.js", "start_line": 7, "end_line": 33 }
      ],
      "inputs": [],
      "outputs": [
        { "id": "handler_path", "path": "cli/src/handlers/stop-evaluate.js" }
      ],
      "task_constraints": [
        { "type": "preserve_string", "target": "blockReason values in existing hooks" },
        { "type": "no_modify", "target": "loop-state.js" },
        { "type": "no_modify", "target": "chain-state.js" }
      ],
      "checkpoint": {
        "enabled": true,
        "message": "feat(dev-cli): add stop-evaluate handler for unified stop hook evaluation",
        "condition": "on_fulfill"
      }
    },
    {
      "id": "T2",
      "action": "Create stop-router.sh",
      "type": "work",
      "risk": "low",
      "file_scope": [
        "scripts/stop-router.sh"
      ],
      "fulfills": ["R1", "R2"],
      "depends_on": ["T1"],
      "steps": [
        "Create scripts/stop-router.sh: read stdin JSON, extract session_id + cwd",
        "Call dev-cli stop-evaluate with extracted params",
        "Make executable (chmod +x)"
      ],
      "references": [
        { "path": "scripts/rph-loop.sh" }
      ],
      "inputs": [
        { "from_task": "T1", "artifact": "handler_path" }
      ],
      "outputs": [
        { "id": "router_path", "path": "scripts/stop-router.sh" }
      ],
      "task_constraints": [
        { "type": "no_modify", "target": "dev-execute-stop-hook.sh" }
      ],
      "checkpoint": null
    },
    {
      "id": "T3",
      "action": "Update settings.json and remove old scripts",
      "type": "work",
      "risk": "medium",
      "file_scope": [
        ".claude/settings.json"
      ],
      "fulfills": [],
      "depends_on": ["T2"],
      "steps": [
        "Update .claude/settings.json: keep execute hook 1st, add stop-router.sh 2nd",
        "Remove chain-stop-hook.sh, rv-validator.sh, rph-loop.sh from settings and disk"
      ],
      "references": [
        { "path": ".claude/settings.json", "start_line": 100, "end_line": 121 }
      ],
      "inputs": [
        { "from_task": "T2", "artifact": "router_path" }
      ],
      "outputs": [],
      "task_constraints": [
        { "type": "no_modify", "target": "dev-execute-stop-hook.sh" }
      ],
      "checkpoint": {
        "enabled": true,
        "message": "refactor(hooks): consolidate chain/rv/rph stop hooks into single stop-router",
        "condition": "always"
      }
    },
    {
      "id": "T4",
      "action": "Verify R1 scenarios",
      "type": "verification",
      "risk": "low",
      "file_scope": [],
      "fulfills": ["R1"],
      "depends_on": ["T2", "T3"],
      "steps": [
        "Run R1.S1 machine verification",
        "Run R1.S2 agent assertion checks"
      ],
      "references": [],
      "inputs": [
        { "from_task": "T1", "artifact": "handler_path" },
        { "from_task": "T2", "artifact": "router_path" }
      ],
      "outputs": [],
      "task_constraints": [
        { "type": "read_only", "target": "all files" }
      ],
      "checkpoint": null
    },
    {
      "id": "T5",
      "action": "Verify R2 scenarios and constraints",
      "type": "verification",
      "risk": "low",
      "file_scope": [],
      "fulfills": ["R2"],
      "depends_on": ["T3"],
      "steps": [
        "Run R2.S1 machine verification",
        "Verify all constraints (C1, C2, C3)"
      ],
      "references": [],
      "inputs": [],
      "outputs": [],
      "task_constraints": [
        { "type": "read_only", "target": "all files" }
      ],
      "checkpoint": null
    }
  ],

  "constraints": [
    {
      "id": "C1",
      "type": "must_not_do",
      "rule": "block reason 텍스트를 변경하지 않는다",
      "verified_by": "agent",
      "verify": {
        "type": "assertion",
        "checks": [
          "git diff에서 blockReason 문자열이 변경되지 않았는지 확인",
          "새 handler의 blockReason이 기존과 byte-for-byte 동일한지 확인"
        ]
      }
    },
    {
      "id": "C2",
      "type": "preserve",
      "rule": "기존 execute hook의 동작이 유지되어야 한다",
      "verified_by": "machine",
      "verify": {
        "type": "command",
        "run": "bash scripts/dev-execute-init-hook.sh",
        "expect": { "exit_code": 0 }
      }
    },
    {
      "id": "C3",
      "type": "must_not_do",
      "rule": "허용 경로 외 파일 수정 금지 (scripts/, .claude/settings.json, cli/ 만 허용)",
      "verified_by": "machine",
      "verify": {
        "type": "command",
        "run": "git diff --name-only | grep -vcE '^(scripts/|.claude/settings.json|cli/)' || true",
        "expect": { "exit_code": 0, "stdout_contains": "0" }
      }
    }
  ]
}
```

### state.json 예시 (별도 파일)

```json
{
  "$schema": "dev-state/v1",
  "spec_ref": "spec.json",
  "spec_hash": "sha256:a1b2c3d4e5f6...",

  "tasks": {
    "T1": { "status": "done", "owner": "worker-1", "started_at": "...", "completed_at": "..." },
    "T2": { "status": "done", "owner": "worker-1", "started_at": "...", "completed_at": "..." },
    "T3": { "status": "in_progress", "owner": "worker-1", "started_at": "..." },
    "T4": { "status": "pending" },
    "T5": { "status": "blocked_by", "blocked_by": ["T3"] }
  },

  "verifications": {
    "R1.S1": { "passed": null },
    "R1.S2": { "passed": null },
    "R2.S1": { "passed": null }
  },

  "assumptions": {
    "A1": { "verified": false },
    "A2": { "verified": true, "verified_at": "2026-03-04T10:30:00Z" }
  },

  "history": [
    { "action": "task_started", "task": "T1", "by": "worker-1", "at": "2026-03-04T10:05:00Z" },
    { "action": "task_completed", "task": "T1", "by": "worker-1", "at": "2026-03-04T10:30:00Z" }
  ]
}
```

### state.json task.status 상태머신

```
pending → in_progress → done
                      → blocked_by (depends_on 미완료 시)
```

- `pending`: 아직 시작되지 않음
- `in_progress`: Worker가 작업 중
- `done`: 완료
- `blocked_by`: depends_on에 명시된 task가 아직 done이 아님 (+ `blocked_by` 필드에 task ID 목록)

---

## v3→v4 변경 요약

| 항목 | v3 | v4 | 이유 |
|------|----|----|------|
| `strength` 필드 | `"must"` | **제거** | behavior의 RFC2119 키워드가 유일 소스 |
| `status` (spec내) | `"pending"` | **state.json으로 이동** | 계약/현황 분리 |
| `verified` (assumptions) | spec 내 boolean | **state.json으로 이동** | 런타임 상태 |
| `checkpoint.condition` | 자유 텍스트 | enum: `always\|on_fulfill\|manual` | 파싱 가능 |
| `expect` | `"exit_0"` 문자열 | 객체: `{exit_code, stdout_contains?, ...}` | 표현력 확장 |
| `references[]` | 문자열 | 객체: `{path, start_line?, end_line?}` | 포맷 명확화 |
| `task_constraints[]` | 자유 텍스트 | typed: `{type, target}` | machine-check 가능 |
| `deliverables[]` | 문자열 | 객체: `{path, description}` | 구조화 |
| `interview` | 단일 문자열 | 배열: `[{topic, decision}]` | 항목별 분리 |
| `known_gaps[]` | 문자열 | 객체: `{gap, severity, mitigation}` | 심각도+대응 포함 |
| `alternatives_rejected` | 문자열 배열 | 객체: `[{option, reason}]` | 거부 사유 포함 |
| `assumptions[].impact` | 없음 | `minor\|major\|critical` | 영향도 명시 |
| `meta.source` | 의미 불명 | `derived_from`으로 변경 | 명확화 |
| `meta.workflow_notes` | 용도 불명 | **제거** | 불필요 |
| `verify.check` (assertion) | 단일 문자열 | `checks[]` 체크리스트 | 판정 편차 축소 |
| T2 (1 task) | 3개 action 묶음 | T2+T3으로 분리 | 원자성 강화 |
| T3 (1 verification) | 6개 검증 묶음 | T4+T5로 분리 | 실패 지점 추적 |
| scope_boundary | 별도 type | **제거** → `meta.non_goals` + `tasks[].file_scope` | orthogonality 개선 |

---

## Agent Council Review History

### Schema v1 Review (24/30 → APPROVE)

Members: Codex(OpenAI), Chairman(Claude). Gemini 429 실패.

| Rubric | Codex | Claude | 합의 |
|--------|-------|--------|------|
| R1 모호함 제거 | 4 | 4 | 4 |
| R2 검증/재현 | 4 | 4 | 4 |
| R3 Task 원자성 | 4 | 4 | 4 |
| R4 제약 명확성 | 4 | 4 | 4 |
| R5 중복 제거 | 5 | 5 | 5 |
| R6 내용 누락 | **3** | **3** | **3** |
| TOTAL | 24 | 24 | 24/30 |

**v1 주요 약점:** context/assumptions/decisions 누락, verify가 plain string

### v1→v2 변경사항 (Schema 내부 버전)

1. `context` 섹션 신설 (summary, assumptions[], decisions[])
2. `verify` string → typed object ({type, run/check/ask, expect})
3. `tasks[].checkpoint: boolean` 추가

### Schema v2 Review (25.5/30 → APPROVE, +1.5)

| Rubric | Codex | Claude | 합의 | v1→v2 |
|--------|-------|--------|------|-------|
| R1 모호함 제거 | 4 | 4 | 4 | = |
| R2 검증/재현 | **5** | **5** | **5** | **+1** |
| R3 Task 원자성 | 4 | 4 | 4 | = |
| R4 제약 명확성 | 4 | 4.5 | 4 | = |
| R5 중복 제거 | 4 | 5 | 4.5 | -0.5 |
| R6 내용 누락 | **4** | **4.5** | **4** | **+1** |
| TOTAL | 25 | 27 | 25.5/30 | +1.5 |

### Schema v3 Review (21/30 — 더 엄격한 기준 적용)

Members: Codex(GPT-5.3), Chairman(Claude Opus 4.6). Gemini 429 실패.

**주의:** v2보다 점수가 낮은 이유는 평가 기준이 변경됨. v2까지는 "스키마 설계 자체"만 평가, v3부터는 "실전 3-agent 시스템 작동 가능성"까지 포함.

| Rubric | Codex | Claude | 합의 |
|--------|-------|--------|------|
| R1 모호함 제거 | 3 | 3.5 | 3 |
| R2 검증/재현 | 4 | 4 | 4 |
| R3 Task 원자성 | 3 | 3 | 3 |
| R4 제약 명확성 | 3 | 3.5 | 3 |
| R5 중복 제거 | 4 | 3.5 | 4 |
| R6 내용 누락 | 4 | 4.5 | 4 |
| TOTAL | 21 | 22 | 21/30 |

**v3 주요 약점 (v4에서 해결):**
- behavior vs strength 중복 → strength 제거
- status/verified가 spec에 혼재 → state.json 분리
- checkpoint.condition 자유 텍스트 → enum
- references/task_constraints 비구조화 → 객체화
- T2 원자성 부족 → T2/T3 분리
- T3 verification 묶음 → T4/T5 분리
- scope_boundary vs file_scope 충돌 → scope_boundary 제거, non_goals + file_scope로 대체

### v3→v4 핵심 변경 근거

| 문제 카테고리 | v3 이슈 수 | v4 해결 수 |
|-------------|-----------|-----------|
| 치명적 모호함 | 5 | 5 (전수 해결) |
| 중간 모호함 | 7 | 7 (전수 해결) |
| 경미 모호함 | 7 | 7 (전수 해결) |
| 구조적 문제 | 1 (spec/state 혼재) | 1 (분리 완료) |

---

## PLAN.md 대비 장단점

### 장점
1. **프로그래매틱 파싱** — Observer가 `jq`로 즉시 검증 (PLAN.md는 regex 파싱)
2. **경계 명시** — requirements/tasks/constraints 분리로 관심사 혼합 방지
3. **diff 추적** — JSON 구조 변경이 git diff로 명확
4. **자동 검증 파이프라인** — `verify.type: command` → CI/Observer 직결
5. **3중 중복 해결** — scenarios가 유일한 검증 소스
6. **계약/현황 분리** — spec은 불변, state는 자유 변경

### 단점
1. **작성 비용** — specify skill이 자동 생성해야 실용적
2. **탐색적 사고 기록 약화** — 자유 서술이 구조화 필드로 축소
3. **raw 가독성** — 사람이 직접 읽기에는 PLAN.md가 더 편함
4. **스키마 강제 필요** — JSON Schema 없이는 "구조화된 마크다운"에 불과

---

## Next Steps

### Phase 1: Schema + cli (DONE)

- [x] JSON Schema validation 파일 작성 (dev-spec-v4.schema.json, dev-state-v1.schema.json)
- [x] cli에 spec/state 조작 커맨드 구현
  - `cli spec validate` — spec.json을 schema로 검증
  - `cli state init` — spec.json에서 state.json 초기 생성
  - `cli state update T1 --done` — state.json 업데이트
  - `cli state check` — spec_hash 정합성 + orphan key 검증
  - `cli state sync` — spec 변경 후 state 동기화
  - `cli feedback create "message"` — feedback 파일 생성
  - `cli spec amend --reason fb-001` — spec 수정 (placeholder)

### Phase 2: /specify 통합 + Observer/Coordinator

- [ ] /specify skill에서 spec.json v4 + state.json 생성 흐름 구현
- [ ] Observer agent가 spec.json + state.json을 읽고 feedback.json을 작성하는 프로토타입
- [ ] Coordinator가 feedback → spec amend 흐름 구현
- [ ] pre-commit hook: spec/state 직접 수정 차단 (cli 경유만 허용)
- [ ] lint 규칙: inputs[].artifact ↔ outputs[].id 교차 검증
- [ ] lint 규칙: tasks[].file_scope 중복 경고 (cli spec check에 구현 완료)
