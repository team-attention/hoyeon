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
Feature: Subscription Management
  Background: Logged in as a test user

  Scenario: Add a new subscription
    Given I am on the dashboard page
    When I click the "Add Subscription" button
    And I enter the URL "https://example.com/feed"
    And I click the "Save" button
    Then "example.com" is displayed in the subscription list
    And the corresponding subscription record exists in the DB
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

### Sandbox Drift Prevention

When DB schemas, external services, or infrastructure configs change, the sandbox environment must stay in sync. Drift between production code and sandbox setup causes false test failures and masks real bugs.

**Drift-prone artifacts** — check these whenever the corresponding source changes:

| Change Source | Sandbox Artifact to Update | Signal Files |
|--------------|---------------------------|-------------|
| DB migration added/modified | `seed.sql`, seed scripts, fixture data | `migrations/`, `prisma/migrations/`, `alembic/versions/` |
| New env variable required | `.env.sandbox` | `.env.example`, env validation schema |
| Service added/removed | `docker-compose.yml` (services, ports, networks) | `docker-compose.*`, `Dockerfile` |
| API dependency changed | Mock/stub configs, fixture responses | HTTP client configs, SDK version bumps |
| IaC config changed | Local Docker equivalent | `terraform/`, `cloudformation/`, `k8s/` |

**Drift detection checklist** (for verification agents):
- [ ] Migration files changed → seed data still compatible?
- [ ] New env var in code → present in `.env.sandbox`?
- [ ] `docker-compose.yml` changed → `sandbox:up` still works?
- [ ] External API contract changed → mock/stub responses updated?
- [ ] Seed data still idempotent after schema change?

> **Principle**: Every infrastructure change PR should include sandbox updates in the same commit.
> If sandbox cannot be updated immediately, mark the item as `verified_by: Manual` in the verification plan.

### Sandbox Bootstrapping Patterns

When a project lacks Tier 4 sandbox infrastructure, use these patterns as starter scaffolds.
Adapt to your project's stack and constraints.

> These patterns are for local dev/test environments only. Do not use directly in production.

#### Pattern: Web App (SPA + API + DB)

**Fits**: React/Vue/Next.js + Node/Python API + PostgreSQL/MySQL
**Detection signals**: Separate client/server directories, DB ORM config present

Directory structure:
```
sandbox/
├── docker-compose.yml    # db + server + client
├── features/
│   ├── auth.feature      # Authentication scenarios
│   └── core.feature      # Core feature scenarios
├── scripts/
│   └── status.ts         # Port/DB/service health check
└── .env.sandbox          # Mock credentials
```

Required scripts: `sandbox:up`, `sandbox:down`, `sandbox:status`
First features: Authentication + one core CRUD operation

#### Pattern: API Server

**Fits**: NestJS/FastAPI/Go API + DB (no frontend)
**Detection signals**: Server code only, no client directory

Directory structure:
```
sandbox/
├── docker-compose.yml    # db + server
├── features/
│   └── api-core.feature  # Core API scenarios
├── scripts/
│   └── status.sh         # Health check
└── seed.sql              # Seed data
```

Admin Agent: DB + API response verification (curl/httpie)
User Agent: API client simulation

#### Pattern: CLI Tool

**Fits**: Input/output transformation, file processing tools
**Detection signals**: bin field in package.json, CLI entrypoint, commander/yargs dependency

Directory structure:
```
sandbox/
├── fixtures/
│   ├── input/            # Test input files
│   └── expected/         # Expected output files
├── features/
│   └── cli-core.feature  # CLI scenarios
└── scripts/
    └── run-scenarios.sh  # Fixture-based verification
```

Docker may not be needed — fixture-based input/output comparison can suffice.

#### Pattern: Monorepo

**Fits**: pnpm workspace, turborepo, nx
**Detection signals**: pnpm-workspace.yaml, turbo.json, nx.json

Directory structure:
```
sandbox/
├── docker-compose.yml    # Compose profiles per service
├── features/
│   ├── service-a.feature
│   └── service-b.feature
├── scripts/
│   └── status.ts
└── .env.sandbox
```

Use compose profiles for selective service startup.
Shared DB with per-service seed data.

#### Security Checklist

Always verify when bootstrapping a sandbox:
- [ ] All credentials are mock values (never include real keys)
- [ ] Minimize host port bindings
- [ ] .env.sandbox is git-tracked (safe because mock values only)
- [ ] Volume mounts do not include sensitive host directories
- [ ] Seed data is idempotent (safe to rerun)

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

## Verification Classification: 2-Axis Model

Each acceptance criterion is classified on two independent axes:

### Axis 1: verified_by (who verifies)

| Value | Meaning |
|-------|---------|
| `Auto` | Machine verified — deterministic exit code (shell command, test runner) |
| `Agent` | Agent verified — probabilistic, LLM judgment (spot-check worthy) |
| `Manual` | Human judgment required — design quality, UX feel, business sign-off |

### Axis 2: execution_env (where it runs)

| Value | Meaning |
|-------|---------|
| `host` | Runs directly on the developer machine / CI runner |
| `sandbox` | Requires isolated environment (Docker, test DB, mocked external services) |

### Display Convention

When reporting verification results, use these labels:

```
Auto    — machine verified, deterministic
Agent   — agent verified, probabilistic (spot-check worthy)
Manual  — human judgment required
```

Append `[sandbox]` inline when `execution_env != host`:

```
Auto [sandbox]    — machine verified but requires sandbox to be running
Agent [sandbox]   — agent verified inside sandbox environment
```

When a sandbox is unavailable, collect all sandbox-dependent items in a `SKIPPED` section rather than marking them as failures:

```
## SKIPPED (sandbox unavailable)
- <item description> (Auto [sandbox]) — sandbox not running
```

---

## For Verification Agents

When building a verification strategy, scan all 4 tiers:

1. **Read `CLAUDE.md`** — project-specific test commands, sandbox setup, custom scripts
2. **Read `package.json` scripts** — discover `test`, `test:e2e`, `sandbox:*` commands
3. **Scan for test infrastructure** — config files, test directories, feature files
4. **Classify each acceptance criterion** using the 2-axis model (`verified_by` × `execution_env`)
5. **Auto items**: Tiers 1-3 produce deterministic exit codes → `verified_by: Auto`
6. **Agent items**: Tier 4 findings evaluated by LLM judgment → `verified_by: Agent`
7. **Manual items**: UX/design quality, business sign-off → `verified_by: Manual`
8. **Sandbox items**: Tiers 2-4 requiring Docker/test DB → `execution_env: sandbox`, append `[sandbox]` tag

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
