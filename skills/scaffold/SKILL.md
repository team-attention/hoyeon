---
name: scaffold
description: |
  Greenfield project architecture scaffolding for AI Agent productivity.
  Interview-driven architecture decisions → spec.json → execute.
  Produces: Code Structure (with vertical slice exemplar), Test Infrastructure, Guard Rails,
  conditional extensions, AND Harness Infrastructure (Project Memory, Domain Skills, Hooks).
  L2-heavy pipeline (architecture + harness decisions), L3 minimal (no behavioral requirements).
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
| 1 | **Tech Stack** | 20% | Language/runtime, framework, package manager |
| 2 | **Communication** | 15% | Client-server protocol, API style, type safety strategy |
| 3 | **Data & State** | 20% | Database choice, ORM/query builder, migration strategy, caching |
| 4 | **Testing** | 15% | Test framework, test patterns, coverage strategy |
| 5 | **DevOps & Environment** | 15% | Containerization, CI/CD, env config, deployment target |
| 6 | **Harness & Context** | 15% | Domain knowledge, team conventions, recurring tasks, hooks |

**L1 Auto-Resolve**: Check each checkpoint against environment scan. Node installed → resolve "runtime" checkpoint. Docker available → partially resolve containerization.

### Dimension 6: Harness & Context Checkpoints

Dimension 6 captures project context that code structure alone cannot express. These checkpoints drive the Harness Extensions (R8, R9, R10).

| # | Checkpoint | Question Style | Drives |
|---|-----------|----------------|--------|
| 6-1 | **Domain Terms & Business Rules** | "Does this project have domain-specific terminology or business rules the agent should always know?" | R8 (Memory) |
| 6-2 | **Team Conventions** | "Are there team rules for commits, PRs, branching, code review, or deployment?" | R8 (Memory) |
| 6-3 | **Recurring Tasks** | Stack-based auto-suggest + "What tasks will you repeat frequently beyond these?" | R9 (Skills) |
| 6-4 | **Code Quality Automation** | Auto-resolved from Dim 1 (formatter, linter, type checker detected) | R10 (Hooks) |

**6-1 Example:**
```
AskUserQuestion(
  question: "Does this project have domain-specific terms or business rules? For example, 'tenant = company-level customer' or 'credit balance must never go negative'.",
  options: [
    { label: "Yes, I'll describe them", description: "You'll provide domain terms and key rules" },
    { label: "None yet", description: "Skip — can add later via memory" },
    { label: "Agent decides", description: "Infer from project goal if possible" }
  ]
)
```

**6-2 Example:**
```
AskUserQuestion(
  question: "Does your team have conventions for commits, PRs, or branching?",
  options: [
    { label: "Conventional Commits + GitHub Flow", description: "feat/fix/chore prefixes, feature branches, squash merge" },
    { label: "Trunk-based development", description: "Short-lived branches, no long-running feature branches" },
    { label: "Custom — I'll describe", description: "You'll specify your team's rules" },
    { label: "Solo project, no conventions", description: "Skip team context" }
  ]
)
```

**6-3 Stack-Based Auto-Suggestion:**

After Dimensions 1-5 are resolved, scan decisions to auto-suggest skills:

| Decision Signal | Auto-Suggested Skill | Description |
|----------------|---------------------|-------------|
| DB + ORM (Prisma, Drizzle, SQLAlchemy) | `/migrate` | Run migration + regenerate types |
| DB detected | `/seed-data` | Generate development seed data |
| Docker / docker-compose | `/deploy` | Build, push, run with health check |
| API server (REST, GraphQL, tRPC) | `/api-test` | Test endpoint with curl/httpie |
| Async workers (Celery, BullMQ) | `/worker-test` | Dispatch test task + verify result |
| CLI binary (Rust, Go) | `/release` | Version bump + build + tag + publish |
| Frontend framework | `/new-component` | Scaffold component + test + story |
| Payment integration (Stripe, etc.) | `/test-webhook` | Forward + trigger webhook locally |

Present auto-suggestions, then ask: "Any other tasks you'll repeat frequently?"

**6-4 Auto-Resolution from Dimension 1:**

| Tech Stack Decision | Auto-Resolved Hook |
|--------------------|-------------------|
| TypeScript (tsconfig.json) | PostToolUse: `tsc --noEmit` on Edit/Write to .ts files |
| Prettier configured | PostToolUse: `prettier --write` on Edit/Write |
| ESLint configured | PostToolUse: `eslint --fix` on Edit/Write |
| Ruff / Black (Python) | PostToolUse: `ruff format` on Edit/Write |
| rustfmt (Rust) | PostToolUse: `rustfmt` on Edit/Write |
| gofmt (Go) | PostToolUse: `gofmt -w` on Edit/Write |
| .env files present | PreToolUse: block Edit/Write to `.env*` |
| Lock files present | PreToolUse: block Edit/Write to lock files |

