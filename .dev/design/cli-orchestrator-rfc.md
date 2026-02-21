# RFC: CLI-Based Orchestrator Architecture

> **Status**: Draft
> **Date**: 2026-02-20
> **Scope**: /specify, /execute, /ultrawork skills refactoring
> **Author**: hoyeonlee + Claude (Agent Council: Codex, Gemini)

---

## 1. Problem Statement

### Current Pain Points

| Problem | Impact |
|---------|--------|
| SKILL.md가 거대함 (specify: 1150줄, execute: 1647줄) | 로드 시 컨텍스트 ~2200줄 소비 |
| 모든 오케스트레이션 로직이 프롬프트에 녹아있음 | LLM이 1000줄+ 지시를 정확히 따라야 함 |
| 서브에이전트 결과가 메인 컨텍스트에 전부 반환됨 | 분석 에이전트 4개 × 200줄 = 800줄 추가 |
| Context compaction 시 흐름이 끊김 | 상태가 컨텍스트에만 있어서 복구 불가 |
| Hook 시스템이 자체 상태를 관리함 | state.local.json과 SKILL.md 상태가 이원화 |
| 모드 추가 시 SKILL.md의 Mode Gate가 누적됨 | 새 모드 = 프롬프트 복잡도 증가 |

### Goal

**프롬프트 기반 오케스트레이션 → CLI 기반 오케스트레이션으로 전환**

- 메인 에이전트 컨텍스트 최소화 (~200줄 → ~20줄)
- Deterministic한 작업은 CLI가 처리
- Context compact 후에도 즉시 복구 가능
- 모드 추가 = 새 YAML 파일 하나 (프롬프트 변경 없음)

---

## 2. Core Architecture

### 2.1 Two-Layer Model

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1: CLI (Brain) — Orchestration                     │
│                                                          │
│  dev-cli (Node.js)                                       │
│  • state.json 관리 (single source of truth)               │
│  • Recipe 실행 (블록 시퀀싱, 엔진 루프)                     │
│  • 파일 R/W (DRAFT, PLAN, findings, analysis)             │
│  • 검증 (completeness check, schema validation)           │
│  • 변환 (DRAFT → PLAN mapping)                            │
│  • Policy enforcement (retry limits, depth limits)        │
└────────────────────────┬─────────────────────────────────┘
                         │ state.json
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 2: Hooks (Guardrails) — Safety                     │
│                                                          │
│  5 hooks (down from 18)                                  │
│  • PreToolUse: Edit/Write 차단 (phase 기반)                │
│  • PostToolUse: validate-output                          │
│  • SessionEnd: 최종 정리                                   │
│  • Hooks는 state.json만 읽음, 자체 상태 없음                │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Deterministic vs Non-Deterministic Split

| Deterministic (CLI) | Non-Deterministic (LLM/Subagents) |
|---|---|
| Mode selection / flag parsing | Intent classification |
| State management (state.json) | Codebase exploration |
| Draft creation from template | User interview |
| Draft section updates | Analysis (gap, tradeoff, verify) |
| Draft completeness validation | Codex strategic synthesis |
| DRAFT → PLAN transformation | Plan review |
| Plan Approval Summary generation | TODO content authoring |
| File/directory management | Fix prompt generation |
| Retry/depth limit enforcement | Scope violation judgment |
| Variable substitution (${todo-N.outputs}) | Verify result interpretation |
| Task queue/graph operations | Summary/report writing |

### 2.3 State Machine Model

이 아키텍처는 본질적으로 **State Machine** 패턴이다.

| State Machine 개념 | RFC 대응 |
|---|---|
| **State** | Block (init, interview, analyze-full...) |
| **Transition** | `dev-cli next` 반환값 |
| **Event** | LLM의 action 완료 (`step complete`) |
| **Guard** | Mode gate (quick/standard, interactive/autopilot) |
| **Entry Action** | Block의 instruction 실행 |
| **Extended State** | `state.json` (context data) |

Sequential Recipe = **Flat State Machine** (linear block sequence with guards).
Engine Recipe = **Hierarchical State Machine** (engine state contains todo graph sub-machine).
Meta Recipe = **State Machine Composition** (phase chaining across child machines).

### 2.4 Ping-Pong Pattern (with Pending/Ack)

CLI 안에 LLM은 없다. LLM(메인 에이전트)이 CLI를 호출하고, CLI가 다음 지시를 반환한다.
**Transition atomicity**: LLM이 action을 완료하고 `step complete`로 ack해야만 state가 advance한다.

```
Main Agent (LLM)              CLI (dev-cli)
────────────────              ─────────────
│                              │
├── dev-cli next ────────────→ │ reads state.json
│                              │ if pendingAction exists && !acknowledged:
│                              │   return SAME instruction (idempotent)
│                              │ finds next block
│                              │ if deterministic: execute + advance
│                              │ if LLM needed: set pendingAction, return instruction
│  ←── { action, instruction } │
│                              │
├── [LLM performs action]      │
│   (classify / dispatch /     │
│    ask user / write JSON)    │
│                              │
├── dev-cli step complete ───→ │ pendingAction.acknowledged = true
│                              │ advance to next block
│  ←── { ok }                  │
│                              │
├── dev-cli next ────────────→ │ ...repeat
│  ←── { next instruction }    │
│                              │
└── (until { done: true })     │
```

