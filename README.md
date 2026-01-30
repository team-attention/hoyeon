# oh-my-claude-code

Claude Code plugin for automated Spec-Driven Development (SDD). Plan, create PRs, execute tasks, and extract learnings — all through an orchestrated skill pipeline.

## Core Workflow

```
/specify → /open → /execute → /publish → /compound
```

| Step | Skill | What it does |
|------|-------|-------------|
| 1 | `/specify` | Interview-driven planning. Gathers requirements, runs parallel analysis (gap-analyzer, tradeoff-analyzer, verification-planner, external-researcher), generates `PLAN.md` with reviewer approval. |
| 2 | `/open` | Creates a Draft PR on `feat/{name}` branch from the approved spec. |
| 3 | `/execute` | Orchestrator reads `PLAN.md`, creates Tasks per TODO, delegates to worker agents, verifies results, commits atomically. |
| 4 | `/publish` | Converts Draft PR to Ready for Review. |
| 5 | `/compound` | Extracts learnings from completed PR into `docs/learnings/`. |

### One-shot: `/ultrawork`

Chains the entire pipeline automatically via Stop hooks:

```
/ultrawork feature-name
  → /specify (interview + plan)
  → /open (create Draft PR)
  → /execute (implement all TODOs)
```

## Skills

### Planning & Execution
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/specify` | "plan this" | Interview → DRAFT.md → PLAN.md with reviewer approval |
| `/open` | "create PR" | Draft PR creation from spec |
| `/execute` | "/execute" | Orchestrate TODO implementation via worker agents |
| `/publish` | "publish PR" | Draft → Ready for Review |
| `/ultrawork` | "/ultrawork name" | Full automated pipeline |

### State & Knowledge
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/state` | "PR status" | PR state management (queue, begin, pause, complete) |
| `/compound` | "document learnings" | Extract knowledge from completed PRs |

### Research & Analysis
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/tech-decision` | "A vs B" | Systematic tech comparison with multi-source research |
| `/dev-scan` | "community opinions" | Aggregate developer perspectives from Reddit, HN, Dev.to, Lobsters |
| `/skill-session-analyzer` | "analyze session" | Post-hoc validation of skill execution |

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `worker` | Sonnet | Implements delegated TODOs (code, tests, fixes) |
| `gap-analyzer` | Haiku | Identifies missing requirements and pitfalls before planning |
| `tradeoff-analyzer` | Sonnet | Evaluates risk (LOW/MED/HIGH), simpler alternatives, over-engineering warnings |
| `verification-planner` | Sonnet | Classifies verification as Agent-verifiable (A-items) vs Human-required (H-items), discovers external dependencies |
| `docs-researcher` | Sonnet | Searches internal docs (ADRs, READMEs, configs) for conventions and constraints |
| `external-researcher` | Sonnet | Researches external libraries, frameworks, and official docs |
| `reviewer` | Opus | Evaluates plans for clarity, verifiability, completeness, structural integrity |
| `git-master` | Sonnet | Enforces atomic commits following project style |

## /specify Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERVIEW MODE                           │
│                                                             │
│  Step 1: Initialize                                         │
│   • Intent 분류 (Refactoring/Feature/Bug/Arch/...)          │
│   • 병렬 에이전트:                                          │
│     ┌──────────┐ ┌──────────┐ ┌────────────────┐            │
│     │Explore #1│ │Explore #2│ │docs-researcher │            │
│     │패턴 탐색 │ │구조+명령 │ │ADR/컨벤션 탐색 │            │
│     └────┬─────┘ └────┬─────┘ └───────┬────────┘            │
│          └────────────┼───────────────┘                     │
│                       ▼                                     │
│  Step 1.5: 탐색 결과 요약                       🧑 HITL #1 │
│   → 사용자가 코드베이스 이해 확인                           │
│                       ▼                                     │
│  Step 2: 인터뷰                                 🧑 HITL #2 │
│   ASK: 경계조건, 트레이드오프, 성공기준                     │
│   PROPOSE: 탐색 기반 제안                                   │
│                       ▼                                     │
│  Step 3-4: DRAFT 업데이트 + 전환 준비                       │
│   (tech-decision 필요시)                        🧑 HITL #3 │
│                       │                                     │
│            사용자: "플랜 만들어줘"               🧑 HITL #4 │
└───────────────────────┼─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  PLAN GENERATION MODE                        │
│                                                             │
│  Step 1: Draft 완성도 검증                                   │
│                       ▼                                     │
│  Step 2: 병렬 분석 에이전트                                  │
│   ┌─────────────┐ ┌──────────────────┐ ┌────────────────┐   │
│   │gap-analyzer │ │tradeoff-analyzer │ │verification-   │   │
│   │누락/위험    │ │위험도/대안/과설계│ │planner         │   │
│   └──────┬──────┘ └────────┬─────────┘ │A/H-items,ExtDep│   │
│          │                 │           └───────┬────────┘   │
│          │         ┌───────────────┐           │            │
│          │         │external-      │           │            │
│          │         │researcher     │           │            │
│          │         │(선택적)       │           │            │
│          │         └───────┬───────┘           │            │
│          └─────────────────┼───────────────────┘            │
│                            ▼                                │
│   HIGH risk decision_points → 사용자 승인       🧑 HITL #5 │
│                       ▼                                     │
│  Step 3: 결정 요약 + 검증 전략 체크포인트       🧑 HITL #6 │
│   사용자 결정 + 자동 결정 + A/H-items 확인                  │
│                       ▼                                     │
│  Step 4: PLAN.md 생성                                        │
│   (Verification Summary + External Deps + TODOs + Risk)     │
│                       ▼                                     │
│  Step 4.5: Verification Summary 확인            🧑 HITL #6b│
│                       ▼                                     │
│  Step 5-6: Reviewer 검토 (+ Structural Integrity)            │
│   ┌────────┐                                                │
│   │reviewer│──OKAY──→ DRAFT 삭제 → 완료                     │
│   └───┬────┘                                                │
│       │REJECT                                               │
│       ├─ cosmetic → 자동 수정 → 재검토                      │
│       └─ semantic → 사용자 선택                 🧑 HITL #7  │
│           ├ 제안대로 수정                                    │
│           ├ 직접 수정                                        │
│           └ 인터뷰로 돌아가기                   🧑 HITL #8  │
└─────────────────────────────────────────────────────────────┘
                        ▼
              /open (Draft PR) 또는 /execute
```