These hooks are auto-resolved (no interview question needed). Present the list for user confirmation during L2 approval.

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
- All architecture decisions (Dimensions 1-6)
- Activated conditional extensions AND harness extensions
- The 7 quality criteria (agent extensibility, testability, drift resistance, type safety, cross-session continuity, task automation, code quality enforcement)

Check:
1. Do decisions form a coherent stack? (no contradictions)
2. Are the 7 quality criteria addressed?
3. Any activated extension missing its supporting decisions?
4. Any decision that agents will struggle to follow consistently?
5. Are harness extensions (R8/R9/R10) appropriately activated given the project type?
   - Solo/simple project with no domain terms → R8.3/R8.4 correctly skipped?
   - Recurring tasks detected → R9 activated?
   - Formatter/linter chosen → R10 activated with matching tool?

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

**Harness Extensions (from Dimension 6):**

```
R8: "Project Memory — Architecture decisions, domain knowledge, and team context persisted for cross-session continuity" (always active — R8.2 minimum, R8.3 if 6-1 provided, R8.4 if 6-2 provided)
  R8.1: "MEMORY.md index initialized with pointers to memory files"
  R8.2: "Architecture memory file recording L2 decisions (tech stack, patterns, conventions)"
  R8.3: "Domain memory file with project-specific terms and business rules (if provided in 6-1)"
  R8.4: "Team memory file with conventions, PR rules, branching strategy (if provided in 6-2)"

R9: "Domain Skills — Project-specific repeatable task recipes" (if recurring tasks detected in 6-3)
  R9.1: "Each auto-suggested skill has SKILL.md with step-by-step instructions"
  R9.2: "Each user-specified skill has SKILL.md with project-tailored steps"
  R9.3: "Skills include scripts/ or templates/ when the task involves validation or boilerplate"

R10: "Project Hooks — Automated code quality enforcement" (if tooling detected in 6-4)
  R10.1: ".claude/settings.json with PostToolUse hooks for detected formatter/linter/type-checker"
  R10.2: "PreToolUse protection hooks for .env and lock files (if present)"
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

--- Harness tasks ---

T_MEM: Project Memory initialization
    fulfills: [R8]
    depends_on: [T2]
    ← Converts L2 decisions + Dim 6 interview answers into memory files

T_SKILL: Domain Skills generation (if R9 exists)
    fulfills: [R9]
    depends_on: [T3]
    ← Needs vertical slice context to write project-accurate skill steps

T_HOOK: Project Hooks setup (if R10 exists)
    fulfills: [R10]
    depends_on: [T1]
    ← Only needs base config to know formatter/linter paths

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

### T_MEM: Project Memory Initialization

T_MEM converts L2 architecture decisions and Dimension 6 interview answers into persistent memory files.

**Output structure:**
```
~/.claude/projects/{project-path}/memory/
├── MEMORY.md                      # Index file with pointers
├── project_architecture.md        # L2 decisions as memory (type: project)
├── project_domain.md              # Domain terms + business rules (type: project, if 6-1 provided)
└── project_team.md                # Team conventions (type: project, if 6-2 provided)
```

**Memory file format** (follows auto-memory frontmatter spec):
```markdown
---
name: project-architecture
description: Architecture decisions for {project name} — tech stack, patterns, conventions
type: project
---

{Content derived from L2 decisions. Each decision becomes a bullet point.}
```

**Rules:**
- R8.2 (architecture) is always created — L2 decisions always exist
- R8.3 (domain) is only created if user provided domain terms in checkpoint 6-1
- R8.4 (team) is only created if user provided team conventions in checkpoint 6-2
- If user answered "None yet" or "Solo project" → skip that memory file, don't create empty ones
- MEMORY.md index entries must be under 150 chars each

---

### T_SKILL: Domain Skills Generation

T_SKILL creates project-specific skill files based on Dimension 6-3 results.

**Output structure:**
```
.claude/skills/
├── {skill-name}/
│   ├── SKILL.md                   # Step-by-step instructions
│   └── scripts/                   # Optional validation scripts
│       └── validate.sh
```

**SKILL.md template:**
```yaml
---
name: {skill-name}
description: {what this skill does — specific to this project}
disable-model-invocation: true
---

# /{skill-name} — {Title}

