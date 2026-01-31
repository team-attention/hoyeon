# Testing Strategy: The 4-Tier Model

> Code tests verify correctness. Agent tests verify experience.

## Overview

Modern software testing is evolving beyond programmatic assertions. This document defines a 4-tier testing model that AI agents **must** reference when building verification strategies.

```
Tier 1: Unit          ─── code, programmatic, deterministic
Tier 2: Integration   ─── code, programmatic, deterministic
Tier 3: E2E           ─── code, programmatic, deterministic
Tier 4: Agent Sandbox ─── natural language, agentic, probabilistic
```

Tiers 1-3 answer **"does the code work?"**
Tier 4 answers **"does the product work for humans?"**

---

## Tier 1: Unit

**Nature**: Code → Deterministic pass/fail

Verifies individual functions, classes, and modules in isolation.

| Aspect | Detail |
|--------|--------|
| Interface | Code (Jest, Vitest, pytest, go test) |
| Execution | `pnpm test`, `pytest` |
| Determinism | 100% — same input, same output |
| Speed | Milliseconds |
| Scope | Single function or module |
| Mocks | External dependencies stubbed |

**Agent guidance**: Always run unit tests first. If they fail, stop and fix before proceeding.

## Tier 2: Integration

**Nature**: Code → Deterministic pass/fail

Verifies that modules work together — API routes, DB queries, service interactions.

| Aspect | Detail |
|--------|--------|
| Interface | Code (Supertest, API test suites) |
| Execution | `pnpm test:integration` |
| Determinism | 100% — requires stable test DB |
| Speed | Seconds |
| Scope | Multiple modules, real DB |
| Mocks | External APIs mocked, DB real |

**Agent guidance**: Requires sandbox DB running. Check `pnpm sandbox:status` before execution.

## Tier 3: E2E

**Nature**: Code → Deterministic pass/fail

Verifies complete user flows through the real stack — browser, server, database.

| Aspect | Detail |
|--------|--------|
| Interface | Code (Playwright, Cypress, Selenium) |
| Execution | `pnpm test:e2e` |
| Determinism | ~95% — UI timing can cause flakes |
| Speed | Seconds to minutes |
| Scope | Full stack, real browser |
| Mocks | External APIs only |

**Agent guidance**: Full sandbox must be running (`pnpm sandbox:up`). Screenshots on failure are evidence.

## Tier 4: Agent Sandbox

**Nature**: Natural language → Probabilistic, judgment-based

AI agents with personas autonomously test the product as real users would — navigating UI, making decisions, encountering edge cases no script anticipated.

| Aspect | Detail |
|--------|--------|
| Interface | Natural language (BDD/Gherkin scenarios) |
| Execution | Agent orchestrator dispatches persona agents |
| Determinism | Probabilistic — run N times, aggregate |
| Speed | Minutes |
| Scope | User experience, product quality |
| Mocks | External APIs only, everything else real |

### Why This Tier Exists

Code-based tests verify what developers **anticipated**. Agent sandbox tests discover what developers **didn't anticipate** — confusing flows, broken mental models, missing feedback, edge cases that emerge from real interaction patterns.

### Architecture: 3-Agent Pattern

```
┌─────────────────────────────┐
│     Orchestrator Agent      │
│  - Parses .feature files    │
│  - Dispatches persona agents│
│  - Collects & judges results│
│  - Budget: N API calls/scenario│
└──────────┬──────────────────┘
           │
     ┌─────┴─────┐
     │           │
┌────▼────┐ ┌───▼──────┐
│  User   │ │  Admin   │
│  Agent  │ │  Agent   │
│         │ │          │
│ Browser │ │ DB + Logs│
│ Actions │ │ Queries  │
└─────────┘ └──────────┘
```