**Failure recovery**: Context compaction이나 세션 중단 후에도 `pendingAction`이 state.json에 남아있으므로 `dev-cli next`가 같은 instruction을 재반환. LLM은 "처음 보는 것처럼" 수행하면 됨.

**CLI-only blocks**: `type: cli` 블록은 pendingAction 없이 즉시 실행 + advance. LLM 개입이 없으므로 atomicity 문제 없음.

---

## 3. Block + Recipe + Engine

### 3.1 Blocks

재사용 가능한 작업 단위. 각 블록은 하나의 역할만 수행한다.

| Block | Type | Description |
|-------|------|-------------|
| `init` | cli | 프로젝트 초기화 (state.json, DRAFT.md 생성) |
| `classify-intent` | llm | 사용자 요청 → 의도 분류 |
| `explore-full` | subagent | 4 agents (explore×2, docs, ux) |
| `explore-lite` | subagent | 2 agents (explore×2) |
| `interview` | llm-loop | 사용자와 대화, exit: draft validate |
| `auto-assume` | cli | Quick 모드: 자동 가정 생성 |
| `decision-confirm` | llm | Decision Summary 확인 |
| `analyze-full` | subagent | 4 agents (gap, tradeoff, verify, external) |
| `analyze-lite` | subagent | 1 agent (tradeoff-lite) |
| `codex-synth` | subagent | Codex strategic synthesis |
| `generate-plan` | llm+cli | LLM: plan-content.json 작성, CLI: PLAN.md 렌더링 |
| `review-full` | subagent-loop | plan-reviewer, max N rounds |
| `review-once` | subagent | plan-reviewer, 1 round |
| `summary` | cli | Plan Approval Summary 추출/포맷팅 |
| `cleanup` | cli | DRAFT 삭제, state 정리 |
| `execution-engine` | engine | 동적 task graph loop (execute 전용) |

### 3.2 Block Types

| Type | Who acts | LLM involvement | Default onError |
|------|----------|-----------------|-----------------|
| `cli` | CLI 자체 실행 | 없음 (결과만 반환) | halt |
| `llm` | Main agent 판단 | instruction에 따라 수행 | halt |
| `llm-loop` | Main agent 반복 | exit_check 통과까지 반복 | halt |
| `llm+cli` | LLM 작성 → CLI 처리 | JSON 작성 후 CLI에 넘김 | halt |
| `subagent` | Main agent가 Task() dispatch | 서브에이전트 실행 | continue |
| `subagent-loop` | Main agent가 반복 dispatch | 조건 만족까지 반복 | halt |
| `engine` | CLI 내부 loop (execute 전용) | handler별로 LLM/subagent 호출 | (engine policies) |

**`onError` 정책**: Recipe에서 block별로 override 가능.

| Policy | 동작 |
|--------|------|
| `halt` | 에러 시 워크플로우 중단, 사용자에게 보고 |
| `continue` | 에러 로그 후 다음 블록으로 진행 (subagent 부분 실패 허용) |
| `retry` | 같은 블록 재시도 (max 2) |

### 3.3 Recipes

레시피는 블록들의 조합. 모드별로 다른 레시피 파일.

#### Sequential Recipe (specify)

```yaml
# recipes/specify-standard-interactive.yaml
name: specify-standard-interactive
type: sequential
description: Full planning with user interaction

blocks:
  - id: init
    type: cli
    command: "dev-cli init {name} --standard --interactive"

  - id: classify-intent
    type: llm
    instruction: |
      Classify user intent. Categories:
      Feature / Bug / Refactor / Architecture / Migration / Performance / Research
    save: "dev-cli draft update {name} --section intent"

  - id: explore-full
    type: subagent
    agents:
      - type: Explore
        promptHint: "Find existing patterns for {intent}"
        output: "findings/explore-1.md"
      - type: Explore
        promptHint: "Find project structure + commands"
        output: "findings/explore-2.md"
      - type: docs-researcher
        promptHint: "Find ADRs, conventions, constraints"
        output: "findings/docs.md"
      - type: ux-reviewer
        promptHint: "Evaluate UX impact"
        output: "findings/ux.md"
    parallel: true
    onComplete: "dev-cli draft import {name}"
    onError: continue          # 개별 agent 실패 시 나머지 결과로 진행

  - id: interview
    type: llm-loop
    instruction: |
      Present exploration summary to user.
      Ask about: boundaries, trade-offs, success criteria.
      Minimize questions, maximize proposals based on research.
    save: "dev-cli draft update {name} --section decisions"
    exitCheck: "dev-cli draft validate {name}"
    onError: halt              # 인터뷰 실패 시 중단

  - id: decision-confirm
    type: llm
    instruction: "Present Decision Summary. Ask user to confirm."

  - id: analyze-full
    type: subagent
    agents:
      - type: gap-analyzer
        output: "analysis/gap.md"
      - type: tradeoff-analyzer
        output: "analysis/tradeoff.md"
      - type: verification-planner
        output: "analysis/verify.md"
    parallel: true

  - id: codex-synth
    type: subagent
    agents:
      - type: codex-strategist
        output: "analysis/codex.md"
        readsFrom: ["analysis/gap.md", "analysis/tradeoff.md", "analysis/verify.md"]

  - id: generate-plan
    type: llm+cli
    instruction: "Write plan-content.json with TODO details"
    command: "dev-cli plan generate {name} --data plan-content.json"

  - id: review-full
    type: subagent-loop
    agents:
      - type: plan-reviewer
    maxRounds: 3
    exitWhen: "result contains OKAY"

  - id: summary
    type: cli
    command: "dev-cli plan summary {name}"

  - id: cleanup
    type: cli
    command: "dev-cli cleanup {name}"
```

