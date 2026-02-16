# hoyeon

Claude Code plugin for automated Spec-Driven Development (SDD). Plan, create PRs, execute tasks, and extract learnings — all through an orchestrated skill pipeline.

## Core Workflow

```
/specify → /open → /execute → /publish → /compound
```

| Step | Skill | What it does |
|------|-------|-------------|
| 1 | `/specify` | Interview-driven planning. Gathers requirements, runs parallel analysis (gap-analyzer, tradeoff-analyzer, verification-planner, external-researcher), Codex strategic synthesis, generates `PLAN.md` with plan-reviewer approval. |
| 2 | `/open` | Creates a Draft PR on `feat/{name}` branch from the approved spec. |
| 3 | `/execute` | Orchestrator reads `PLAN.md`, creates Tasks per TODO, delegates to worker agents, verifies results, Codex code review gate, commits atomically. |
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
| `/specify` | "plan this" | Interview → DRAFT.md → PLAN.md with plan-reviewer approval |
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
| `/tribunal` | "review this" | 3-perspective adversarial review (Risk/Value/Feasibility → APPROVE/REVISE/REJECT) |
| `/skill-session-analyzer` | "analyze session" | Post-hoc validation of skill execution |

### Worktree Management
| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/init` | "initialize config" | Scan project, create `.dev/config.yml`, install hy CLI |
| `/worktree` | "워크트리 만들어줘" | Create, navigate, monitor, and cleanup git worktrees |

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `worker` | Sonnet | Implements delegated TODOs (code, tests, fixes) |
| `gap-analyzer` | Haiku | Identifies missing requirements and pitfalls before planning |
| `tradeoff-analyzer` | Sonnet | Evaluates risk (LOW/MED/HIGH), simpler alternatives, over-engineering warnings |
| `verification-planner` | Sonnet | 4-Tier testing model (Unit/Integration/E2E/Agent Sandbox) 기반 검증 전략 수립, A/H-items 분류, 외부 의존성 전략 |
| `docs-researcher` | Sonnet | Searches internal docs (ADRs, READMEs, configs) for conventions and constraints |
| `external-researcher` | Sonnet | Researches external libraries, frameworks, and official docs |
| `ux-reviewer` | Sonnet | UX 관점에서 변경사항 평가 — 단순성, 직관성, UX regression 방지. specify 초기에 실행 |
| `plan-reviewer` | Opus | Evaluates plans for clarity, verifiability, completeness, structural integrity |
| `git-master` | Sonnet | Enforces atomic commits following project style |
| `codex-strategist` | Haiku | Calls Codex CLI to cross-check analysis reports and find blind spots in /specify |
| `code-reviewer` | Sonnet | Multi-model code reviewer that runs Gemini, Codex, and Claude reviews in parallel, then synthesizes converged verdict |
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
              • /worktree create {name} — 격리 작업 (spec 자동 이동)
              • /open — Draft PR 생성
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
  ├── For each TODO:
  │   ├── Worker agent (implementation)
  │   ├── Verify (3 checks: functional, static, runtime)
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

## Worktree Management

Parallel feature development using git worktrees with isolated Claude sessions.

### Setup

```bash
/init  # Scan project, create .dev/config.yml, install hy CLI
```

Creates `.dev/config.yml`:
```yaml
worktree:
  copy_files: [.env.local]  # Files to copy to new worktrees
  base_dir: ".worktrees/{name}"
  post_command: "claude"  # Or set HY_POST_COMMAND env var
```

### Commands

| Command | Purpose |
|---------|---------|
| `hy` | Interactive: show status + select worktree to open |
| `hy create <name>` | Create worktree with spec move from main |
| `hy go <name>` | Navigate to worktree + run post_command |
| `hy status` | Show all worktrees with PLAN progress |
| `hy path <name>` | Print worktree path (for scripting) |
| `hy cleanup <name>` | Remove worktree and optionally delete branch |

### Workflow

```
/specify feature-name → Plan approved
    ↓
/worktree create feature-name  # Spec moves to worktree
    ↓
hy go feature-name  # cd + claude (or custom post_command)
    ↓
/execute  # In worktree
```

### Status Table

```
#   NAME                 PROGRESS             CHANGES  BEHIND   SESSIONS   PR
-   ----                 --------             -------  ------   --------   --
1   auth                 3/5 ███░░            2        0        2          #42
2   payment              5/5 █████            0        3        0          -
```

## Project Structure

```
.claude/
├── skills/          # Skill definitions (SKILL.md per skill)
├── agents/          # Agent definitions (frontmatter + system prompt)
└── scripts/         # Hook scripts (bash)

.dev/
├── config.yml       # Worktree configuration (committed)
├── specs/{name}/    # Per-feature specs
│   ├── PLAN.md
│   └── context/     # learnings.md, decisions.md, issues.md, outputs.json
├── local.json       # Worktree identity metadata (git-ignored)
└── state.local.json # Session tracking state (git-ignored)

.worktrees/          # Feature worktrees (git-ignored)
└── {name}/          # Each worktree has its own .dev/local.json

scripts/
└── hy             # Standalone CLI for worktree management

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