**Orchestrator**: Reads Gherkin scenarios, dispatches tasks, aggregates results, generates reports.
**User Agent**: Controls browser via accessibility tree. Simulates real user behavior with a defined persona (e.g., "cautious novice", "power user", "impatient admin").
**Admin Agent**: Validates backend state — DB assertions, log inspection. Read-only access (SELECT only).

### Scenario Format: BDD/Gherkin

Gherkin is the natural interface between humans and agent testers. `Given/When/Then` provides LLMs with clear context, actions, and expected outcomes.

```gherkin
Feature: 구독 관리
  Background: 테스트 사용자로 로그인되어 있다

  Scenario: 새 구독 추가
    Given 대시보드 페이지에 있다
    When "구독 추가" 버튼을 클릭한다
    And URL "https://example.com/feed"를 입력한다
    And "저장" 버튼을 클릭한다
    Then 구독 목록에 "example.com"이 표시된다
    And DB에 해당 구독 레코드가 존재한다
```

### Handling Non-Determinism

Agent tests are inherently probabilistic. Strategies to manage this:

| Strategy | Description |
|----------|-------------|
| **N-run aggregation** | Run each scenario 3-5 times, pass if >80% succeed |
| **LLM-as-Judge** | Separate LLM evaluates test outcomes against criteria |
| **Full output logging** | Every agent action logged for post-mortem analysis |
| **Budget limits** | Cap API calls per scenario to prevent runaway costs |
| **Deterministic fallback** | Extract regression-worthy findings into Tier 3 E2E tests |

### Sandbox Requirements

Agent sandbox testing requires a **fully isolated environment**:

- All services running (DB, server, client) via Docker
- Mock credentials for all external APIs (no production calls)
- Idempotent seed data (can reset and rerun safely)
- Health check before test execution (`sandbox:status`)

---

## Decision Matrix: Which Tier to Use

| Question | Tier |
|----------|------|
| Does this function return the right value? | 1 - Unit |
| Do these services talk to each other correctly? | 2 - Integration |
| Does the user flow work end-to-end? | 3 - E2E |
| Is this confusing/broken from a real user's perspective? | 4 - Agent Sandbox |
| Did we break an existing feature? | 3 - E2E (regression) |
| What happens when a user does something unexpected? | 4 - Agent Sandbox |

---

## For Verification Agents

When building a verification strategy, scan all 4 tiers:

1. **Read `CLAUDE.md`** — project-specific test commands, sandbox setup, custom scripts
2. **Read `package.json` scripts** — discover `test`, `test:e2e`, `sandbox:*` commands
3. **Scan for test infrastructure** — config files, test directories, feature files
4. **Classify each acceptance criterion** into the appropriate tier
5. **Agent-verifiable (A-items)**: Tiers 1-3 produce deterministic exit codes
6. **Judgment-required (H-items)**: Tier 4 findings + UX/design quality

### The Key Insight

> Flaky environments affect agent performance more than model quality.
> Stabilize the sandbox first, optimize prompts second.

---

## References

- [HN: Why DIY Agent Sandboxing](https://news.ycombinator.com/item?id=46699324) — "Simple enough to DIY badly, complex enough that no standard fits everyone"
- [HN: E2E Test Agent in Plain English](https://news.ycombinator.com/item?id=45942443)
- [Dev.to: Autonomous Testing Revolution](https://dev.to/qa-leaders/the-autonomous-testing-revolution-how-ai-agents-are-reshaping-quality-engineering-37c7) — 3,000 API test cases in one afternoon
- [Dev.to: Managing AI Testing Agents](https://dev.to/johnjvester/effectively-managing-ai-agents-for-testing-iie) — shift from execution to oversight
- [Reddit: LLM E2E Testing for Chatbots](https://www.reddit.com/r/LLMDevs/comments/19b1f7n/how_do_you_e2e_test_your_llm_based_chatbot/) — LLM-as-Judge pattern
- [Lobsters: Software Engineering with LLMs Reality Check](https://lobste.rs/s/zssy2h) — skeptical counter-perspective
