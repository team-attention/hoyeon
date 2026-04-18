---
name: scaffold
description: |
  Greenfield project architecture + harness scaffolding for AI Agent productivity.
  Interview-driven decisions → requirements.md → execute.
  Produces: Code Structure (vertical slice exemplar), Test Infrastructure, Guard Rails,
  conditional extensions, AND Harness (CLAUDE.md with domain/team context, rules, skills, hooks).
  L2: architecture decisions, L3: harness setup, L4: requirements + harness decisions (tasks generated later by /execute into plan.json).
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

Generate a scaffold requirements.md through an architecture-focused derivation chain.
Produces a complete development foundation that AI agents can extend consistently.

---

## Core Identity

scaffold is specify's **architecture variant**. Same requirements.md format, different weight center.

| | specify | scaffold |
|---|---------|----------|
| Focus | What to build (features) | How to structure (architecture + harness) |
| L2 weight | Moderate (feature decisions) | **Heavy** (tech stack, patterns, infra) |
| L3 | Requirements (behavioral) | **Harness** (domain, team, skills, hooks, rules) |
| L4 | Verification journeys | **Requirements + Harness Decisions** (no tasks — /execute writes plan.json) |
| Tasks | Feature implementation | Project initialization + exemplar + harness |
| Output | Code changes | Complete development environment + AI harness |
| When | Feature on existing codebase | Greenfield or major restructure |

---

## Core Rules

1. **CLI creates the spec dir** — `hoyeon-cli req init` to create the spec directory and stub requirements.md. Then Write/Edit requirements.md directly.
2. **Direct markdown editing** — Write requirements.md content using Write or Edit tools. No JSON merge protocol needed.
3. **No schema validation** — requirements.md is freeform markdown. No `spec validate` or `spec guide` commands.
4. **Revision Protocol** — When user selects "Revise" at an approval gate:
   - Use Edit tool to modify, add, or remove sections in requirements.md directly.
   - No merge flags needed — just edit the markdown.

---

## Layer Flow

| Layer | What | Gate |
|-------|------|------|
| L0 | Mirror → confirmed_goal, non_goals | User confirms mirror |
| L1 | Environment scan (greenfield detection) | Auto-advance |
| L2 | **Architecture interview** → decisions + constraints (HEAVY) | User approval |
| L3 | **Harness setup** → domain, team, rules, skills, hooks | User approval |
| L4 | **Requirements + Harness Decisions** → requirements (with GWT sub-reqs) + harness decisions | User approval |

scaffold produces requirements.md only (no tasks). Task breakdown is handled later by `/execute` (via `/blueprint` or inline planning), which writes a sibling `plan.json` next to requirements.md.

### Session Init (before L0)

```bash
SPEC_DIR=".hoyeon/specs/{name}"
hoyeon-cli req init $SPEC_DIR --type greenfield --goal "{goal}"
```

This creates `${SPEC_DIR}/requirements.md` with a stub template.

```bash
SESSION_ID="[from UserPromptSubmit hook]"
hoyeon-cli session set --sid $SESSION_ID --key spec_dir --value "$SPEC_DIR"
```

---

## L0: Goal

**Output**: Goal, Non-Goals, Confirmed Goal sections in requirements.md

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

### Write to requirements.md

Use the Edit tool to write the Goal, Non-Goals, and Confirmed Goal sections into `${SPEC_DIR}/requirements.md`.

### Gate

User confirms mirror → advance to L1.

---

## L1: Environment Scan

**Output**: Research section in requirements.md

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

### Write to requirements.md

Use the Edit tool to add a Research/Context section to `${SPEC_DIR}/requirements.md` with the environment scan findings.

### Gate

Auto-advance to L2 (no user approval needed).

---

## L2: Architecture Decisions (HEAVY)

**Output**: Decisions, Constraints, Known Gaps sections in requirements.md

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

Composite score uses **weighted average** across dimensions (weights from the table above).
Terminate when: composite >= 0.80, every dimension >= 0.60, unknowns == 0.

### Inversion Probe

Two architecture-specific questions:

