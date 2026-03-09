# hoyeon

Claude Code plugin for automated Spec-Driven Development (SDD). Plan, execute tasks, and extract learnings — all through an orchestrated skill pipeline.

## Core Workflow

```
/discuss → /specify → /execute → /compound
                                  ↑
/bugfix ──(circuit breaker)──→ /specify
```

| Step | Skill | What it does |
|------|-------|-------------|
| 0 | `/discuss` | Socratic discussion partner. Challenges assumptions, explores alternatives, and surfaces blind spots before planning. Saves insights for `/specify` handoff. |
| 1 | `/specify` | Interview-driven planning. Gathers requirements, runs parallel analysis (gap-analyzer, tradeoff-analyzer, verification-planner, external-researcher), Codex strategic synthesis, generates `PLAN.md` with plan-reviewer approval. |
| 2 | `/execute` | Orchestrator reads `PLAN.md`, creates Tasks per TODO, delegates to worker agents, verifies results, Codex code review gate, commits atomically. |
| 3 | `/compound` | Extracts learnings from completed PR into `docs/learnings/`. |

### One-shot: `/ultrawork`

Chains the entire pipeline automatically via Stop hooks:

```
/ultrawork feature-name
  → /specify (interview + plan)
  → /execute (implement all TODOs)
```

## Skills

### Planning & Execution
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/discuss` | "같이 생각해보자" | Socratic pre-planning exploration (DIAGNOSE → PROBE → SYNTHESIZE) |
| `/specify` | "plan this" | Interview → DRAFT.md → PLAN.md with plan-reviewer approval |
| `/execute` | "/execute" | Orchestrate TODO implementation via worker agents |
| `/ultrawork` | "/ultrawork name" | Full automated pipeline |

### State & Knowledge
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/compound` | "document learnings" | Extract knowledge from completed PRs |

### Bug Fixing
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/bugfix` | "/bugfix 에러 설명" | Root cause 기반 원샷 버그픽스. debugger 진단 → worker 수정 → verify → commit. 3회 실패 시 `/specify`로 에스컬레이션 |

### Research & Analysis
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/tech-decision` | "A vs B" | Systematic tech comparison with multi-source research |
| `/dev-scan` | "community opinions" | Aggregate developer perspectives from Reddit, X/Twitter, HN, Dev.to, Lobsters |
| `/tribunal` | "review this" | 3-perspective adversarial review (Risk/Value/Feasibility → APPROVE/REVISE/REJECT) |
| `/skill-session-analyzer` | "analyze session" | Post-hoc validation of skill execution |


## Agents

| Agent | Model | Role |
|-------|-------|------|
| `debugger` | Sonnet | Root cause 분석 전문. Backward call stack tracing, Bug Type 분류, Severity 판정 (SIMPLE/COMPLEX). Read-only |
| `worker` | Sonnet | Implements delegated TODOs (code, tests, fixes) |
| `gap-analyzer` | Haiku | Identifies missing requirements and pitfalls before planning |
| `tradeoff-analyzer` | Sonnet | Evaluates risk (LOW/MED/HIGH) with reversibility analysis, simpler alternatives, over-engineering warnings |
| `verification-planner` | Sonnet | 4-Tier testing model 기반 검증 전략 수립, A/H-items 분류, 외부 의존성 전략, sandbox drift 감지 및 bootstrapping 패턴 추천 |
| `docs-researcher` | Sonnet | Searches internal docs (ADRs, READMEs, configs) for conventions and constraints |
| `external-researcher` | Sonnet | Researches external libraries, frameworks, and official docs |
| `ux-reviewer` | Sonnet | UX 관점에서 변경사항 평가 — 단순성, 직관성, UX regression 방지. specify 초기에 실행 |
| `plan-reviewer` | Opus | Evaluates plans for clarity, verifiability, completeness, structural integrity |
| `git-master` | Sonnet | Enforces atomic commits following project style |
| `codex-strategist` | Haiku | Calls Codex CLI to cross-check analysis reports and find blind spots in /specify |
| `code-reviewer` | Sonnet | Multi-model code reviewer (Gemini + Codex + Claude in foreground parallel), synthesizes converged verdict |
| `codex-risk-analyst` | Haiku | /tribunal — adversarial risk analysis via Codex CLI (the challenger) |
| `value-assessor` | Sonnet | /tribunal — constructive value and goal alignment assessment |
| `feasibility-checker` | Sonnet | /tribunal — pragmatic feasibility and effort evaluation |

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
│          │      ┌─────────────┐       │                     │
│          │      │ux-reviewer  │       │                     │
│          │      │UX 영향 평가 │       │                     │
│          │      └──────┬──────┘       │                     │
│          └─────────────┼──────────────┘                     │
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
│  Step 2.5: Codex Strategic Synthesis (Standard mode only)   │
│   ┌─────────────────┐                                      │
│   │codex-strategist │ → 교차 검증, 블라인드 스팟 발견       │
│   └────────┬────────┘                                      │
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
│  Step 5-6: Plan-Reviewer 검토 (+ Structural Integrity)       │
│   ┌─────────────┐                                           │
│   │plan-reviewer│──OKAY──→ DRAFT 삭제 → 완료                │
│   └───┬────┘                                                │
│       │REJECT                                               │
│       ├─ cosmetic → 자동 수정 → 재검토                      │
│       └─ semantic → 사용자 선택                 🧑 HITL #7  │
│           ├ 제안대로 수정                                    │
│           ├ 직접 수정                                        │
│           └ 인터뷰로 돌아가기                   🧑 HITL #8  │
└─────────────────────────────────────────────────────────────┘
                        ▼
              다음 단계 선택:
              • /execute — 바로 구현 시작
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

