# hoyeon

[English](README.md) | 한국어 | [中文](README.zh.md) | [日本語](README.ja.md)

**All you need is requirements.**
의도에서 요구사항을 도출하고, 모든 도출 과정을 검증하며, 추적 가능한 코드를 만들어내는 Claude Code 플러그인 — 계획을 직접 작성할 필요가 없습니다.

[![npm](https://img.shields.io/npm/v/@team-attention/hoyeon-cli)](https://www.npmjs.com/package/@team-attention/hoyeon-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[빠른 시작](#빠른-시작) · [철학](#요구사항은-작성하는-것이-아니다) · [도출 체인](#도출-체인) · [명령어](#명령어) · [에이전트](#스물한-개의-사고)

---

> *AI는 무엇이든 만들 수 있다. 어려운 것은 무엇을 만들어야 하는지 정확히 아는 것이다.*

대부분의 AI 코딩은 **출력**이 아니라 **입력**에서 실패한다. 병목은 AI의 능력이 아니다. 인간의 명확성이다. "다크 모드 추가해줘"라고 말하면, 그 세 단어 뒤에는 백 가지 결정이 숨어 있다.

대부분의 도구는 그 결정들을 사전에 나열하도록 강요하거나, 아예 무시한다. Hoyeon은 둘 다 하지 않는다 — 그것들을 **도출**한다. 레이어별로. 게이트별로. 의도에서 검증된 코드까지.

---

## 요구사항은 작성하는 것이 아니다

> *적절한 질문을 받기 전까지는, 자신이 무엇을 원하는지 모른다.*

요구사항은 코딩 전에 만들어내는 산출물이 아니다. 의도에 대한 구조화된 질문을 통해 드러나는 **발견**이다. 모든 "기능 추가"에는 말하지 않은 가정이 숨어 있다. 모든 "버그 수정"에는 아직 이름 붙이지 않은 근본 원인이 숨어 있다.

Hoyeon의 역할은 당신이 말하지 않은 것을 찾아내는 것이다.

```
  You say:     "add dark mode toggle"
                    │
  Hoyeon asks: "System preference or manual?"     ← assumption exposed
               "Which components need variants?"   ← scope clarified
               "Persist where? How?"               ← decision forced
                    │
  Result:      3 requirements, 7 scenarios, 4 tasks — all with verify commands
```

이것은 단순한 프로세스가 아니다. AI 코딩이 어떻게 작동해야 하는지에 대한 세 가지 신념 위에 구축되었다.

### 1. 태스크보다 요구사항이 먼저다

> *요구사항을 제대로 잡으면, 코드는 저절로 작성된다. 잘못 잡으면, 아무리 많은 코드로도 고칠 수 없다.*

대부분의 AI 도구는 곧바로 태스크로 뛰어든다 — "파일 X 생성, 함수 Y 수정." 하지만 태스크는 파생물이다. 요구사항이 바뀌면 태스크도 바뀐다. 태스크부터 시작하면, 모래 위에 짓는 것이다.

Hoyeon은 **목표**에서 출발하여 레이어 체인을 따라 아래로 도출한다:

```
Goal → Decisions → Requirements → Scenarios → Tasks
```

코드 한 줄이 작성되기 전에 요구사항은 다양한 각도에서 정제된다. 인터뷰어가 가정을 파헤치고, 갭 분석기가 누락된 것을 찾고, UX 리뷰어가 사용자 영향을 점검하고, 트레이드오프 분석기가 대안을 저울질한다. 각 관점이 요구사항을 날카롭게 다듬어, 검증 가능한 시나리오를 생성할 수 있을 만큼 정밀하게 만든다.

체인은 방향성이 있다: **요구사항이 태스크를 생성하지, 그 반대는 절대 아니다.** 요구사항이 바뀌면 시나리오와 태스크는 재도출된다. Hoyeon이 실행 중 블로커를 만나도 복구할 수 있는 이유가 바로 이것이다 — 요구사항은 여전히 유효하고, 태스크만 조정하면 된다.

### 2. 설계에 의한 결정론

> *LLM은 비결정적이다. 그것을 둘러싼 시스템까지 그럴 필요는 없다.*

같은 프롬프트를 두 번 주면 LLM은 다른 코드를 생성할 수 있다. 이것이 AI 지원 개발의 근본적 과제다. Hoyeon의 답: 비결정성이 전파되지 않도록 **프로그래밍적 제어로 LLM을 제약**한다.

세 가지 메커니즘이 이를 강제한다:

- **`spec.json`이 단일 진실 공급원** — 모든 에이전트가 같은 구조화된 스펙에서 읽고 쓴다. 어떤 에이전트도 자체적으로 컨텍스트를 만들어내지 않는다. 대화 안에만 존재하는 정보는 없다. 스펙은 컨텍스트 윈도우, 압축, 에이전트 핸드오프를 넘어 살아남는 공유 메모리다.

- **CLI 강제 구조** — `hoyeon-cli`는 `spec.json`에 대한 모든 병합을 검증한다. 필드명, 타입, 필수 관계 — 모두 LLM이 데이터를 보기 전에 프로그래밍적으로 검사된다. CLI는 구조를 제안하지 않는다; 잘못된 구조를 **거부**한다.

- **계약으로서의 도출 체인** — Goal → Decisions → Requirements → Scenarios → Tasks는 연결되어 있다. 각 레이어는 상위 레이어를 참조한다. 시나리오는 요구사항으로 추적되고, 태스크는 시나리오로 추적된다. 체인이 끊기면 게이트가 차단한다. 이것의 의미: **유효한 요구사항이 있으면, 시스템은 결과를 만들어낸다** — LLM의 개별 출력이 달라지더라도 결정론적으로 라우팅된다.

LLM이 창의적 작업을 한다. 시스템이 그것을 궤도 위에 유지한다.

### 3. 기본적으로 기계 검증 가능

> *사람이 확인해야 한다면, 시스템이 자동화에 실패한 것이다.*

`spec.json`의 모든 시나리오는 `verified_by` 분류를 가진다:

```json
{
  "given": "user clicks dark mode toggle",
  "when": "toggle is activated",
  "then": "theme switches to dark",
  "verified_by": "machine",
  "verify": { "type": "command", "run": "npm test -- --grep 'dark mode'" }
}
```

시스템은 모든 것을 `machine` 검증 쪽으로 밀어붙인다. AC Quality Gate는 각 시나리오를 검토하고 `human` 항목을 가능한 한 `machine`으로 전환할 것을 제안한다. 다중 모델 코드 리뷰(Codex + Gemini + Claude)가 독립적으로 실행되어 합의된 판정을 내린다. 독립 검증자가 격리된 컨텍스트에서 완료 기준을 점검하여 자기 검증 편향을 제거한다.

인간 리뷰는 기계가 진정으로 판단할 수 없는 것에만 사용된다 — UX 느낌, 비즈니스 로직 정확성, 네이밍 결정. 나머지는 모두 자동으로, 매번, 묻지 않고 실행된다.

---

이것들은 포부가 아니다. 아키텍처에 의해 강제된다 — CLI가 잘못된 스펙을 거부하고, 게이트가 미검증 레이어를 차단하고, 훅이 쓰기를 보호하고, 에이전트가 격리 상태에서 검증한다. 시스템은 **올바른 일을 하는 것이 가장 쉬운 길**이 되도록 설계되었다.

---

## 실제로 보기

```
You:  /specify "add dark mode toggle to settings page"

  Hoyeon interviews you (scenario-based):
  ├─ "User opens the app at night — should it auto-detect OS dark mode or require a manual toggle?"
  ├─ "User switches to dark mode mid-session — should charts/images also invert?"
  └─ derives implications: CSS variables needed, localStorage for persistence, prefers-color-scheme media query

  Agents research your codebase in parallel:
  ├─ code-explorer scans component structure
  ├─ docs-researcher checks design system conventions
  └─ ux-reviewer flags potential regression

  → spec.json generated:
    3 requirements, 7 scenarios, 4 tasks — all with verify commands

You:  /execute

  Hoyeon orchestrates:
  ├─ Worker agents implement each task in parallel
  ├─ Verifier 에이전트가 태스크별 시나리오를 독립 검증
  ├─ Code review: Codex + Gemini + Claude (multi-model consensus)
  └─ Final Verify: goal + constraints + AC — holistic check

  → Done. Every file change traced to a requirement.
```

<details>
<summary><strong>방금 무슨 일이 일어난 건가?</strong></summary>

```
/specify → 인터뷰가 숨겨진 가정을 드러냄
           → 에이전트들이 코드베이스를 병렬로 조사
           → 레이어별 도출: L0→L1→L2→L3→L4→L5
           → 각 레이어는 CLI 검증 + 에이전트 리뷰로 게이팅

/execute → 오케스트레이터가 spec.json을 읽고 병렬 워커를 디스패치
           → 독립 Verifier가 각 시나리오를 기계적으로 점검
           → 다중 모델 코드 리뷰가 합의된 판정을 도출
           → Final Verify가 목표, 제약 조건, AC를 전체적으로 점검
           → 완전한 추적성을 가진 원자적 커밋
```

의도에서 증명까지 체인이 실행되었다. 모든 도출이 검증되었다.

</details>

---

## 도출 체인

여섯 개의 레이어. 각각 이전 레이어에서 도출된다. 각각 다음 레이어가 시작되기 전에 게이팅된다.

```
  L0: Goal           "add dark mode toggle"
   ↓  ◇ gate         목표가 명확한가?
  L1: Context        코드베이스 분석, UX 리뷰, 문서 조사
   ↓  ◇ gate         컨텍스트가 충분한가?
  L2: Decisions      시나리오 인터뷰 → 함의 도출 (L2.5)
   ↓  ◇ gate         결정이 정당화되었는가?
  L3: Requirements   R1: "Toggle switches theme" → scenarios + verify
   ↓  ◇ gate         요구사항이 완전한가? (AC Quality Gate)
  L4: Tasks          T1: "Add toggle component" → file_scope, AC
   ↓  ◇ gate         태스크가 모든 요구사항을 커버하는가?
  L5: Review         plan-reviewer + step-back gate-keeper
```

각 게이트에는 두 가지 검사가 있다:
- **병합 체크포인트** — CLI가 구조와 완전성을 검증
- **게이트키퍼** — 에이전트 팀이 범위 이탈, 사각지대, 불필요한 복잡성을 리뷰

둘 다 통과하지 않으면 다음으로 진행할 수 없다. 체인은 가장 약한 고리만큼만 강하다 — 그래서 모든 고리를 검증한다.

### 스펙 계약

`spec.json`이 단일 진실 공급원이다. 모든 것이 여기서 읽고, 모든 것이 여기에 쓴다.

```json
{
  "meta": { "goal": "...", "mode": { "depth": "standard" } },
  "context": { "research": {}, "decisions": [{ "implications": [] }], "assumptions": [] },
  "requirements": [{
    "behavior": "Toggle switches between light and dark theme",
    "scenarios": [{
      "given": "user is on settings page",
      "when": "user clicks dark mode toggle",
      "then": "theme switches to dark mode",
      "verified_by": "machine",
      "verify": { "type": "command", "run": "npm test -- --grep 'dark mode'" }
    }]
  }],
  "tasks": [{ "id": "T1", "action": "...", "acceptance_criteria": {} }]
}
```

증거의 사슬: **requirement → scenario → verify command → pass/fail**. 의도에서 증명까지.

---

## 실행 엔진

오케스트레이터가 `spec.json`을 읽고 병렬 워커 에이전트를 디스패치한다:

```
  ┌─────────────────────────────────────────────────────┐
  │  /execute                                           │
  │                                                     │
  │  Worker T1 ──→ Verifier T1 ──→ Commit T1             │
  │  Worker T2 ──→ Verifier T2 ──→ Commit T2  (parallel)│
  │  Worker T3 ──→ Verifier T3 ──→ Commit T3             │
  │       │                                             │
  │       ▼                                             │
  │  Code Review (Codex + Gemini + Claude)              │
  │       │  independent reviews → synthesized verdict  │
  │       ▼                                             │
  │  Final Verify                                       │
  │    ✓ goal alignment                                 │
  │    ✓ constraint compliance                          │
  │    ✓ acceptance criteria                            │
  │    ✓ requirement coverage                           │
  │       │                                             │
  │       ▼                                             │
  │  Report                                             │
  └─────────────────────────────────────────────────────┘
```

워커는 구현하고, 독립 Verifier 에이전트가 각 시나리오의 `verify_plan`을 기계적으로 실행한다 — 판단 없음, 바이패스 없음. 샌드박스 시나리오에는 인라인 레시피(웹, 서버, CLI, 데이터베이스)가 제공된다.

### 스펙은 살아 있다

> *적응할 수 없는 스펙은 버려질 스펙이다.*

`spec.json`은 계획 시점에 고정된 정적 문서가 아니다. 실행 중에도 진화하는 **살아 있는 계약**이다 — 엄격하고 결정론적인 범위 안에서.

워커가 실제 코드베이스가 계획의 가정과 다르다는 것을 발견하면, 스펙이 적응한다:

```
  spec.json at plan time:
    tasks: [T1, T2, T3]           ← 3 planned tasks

  Worker T2 hits a blocker:
    "T2 requires a util function that doesn't exist"
       │
       ▼
  System derives T2-fix:
    tasks: [T1, T2, T3, T2-fix]   ← spec grows, append-only
       │
       ▼
  T2-fix executes → T2 retries → passes
    tasks: [T1 ✓, T2 ✓, T3 ✓, T2-fix ✓]
```

이것이 **제한된 적응**이다 — 스펙은 성장하지만 변이하지 않는다. 세 가지 규칙이 결정론을 유지한다:

- **추가 전용** — 기존 태스크는 절대 수정되지 않고, 새 태스크만 추가된다. 원래 계획은 감사 추적으로 그대로 유지된다.
- **깊이 1 제한** — 파생된 태스크는 추가 태스크를 파생할 수 없다. 한 단계의 적응만 허용하며, 연쇄적 확장은 없다. 이것은 스펙이 통제 불능의 복잡성으로 빠지는 것을 방지한다.
- **서킷 브레이커** — 경로당 최대 재시도 횟수를 초과하면 사용자에게 에스컬레이션한다. 시스템은 언제 시도를 멈추고 도움을 요청해야 하는지 안다.

핵심 통찰: **실행 중에 요구사항은 변하지 않는다 — 태스크만 변한다.** 도출 체인을 통해 검증된 목표, 결정, 요구사항은 안정적으로 유지된다. 태스크는 가장 하위 레이어일 뿐이며, 재도출 비용이 가장 낮다. 레이어 위계가 중요한 이유가 바로 이것이다: 레이어가 높을수록 더 안정적이다.

```
  실행 중 안정:
    L0: Goal           ← 잠김
    L1: Context        ← 잠김
    L2: Decisions      ← 잠김
    L3: Requirements   ← 잠김
    L3: Scenarios      ← 잠김 (verify commands 그대로 실행)

  실행 중 적응 가능:
    L4: Tasks          ← 성장 가능 (추가 전용, 깊이 1 제한)
```

스펙은 미래를 예측하지 않는다. 미래를 견뎌낸다 — 어디를 단단히 잡고, 어디를 유연하게 할지 알기 때문에.

---

## 스물한 개의 사고

스물한 개의 에이전트, 각각 다른 사고 방식. 직접 상호작용하지 않는다 — 스킬이 뒤에서 이들을 오케스트레이션한다.

| 에이전트 | 역할 | 핵심 질문 |
|-------|------|---------------|
| **Interviewer** | 질문만 한다. 절대 만들지 않는다. | *"아직 말하지 않은 것은?"* |
| **Gap Analyzer** | 문제가 되기 전에 누락된 것을 찾는다 | *"무엇이 잘못될 수 있는가?"* |
| **UX Reviewer** | 사용자 경험을 지킨다 | *"사람이 이것을 좋아할까?"* |
| **Tradeoff Analyzer** | 모든 선택지의 비용을 저울질한다 | *"무엇을 포기하는가?"* |
| **Debugger** | 증상이 아닌 근본 원인을 추적한다 | *"이것이 원인인가, 증상인가?"* |
| **Code Reviewer** | 다중 모델 합의 (Codex + Gemini + Claude) | *"세 전문가가 이것을 출시할까?"* |
| **Worker** | 스펙 정밀도로 구현한다 | *"이것이 요구사항과 일치하는가?"* |
| **Verifier** | 태스크별 독립 시나리오 검증 | *"코드가 모든 시나리오와 일치하는가?"* |
| **Ralph Verifier** | 독립적, 컨텍스트 격리된 완료 기준 점검 | *"정말로 끝난 것인가?"* |
| **Plan Reviewer** | 스펙 완전성과 품질을 검증한다 | *"계획이 목표를 커버하는가?"* |
| **External Researcher** | 라이브러리와 모범 사례를 조사한다 | *"실제로 어떤 근거가 있는가?"* |

<details>
<summary><strong>전체 21개 에이전트</strong></summary>

| 에이전트 | 역할 |
|-------|------|
| Interviewer | 소크라테스식 질문 — 질문만, 코드 없음 |
| Gap Analyzer | 누락된 요구사항 및 함정 탐지 |
| UX Reviewer | 사용자 경험 보호 및 리그레션 방지 |
| Tradeoff Analyzer | 리스크 평가 및 더 단순한 대안 제안 |
| Debugger | 버그 분류를 통한 근본 원인 분석 |
| Code Reviewer | 다중 모델 리뷰: Codex + Gemini + Claude → SHIP/NEEDS_FIXES |
| Worker | 스펙 기반 자체 검증으로 태스크 구현 |
| Verifier | verify_plan 기반 독립 시나리오 검증 (기계적, 바이패스 없음) |
| Ralph Verifier | 격리된 컨텍스트에서 독립적 완료 기준 검증 |
| Plan Reviewer | 스펙 품질 리뷰: 목표 정렬, 커버리지, 세분화 |
| External Researcher | 웹을 통한 라이브러리 조사 및 모범 사례 탐색 |
| Docs Researcher | 내부 문서 및 아키텍처 결정 탐색 |
| Code Explorer | 빠른 읽기 전용 코드베이스 검색 및 패턴 발견 |
| Git Master | 프로젝트 스타일 감지를 통한 원자적 커밋 강제 |
| AC Quality Gate | 인수 조건 검증 (반복, 최대 5라운드) |
| Phase2 Stepback | 계획 수립 전 범위 이탈 및 사각지대 탐지 |
| Verification Planner | 테스트 전략 설계 (Auto/Agent/Manual 분류) |
| Value Assessor | 긍정적 영향 및 목표 정렬 평가 |
| Risk Analyst | 취약점, 장애 모드, 엣지 케이스 탐지 |
| Feasibility Checker | 실제 구현 가능성 평가 |
| Codex Strategist | 교차 보고서 전략적 종합 및 사각지대 탐지 |

</details>

---

## 명령어

24개의 스킬 — Claude Code 안에서 호출하는 슬래시 명령어.

| 카테고리 | 하는 일 | 스킬 |
|----------|------------------|--------|
| **이해** | 요구사항 도출, 스펙 생성 | `/specify` `/quick-plan` `/discuss` `/deep-interview` `/mirror` |
| **조사** | 코드베이스 분석, 레퍼런스 탐색, 커뮤니티 스캔 | `/deep-research` `/dev-scan` `/reference-seek` `/google-search` `/browser-work` |
| **결정** | 트레이드오프 평가, 다중 관점 리뷰 | `/council` `/tribunal` `/tech-decision` `/stepback` |
| **구현** | 스펙 실행, 버그 수정, 반복 | `/execute` `/ralph` `/rulph` `/bugfix` `/ultrawork` |
| **성찰** | 변경 사항 검증, 교훈 추출 | `/check` `/compound` `/scope` `/issue` |

<details>
<summary><strong>주요 명령어 설명</strong></summary>

| 명령어 | 하는 일 |
|---------|--------------|
| `/specify` | 레이어 기반 인터뷰 → spec.json 도출 (L0→L5), 게이트키퍼 포함 |
| `/execute` | 스펙 기반 병렬 에이전트 디스패치 + 다중 모델 리뷰 + Final Verify |
| `/ultrawork` | 전체 파이프라인: specify → execute를 하나의 명령으로 |
| `/bugfix` | 근본 원인 진단 → 자동 생성 스펙 → execute (적응형 라우팅) |
| `/ralph` | 완료 기준 기반 반복 루프 — 독립적으로 검증될 때까지 계속 |
| `/council` | 다중 관점 심의: tribunal + 외부 LLM + 커뮤니티 스캔 |
| `/tribunal` | 3-에이전트 대립 리뷰: Risk + Value + Feasibility → 종합 판정 |
| `/scope` | 빠른 병렬 영향 분석 — 5개 이상의 에이전트가 깨질 수 있는 것을 스캔 |
| `/check` | 프로젝트 규칙 체크리스트에 대한 푸시 전 검증 |
| `/rulph` | 루브릭 기반 다중 모델 평가 + 자율적 자기 개선 |

</details>

---

## 내부 구조

**24개 스킬 · 21개 에이전트 · 18개 훅**

```
.claude/
├── skills/
│   ├── specify/       레이어 기반 스펙 도출 (L0→L5)
│   ├── execute/       스펙 기반 병렬 오케스트레이션
│   ├── bugfix/        근본 원인 → 스펙 → execute 파이프라인
│   ├── council/       다중 관점 심의
│   ├── tribunal/      3-에이전트 대립 리뷰
│   └── ...            19개 추가 스킬
├── agents/
│   ├── interviewer    소크라테스식 질문
│   ├── debugger       근본 원인 분석
│   ├── worker         태스크 구현
│   ├── code-reviewer  다중 모델 합의
│   └── ...            17개 추가 에이전트
├── scripts/           18개 훅 스크립트
│   ├── session        라이프사이클 관리
│   ├── guards         쓰기 보호, 계획 강제
│   ├── validation     출력 품질, 실패 복구
│   └── pipeline       Ultrawork 전환, 완료 기준 루프
└── cli/               spec.json 검증 & 상태 관리
```

**주요 내부 구성요소:**

- **도출 체인** — L0→L5, 각 전환마다 병합 체크포인트 + 게이트키퍼 팀
- **품질 게이트** — AC Quality Gate가 인수 조건을 반복적으로 검증 (최대 5라운드)
- **다중 모델 리뷰** — Codex + Gemini + Claude가 독립적으로 리뷰 후 SHIP/NEEDS_FIXES 판정 도출
- **훅 시스템** — 18개 훅이 파이프라인 전환, 쓰기 보호, 게이트 강제, 실패 복구를 자동화
- **검증 파이프라인** — CLI가 태스크별 verify_plan 생성; 전용 Verifier 에이전트가 인라인 샌드박스 레시피로 시나리오 실행
- **자기 개선** — 범위 블로커 → 런타임에 수정 태스크 도출 (추가 전용, 깊이 1, 서킷 브레이커)
- **Ralph 루프** — 완료 기준 기반 반복 + Stop 훅 재주입 + 독립적 컨텍스트 격리 검증

전체 파이프라인 다이어그램은 [docs/architecture.md](docs/architecture.md) 참조.

---

## 빠른 시작

```bash
# 플러그인 설치
claude plugin add team-attention/hoyeon
npm install -g @team-attention/hoyeon-cli

# 시작 — 요구사항을 도출하고 실행
/specify "add dark mode toggle to settings page"
/execute

# 또는 전체 파이프라인을 하나의 명령으로
/ultrawork "refactor auth module"

# 근본 원인 분석으로 버그 수정
/bugfix "login fails when session expires"
```

Claude Code에서 `/`를 입력하면 사용 가능한 모든 스킬을 볼 수 있다.

## CLI

`hoyeon-cli`는 spec.json 검증과 세션 상태를 관리한다:

```bash
hoyeon-cli spec init "project-name"        # 새 스펙 생성
hoyeon-cli spec merge spec.json --json ...  # 검증된 병합
hoyeon-cli spec check spec.json             # 완전성 확인
hoyeon-cli spec guide <section>             # 필드 구조 보기
```

전체 명령어 레퍼런스는 [docs/cli.md](docs/cli.md) 참조.

---

## 기여하기

기여를 환영합니다. 가이드라인은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

---

*"스펙은 미래를 예측하지 않는다. 미래를 견뎌낸다."*

**요구사항은 작성하는 것이 아니다 — 도출하는 것이다.**

`MIT License`