1. **Inversion**: "Given these architecture decisions, what scenario would cause a complete restructure even if every component works individually?"
2. **Implication**: "You chose [most impactful decision]. Does that also mean [architectural consequence]?"

If the probe reveals a critical issue (e.g., contradictory decisions, missing dimension coverage):
- Merge the issue as a `known_gap` via `--append`
- Re-enter the interview loop targeting the affected dimension(s)
- Continue until termination criteria are met again

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

Use Edit tool to write all decisions, constraints, and known gaps into the Decisions section of `${SPEC_DIR}/requirements.md`.

---

## L3: Harness Setup

**Output**: Harness decisions added to Decisions section in requirements.md

L3 determines the AI work environment for this project. While L2 decides how the code is structured, L3 decides how Claude will work with that code across sessions.

### 3-1. Domain Context (interactive)

```
AskUserQuestion(
  question: "Does this project have domain-specific terms or business rules? For example, 'tenant = company-level customer' or 'credit balance must never go negative'.",
  options: [
    { label: "Yes, I'll describe them", description: "You'll provide domain terms and key business rules" },
    { label: "None yet", description: "Skip — can add later to CLAUDE.md" },
    { label: "Agent decides", description: "Infer from project goal if possible" }
  ]
)
```

If user provides domain terms → record as decision: `D_H1: "Domain context: [terms and rules]"`
These will be written into CLAUDE.md by the Guard Rails task (derived by `/execute`).

### 3-2. Team Context (interactive)

```
AskUserQuestion(
  question: "Are there team conventions for commits, PRs, branching, or code review?",
  options: [
    { label: "Conventional Commits + GitHub Flow", description: "feat/fix/chore prefixes, feature branches, squash merge" },
    { label: "Trunk-based development", description: "Short-lived branches, no long-running feature branches" },
    { label: "Custom — I'll describe", description: "You'll specify your team's rules" },
    { label: "Solo project, no conventions", description: "Skip team context" }
  ]
)
```

If user provides team conventions → record as decision: `D_H2: "Team conventions: [rules]"`
These will be written into CLAUDE.md by the Guard Rails task (derived by `/execute`).

### 3-3. Constraints → Rules (auto + confirm)

Scan L2 constraints[] and propose converting them to `.claude/rules/` files:

```
L2 produced these constraints:
  C1: "pnpm workspace — always use pnpm, never npm/yarn"
  C3: "Dependency direction: shared → client/server only"

These can become auto-enforced rules in .claude/rules/.
```

```
AskUserQuestion(
  question: "Convert these constraints to .claude/rules/ for automatic enforcement?",
  options: [
    { label: "Yes, all of them", description: "All constraints become rules files" },
    { label: "Let me pick", description: "Choose which constraints to enforce" },
    { label: "Skip", description: "Keep constraints in requirements.md only" }
  ]
)
```

Record as decision: `D_H3: "Rules: [list of constraints to convert]"`

### 3-4. Skills Detection (auto-suggest + ask)

Scan L2 decisions for recurring task patterns and suggest project-specific skills:

| L2 Decision Signal | Auto-Suggested Skill | Description |
|-------------------|---------------------|-------------|
| DB + ORM (Prisma, Drizzle, SQLAlchemy) | `/migrate` | Run migration + regenerate types |
| DB detected | `/seed-data` | Generate development seed data |
| Docker / docker-compose | `/deploy` | Build, push, run with health check |
| API server (REST, GraphQL, tRPC) | `/api-test` | Test endpoint with curl/httpie |
| Async workers (Celery, BullMQ) | `/worker-test` | Dispatch test task + verify result |
| CLI binary (Rust, Go) | `/release` | Version bump + build + tag + publish |
| Frontend framework | `/new-component` | Scaffold component + test + story |
| Payment integration (Stripe, etc.) | `/test-webhook` | Forward + trigger webhook locally |

Present auto-suggestions, then ask:

```
AskUserQuestion(
  question: "These skills will be scaffolded based on your tech stack. Any other tasks you'll repeat frequently?",
  options: [
    { label: "These are enough", description: "Proceed with auto-suggested skills only" },
    { label: "Add more", description: "I'll describe additional recurring tasks" },
    { label: "Skip all skills", description: "Don't generate any project skills" }
  ]
)
```

Record as decision: `D_H4: "Skills: [list of skills to generate]"`

Each generated skill will have:
- `SKILL.md` with project-specific steps (using actual commands from L2 decisions)
- `scripts/validate.sh` when the task has a checkable outcome
- `disable-model-invocation: true` (all domain skills have side effects)

### 3-5. Hooks Detection (auto + confirm)

Auto-detect hooks from L2 tech stack decisions:

| L2 Decision | Auto-Detected Hook | Type |
|------------|-------------------|------|
| TypeScript (tsconfig.json) | `tsc --noEmit` on Edit/Write to .ts | PostToolUse |
| Prettier configured | `prettier --write` on Edit/Write | PostToolUse |
| ESLint configured | `eslint --fix` on Edit/Write | PostToolUse |
| Ruff / Black (Python) | `ruff format` on Edit/Write | PostToolUse |
| rustfmt (Rust) | `rustfmt` on Edit/Write | PostToolUse |
| gofmt (Go) | `gofmt -w` on Edit/Write | PostToolUse |
| .env files will exist | Block Edit/Write to `.env*` | PreToolUse |
| Lock files will exist | Block Edit/Write to lock files | PreToolUse |

Present the hook list:

```
AskUserQuestion(
  question: "These hooks will be added to .claude/settings.json for automatic enforcement. Approve?",
  options: [
    { label: "Approve all", description: "Add all detected hooks" },
    { label: "Let me pick", description: "Choose which hooks to enable" },
    { label: "Skip hooks", description: "Don't set up any hooks" }
  ]
)
```

Record as decision: `D_H5: "Hooks: [list of hooks to configure]"`

### L3 Write to requirements.md

Use Edit tool to append all harness decisions to the Decisions section in `${SPEC_DIR}/requirements.md`:

- D_H1: Domain context (if user provided)
- D_H2: Team conventions (if user provided)
- D_H3: Rules to convert from constraints
- D_H4: Skills to generate
- D_H5: Hooks to configure

Only include D_H1/D_H2 if user provided content. Omit if "None yet" or "Solo project".

### L3 Gate

Present harness summary → AskUserQuestion (Approve/Revise/Abort).

---

## L4: Requirements + Harness Decisions

**Output**: Requirements section (with GWT sub-requirements) written to requirements.md

L4 does NOT produce tasks. Task breakdown is the job of `/execute` (via `/blueprint` or inline planning), which writes a sibling `plan.json`. L4's job is to finalize the *what* (requirements + harness intent) so `/execute` has a complete requirements.md to derive tasks from.

Requirements come from both L2 (architecture) and L3 (harness). Every sub-requirement MUST have `given` / `when` / `then` (GWT is mandatory).

### Step 1: Derive Requirements

Construct requirements from L2 decisions + L3 harness decisions, then write them into the Requirements section of `${SPEC_DIR}/requirements.md` using the Edit tool.
Every sub-requirement must include `given`, `when`, `then` — behavior alone is not enough.

**Code Requirements (from L2):**

```
R1: "Code Structure — Project directories, base configs, and a complete vertical slice exemplar"
  R1.1: "Directory structure follows [framework] conventions with clear layer separation"
  R1.2: "Vertical slice exemplar implements one complete flow (route → service → data → test) with importable utilities (logger, config, errors)"
  R1.3: "All exemplar utilities are importable modules, not inline code"

R2: "Test Infrastructure — Framework setup with patterns matching the exemplar"
  R2.1: "[Test framework] configured with [runner] and example test matching exemplar flow"
  R2.2: "Test directory structure mirrors source structure"

R3: "Guard Rails — CLAUDE.md + enforcement mechanisms for drift resistance"
  R3.1: "CLAUDE.md with architectural rules, domain context, team conventions, dependency direction, file placement conventions, available project skills summary, and active hooks summary"
  R3.2: "Linter + formatter configured with project-specific rules"
  R3.3: "CI pipeline running lint + typecheck + test"
  R3.4: ".env.example with all required environment variables documented"
```