```yaml
# recipes/specify-quick-autopilot.yaml
name: specify-quick-autopilot
type: sequential

blocks:
  - id: init
    type: cli
    command: "dev-cli init {name} --quick --autopilot"

  - id: classify-intent
    type: llm
    instruction: "Classify intent"
    save: "dev-cli draft update {name} --section intent"

  - id: explore-lite
    type: subagent
    agents:
      - type: Explore
        output: "findings/explore-1.md"
      - type: Explore
        output: "findings/explore-2.md"
    parallel: true
    onComplete: "dev-cli draft import {name}"

  # interview 없음
  # decision-confirm 없음

  - id: auto-assume
    type: cli
    command: "dev-cli draft auto-assume {name}"

  - id: analyze-lite
    type: subagent
    agents:
      - type: tradeoff-analyzer
        output: "analysis/tradeoff.md"
        promptVariant: lite

  # codex-synth 없음

  - id: generate-plan
    type: llm+cli
    instruction: "Write plan-content.json"
    command: "dev-cli plan generate {name} --data plan-content.json"

  - id: review-once
    type: subagent
    agents:
      - type: plan-reviewer
    maxRounds: 1

  - id: summary
    type: cli
    command: "dev-cli plan summary {name}"

  - id: cleanup
    type: cli
    command: "dev-cli cleanup {name}"
```

#### Engine Recipe (execute)

```yaml
# recipes/execute-standard.yaml
name: execute-standard
type: engine
block: execution-engine

config:
  depth: standard
  handlers:
    state_begin: state-begin   # PR only
    worker: worker
    verify: verify
    wrap_up: wrap-up
    commit: commit
    code_review: code-review
    final_verify: final-verify
    state_complete: state-complete  # PR only
    report: report
  policies:
    max_retries: 3
    adapt_depth_limit: 1
    max_dynamic_todos: 3
    parallel_limit: 4
    triage_precedence: [halt, adapt, retry]
    verify_enabled: true
    code_review_enabled: true
    final_verify_enabled: true
```

```yaml
# recipes/execute-quick.yaml
name: execute-quick
type: engine
block: execution-engine

config:
  depth: quick
  handlers:
    state_begin: state-begin
    worker: worker
    wrap_up: wrap-up
    commit: commit
    state_complete: state-complete
    report: report
  policies:
    max_retries: 0
    adapt_depth_limit: 0
    parallel_limit: 4
    verify_enabled: false
    code_review_enabled: false
    final_verify_enabled: false
```

#### Meta-Recipe (ultrawork)

```yaml
# workflows/ultrawork.yaml
name: ultrawork
type: meta
description: End-to-end specify → open → execute pipeline

phases:
  - name: plan
    recipe: specify-standard-interactive
  - name: pr
    recipe: open-pr
  - name: implement
    recipe: execute-standard

errorPolicy:
  onFail: halt
  # 향후 확장: retry_phase, skip_phase, rollback_phase
```

---

## 4. State Management

### 4.1 state.json Schema

```jsonc
{
  "schemaVersion": 1,
  "name": "add-auth",
  "recipe": "specify-standard-interactive",

  // Mode
  "mode": {
    "depth": "standard",       // standard | quick
    "interaction": "interactive" // interactive | autopilot
  },

  // Skill identifier (for hook guards)
  "skill": "specify",            // specify | execute | open

  // Workflow position
  "phase": "interview",         // recipe type에 따라 다름
  "currentBlock": "interview",
  "blockIndex": 3,              // sequential recipe에서 현재 위치

  // Pending action (transition atomicity)
  "pendingAction": {
    "block": "interview",
    "action": "llm-loop",
    "instruction": "Ask about boundaries, trade-offs, criteria",
    "issuedAt": "2026-02-20T10:05:00Z",
    "acknowledged": false       // LLM이 step complete 호출 전까지 false
  },

  // Step tracking
  "steps": {
    "init":              { "status": "done", "at": "2026-02-20T10:00:00Z" },
    "classify-intent":   { "status": "done", "at": "2026-02-20T10:01:00Z" },
    "explore-full":      { "status": "done", "at": "2026-02-20T10:03:00Z" },
    "interview":         { "status": "running", "at": "2026-02-20T10:05:00Z" }
  },

  // Subagent tracking
  "agents": {
    "explore-1":       { "status": "done", "outputHash": "sha256:abc...", "at": "..." },
    "explore-2":       { "status": "done", "outputHash": "sha256:def...", "at": "..." },
    "docs-researcher": { "status": "done", "outputHash": "sha256:123...", "at": "..." },
    "ux-reviewer":     { "status": "done", "outputHash": "sha256:456...", "at": "..." }
  },

  // Input hashes for stale detection
  "inputHashes": {
    "DRAFT.md": "sha256:...",
    "analysis/gap.md": "sha256:..."
  },

  // Review tracking
  "reviewRounds": 0,

  // Event log (for debugging & recovery)
  "events": [
    { "type": "init", "at": "2026-02-20T10:00:00Z", "data": { "recipe": "specify-standard-interactive" } },
    { "type": "step-complete", "step": "classify-intent", "at": "2026-02-20T10:01:00Z" },
    { "type": "agent-done", "agent": "explore-1", "at": "2026-02-20T10:02:30Z" },
    { "type": "agent-done", "agent": "explore-2", "at": "2026-02-20T10:02:45Z" }
  ],

  // Meta-recipe tracking (ultrawork only)
  "workflow": {
    "name": "ultrawork",
    "currentPhase": "plan",
    "phaseIndex": 0
  },

  // Error tracking
  "lastError": null,             // 마지막 에러 (디버깅용)

  // CLI metadata
  "cliVersion": "0.1.0",        // dev-cli 버전 (schema 호환성)
  "recipeHash": "sha256:...",   // recipe 파일 해시 (변경 감지)

  "createdAt": "2026-02-20T10:00:00Z",
  "updatedAt": "2026-02-20T10:05:00Z"
}
```

