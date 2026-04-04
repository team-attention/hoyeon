---
name: scaffold
description: |
  Greenfield project architecture scaffolding for AI Agent productivity.
  Interview-driven architecture decisions → spec.json → execute.
  Produces: Code Structure (with vertical slice exemplar), Test Infrastructure, Guard Rails + conditional extensions.
  L2-heavy pipeline (architecture decisions), L3 minimal (no behavioral requirements).
  Use when: "/scaffold", "scaffold", "new project", "set up project", "프로젝트 세팅", "초기 구조"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Write
  - AskUserQuestion
---

# /scaffold — Greenfield Architecture Scaffolding

Generate a scaffold spec.json through an architecture-focused derivation chain.
Produces a complete development foundation that AI agents can extend consistently.

Before starting, run `hoyeon-cli spec guide full --schema v1` to see the complete schema.

---

## Core Identity

scaffold is specify's **architecture variant**. Same spec.json format, different weight center.

| | specify | scaffold |
|---|---------|----------|
| Focus | What to build (features) | How to structure (architecture) |
| L2 weight | Moderate (feature decisions) | **Heavy** (tech stack, patterns, infra) |
| L3 weight | Heavy (behavioral requirements) | **Minimal** (structural requirements only) |
| Tasks | Feature implementation | Project initialization + exemplar |
| Output | Code changes | Complete development environment |
| When | Feature on existing codebase | Greenfield or major restructure |

---

## Core Rules

1. **CLI is the writer** — `spec init`, `spec merge`, `spec validate`. Never hand-write spec.json.
2. **Stdin merge** — Pass JSON via heredoc stdin. No temp files.
   ```bash
   hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin << 'EOF'
   {"context": {"decisions": [...]}}
   EOF
   ```