1. {Step 1 — use project-specific commands/paths from L2 decisions}
2. {Step 2}
3. {Step 3}
4. Verify: {how to check it worked}
```

**Rules:**
- Each skill must reference actual tools/commands from L2 decisions (e.g., "npx prisma migrate dev" not "run migration")
- `disable-model-invocation: true` for all domain skills (they have side effects)
- Include a `scripts/validate.sh` when the task has a checkable outcome (build passes, migration valid, etc.)
- Auto-suggested skills use the detection table from Dimension 6-3
- User-specified skills are written based on their description + project context

---

### T_HOOK: Project Hooks Setup

T_HOOK generates `.claude/settings.json` with hooks derived from Dimension 6-4 auto-resolution.

**Output:** `.claude/settings.json` (or merge into existing)

**Hook generation rules:**

1. **PostToolUse formatter** (if formatter detected):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "{formatter_command} $CLAUDE_FILE_PATH"
          }
        ]
      }
    ]
  }
}
```

2. **PreToolUse protection** (if .env or lock files will exist):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo $CLAUDE_FILE_PATH | grep -qE '\\.(env|env\\..*)$' && echo 'BLOCK: .env files should not be edited directly' && exit 1 || exit 0"
          }
        ]
      }
    ]
  }
}
```

**Rules:**
- Only add hooks for tools actually chosen in L2 (don't add Prettier hook if user chose Biome)
- If `.claude/settings.json` already exists (unlikely in greenfield), merge rather than overwrite
- Present the hook list during L2 approval so user can opt out of specific hooks
- formatter command must match the actual binary (prettier, biome, ruff, gofmt, rustfmt)

---

### TF: Scaffold Verification

TF verifies the scaffold is agent-ready:

```json
{
  "id": "TF",
  "action": "Scaffold verification: agent extensibility + harness check",
  "type": "verification",
  "depends_on": ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T_MEM", "T_SKILL", "T_HOOK"],
  "steps": [
    "Build: all build/lint/typecheck commands pass",
    "Tests: all exemplar tests pass",
    "CLAUDE.md: architectural rules are clear and complete",
    "Exemplar: vertical slice is complete (entry → data → response → test)",
    "Utilities: logger, config, errors are importable and used in exemplar",
    "Memory: MEMORY.md exists with valid pointers, memory files have correct frontmatter",
    "Skills: each generated skill has valid SKILL.md with project-specific commands (not generic placeholders)",
    "Hooks: .claude/settings.json hooks reference correct tool commands (formatter binary matches L2 decision)",
    "Agent test: could an agent read this codebase AND its harness and build a new feature consistently?"
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

Harness Extensions
----------------------------------------
[x] Project Memory (architecture + domain + team)
[x] Domain Skills (/migrate, /seed-data, /deploy + user: /create-tenant)
[x] Project Hooks (prettier, tsc, .env protection)

Scaffold Tasks (DAG)
----------------------------------------
T1: Project init [core] — pending
T2: Guard Rails [core] — pending (depends: T1)
T3: Vertical slice exemplar [core] — pending (depends: T2)
T4: Test infrastructure [core] — pending (depends: T3)
T5: Type Contracts [extension] — pending (depends: T3)
T6: Data Layer [extension] — pending (depends: T1)
T_MEM: Project Memory [harness] — pending (depends: T2)
T_SKILL: Domain Skills [harness] — pending (depends: T3)
T_HOOK: Project Hooks [harness] — pending (depends: T1)
TF: Scaffold verification — pending (depends: all)

Quality Criteria
----------------------------------------
- Agent extensibility: vertical slice exemplar (T3)
- Testability: test infrastructure + exemplar tests (T4)
- Drift resistance: CLAUDE.md + lint + CI (T2)
- Type safety: [type contract strategy from D_] (T5)
- Cross-session continuity: project memory (T_MEM)
- Task automation: domain skills (T_SKILL)
- Code quality enforcement: project hooks (T_HOOK)
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
- [ ] `context.decisions[]` cover all 6 architecture dimensions (including Harness & Context)
- [ ] Conditional extensions detected and recorded as decisions
- [ ] Harness extensions detected from Dimension 6 interview
- [ ] Requirements map to 3 Core + activated extensions + harness extensions
- [ ] R1 includes mandatory vertical slice exemplar requirement
- [ ] T3 (exemplar) includes importable utilities (logger, config, errors)
- [ ] T_MEM produces memory files with correct frontmatter (name, description, type)
- [ ] T_SKILL produces skills with project-specific commands (not generic placeholders)
- [ ] T_HOOK produces hooks matching actual L2 tooling decisions
- [ ] TF includes agent extensibility + harness check
- [ ] CLAUDE.md generation is in Guard Rails task (T2)
- [ ] Plan Summary includes Harness Extensions section
- [ ] Plan Summary presented to user