### 4.2 Execution Engine State (execute 전용)

```jsonc
{
  // ... 기본 schema 위에 추가 ...

  "engine": {
    "todos": [
      {
        "id": "todo-1",
        "title": "Create JWT config",
        "status": "done",       // pending | running | done | failed | stale
        "substeps": {
          "worker":  { "status": "done", "at": "..." },
          "verify":  { "status": "done", "at": "..." },
          "wrapUp":  { "status": "done", "at": "..." },
          "commit":  { "status": "done", "at": "..." }
        },
        "retries": 0,
        "dynamicTodos": []
      },
      {
        "id": "todo-2",
        "title": "Auth middleware",
        "status": "running",
        "dependsOn": ["todo-1"],
        "substeps": {
          "worker":  { "status": "running", "at": "..." },
          "verify":  { "status": "pending" },
          "wrapUp":  { "status": "pending" },
          "commit":  { "status": "pending" }
        },
        "retries": 0,
        "dynamicTodos": []
      }
    ],
    "finalize": {
      "residualCommit": { "status": "pending" },
      "codeReview":     { "status": "pending" },
      "finalVerify":    { "status": "pending" },
      "stateComplete":  { "status": "pending" },
      "report":         { "status": "pending" }
    },
    "outputs": {
      "todo-1": { "config_path": "./config/jwt.json" }
    }
  }
}
```

### 4.3 Context Compact Recovery

```bash
# 컨텍스트가 compact된 후 첫 턴:
$ dev-cli manifest add-auth

→ "Step: interview | Mode: standard/interactive | DRAFT: 5/8 filled
   (missing: boundaries, criteria) | Agents: 4/4 explore done, 0/4 analysis |
   Next: Continue interview — ask about boundaries and success criteria.
   Decisions so far: Auth=JWT, Routes=/api/users/*"
```

manifest 한 번으로 전체 상태 복구. SKILL.md의 "매 턴 시작시 manifest 호출" 지시만 있으면 됨.

---

## 5. Directory Structure

### 5.1 Active Spec Pointer

```
.dev/active-spec              ← 현재 활성 spec 이름 (plain text)
```

`dev-cli init`이 생성, `dev-cli cleanup`이 삭제. Guard hook은 이 파일로 어떤 spec의 state.json을 읽을지 결정. 동시에 하나의 spec만 active 가능 (multi-spec 동시 실행은 v2).

### 5.2 Per-Spec Directory

```
.dev/specs/{name}/
├── state.json              ← CLI가 관리하는 워크플로우 상태
├── DRAFT.md                ← 인터뷰 결과 (specify 완료 후 삭제)
├── PLAN.md                 ← 최종 플랜
├── plan-content.json       ← LLM이 작성한 TODO 내용 (PLAN 생성 입력)
├── findings/               ← 탐색 에이전트 출력
│   ├── explore-1.md
│   ├── explore-2.md
│   ├── docs.md
│   └── ux.md
├── analysis/               ← 분석 에이전트 출력
│   ├── gap.md
│   ├── tradeoff.md
│   ├── verify.md
│   └── codex.md
└── context/                ← execute 시 컨텍스트 (기존 유지)
    ├── outputs.json
    ├── learnings.md
    ├── issues.md
    ├── audit.md
    └── sandbox-report.md
```

### 5.3 CLI Project Structure

```
dev-cli/
├── package.json
├── bin/
│   └── dev-cli.js          ← CLI entry point
├── src/
│   ├── core/
│   │   ├── state.js        ← state.json CRUD, hash computation, atomic writes
│   │   ├── sequencer.js    ← Sequential block runner (specify)
│   │   ├── engine.js       ← Execution engine (execute) — dynamic loop
│   │   ├── workflow.js     ← Meta-recipe runner (ultrawork) — phase chaining
│   │   └── manifest.js     ← Context manifest generator
│   ├── blocks/
│   │   ├── init.js
│   │   ├── draft-update.js
│   │   ├── draft-import.js
│   │   ├── draft-validate.js
│   │   ├── auto-assume.js
│   │   ├── plan-generate.js
│   │   ├── plan-summary.js
│   │   ├── step-complete.js
│   │   ├── step-invalidate.js
│   │   └── cleanup.js
│   ├── handlers/           ← execute engine handlers
│   │   ├── worker.js       ← Worker dispatch instruction builder
│   │   ├── verify.js       ← Verify dispatch instruction builder
│   │   ├── triage.js       ← Policy enforcement (CLI-side)
│   │   ├── commit.js
│   │   ├── wrapup.js
│   │   ├── substitute.js   ← Variable substitution
│   │   └── dispatch.js     ← Parallel task management
│   └── utils/
│       ├── markdown.js     ← Markdown parsing/rendering (frontmatter aware)
│       ├── hash.js         ← SHA256 for stale detection
│       └── recipe-loader.js
├── recipes/
│   ├── specify-standard-interactive.yaml
│   ├── specify-standard-autopilot.yaml
│   ├── specify-quick-autopilot.yaml
│   ├── specify-quick-interactive.yaml
│   ├── execute-standard.yaml
│   ├── execute-quick.yaml
│   └── open-pr.yaml
└── workflows/
    └── ultrawork.yaml
```