**Conditional Code Extensions (from L2):**

```
R4: "Type Contracts — Schema-driven type safety across client-server boundary" (if D_EXT1)
  R4.1: "API schema or router defines all endpoints with typed request/response"
  R4.2: "Client-side type bindings generated or inferred from the schema (no manual type duplication)"

R5: "Data Layer — Database connection, schema management, and seed data" (if D_EXT2)
  R5.1: "ORM/query builder configured with typed models matching the domain"
  R5.2: "Initial migration generated and seed script produces development data"
  R5.3: "Database connection uses environment variable (DATABASE_URL or equivalent)"

R6: "Docker/Infra — Containerized local development environment" (if D_EXT3)
  R6.1: "docker-compose.yml with required services (DB, cache, etc.) and persistent volumes"
  R6.2: "README or CLAUDE.md documents how to start/stop the local environment"

R7: "Runtime Patterns — Production-readiness baseline for long-running server" (if D_EXT4)
  R7.1: "Health check endpoint returns server status and dependency connectivity"
  R7.2: "Graceful shutdown handler closes DB connections and in-flight requests"
```

**Harness Requirements (from L3):**

```
R8: "Project Rules — Constraints converted to .claude/rules/ for automatic enforcement" (if D_H3)
  R8.1: "Each selected constraint has a corresponding .claude/rules/{name}.md file"
  R8.2: "Rule files contain clear, actionable directives (not vague guidelines)"

R9: "Domain Skills — Project-specific repeatable task recipes" (if D_H4)
  R9.1: "Each skill has SKILL.md with project-specific commands (not generic placeholders)"
  R9.2: "Skills with checkable outcomes include scripts/validate.sh"

R10: "Project Hooks — Automated code quality enforcement" (if D_H5)
  R10.1: ".claude/settings.json with PostToolUse hooks for detected formatter/linter"
  R10.2: "PreToolUse protection hooks for .env and lock files (if applicable)"
```

**Behavior Quality**: Same rules as specify — trigger + observable outcome.

**Note on fulfills[]**: Use parent requirement IDs only (R1, R2, R3), NOT sub-requirement IDs (R1.1, R3.4).

### Step 2: Harness Intent (no task generation)

Task derivation is handled by `/execute` (via `/blueprint` or inline planning). `/execute` reads requirements.md and writes `plan.json` next to it.

Ensure the requirements written in Step 1 carry enough harness detail that `/execute` can derive the right tasks:

- **R1 (Code Structure)** must include the vertical slice exemplar as a sub-requirement with full GWT.
- **R3 (Guard Rails)** CLAUDE.md sub-req must spell out domain context (D_H1), team conventions (D_H2), available skills (D_H4), and active hooks (D_H5).
- **R8 / R9 / R10** (harness) must be present whenever D_H3 / D_H4 / D_H5 fired in L3.
- Conditional extensions R4-R7 must be present whenever the matching D_EXT fired in L2.

### Task Shape Guidance for `/execute`

`/execute` will read `requirements.md` and derive `plan.json` tasks. The scaffold-specific shape it is expected to produce (documented here so reviewers know what "good" looks like):

- `T1` Project initialization → fulfills R1
- `T2` Guard Rails + CLAUDE.md + rules → fulfills R3 (+ R8 when present), depends on T1
- `T4` Test infrastructure → fulfills R2, depends on T1
- `T3` Vertical slice exemplar (highest-value task) → fulfills R1, depends on T2, T4
- Conditional extension tasks for any of R4/R5/R6/R7 that exist
- Harness tasks for R9 (skills) and R10 (hooks) when present
- A final verification task covering agent-extensibility + harness checks

Keep this as guidance; the actual task records are `/execute`'s responsibility.

### Vertical Slice Exemplar (R1 sub-requirement)

The exemplar is the scaffold's highest-value output. Its GWT sub-requirement must demand:

1. **The complete flow** — from entry point to data layer and back
2. **Importable utilities** — `lib/logger.ts`, `lib/config.ts`, `lib/errors.ts` (not inline)
3. **The naming convention** — how files, functions, and variables are named
4. **The test pattern** — how to test this flow (test lives alongside the exemplar)
5. **Error handling** — how errors propagate through layers
6. **Type safety** — how types flow across boundaries

The exemplar answers: "If an agent reads only this one feature, can it build the next feature correctly?"

### Domain Skills (R9 sub-requirements)

Each generated skill must reference actual tools/commands from L2 decisions:
- `disable-model-invocation: true` for all domain skills (they have side effects)
- Include `scripts/validate.sh` when the task has a checkable outcome
- Use project-specific commands (e.g., "npx prisma migrate dev" not "run migration")

### L4 Approval — Plan Summary

```
requirements.md ready! .hoyeon/specs/{name}/requirements.md

Goal
----------------------------------------
{confirmed_goal}

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

Harness
----------------------------------------
CLAUDE.md: architecture + domain context + team conventions
Rules: {n} constraints → .claude/rules/
Skills: {list of skills}
Hooks: {list of hooks}

Task Derivation
----------------------------------------
(none in requirements.md — /execute will derive tasks into plan.json
 next to requirements.md: project init, guard rails + rules, test infra, vertical slice exemplar,
 conditional extensions, domain skills, project hooks, and a final scaffold verification.)

Quality Criteria
----------------------------------------
- Agent extensibility: vertical slice exemplar (T3)
- Testability: test infrastructure + exemplar tests (T4)
- Drift resistance: CLAUDE.md + rules + lint + CI (T2)
- Type safety: [type contract strategy from D_]
- Cross-session continuity: CLAUDE.md with domain/team context (T2)
- Task automation: domain skills (T_SKILL)
- Code quality enforcement: project hooks (T_HOOK)
```

```
AskUserQuestion(
  question: "Review the scaffold plan above.",
  options: [
    { label: "/execute", description: "Start scaffolding" },
    { label: "Revise architecture (L2)", description: "Change architecture decisions" },
    { label: "Revise harness (L3)", description: "Change harness setup" },
    { label: "Revise plan (L4)", description: "Adjust requirements or harness decisions" },
    { label: "Abort", description: "Stop" }
  ]
)
```

On approval, run `/execute`.

---

## User Approval Protocol

Three approval gates (L2, L3, L4). L2: architecture, L3: harness, L4: unified plan. Same pattern as specify:

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

- [ ] requirements.md at `.hoyeon/specs/{name}/requirements.md`
- [ ] Confirmed Goal is architecture-framed (not feature-framed)
- [ ] Non-Goals includes "feature implementation" or similar
- [ ] L2: Decisions cover all 5 architecture dimensions
- [ ] L2: Conditional extensions detected and recorded as decisions
- [ ] L3: Applicable harness decisions (D_H1-D_H5, skip if user opted out) written to Decisions section
- [ ] L3: Constraints → rules conversion offered to user
- [ ] L3: Skills auto-suggested from tech stack + user input
- [ ] L3: Hooks auto-detected from formatter/linter choices
- [ ] L4: Requirements include Code (R1-R3) + Conditional (R4-R7) + Harness (R8-R10)
- [ ] L4: Every sub-requirement has `given`, `when`, `then` (mandatory)
- [ ] L4: No tasks written to requirements.md (/execute writes plan.json)
- [ ] R1 includes mandatory vertical slice exemplar sub-requirement with full GWT
- [ ] Exemplar sub-req requires importable utilities (logger, config, errors)
- [ ] R3.1 CLAUDE.md includes domain context (D_H1), team conventions (D_H2), available skills (D_H4), and active hooks (D_H5)
- [ ] R9 sub-reqs require project-specific commands (not generic placeholders)
- [ ] R10 sub-reqs require hooks matching actual L2 tooling decisions
- [ ] Plan Summary includes Harness section and states tasks come from /execute
- [ ] Plan Summary presented to user