**Human-in-the-Loop Checkpoints (9개):**

| # | 시점 | 목적 |
|---|------|------|
| 1 | 탐색 결과 요약 | 잘못된 전제 방지 |
| 2 | 인터뷰 질문 | 비즈니스 판단 |
| 3 | tech-decision | 기술 선택 |
| 4 | Plan 전환 | 명시적 사용자 의도 |
| 5 | HIGH risk 결정 | 되돌리기 어려운 변경 |
| 6 | 결정 요약 + 검증 전략 확인 | silent drift 방지 + 검증 방식 합의 |
| 6b | Verification Summary 확인 | A/H-items + External Deps 최종 확인 |
| 7 | Semantic REJECT | 범위/요구사항 변경 |
| 8 | 인터뷰 복귀 | 방향 전환 |

**Risk Tagging:** TODO별로 LOW/MEDIUM/HIGH 위험도 태그. HIGH(DB 스키마, 인증, breaking API)는 반드시 사용자 승인 + rollback 포함.

**Verification Strategy:** PLAN 최상단에 Verification Summary (A-items: Agent 자동 검증, H-items: Human 확인 필요) + External Dependencies Strategy (Pre-work/During/Post-work). A-items는 TODO Final의 Acceptance Criteria로 흘러감.

**Verification Block:** TODO마다 Functional/Static/Runtime 수락 기준, 실행 가능한 커맨드(`npm test`, `npm run typecheck`) 포함.

## Hook System

Hooks automate transitions and enforce quality:

| Hook Type | Script | Purpose |
|-----------|--------|---------|
| UserPromptSubmit | `ultrawork-init-hook.sh` | Initialize ultrawork pipeline state |
| Stop | `dev-specify-stop-hook.sh` | Transition specify → open |
| PostToolUse | `validate-output.sh` | Validate agent/skill output against `validate_prompt` |

## Execute Architecture

The `/execute` skill follows an Orchestrator-Worker pattern:

```
Orchestrator (reads PLAN.md)
  ├── Parse TODOs → Create Tasks with dependencies
  ├── Parallelize non-blocked Tasks
  └── For each TODO:
      ├── Worker agent (implementation)
      ├── Verify (3 checks: functional, static, runtime)
      ├── Context save (learnings, decisions, issues)
      └── git-master (atomic commit)
```

**Key rules:**
- Orchestrator never writes code — only delegates and verifies
- Plan checkboxes (`### [x] TODO N:`) are the single source of truth
- Failed tasks retry up to 3 times (reconciliation)
- Independent TODOs run in parallel

## Project Structure

```
.claude/
├── skills/          # Skill definitions (SKILL.md per skill)
├── agents/          # Agent definitions (frontmatter + system prompt)
└── scripts/         # Hook scripts (bash)

.dev/
├── specs/{name}/    # Per-feature specs
│   ├── PLAN.md
│   └── context/     # learnings.md, decisions.md, issues.md, outputs.json
└── state.local.json # Session state (git-ignored)

docs/
└── learnings/           # Knowledge extracted from development
    └── lessons-learned.md
```

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook and tool behavior gotchas discovered during development.