---

## 6. CLI Commands

### 6.1 Core Commands

```bash
# Initialize a spec
dev-cli init <name> [--quick] [--autopilot] [--recipe <name>]

# Get next action (the loop driver)
dev-cli next <name>

# Get context manifest (for compact recovery)
dev-cli manifest <name>

# Get detailed status
dev-cli status <name>
```

### 6.2 Draft Commands

```bash
# Update a section of the draft
dev-cli draft update <name> --section <section> --data '<json>'

# Import findings from subagent output files
dev-cli draft import <name>

# Validate draft completeness
dev-cli draft validate <name>

# Auto-populate assumptions (quick/autopilot)
dev-cli draft auto-assume <name>
```

### 6.3 Plan Commands

```bash
# Generate PLAN.md from DRAFT + analysis + plan-content.json
dev-cli plan generate <name> --data <plan-content.json>

# Extract and format Plan Approval Summary
dev-cli plan summary <name>
```

### 6.4 Step Management

```bash
# Mark a step as complete
dev-cli step complete <name> --step <step> [--result <ok|fail>]

# Invalidate a step (marks downstream as stale)
dev-cli step invalidate <name> --step <step>
```

### 6.5 Analysis Commands

```bash
# Save analysis agent output (stdin → file)
dev-cli analysis save <name> --agent <type>
```

### 6.6 Lifecycle Commands

```bash
# Clean up after completion
dev-cli cleanup <name>
```

### 6.7 `dev-cli next` Response Format

```jsonc
// Pending action not yet acknowledged — returns SAME instruction (idempotent)
{ "action": "pending", "block": "classify-intent",
  "instruction": "Classify user intent...",
  "message": "Previous instruction not yet acknowledged. Call 'dev-cli step complete' first." }

// CLI-only block (auto-executed, no pendingAction needed)
{ "action": "cli-chain", "results": { "summary": "...", "cleanup": "done" }, "done": true }

// LLM judgment needed
{ "action": "llm", "block": "classify-intent",
  "instruction": "Classify user intent...",
  "saveWith": "dev-cli draft update {name} --section intent" }

// Subagent dispatch needed
{ "action": "dispatch-subagents", "block": "explore-full",
  "agents": [
    { "type": "Explore", "promptHint": "...", "output": "findings/explore-1.md" },
    ...
  ],
  "parallel": true,
  "onComplete": "dev-cli draft import {name}" }

// LLM loop (repeat until exit)
{ "action": "llm-loop", "block": "interview",
  "instruction": "Ask about boundaries, trade-offs, criteria",
  "draftSummary": { "patterns": "...", "commands": "..." },
  "saveWith": "dev-cli draft update {name} --section decisions",
  "exitCheck": "dev-cli draft validate {name}" }

// LLM writes then CLI processes
{ "action": "llm+cli", "block": "generate-plan",
  "instruction": "Write plan-content.json with TODO details",
  "context": { "workBreakdown": [...], "risks": {...} },
  "then": "dev-cli plan generate {name} --data plan-content.json" }

// Wait for user input
{ "action": "wait-for-user", "block": "transition-check",
  "message": "Draft complete. Waiting for user to say 'make it a plan'" }

// Execution engine instruction (execute only)
{ "action": "engine-dispatch", "block": "execution-engine",
  "tasks": [
    { "todoId": "todo-1", "substep": "worker", "type": "subagent",
      "agent": "worker", "prompt": "...", "parallel": true },
    { "todoId": "todo-3", "substep": "worker", "type": "subagent",
      "agent": "worker", "prompt": "...", "parallel": true }
  ] }
```

---

## 7. Subagent Output Format

### 7.1 Markdown + YAML Frontmatter (확정)

모든 서브에이전트 출력 파일은 이 형식을 따른다.

```markdown
---
agent: gap-analyzer
specName: add-auth
timestamp: 2026-02-20T10:15:00Z
schemaVersion: 1
summary: "Missing: rate limiting, input validation. Pitfalls: 2. Must-NOT-do: 3 items."
confidence: high
---

# Gap Analysis: add-auth

## Missing Requirements
- Rate limiting on new endpoints
- Input validation for JWT payload

## AI Pitfalls
- Do not hardcode JWT secret
- Do not skip token expiry validation

## Must NOT Do
- Do not modify existing public endpoints
- Do not add new npm dependencies
- Do not change the auth flow for existing users
```

### 7.2 Subagent Rules

서브에이전트는 반드시:
1. 전체 결과를 지정된 파일 경로에 `Write`
2. YAML frontmatter에 `agent`, `timestamp`, `summary` 포함
3. 메인 에이전트에는 **1-2줄 요약만 반환**

```
Task(subagent_type="gap-analyzer", prompt="""
...분석 지시...

## Output Rules
1. Write full analysis to .dev/specs/add-auth/analysis/gap.md
   - Include YAML frontmatter: agent, timestamp, summary, confidence
2. Return ONLY a 1-2 line summary to me.
   Example: "Missing: 2 items. Pitfalls: 2. Must-NOT-do: 3 items."
""")
```