**Risk Tagging:** TODO별로 LOW/MEDIUM/HIGH 위험도 태그 + 되돌림 가능성(Reversible/Irreversible) 분석. HIGH(DB 스키마, 인증, breaking API)는 반드시 사용자 승인 + rollback 포함.

**Verification Strategy:** PLAN 최상단에 Verification Summary (A-items: Agent 자동 검증, H-items: Human 확인 필요) + External Dependencies Strategy (Pre-work/During/Post-work). A-items는 TODO Final의 Acceptance Criteria로 흘러감.

**Verification Block:** TODO마다 Functional/Static/Runtime 수락 기준, 실행 가능한 커맨드(`npm test`, `npm run typecheck`) 포함.

## Hook System

Hooks automate transitions and enforce quality:

| Hook Type | Script | Purpose |
|-----------|--------|---------|
| UserPromptSubmit + PreToolUse(Skill) | `skill-session-init.sh` | Initialize session state for specify/execute |
| PreToolUse(Edit/Write) | `skill-session-guard.sh` | Plan guard (specify) / orchestrator guard (execute) |
| Stop | `skill-session-stop.sh` | Block exit if execute has incomplete tasks |
| SessionEnd | `skill-session-cleanup.sh` | Clean up session state files |
| UserPromptSubmit | `ultrawork-init-hook.sh` | Initialize ultrawork pipeline state |
| PostToolUse | `validate-output.sh` | Validate agent/skill output against `validate_prompt` |

## Execute Architecture

The `/execute` skill follows an Orchestrator-Worker pattern:

```
Orchestrator (reads spec.json via cli)
  ├── Parse tasks → Create Tasks with dependencies
  ├── Parallelize non-blocked Tasks
  ├── For each task:
  │   ├── Worker agent (implementation)
  │   ├── Verify (acceptance criteria checks)
  │   ├── Context save (learnings, decisions, issues)
  │   └── git-master (atomic commit)
  └── Finalize:
      ├── Residual Commit
      ├── Code Review (code-reviewer → SHIP/NEEDS_FIXES)
      ├── State Complete (PR mode)
      └── Report
```

**Key rules:**
- Orchestrator never writes code — only delegates and verifies
- Plan checkboxes (`### [x] TODO N:`) are the single source of truth
- Failed tasks retry up to 3 times (reconciliation)
- Independent TODOs run in parallel

## /bugfix — One-shot Bug Fixing

Root cause 기반 원샷 버그픽스. Adaptive mode가 debugger의 Severity 판정에 따라 파이프라인 depth를 자동 선택.

```
/bugfix "에러 설명"
  ├── Phase 1: DIAGNOSE
  │   ├── debugger + verification-planner (병렬)
  │   ├── [COMPLEX] gap-analyzer 추가
  │   └── User 확인 (Root Cause 맞는지)
  ├── Phase 2: FIX (max 3 attempts)
  │   ├── worker (최소 수정 + 리그레션 테스트)
  │   ├── Bash verify (A-items 독립 실행)
  │   └── 3회 실패 → Circuit Breaker → /specify 에스컬레이션
  └── Phase 3: REVIEW & COMMIT
      ├── [COMPLEX] code-reviewer (multi-model)
      └── git-master (atomic commit)
```

| Severity | Agents | 조건 |
|----------|--------|------|
| **SIMPLE** | 4개 (debugger, v-planner, worker, git-master) | 단일 파일, 명확한 원인 |
| **COMPLEX** | 6개 (+gap-analyzer, +code-reviewer) | 다중 파일, INTEGRATION, 보안 경로 |

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
└── state.local.json # Session tracking state (git-ignored)

docs/
└── learnings/           # Knowledge extracted from development
    └── lessons-learned.md
```

## Codex Integration

Cross-model strategy using OpenAI Codex CLI (`codex exec`) for adversarial analysis alongside Claude agents.

| Integration Point | Agent | When | Purpose |
|-------------------|-------|------|---------|
| `/specify` Step 2.5 | `codex-strategist` | After 4 analysis agents | Cross-check reports, find blind spots, surface contradictions |
| `/execute` Finalize | `code-reviewer` | After residual commit | Final quality gate code review (SHIP/NEEDS_FIXES) |
| `/tribunal` Risk | `codex-risk-analyst` | Parallel with 2 Claude agents | Adversarial risk analysis from a different model's perspective |

**Graceful degradation**: If `codex` CLI is unavailable, agents return SKIPPED/DEGRADED and the pipeline continues without blocking.

**Mode gate**: Codex steps run in Standard mode only. Quick mode skips them entirely.

## /tribunal — Adversarial Review

3-perspective review skill that evaluates any proposal (plan, PR, diff) from Risk, Value, and Feasibility angles simultaneously.

```
            ┌─ codex-risk-analyst (Codex)  ── "What can go wrong?"
Input ──────┼─ value-assessor (Claude)     ── "What value does this deliver?"
            └─ feasibility-checker (Claude) ── "Can this actually be built?"
                         ↓
               Synthesize → APPROVE / REVISE / REJECT
```

**Verdict matrix**: Risk (BLOCK/CAUTION/CLEAR) × Value (STRONG/ADEQUATE/WEAK) × Feasibility (GO/CONDITIONAL/NO-GO) → final verdict with required actions.

**Usage**: `/tribunal PLAN.md`, `/tribunal --pr 42`, `/tribunal --diff`

## Lessons Learned

See [docs/learnings/lessons-learned.md](docs/learnings/lessons-learned.md) for hook and tool behavior gotchas discovered during development.