3. **Guide before merge** — Run `hoyeon-cli spec guide <section> --schema v1` before constructing JSON.
4. **Validate at layer transitions** — `hoyeon-cli spec validate` once per layer.
5. **One merge per section** — Never merge multiple sections in parallel.
6. **--append for arrays** — When adding to existing arrays.
7. **Revision Merge Protocol** — When user selects "Revise" at an approval gate:
   - **Modify existing item** (e.g. update D3's rationale) → `--patch`
   - **Add new item** (e.g. add D12) → `--append`
   - **Remove + rewrite entire section** → no flag (intentional full replace)
   - **NEVER** use no-flag merge with a subset of items — this silently replaces the entire array.

---

## Layer Flow

| Layer | What | Gate |
|-------|------|------|
| L0 | Mirror → confirmed_goal, non_goals | User confirms mirror |
| L1 | Environment scan (greenfield detection) | Auto-advance |
| L2 | **Architecture interview** → decisions + constraints (HEAVY) | CLI validate + User approval |
| L3 | Structural requirements (minimal — from decisions) | CLI validate + User approval |
| L4 | Scaffold tasks + category mapping | CLI validate + User approval |

### Session Init (before L0)

```bash
hoyeon-cli spec init {name} --goal "{goal}" --type dev --schema v1 --interaction {interaction} \
  .hoyeon/specs/{name}/spec.json
```

```bash
SESSION_ID="[from UserPromptSubmit hook]"
hoyeon-cli session set --sid $SESSION_ID --spec ".hoyeon/specs/{name}/spec.json"
```

---

## L0: Goal

**Output**: `meta.goal`, `meta.non_goals`, `context.confirmed_goal`

### Mirror Protocol

Mirror the user's goal with scaffold-specific framing:

```
"I understand you want to build [product/system].
 Architecture scope: [what the scaffold will set up].
 NOT in scaffold scope: [features, business logic — those come later via /specify].
 Done when: [agent can extend the codebase consistently].
 Does this match?"
```

**Key distinction**: scaffold's goal is the **foundation**, not the product. If user says "I want to build a todo app", the scaffold goal is "Set up a web application foundation (server + client + DB) that an agent can extend to build features like a todo app."

### Merge

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin << 'EOF'
{confirmed_goal, non_goals matching guide output}
EOF
```

### Gate

User confirms mirror → advance to L1.

---

## L1: Environment Scan

**Output**: `context.research`

Unlike specify's L1 (which scans existing code), scaffold's L1 scans the **environment**:

### Scan Targets

| Target | How | Why |
|--------|-----|-----|
| Working directory | `ls -la`, check for existing files | Greenfield confirmation |
| Package managers | `which npm`, `which yarn`, `which pnpm`, `which bun` | Available tooling |
| Runtime versions | `node -v`, `python3 --version`, `go version`, etc. | Compatibility constraints |
| Docker | `docker --version`, `docker compose version` | Infra capability |
| Git | `git status` | Repo state |
| OS/platform | `uname -a` | Platform constraints |

### Past Scaffold Search

```bash
hoyeon-cli spec search "[goal keywords]" --json --limit 5
```

Find previous scaffold decisions to compound on.

### Merge

Merge findings as `context.research`:

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin << 'EOF'
{"context": {"research": "Environment: node v22, pnpm available, Docker installed, empty directory (greenfield confirmed). No past scaffold specs found."}}
EOF
```

### Gate

Auto-advance to L2.

---

## L2: Architecture Decisions (HEAVY)

**Output**: `context.decisions[]`, `constraints[]`, `context.known_gaps[]`

This is scaffold's core. The interview determines the entire project architecture.

### Step 0: Checkpoint Generation

Read L1 environment scan + confirmed_goal, then generate checkpoints per **architecture dimension**.

**Complexity classification** — based on confirmed goal:

| Signal | Examples |
|--------|----------|
| Client-server boundary | web app, mobile + API, microservices |
| Multiple data stores | DB + cache + queue |
| Real-time communication | WebSocket, SSE, polling |
| External service integration | payment, auth provider, AI API |
| Multi-environment deployment | dev/staging/prod, Docker |
| Background processing | workers, cron, queues |

- **Simple** (0-1 signals) → 2-3 per dimension
- **Medium** (2-3 signals) → 4-5 per dimension
- **Complex** (4+ signals) → 6-8 per dimension

### Architecture Dimensions

| # | Dimension | Weight | Example Checkpoints |
|---|-----------|--------|-------------------|
| 1 | **Tech Stack** | 25% | Language/runtime, framework, package manager |
| 2 | **Communication** | 20% | Client-server protocol, API style, type safety strategy |
| 3 | **Data & State** | 20% | Database choice, ORM/query builder, migration strategy, caching |
| 4 | **Testing** | 15% | Test framework, test patterns, coverage strategy |
| 5 | **DevOps & Environment** | 20% | Containerization, CI/CD, env config, deployment target |

**L1 Auto-Resolve**: Check each checkpoint against environment scan. Node installed → resolve "runtime" checkpoint. Docker available → partially resolve containerization.

### Interview Loop (score-driven)

Same mechanics as specify's L2 but with **architecture-specific question framing**.

Each round:
1. **Score** — coverage per dimension
2. **Target** — lowest-scoring dimension(s)
3. **Ask** — 2 scenario questions targeting those checkpoints
4. **Resolve** — mark covered, merge decisions
5. **Scan** — detect cross-decision tensions
6. **Display** — scoreboard

**Question format — RIGHT (concrete scenario):**
```
AskUserQuestion(
  question: "Your API needs to serve both a React frontend and a future mobile app. How should client-server communication work?",
  options: [
    { label: "REST + OpenAPI + code-gen", description: "OpenAPI spec → Orval/openapi-typescript. Type-safe, well-tooled." },
    { label: "tRPC", description: "End-to-end type safety, no code-gen. TypeScript only." },
    { label: "GraphQL", description: "Flexible queries, schema-first. Higher complexity." },
    { label: "Agent decides", description: "Let scaffold choose based on project context" }
  ]
)
```

**Question format — WRONG (abstract):**
```
AskUserQuestion(question: "What API style do you prefer?", ...)
```

**"Agent decides" handling**: When user selects this, scaffold makes an opinionated choice based on:
1. L1 environment capabilities
2. Decisions already made (consistency)
3. Project complexity (simpler for simple projects)
4. Agent productivity criteria (prefer type-safe, convention-over-config)

Record as decision with `assumed: true`.

### Agent Productivity Bias

When making or recommending decisions, bias toward the 4 quality criteria:

| Criteria | Bias |
|----------|------|
| Agent extensibility | Prefer convention-over-config, clear naming, predictable patterns |
| Testability | Prefer dependency injection, pure functions, mockable boundaries |
| Drift resistance | Prefer strict linting, type checking, boundary enforcement |
| Type-safe communication | Prefer code-gen over manual types, schema-first over code-first |

### Conditional Extension Detection

During the interview, detect which conditional extensions to activate:

| Signal from Interview | Extension Activated |
|----------------------|-------------------|
| Client-server boundary detected | **Type Contracts** (OpenAPI/tRPC/GraphQL schema) |
| Database mentioned or implied | **Data Layer** (migrations, connection, seed) |
| Docker available + multi-service | **Docker/Infra** (compose, Dockerfile) |
| Long-running server process | **Runtime Patterns** (health check, graceful shutdown) |

Record activated extensions as decisions:
```
D_EXT1: "Type Contracts extension activated — OpenAPI + Orval code-gen for client-server type safety"
D_EXT2: "Data Layer extension activated — PostgreSQL + Prisma migrations"
```

### Termination

Same as specify: composite >= 0.80, every dimension >= 0.60, unknowns == 0.

### Inversion Probe

Two architecture-specific questions:

1. **Inversion**: "Given these architecture decisions, what scenario would cause a complete restructure even if every component works individually?"
2. **Implication**: "You chose [most impactful decision]. Does that also mean [architectural consequence]?"

### L2 Approval

Present all decisions + constraints + activated extensions. Spawn L2-reviewer:

```
Task(subagent_type="general-purpose", prompt="""
You are an L2 architecture reviewer for a scaffold spec. Given:
- All architecture decisions
- Activated conditional extensions
- The 4 quality criteria (agent extensibility, testability, drift resistance, type safety)

Check:
1. Do decisions form a coherent stack? (no contradictions)
2. Are the 4 quality criteria addressed?
3. Any activated extension missing its supporting decisions?
4. Any decision that agents will struggle to follow consistently?

Return: PASS or NEEDS_FIX with specific issues.
""")
```

### L2 Gate

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --layer decisions
```

---

## L3: Structural Requirements (MINIMAL)

**Output**: `requirements[]` with `sub[]`

scaffold's L3 is deliberately thin. Requirements describe **what the scaffold must produce**, not feature behaviors.

### Derive from Decisions

```bash
hoyeon-cli spec derive-requirements .hoyeon/specs/{name}/spec.json
```

### Reshape into Output Categories

Map requirements to the **3 Core + Conditional Extensions** model:

**Core (always present):**

```
R1: "Code Structure — Project directories, base configs, and a complete vertical slice exemplar"
  R1.1: "Directory structure follows [framework] conventions with clear layer separation"
  R1.2: "Vertical slice exemplar implements one complete flow (route → service → data → test) with importable utilities (logger, config, errors)"
  R1.3: "All exemplar utilities are importable modules, not inline code"

R2: "Test Infrastructure — Framework setup with patterns matching the exemplar"
  R2.1: "[Test framework] configured with [runner] and example test matching exemplar flow"
  R2.2: "Test directory structure mirrors source structure"

R3: "Guard Rails — Enforcement mechanisms for drift resistance"
  R3.1: "CLAUDE.md with architectural rules, dependency direction, and file placement conventions"
  R3.2: "Linter + formatter configured with project-specific rules"
  R3.3: "CI pipeline running lint + typecheck + test"
  R3.4: ".env.example with all required environment variables documented"
```

**Conditional (only if activated in L2):**

```
R4: "Type Contracts — [OpenAPI/tRPC/GraphQL] schema with code generation" (if activated)
  R4.1: "Schema definition file as single source of truth"
  R4.2: "Code-gen configured to produce typed client/server stubs"

R5: "Data Layer — Database with migration infrastructure" (if activated)
  R5.1: "[ORM] configured with connection pooling"
  R5.2: "Initial migration with exemplar model"
  R5.3: "Seed data script for development"

R6: "Docker/Infra — Containerized development environment" (if activated)
  R6.1: "Dockerfile for [service]"
  R6.2: "docker-compose.yml for local development (app + dependencies)"

R7: "Runtime Patterns — Production readiness foundations" (if activated)
  R7.1: "Health check endpoint"
  R7.2: "Graceful shutdown handler (SIGTERM)"
```

### Behavior Quality

Same rules as specify — trigger + observable outcome:
- BAD: "Project has good structure"
- GOOD: "Directory structure follows NestJS module conventions with `src/modules/{name}/` containing controller, service, module files"

### L3 Approval

Print all requirements → AskUserQuestion (Approve/Revise/Abort).

### L3 Gate

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --layer requirements
```

---

## L4: Scaffold Tasks

**Output**: `tasks[]`, `external_dependencies`

### Derive from Requirements

```bash
hoyeon-cli spec derive-tasks .hoyeon/specs/{name}/spec.json
```

### Task Structure

Scaffold tasks follow a specific execution order:

```
T1: Project initialization (package.json, tsconfig, base configs)
    fulfills: [R1 partial, R3 partial]

T2: Guard Rails setup (CLAUDE.md, lint, format, CI, .env.example)
    fulfills: [R3]
    depends_on: [T1]

T3: Vertical slice exemplar (the reference implementation)
    fulfills: [R1, R2 partial]
    depends_on: [T2]
    ← THIS IS THE MOST IMPORTANT TASK

T4: Test infrastructure (framework + exemplar-matching tests)
    fulfills: [R2]
    depends_on: [T3]

--- Conditional tasks (parallel where possible) ---

T5: Type Contracts setup (if R4 exists)
    fulfills: [R4]
    depends_on: [T3]

T6: Data Layer setup (if R5 exists)
    fulfills: [R5]
    depends_on: [T1]

T7: Docker/Infra setup (if R6 exists)
    fulfills: [R6]
    depends_on: [T1]

T8: Runtime Patterns (if R7 exists)
    fulfills: [R7]
    depends_on: [T3]

TF: Scaffold verification
    depends_on: [all]
```

### T3: Vertical Slice Exemplar (Critical Task)

The exemplar is the scaffold's highest-value output. It must demonstrate:

1. **The complete flow** — from entry point to data layer and back
2. **Importable utilities** — `lib/logger.ts`, `lib/config.ts`, `lib/errors.ts` (not inline)
3. **The naming convention** — how files, functions, and variables are named
4. **The test pattern** — how to test this flow (test lives alongside T3)
5. **Error handling** — how errors propagate through layers
6. **Type safety** — how types flow across boundaries

The exemplar answers the question: "If an agent reads only this one feature, can it build the next feature correctly?"

### TF: Scaffold Verification

TF verifies the scaffold is agent-ready:

```json
{
  "id": "TF",
  "action": "Scaffold verification: agent extensibility check",
  "type": "verification",
  "depends_on": ["T2", "T3", "T4"],
  "steps": [
    "Build: all build/lint/typecheck commands pass",
    "Tests: all exemplar tests pass",
    "CLAUDE.md: architectural rules are clear and complete",
    "Exemplar: vertical slice is complete (entry → data → response → test)",
    "Utilities: logger, config, errors are importable and used in exemplar",
    "Agent test: could an agent read this codebase and build a new feature consistently?"
  ]
}
```

### L4 Approval — Plan Summary

```
spec.json ready! .hoyeon/specs/{name}/spec.json

Goal
----------------------------------------
{context.confirmed_goal}

Architecture Decisions ({n} total)
----------------------------------------
D1: {tech stack decision}
D2: {communication decision}
...

Activated Extensions
----------------------------------------
[x] Type Contracts (OpenAPI + Orval)
[x] Data Layer (PostgreSQL + Prisma)
[ ] Docker/Infra (not needed)
[ ] Runtime Patterns (not needed)

Scaffold Tasks (DAG)
----------------------------------------
T1: Project init [core] — pending
T2: Guard Rails [core] — pending (depends: T1)
T3: Vertical slice exemplar [core] — pending (depends: T2)
T4: Test infrastructure [core] — pending (depends: T3)
T5: Type Contracts [extension] — pending (depends: T3)
T6: Data Layer [extension] — pending (depends: T1)
TF: Scaffold verification — pending (depends: all)

Quality Criteria
----------------------------------------
- Agent extensibility: vertical slice exemplar (T3)
- Testability: test infrastructure + exemplar tests (T4)
- Drift resistance: CLAUDE.md + lint + CI (T2)
- Type safety: [type contract strategy from D_] (T5)
```

```
AskUserQuestion(
  question: "Review the scaffold plan above.",
  options: [
    { label: "/execute", description: "Start scaffolding" },
    { label: "Revise decisions (L2)", description: "Change architecture decisions" },
    { label: "Revise tasks (L4)", description: "Adjust task breakdown" },
    { label: "Abort", description: "Stop" }
  ]
)
```

On approval, run `/execute`.

---

## User Approval Protocol

Three approval gates (L2, L3, L4). Same pattern as specify:

```
AskUserQuestion(
  question: "Review the {items} above. Ready to proceed?",
  options: [
    { label: "Approve", description: "Looks good — proceed to next layer" },
    { label: "Revise", description: "I want to change something" },
    { label: "Abort", description: "Stop specification" }
  ]
)
```

---

## Checklist Before Stopping

- [ ] spec.json at `.hoyeon/specs/{name}/spec.json`
- [ ] `hoyeon-cli spec validate` passes
- [ ] `context.confirmed_goal` is architecture-framed (not feature-framed)
- [ ] `meta.non_goals` includes "feature implementation" or similar
- [ ] `context.decisions[]` cover all 5 architecture dimensions
- [ ] Conditional extensions detected and recorded as decisions
- [ ] Requirements map to 3 Core + activated extensions
- [ ] R1 includes mandatory vertical slice exemplar requirement
- [ ] T3 (exemplar) includes importable utilities (logger, config, errors)
- [ ] TF includes agent extensibility check
- [ ] CLAUDE.md generation is in Guard Rails task (T2)
- [ ] Plan Summary presented to user