### 7.3 Context Budget Effect

```
Before: Main context = SKILL.md(1150줄) + 4 agent results(800줄) = ~2000줄
After:  Main context = SKILL.md(20줄) + 4 summaries(4줄) + CLI responses(10줄) = ~35줄
```

---

## 8. Hook Integration

### 8.1 Hook Reduction: 18 → 5

| Hook | Type | Decision | Reason |
|------|------|----------|--------|
| `dev-plan-guard.sh` | PreToolUse | **Keep (simplify)** | state.json phase만 읽음 |
| `dev-orchestrator-guard.sh` | PreToolUse | **Keep (simplify)** | 같은 패턴 |
| `rph-dod-guard.sh` | PreToolUse | **Keep** | |
| `validate-output.sh` | PostToolUse | **Keep** | CLI가 못 잡는 도구 수준 검증 |
| `rph-cleanup.sh` | SessionEnd | **Keep** | CLI가 감지 불가 |
| `dev-specify-init-hook.sh` | PreToolUse | **Remove** | `dev-cli init` 대체 |
| `dev-execute-init-hook.sh` | PreToolUse | **Remove** | `dev-cli init` 대체 |
| `ultrawork-stop-hook.sh` | Stop | **Remove** | meta-recipe 대체 |
| `dev-specify-stop-hook.sh` | Stop | **Remove** | CLI cleanup 대체 |
| `dev-execute-stop-hook.sh` | Stop | **Remove** | CLI cleanup 대체 |
| `ultrawork-init-hook.sh` | UserPromptSubmit | **Remove** | `dev-cli init` 대체 |
| `dev-init-hook.sh` | UserPromptSubmit | **Remove** | `dev-cli init` 대체 |
| `rv-validator.sh` | Stop | **Move to CLI** | |
| `rph-loop.sh` | Stop | **Move to CLI** | |
| `rv-detector.sh` | UserPromptSubmit | **Move to CLI** | |
| `rph-detector.sh` | UserPromptSubmit | **Move to CLI** | |

### 8.2 Simplified Guard Hook Example

```bash
#!/bin/bash
# dev-plan-guard.sh (simplified — reads state.json only)
set -euo pipefail

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Resolve active spec via pointer file (avoids multi-spec ambiguity)
ACTIVE_SPEC_FILE="$CWD/.dev/active-spec"
if [[ ! -f "$ACTIVE_SPEC_FILE" ]]; then exit 0; fi
SPEC_NAME=$(cat "$ACTIVE_SPEC_FILE")
STATE_FILE="$CWD/.dev/specs/$SPEC_NAME/state.json"
if [[ ! -f "$STATE_FILE" ]]; then exit 0; fi

# Use "skill" field (top-level), not "phase" (which is block ID)
SKILL=$(jq -r '.skill // "none"' "$STATE_FILE" 2>/dev/null || echo "none")

# During specify skill, block edits outside .dev/
if [[ "$SKILL" == "specify" ]] && [[ "$FILE_PATH" != *".dev/"* ]]; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny"
    },
    "systemMessage": "PLAN MODE: File modification blocked. Use dev-cli to update specs."
  }'
else
  exit 0
fi
```

### 8.3 Why Hooks Still Matter

CLI가 대체할 수 없는 3가지:

| Event | Why CLI can't handle |
|-------|---------------------|
| PreToolUse (Edit/Write) | LLM이 CLI 무시하고 직접 파일 수정 시도 가능 |
| PostToolUse (validation) | CLI 경유하지 않는 도구 호출 검증 |
| SessionEnd | 세션 종료를 CLI가 감지 불가 |

---

## 9. SKILL.md (Thin Version)

### 9.1 /specify SKILL.md (~20 lines)

```markdown
---
name: specify
description: CLI-orchestrated planning workflow
allowed-tools: [Read, Grep, Glob, Task, Write, Bash, AskUserQuestion]
---

# /specify — CLI-Orchestrated Planning

## Rules
- Subagents: Write full results to designated file path. Return only 1-2 line summary.
- Subagent output format: Markdown with YAML frontmatter (agent, timestamp, summary).

## Flow
1. `dev-cli init {name} [--quick] [--autopilot]`
2. Loop: call `dev-cli next {name}` → follow the returned instruction
3. Until CLI returns `{ "done": true }`

## On Context Compaction
Call `dev-cli manifest {name}` to recover full state.
```

### 9.2 /execute SKILL.md (~20 lines)

```markdown
---
name: execute
description: CLI-orchestrated implementation workflow
allowed-tools: [Read, Grep, Glob, Task, Bash, Edit, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

# /execute — CLI-Orchestrated Implementation

## Rules
- DELEGATE: All code writing goes to Task(worker). You only manage state.
- Subagents: Write results to files, return summaries only.

## Flow
1. `dev-cli init {name} --execute [--quick]`
2. Loop: call `dev-cli next {name}` → follow the returned instruction
3. Until CLI returns `{ "done": true }`

## On Context Compaction
Call `dev-cli manifest {name}` to recover full state.
```

---

## 10. Concrete Flow Example: /specify "Add JWT auth"

```
Turn 1: User says "/specify Add JWT auth to API"

  LLM: Bash("dev-cli init add-auth --standard --interactive")
    → { status: "initialized" }
  LLM: Bash("dev-cli next add-auth")
    → { action: "llm", block: "classify-intent", instruction: "Classify intent..." }

Turn 2: LLM classifies

  LLM: (judgment) "New Feature"
  LLM: Bash("dev-cli draft update add-auth --section intent --data '{...}'")
  LLM: Bash("dev-cli step complete add-auth --step classify-intent")  ← ack
  LLM: Bash("dev-cli next add-auth")
    → { action: "dispatch-subagents", block: "explore-full", agents: [...] }

Turn 3: LLM dispatches 4 subagents

  LLM: Task(Explore, "write to findings/explore-1.md, return summary")
       Task(Explore, "write to findings/explore-2.md, return summary")
       Task(docs-researcher, "write to findings/docs.md, return summary")
       Task(ux-reviewer, "write to findings/ux.md, return summary")
  Context receives: 4 summary lines only

  LLM: Bash("dev-cli draft import add-auth")
  LLM: Bash("dev-cli next add-auth")
    → { action: "llm-loop", block: "interview", draftSummary: {...} }

Turn 4-6: Interview loop

  LLM ↔ User: "Auth method?" → "JWT"
  LLM: Bash("dev-cli draft update add-auth --section decisions --data '{...}'")
  LLM: Bash("dev-cli draft validate add-auth")
    → { ready: false, missing: ["criteria"] }
  LLM ↔ User: "Success criteria?" → "401 without token, pass with valid token"
  LLM: Bash("dev-cli draft update add-auth --section criteria --data '{...}'")
  LLM: Bash("dev-cli draft validate add-auth")
    → { ready: true }

Turn 7: User says "make it a plan"

  LLM: Bash("dev-cli next add-auth")
    → { action: "dispatch-subagents", block: "analyze-full", agents: [...] }

Turn 8: Analysis agents

  LLM: Task(gap-analyzer, "write to analysis/gap.md")
       Task(tradeoff-analyzer, "write to analysis/tradeoff.md")
       Task(verification-planner, "write to analysis/verify.md")
  Context: 3 summary lines

Turn 9: Plan generation

  LLM: Bash("dev-cli next add-auth")
    → { action: "llm+cli", instruction: "Write plan-content.json" }
  LLM: Write("plan-content.json", { todos: [...] })
  LLM: Bash("dev-cli plan generate add-auth --data plan-content.json")
    → { status: "generated", summary: "3 TODOs, risk: 0H/1M/2L" }

Turn 10: Review

  LLM: Bash("dev-cli next add-auth")
    → { action: "dispatch-subagent", block: "review-full", agent: { type: "plan-reviewer" } }
  LLM: Task(plan-reviewer, "Review PLAN.md")
    → "OKAY"
  LLM: Bash("dev-cli step complete add-auth --step review --result okay")
  LLM: Bash("dev-cli next add-auth")
    → { action: "cli-chain", results: { summary: "Plan approved!...", cleanup: "done" }, done: true }
  LLM → User: "Plan approved! [summary]"
```

---

## 11. Agent Council Review Summary

3회의 Council 리뷰(Codex + Gemini)에서 도출된 핵심 합의:

### Round 1: 기본 아키텍처

- **state.json 강화 필요**: inputHashes (stale data 감지), events log (디버깅), schemaVersion
- **서브에이전트 출력**: Markdown + YAML frontmatter (만장일치)
- **숨겨진 분기 로직 유실 주의**: Mode Gate 조건들을 CLI/recipe에 명시적 인코딩 필요
- **`dev-cli manifest` 명령 추가**: 매 턴 컨텍스트 복구용 초경량 요약
- **CLI step을 idempotent하게**: 같은 입력이면 같은 결과
- **`step invalidate` 명령 추가**: downstream을 stale로 마킹

### Round 2: Execute + Ultrawork

- **Execute는 engine block으로**: flat block list가 아닌 단일 "execution-engine" with handlers + policies config
- **레시피 3가지 유형**: Sequential (specify), Engine (execute), Meta (ultrawork)
- **Hybrid logic split**: CLI = hard rails (state, policy, limits), LLM = soft logic (judgment, interpretation)
- **Handler registry**: 새 handler = registry에 추가, orchestrator 변경 불필요
- **Phase chaining**: meta-recipe에서 `currentPhase` + `phaseIndex`로 추적

### Round 3: Hook 통합

- **Option C 만장일치**: CLI = Brain, Hooks = Guardrails
- **18 hooks → 5 hooks 축소**
- **Stop/Init hooks 제거**: CLI recipes가 대체
- **Guard hooks 단순화**: state.json만 읽는 15줄 스크립트로
- **CLI가 못하는 것**: PreToolUse interception, SessionEnd — hook 유지 필수
- **state.json = single source of truth**: hooks는 자체 상태 없음

---

## 12. Implementation Roadmap

### Phase 1: CLI 뼈대 (MVP)

- [ ] `dev-cli init`, `next`, `manifest`, `status` 구현
- [ ] state.json CRUD + atomic writes
- [ ] Sequential block runner (sequencer.js)
- [ ] Recipe loader (YAML → block sequence)

### Phase 2: Specify 블록 구현

- [ ] `draft update`, `draft import`, `draft validate` 구현
- [ ] `plan generate`, `plan summary` 구현
- [ ] `step complete`, `step invalidate` 구현
- [ ] `cleanup` 구현
- [ ] Specify recipes (standard-interactive, quick-autopilot)
- [ ] Thin SKILL.md 작성

### Phase 3: Hook 마이그레이션

- [ ] Guard hooks 단순화 (state.json 기반)
- [ ] Init/Stop hooks 제거
- [ ] hooks.json 업데이트

### Phase 4: Execute 엔진

- [ ] execution-engine (engine.js) 구현
- [ ] Handlers (worker, verify, triage, commit, wrapup, etc.)
- [ ] Variable substitution
- [ ] Dynamic task creation (adapt, code review fixes)
- [ ] Execute recipes (standard, quick)
- [ ] Thin SKILL.md 작성

### Phase 5: Ultrawork + Meta-Recipe

- [ ] Workflow runner (workflow.js) 구현
- [ ] Phase chaining with state tracking
- [ ] Error policy (halt, retry_phase)
- [ ] ultrawork.yaml

### Phase 6: 기존 스킬 전환

- [ ] 기존 specify SKILL.md → thin version 교체
- [ ] 기존 execute SKILL.md → thin version 교체
- [ ] 기존 ultrawork SKILL.md → thin version 교체
- [ ] 레거시 hook 스크립트 제거
- [ ] E2E 테스트

---

## 13. Open Questions

### Resolved (Council Review)

| # | Question | Resolution |
|---|----------|------------|
| 4 | `dev-cli next`의 idempotency 보장 방법 | **pendingAction 메커니즘**: `acknowledged: false`면 같은 instruction 재반환. `step complete`로 ack 후 advance. (Section 2.4, 4.1) |
| — | Guard hook의 phase 불일치 | **`skill` 필드 추가**: hook은 `state.skill` (specify/execute/open)을 체크. `phase`는 block ID이므로 hook guard에 부적합. (Section 8.2) |
| — | Multi-spec 동시 실행 시 hook 혼동 | **`.dev/active-spec` 포인터 파일**: `dev-cli init`이 생성, `cleanup`이 삭제. hook은 이 파일로 active spec 결정. (Section 5.1) |

### Open

| # | Question | Notes |
|---|----------|-------|
| 1 | Recipe YAML의 block instruction은 어디에? | 레시피 inline vs 별도 프롬프트 파일 참조 |
| 2 | `plan-content.json`의 정확한 schema | LLM이 작성하는 TODO 구조체 정의 필요 |
| 3 | CLI 배포 방식 | 플러그인 내 로컬 스크립트 vs npm global install |
| 5 | Stale data policy | inputHash 불일치 시 경고만? 차단? |
| 6 | 기존 .dev/specs/ 구조와의 호환성 | 마이그레이션 필요? |
| 7 | Engine handler 추가 시 recipe schema 변경 | handler registry 설계 상세 |
| 8 | Shadow Mode 구현 범위 | 기존 SKILL.md와 CLI next의 instruction 비교 dry-run (마이그레이션 안전망) |
| 9 | `userPreferences` 필드 설계 | "Always use Vitest" 같은 세션-지속 설정의 구조화 방법 |

---

## 14. Design Principles

1. **State Machine**: 워크플로우는 상태 머신이다. Block = State, Transition = `dev-cli next`, Guard = Mode Gate.
2. **CLI는 deterministic**: LLM call 없음. 같은 입력 → 같은 출력.
3. **state.json = single source of truth**: 모든 상태는 여기에. hooks도 여기서 읽음.
4. **Transition atomicity**: `pendingAction` + `step complete` ack로 state 전이를 원자적으로 보장.
5. **Subagent → file → summary**: 전체 결과는 파일에, 메인 컨텍스트에는 요약만.
6. **Recipe = workflow definition**: 모드 추가 = YAML 파일 추가. 코드 변경 없음.
7. **Compact-resilient**: `manifest` 한 번으로 전체 상태 복구. `pendingAction`이 남아있으면 재시도.
8. **Hooks = safety net**: CLI가 못 잡는 것만. 자체 상태 없음. `skill` 필드로 guard.
9. **Idempotent steps**: 재실행해도 안전함. `dev-cli next`는 같은 state에서 같은 결과 반환.

---

## 15. Agent Council Review (2026-02-20)

### Reviewers
- **Codex**: CONCERNS — Ping-pong 안정성, Recipe 표현력, state 스키마 미완성
- **Gemini**: APPROVE — 현재 시스템 기술적 한계 도달, RFC는 구조적 해법
- **Claude (Chairman)**: APPROVE WITH CONDITIONS

### Must-Fix (Applied)
1. ✅ **Pending/Ack 메커니즘** — `pendingAction` 필드 + `dev-cli next` idempotency (Section 2.4, 4.1)
2. ✅ **Guard hook phase 불일치** — `skill` 필드 기반 체크로 변경 (Section 4.1, 8.2)
3. ✅ **Multi-spec ambiguity** — `.dev/active-spec` 포인터 파일 (Section 5.1)

### Should-Fix (Applied)
4. ✅ Per-block `onError` 정책 (Section 3.2, recipes)
5. ✅ `cliVersion`, `recipeHash`, `lastError` 필드 (Section 4.1)

### Deferred
6. Shadow Mode (dry-run 비교) — Open Question #8
7. `userPreferences` 필드 — Open Question #9
8. Recipe YAML `when` guard — Engine block이 커버하므로 우선순위 낮음

### Key Insight: "Rigid Script vs Smart Agent" (Gemini)
CLI instruction이 너무 좁으면 LLM의 능동적 문제 해결 능력이 제한됨. `llm-loop` 블록의 instruction은 충분한 자유도를 제공해야 함. CLI는 "무엇을 할지"만 지시하고, "어떻게 할지"는 LLM에 위임.
