---
name: specify
description: |
  Full-featured spec generator that outputs unified spec.json v4 via cli.
  Interview-driven planning with mode support (quick/standard × interactive/autopilot).
  Incremental spec.json build via cli spec merge.
  Use when: "/specify", "specify", "plan this", "계획 짜줘", "스펙 만들어줘"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Write
  - AskUserQuestion
validate_prompt: |
  Must produce a valid spec.json that passes both cli spec validate and cli spec check.
  spec.json must include: meta.mode, context.research (structured), tasks with acceptance_criteria, requirements with scenarios.
  Standard mode must include: verification_summary (derived from requirements), constraints, meta.non_goals.
  Output files must be in .dev/specs/{name}/ directory.
---

# /specify — Full Spec Generator (spec.json v4)

Generate a schema-validated, machine-executable spec.json through interview-driven planning.
Single file output — no DRAFT.md, no PLAN.md. All data flows through `hoyeon-cli spec` commands.

## Core Principles

1. **cli is the writer** — Never hand-write spec.json. Use `spec init`, `spec merge`, `spec task`
2. **Validate on every write** — `spec merge` auto-validates. Errors caught immediately
3. **Mode-aware** — Depth and interaction control agent count and user involvement
4. **Incremental build** — spec.json evolves from v0 (meta only) to final (all sections)
5. **No intermediate files** — No DRAFT.md. spec.json IS the draft until finalized

---

## Mode Selection

### Flag Parsing

| Flag | Effect | Default |
|------|--------|---------|
| `--quick` | `{depth}` = quick | `{depth}` = standard |
| `--autopilot` | `{interaction}` = autopilot | (depends on depth) |
| `--interactive` | `{interaction}` = interactive | (depends on depth) |

### Auto-Detect Depth

| Keywords | Auto-Depth |
|----------|------------|
| "fix", "typo", "rename", "bump", "update version" | quick |
| Everything else | standard |

### Interaction Defaults

| Depth | Default Interaction |
|-------|---------------------|
| quick | autopilot |
| standard | interactive |

### Mode Combination Matrix

|  | Interactive | Autopilot |
|---|-------------|-----------|
| **Quick** | `--quick --interactive` | `--quick` (default for quick) |
| **Standard** | (default) | `--autopilot` |

### Mode Variables

Throughout this document, `{depth}` and `{interaction}` refer to the resolved mode values:
- `{depth}` = `quick` | `standard`
- `{interaction}` = `interactive` | `autopilot`

### Autopilot Decision Rules

| Decision Point | Rule |
|----------------|------|
| Tech choices | Use existing stack; prefer patterns in codebase |
| Trade-off questions | Choose lower-risk, simpler option |
| Ambiguous scope | Interpret narrowly (minimum viable) |
| HIGH risk items | HALT and ask user (override autopilot) |
| Missing info | Assume standard approach; log in assumptions |

---

## Phase 0: Initialize

```bash
hoyeon-cli spec init {name} --goal "{goal}" --depth {depth} --interaction {interaction} \
  .dev/specs/{name}/spec.json
```

**Naming**: `{name}` = kebab-case, derived from goal (e.g., "fix-login-bug", "add-auth-middleware").

Output: minimal spec.json with `meta` + placeholder `tasks` + `history`.

Immediately update session state with the spec path:

```bash
SESSION_ID="[session ID from UserPromptSubmit hook]"
hoyeon-cli session set --sid $SESSION_ID --spec ".dev/specs/{name}/spec.json"
```

After init, if non-goals are already apparent from the user's request, merge them early:

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{
  "meta": {
    "non_goals": ["...", "..."]
  }
}'
```

> Non-goals are strategic scope exclusions — "What this project is NOT trying to achieve."
> They are NOT verifiable rules (those go in `constraints`). They are direction statements for humans and reviewers.

### Phase 0.1: Intent Classification (internal analysis)

After `spec init`, classify the task intent and apply the corresponding strategy:

| Intent Type | Keywords | Strategy | Key Questions |
|-------------|----------|----------|---------------|
| **Refactoring** | "refactoring", "cleanup", "improve", "migrate" | Safety first, regression prevention | "Existing tests?", "Gradual vs all-at-once?" |
| **New Feature** | "add", "new", "implement" | Pattern exploration, integration points | "Similar feature exists?", "Where to integrate?" |
| **Bug Fix** | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix | "Reproduction steps?", "When did it start?" |
| **Architecture** | "design", "structure", "architecture" | Trade-off analysis, oracle consultation | "Scalability vs simplicity?", "Constraints?" |
| **Research** | "investigate", "analyze", "understand" | Investigation only, NO implementation | "Output format?", "Scope limits?" |
| **Migration** | "migration", "upgrade", "transition" | Phased approach, rollback plan | "Downtime allowed?", "Rollback possible?" |
| **Performance** | "performance", "optimize", "slow" | Measure first, profile → optimize | "Current measurements?", "Target metrics?" |

**Intent-Specific Actions**:

- **Refactoring**: Must identify existing tests, define "done" clearly
- **Bug Fix**: Must get reproduction steps before planning
- **Architecture**: Consider calling `Skill("agent-council")` for multiple perspectives
- **Migration**: External docs critical — consider tech-decision research
- **Performance**: Baseline measurement required before any optimization

Use the classification internally to guide Phase 1 agent selection and interview questions. Do NOT merge intent_classification into spec.json (not in schema).

---

## Phase 1: Discovery

> **Mode Gate**:
> - **Quick**: 2 agents (code-explorer ×2)
> - **Standard**: 4 agents (code-explorer ×2 + docs-researcher + ux-reviewer)

Launch exploration agents **in parallel** (foreground, NOT background).

<details>
<summary>Quick Mode (2 agents)</summary>

```
Task(subagent_type="code-explorer",
     prompt="Find: existing patterns for [feature type]. Report as file:line format.")

Task(subagent_type="code-explorer",
     prompt="Find: project structure, package.json scripts for lint/test/build commands.")
```

</details>

**Standard Mode** (4 agents):

```
Task(subagent_type="code-explorer",
     prompt="Find: existing patterns for [feature type]. Report findings as file:line format.")

Task(subagent_type="code-explorer",
     prompt="Find: project structure, package.json scripts for lint/test/build commands. Report as file:line format.")

Task(subagent_type="docs-researcher",
     prompt="Find internal documentation relevant to [feature/task]. Search docs/, ADRs, READMEs, config files for conventions, architecture decisions, and constraints. Report as file:line format.")

Task(subagent_type="ux-reviewer",
     prompt="User's Goal: [goal]. Evaluate how this change affects existing UX.")
```

### After agents complete → merge research

> **Continuous Update**: spec.json is updated incrementally after each interaction. Each agent completion triggers a `spec merge`. Do not batch — merge immediately after each phase completes.

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{
  "context": {
    "request": "[user original request]",
    "research": {
      "summary": "[high-level summary]",
      "patterns": [
        {"path": "src/...", "start_line": 10, "end_line": 25, "description": "..."}
      ],
      "structure": ["src/middleware/", "src/config/"],
      "commands": {"test": "npm test", "lint": "npm run lint"},
      "documentation": [
        {"path": "docs/arch.md", "line": 15, "description": "..."}
      ],
      "ux_review": {
        "current_flow": "...",
        "impact": "...",
        "recommendations": ["..."],
        "must_not_do": ["..."]
      }
    }
  }
}'
```

> Quick mode: omit `documentation` and `ux_review` from research.

### Present exploration summary

> **Mode Gate**:
> - **Quick**: 2-3 line abbreviated summary
> - **Autopilot**: Log but don't wait for confirmation

```
"Codebase exploration results:
 - Structure: [key dirs]
 - Patterns: [2-3 discovered patterns]
 - Commands: test/lint/build
 Please confirm this context is correct."
```

---

## Phase 2: Interview

> **Mode Gate**:
> - **Quick**: SKIP entirely → merge assumptions
> - **Autopilot**: Auto-decide → merge assumptions
> - **Interactive**: AskUserQuestion → merge decisions

### Quick / Autopilot → Assumptions

Apply Autopilot Decision Rules, then:

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json '{
  "context": {
    "assumptions": [
      {"id": "A1", "belief": "...", "if_wrong": "...", "impact": "minor"}
    ]
  }
}'
```

### Interactive → Decisions

Use `AskUserQuestion` for boundaries, trade-offs, success criteria only.
Propose based on research; don't ask what you can discover.

#### What to ASK (user knows, agent doesn't)

Use `AskUserQuestion` only for:
- **Non-goals**: "What is this project NOT trying to achieve?" (→ merge into `meta.non_goals`)
- **Boundaries**: "Any restrictions on what not to do?"
- **Trade-offs**: Only when multiple valid options exist and exploration doesn't resolve them
- **Success Criteria**: "When is this considered complete?"

```
AskUserQuestion(
  question: "Which authentication method should we use?",
  options: [
    { label: "JWT (Recommended)", description: "jsonwebtoken already installed" },
    { label: "Session", description: "Requires server state management" },
    { label: "Need comparison", description: "Research with tech-decision" }
  ]
)
```

#### What to DISCOVER (agent finds)

Agent explores — do NOT ask the user about these:
- File locations
- Existing patterns to follow
- Integration points
- Project commands (lint, test, build)

#### What to PROPOSE (research first, then suggest)

After exploration completes, propose instead of asking:

```
"Based on my investigation, this approach should work:
- Middleware at src/middleware/auth.ts
- Following existing logging.ts pattern
- Using jwt.ts verify() function

Let me know if you prefer a different approach."
```

> **Core Principle**: Minimize questions, maximize proposals based on research.

After each decision, immediately merge (continuous update):

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json '{
  "context": {
    "decisions": [
      {"id": "D1", "decision": "...", "rationale": "...",
       "alternatives_rejected": [{"option": "...", "reason": "..."}]}
    ]
  }
}'
```

### Phase 2.5: Tech-Decision Support (Conditional)

> **Mode Gate**:
> - **Quick**: Skip entirely. Use existing stack and patterns found in codebase.
> - **Autopilot**: Skip. Use existing stack; log choice in assumptions.

**Trigger conditions** (check after interview questions):
- Intent is **Architecture** or **Migration**
- User's request contains comparison keywords: "vs", "versus", "compare", "which one", "what should I use"
- User expresses uncertainty mid-interview: "which is better?", "what should I use?"

**If triggered**, propose tech-decision research to user:

```
AskUserQuestion(
  question: "A technology choice seems needed. Shall we run a deep analysis with tech-decision?",
  header: "Tech Research",
  options: [
    { label: "Yes, run analysis", description: "Compare across multiple sources (takes time)" },
    { label: "No, proceed quickly", description: "Decide based on existing patterns/docs" }
  ]
)
```

**If user selects "Yes, run analysis"**:
```
Skill("tech-decision", args="[comparison topic extracted from user's request]")
```

Then merge tech-decision results into spec.json and continue to Phase 2 Transition Gate.

**If user selects "No, proceed quickly"**: Proceed to Transition Gate.

### Transition Gate (Phase 2 → Phase 3)

> **Mode Gate**:
> - **Quick**: Auto-transition after exploration complete and assumptions populated.
> - **Autopilot**: Auto-transition when all conditions met, no explicit user trigger needed.
> - **Standard + Interactive**: Require explicit user trigger ("make it a plan" or similar).

#### Plan Transition Conditions:

- [ ] No `severity: "critical"` gaps remain in `known_gaps`
- [ ] Key decisions/assumptions recorded
- [ ] **Standard + Interactive only**: User explicitly says "make it a plan", "generate the plan", "create the work plan", or similar

#### If critical gaps remain:

```
"Before analysis, I need to confirm: [critical question]"
```

#### Standard + Interactive: Do NOT auto-transition

If all conditions are met but user hasn't explicitly requested plan generation, continue the conversation naturally. **DO NOT generate a plan just because you think you have enough information.**

---

## Phase 3: Analysis

> **Mode Gate**:
> - **Quick**: 1 agent (tradeoff-analyzer lite)
> - **Standard**: 3-4 agents parallel + codex-strategist sequential

### Phase 3 Pre-read: TESTING.md

**Before launching analysis agents**, read TESTING.md to inline into verification-planner's prompt:

```bash
# Read TESTING.md from plugin root (3 levels up from skill baseDir)
# ${baseDir} is shown in the "Base directory for this skill:" header above.
# Resolve: ${baseDir}/../../../TESTING.md
TESTING_MD_CONTENT = Read("${baseDir}/../../../TESTING.md")
```

> **Why inline?** Subagents cannot resolve `${baseDir}` — it's only available as header context to the main agent. The main agent must read the file and pass the content directly into the subagent prompt.

<details>
<summary>Quick Mode (1 agent)</summary>

```
Task(subagent_type="tradeoff-analyzer",
     prompt="Quick assessment: risk per change area, flag HIGH risk items only.")
```

</details>

**Standard Mode** (3-4 agents parallel):

```
Task(subagent_type="gap-analyzer",
     prompt="Analyze for missing requirements, AI pitfalls, must-NOT-do items.")

Task(subagent_type="tradeoff-analyzer",
     prompt="Assess risk per change area, propose simpler alternatives, generate decision_points.")

Task(subagent_type="verification-planner",
     prompt="Generate requirements[] scenarios for ALL verification points.

For EACH verification point, output a requirement with Given-When-Then scenarios.
Each scenario MUST include:
- verified_by: 'machine' (automated command), 'agent' (AI assertion), or 'human' (manual inspection)
- execution_env: 'host' (local), 'sandbox' (docker/container), or 'ci' (CI pipeline) — optional, default 'host'
- verify: command (for machine), assertion (for agent), or instruction (for human)

## Testing Strategy (from TESTING.md)
[Paste TESTING_MD_CONTENT here — the full content read in the pre-read step above.
 If the file was not found, note this in Verification Gaps and proceed without it.]

Use the 4-Tier testing model above. Output format:
- Tier 1-3 items → verified_by: 'machine', execution_env: 'host'
- Tier 4 items → verified_by: 'machine', execution_env: 'sandbox'
- Subjective/UX items → verified_by: 'human'
- AI-checkable items → verified_by: 'agent'")

# Optional: only when migration, new library, unfamiliar tech
Task(subagent_type="external-researcher",
     prompt="Research official docs for [library]: [specific question]")
```

**After parallel agents** (standard only):

```
Task(subagent_type="codex-strategist",
     prompt="Synthesize gap, tradeoff, verification results. Find contradictions and blind spots.")
```

### Handle HIGH risk decision_points

> **Autopilot**: HALT and ask user for HIGH risk only. Auto-select conservative option for MED/LOW.
> **Interactive**: Present all decision_points via AskUserQuestion.

### S-items Fallback Rules

When merging verification-planner results into `requirements`, apply these fallback rules:

- **Misclassified Tier 4**: If verification-planner output has Tier 4 items without `execution_env: "sandbox"`, fix them — Tier 4 items MUST have `execution_env: "sandbox"`.
- **Missing sandbox items despite sandbox infra**: If the project has sandbox infrastructure (docker-compose, `sandbox/features/`) but no requirement scenarios have `execution_env: "sandbox"`, flag this as a warning and check if Tier 4 items were misclassified.
- **UI screenshot S-items**: If the work involves UI/frontend changes and verification-planner did not include screenshot-based sandbox scenarios, add them: screenshot capture at affected routes + comparison against design spec (`execution_env: "sandbox"`, `verified_by: "machine"`).

### Merge analysis results

```bash
# known_gaps from gap-analyzer
hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json '{
  "context": {
    "known_gaps": [
      {"gap": "...", "severity": "medium", "mitigation": "..."}
    ]
  }
}'

# constraints from gap-analyzer
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{
  "constraints": [
    {"id": "C1", "type": "must_not_do", "rule": "...",
     "verified_by": "agent", "verify": {"type": "assertion", "checks": ["..."]}}
  ]
}'

# requirements from verification-planner (apply S-items fallback rules above)
# Requirements are the SINGLE SOURCE OF TRUTH for all verification.
# verification_summary is DERIVED from requirements (not stored independently).
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{
  "requirements": [
    {
      "id": "R1", "behavior": "...", "priority": 1,
      "scenarios": [
        {"id": "R1-S1", "given": "...", "when": "...", "then": "...",
         "verified_by": "machine", "execution_env": "host",
         "verify": {"type": "command", "run": "...", "expect": {"exit_code": 0}}}
      ]
    }
  ]
}'
# verification_summary is derived from requirements at Phase 5d / Phase 6:
#   A-items = scenarios where verified_by is "machine" or "agent" AND execution_env is "host"
#   H-items = scenarios where verified_by is "human"
#   S-items = scenarios where execution_env is "sandbox"

# external_dependencies — HUMAN-ONLY tasks from exploration + verification-planner output
# If no external dependencies exist, omit this merge entirely.
#
# IMPORTANT: pre_work and post_work are HUMAN-ONLY tasks.
# These are things the agent CANNOT do — infrastructure setup, API key provisioning,
# environment configuration, deployment triggers, manual verification, etc.
# If a task CAN be automated by the agent, put it in the Task DAG instead.
#
# pre_work: things the human must complete BEFORE /execute starts
# post_work: things the human must do AFTER execution completes
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{
  "external_dependencies": {
    "pre_work": [
      {"id": "PW-1", "dependency": "PostgreSQL", "action": "Create DB instance and set DATABASE_URL", "blocking": true}
    ],
    "post_work": [
      {"id": "POW-1", "dependency": "Staging env", "action": "Deploy to staging and verify"}
    ]
  }
}'
```

---

## Phase 4: Spec Generation

Build tasks from research findings + analysis results. This is the main spec authoring step.

### Task structure guidelines

- Task IDs: `T1`, `T2`, ... with final `TF` (type: `verification`)
- Every task: `must_not_do: ["Do not run git commands"]`
- Every task: `acceptance_criteria` with at least `functional` + `static` + `runtime`
- Every task: `inputs` listing dependencies from previous tasks (use task output IDs)
- HIGH risk tasks: include rollback steps in `steps`
- Map `research.patterns` → `tasks[].references`
- Map `research.commands` → `TF.acceptance_criteria.runtime`
- Apply S-items from `requirements[].scenarios` where `execution_env: "sandbox"` to TF acceptance criteria where applicable

#### Type Field

| Type | Retry on Fail | Edit/Write Tools | Bash for Testing | Failure Handling |
|------|---------------|------------------|------------------|------------------|
| `work` | Up to 2x | Yes | Yes | Analyze → Fix Task or halt |
| `verification` | No | Forbidden | Yes (tests, builds, sandbox) | Analyze → Fix Task or halt |

**Note**: Failure handling logic is unified for both types. Type only determines retry permission and file modification rights.

#### Acceptance Criteria Categories

| Category | Required | Description |
|----------|----------|-------------|
| Functional | Yes | Feature functionality verification (business logic) |
| Static | Yes | Type check, lint pass (modified files) |
| Runtime | Yes | Related tests pass |
| Cleanup | No | Unused import/file cleanup (only when needed) |

**Worker completion condition**: `Functional AND Static AND Runtime pass (AND Cleanup if specified)`

#### Requirements (Given-When-Then)

Always generate the `requirements` section with Given-When-Then scenarios — do not skip even if success criteria were not explicitly discussed. Derive from the goal, acceptance criteria, and user intent.

### Merge tasks

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{
  "tasks": [
    {
      "id": "T1", "action": "...", "type": "work", "status": "pending",
      "risk": "low",
      "file_scope": ["src/..."],
      "inputs": [],
      "outputs": [{"id": "config_path", "path": "src/config/auth.json"}],
      "steps": ["Step 1", "Step 2"],
      "references": [{"path": "src/...", "start_line": 10, "end_line": 25}],
      "must_not_do": ["Do not run git commands"],
      "acceptance_criteria": {
        "functional": [{"description": "Config file created with required fields"}],
        "static": [{"description": "Valid JSON", "command": "node -e \"require(...)\""}],
        "runtime": [{"description": "Existing tests pass", "command": "npm test"}]
      }
    },
    {
      "id": "TF", "action": "Full verification", "type": "verification", "status": "pending",
      "depends_on": ["T1"],
      "inputs": [{"id": "all_outputs", "from_task": "T1", "type": "deliverables"}],
      "must_not_do": ["Do not modify any files", "Do not run git commands"],
      "acceptance_criteria": {
        "functional": [{"description": "All deliverables exist and work"}],
        "static": [{"description": "Lint passes", "command": "npm run lint"}],
        "runtime": [{"description": "All tests pass", "command": "npm test"}]
      }
    }
  ]
}'
```

### Add requirements (always generate — derive from goal, acceptance criteria, and user intent)

Requirements are the **single source of truth** for all verification. Each scenario specifies WHO verifies (`verified_by`) and WHERE it runs (`execution_env`).

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{
  "requirements": [
    {
      "id": "R1", "behavior": "...", "priority": 1,
      "scenarios": [
        {"id": "R1-S1", "given": "...", "when": "...", "then": "...",
         "verified_by": "machine", "execution_env": "host",
         "verify": {"type": "command", "run": "...", "expect": {"exit_code": 0}}},
        {"id": "R1-S2", "given": "...", "when": "...", "then": "...",
         "verified_by": "human",
         "verify": {"type": "instruction", "check": "Visually confirm layout matches design"}},
        {"id": "R1-S3", "given": "...", "when": "...", "then": "...",
         "verified_by": "machine", "execution_env": "sandbox",
         "verify": {"type": "command", "run": "docker exec ...", "expect": {"exit_code": 0}}}
      ]
    }
  ]
}'
```

---

## Phase 5: Validate & Review

### 5a. Mechanical validation

```bash
hoyeon-cli spec validate .dev/specs/{name}/spec.json
hoyeon-cli spec check .dev/specs/{name}/spec.json
```

If either fails → fix and retry (max 2 attempts).

### 5b. DAG visualization

```bash
hoyeon-cli spec plan .dev/specs/{name}/spec.json
```

Show the output to user.

### 5c. Plan review (standard mode only)

> **Mode Gate**:
> - **Quick**: Skip plan-reviewer. Mechanical validation is sufficient.

```
Task(subagent_type="plan-reviewer",
     prompt="Review this spec: .dev/specs/{name}/spec.json
Read the file and evaluate:
- Task decomposition: reasonable granularity?
- Acceptance criteria: verifiable?
- Dependencies: logical order?
- Must NOT do: covers actual risks?
- Risk tags: appropriate levels?")
```

#### Handle reviewer response

**If REJECT** — classify:

- **Cosmetic** (formatting, missing fields): auto-fix via `spec merge`, re-review
- **Semantic** (scope change, logic issue): ask user, then fix

> **Quick**: Max 1 review round. Semantic rejection → HALT.
> **Autopilot**: Cosmetic auto-fix. Semantic without scope change → auto-fix + log assumption. Scope change → HALT.
> **Quick + Autopilot (combined)**: Quick's 1-round limit takes precedence. Cosmetic: auto-fix (counts as the 1 round). Semantic: HALT always (Quick's stricter rule wins; no auto-fix attempt since it would require a 2nd round).

**If OKAY** → proceed.

### 5d. AC Quality Gate (standard only)

> **Mode Gate**:
> - **Quick**: Skip. Proceed directly to Phase 5e.

Inspect **every** AC across `tasks[].acceptance_criteria` and `requirements[].scenarios` to ensure classification completeness AND semantic quality. This gate runs a checklist-based loop (max 5 iterations) — NOT an LLM self-score.

#### Checklist (all must pass)

**Classification completeness:**
- Every `requirements[].scenarios[]` has `verified_by` set (`machine` | `agent` | `human`)
- Every `requirements[].scenarios[]` has a non-empty `verify` object matching its type
- `verification_summary.gaps` is empty (all ACs classified)

**Semantic quality:**
- **Machine ACs**: `verify.run` is an executable shell command (not pseudocode, not natural language). `verify.expect` has a concrete value (e.g., `exit_code: 0`, not "should work")
- **Agent ACs**: `verify.assert` is **falsifiable** — can be proven wrong by inspecting code/output (FAIL: "code is correct". PASS: "all public functions have JSDoc with @param and @returns")
- **Human ACs**: `verify.ask` is **actionable** — a person can follow it step-by-step (FAIL: "verify it". PASS: "Open /login, enter invalid password, confirm error message shows 'Invalid password' not 'Login failed'")

#### Gate Loop

The orchestrator (this skill) owns the loop. The `ac-quality-gate` agent owns single-pass judgment + fix.

```
FOR iteration IN 1..5:
  result = Agent(
    subagent_type="ac-quality-gate",
    description="AC quality check iteration {iteration}",
    prompt="Check AC quality for spec: .dev/specs/{name}/spec.json"
  )

  IF result.status == "PASS":
    print("AC Quality Gate: PASS ({iteration} iteration(s), {result.total_checked} items checked)")
    BREAK

  IF result.status == "FAIL":
    print("AC Quality Gate: iteration {iteration} — {result.fixed} fixed, {len(result.remaining_failures)} remaining")
    # Agent already applied fixes via spec merge. Loop continues to re-check.

  # Re-validate after fixes
  hoyeon-cli spec validate .dev/specs/{name}/spec.json

IF iteration > 5 AND result.status == "FAIL":
  # Escalate remaining issues to user
  print("AC Quality Gate: {len(result.remaining_failures)} items could not be auto-fixed after 5 rounds.")
  FOR EACH f IN result.remaining_failures:
    print("  - {f.id}: {f.detail}")
  AskUserQuestion(
    question: "These ACs could not be auto-fixed. How should we proceed?",
    options: [
      { label: "Fix manually", description: "I'll provide specific verify commands" },
      { label: "Accept as-is", description: "Proceed with current quality level" },
      { label: "Abort", description: "Stop and rethink requirements" }
    ]
  )
```

#### Examples of auto-fix rewrites

| Before (FAIL) | After (PASS) | Type |
|---------------|-------------|------|
| `run: "check auth works"` | `run: "npm test -- --grep 'auth'"`, `expect: { exit_code: 0 }` | machine |
| `assert: "code is correct"` | `assert: "All API endpoints return JSON with 'status' field; no endpoint returns raw strings"` | agent |
| `ask: "verify it"` | `ask: "Navigate to /dashboard after login. Confirm: (1) page loads within 3s, (2) username appears in top-right, (3) sidebar shows 5 menu items"` | human |

### 5e. Verification Summary Confirmation (standard + interactive only)

> **Mode Gate**:
> - **Quick**: Skip. Proceed directly to Phase 5f.
> - **Autopilot**: Skip. Proceed directly to Phase 5f.

After plan review and AC Quality Gate pass, derive the Verification Summary from `requirements[].scenarios` and present it to the user for lightweight confirmation.

**Derivation rules** (from requirements scenarios):
- **A-items** = scenarios where `verified_by` is `"machine"` or `"agent"` AND `execution_env` is `"host"` (or omitted)
- **H-items** = scenarios where `verified_by` is `"human"`
- **S-items** = scenarios where `execution_env` is `"sandbox"`

The summary must include counts for **all three categories**: A-items, H-items, and S-items (if sandbox infra exists).

> **IMPORTANT — Show Before Ask**: FIRST output the full item list as assistant text so the user can read each item. THEN call `AskUserQuestion` for confirmation only. Never put the item details inside the `question` field — the user cannot see truncated content.

**Step 1**: Output assistant text with full details:

```
## Verification Summary

### Agent-verifiable (A): {A-count}
- A-1: {criterion} → {method}
- A-2: {criterion} → {method}
...

### Human-required (H): {H-count}
- H-1: {criterion} — {reason}
- H-2: {criterion} — {reason}
...

### Sandbox (S): {S-count}
- S-1: {criterion} → {method}
...
(or "none" if no S-items)

### Gaps
{gap summary or "none"}
```

**Step 2**: Then ask for confirmation:

```
AskUserQuestion(
  question: "Shall we proceed with this verification strategy?",
  options: [
    { label: "Confirmed", description: "Verification strategy looks good" },
    { label: "Corrections needed", description: "I'd like to change verification items" }
  ]
)
```

**If "Corrections needed"**: Ask which items to change, update via `spec merge` on `requirements` scenarios (the source of truth), then proceed to Phase 5f.

### 5f. Decision Summary (standard + interactive only)

> **Mode Gate**:
> - **Quick**: Skip
> - **Autopilot**: Log only, don't ask

Present summary to user.

> **IMPORTANT — Show Before Ask**: FIRST output the full decision list as assistant text. THEN call `AskUserQuestion` for confirmation only. Never put the decision details inside the `question` field.

**Step 1**: Output assistant text with full details:

```
## Decision Summary

### User Decisions
- D1: {decision} — {rationale}
- D2: {decision} — {rationale}
...

### Agent Decisions (with risk)
- {decision} — {risk level}, {rationale}
...

### Verification Strategy
- A-items: {count}, H-items: {count}, S-items: {count}
```

**Step 2**: Then ask for confirmation:

```
AskUserQuestion(
  question: "Any corrections to the decisions above?",
  options: [
    { label: "All confirmed" },
    { label: "Corrections needed" }
  ]
)
```

---

## Phase 6: Present & Confirm

After plan review OKAY and validation passes, present a **comprehensive Plan Approval Summary** extracted from spec.json before asking the user to proceed. This summary gives the user a complete picture before execution begins.

> **Mode Gate**:
> - **Interactive**: Print the summary + `AskUserQuestion` (next step selection).
> - **Autopilot**: Print the summary and spec path, then stop (no `AskUserQuestion`).

### Plan Approval Summary Format

```
spec.json approved! .dev/specs/{name}/spec.json is ready.
Mode: {depth}/{interaction}

{If non_goals exist:}
Non-goals (explicitly out of scope)
────────────────────────────────────────
  - {non_goal_1}
  - {non_goal_2}
────────────────────────────────────────

────────────────────────────────────────
Task Overview
────────────────────────────────────────
T1: {action}                             [work|LOW] — pending
T2: {action}                             [work|MED] — pending
  depends on: T1
...
TF: Full verification                    [verification] — pending
────────────────────────────────────────

Verification (recap)
────────────────────────────────────────
Agent-verifiable (A): {count}
  - {A-1 criterion} → {method}
  - {A-2 criterion} → {method}
Human-required (H): {count}
  - {H-1 criterion} — {reason}
Sandbox (S): {count} (or "none" if no S-items)
  - {S-1 scenario} (if exists)
Gaps: {gap summary or "none"}
────────────────────────────────────────

Pre-work (human actions — must complete before /execute)
────────────────────────────────────────
{If pre_work items: list with action, mark [BLOCKING] if blocking=true}
{If none: "(none)"}
────────────────────────────────────────

Post-work (human actions after completion)
────────────────────────────────────────
{If post-work items: list with action}
{If none: "(none)"}
────────────────────────────────────────

Key Decisions
────────────────────────────────────────
  - {decision point 1}: {chosen approach}
  - {decision point 2}: {chosen approach}
────────────────────────────────────────

{If quick or autopilot mode (assumptions section exists):}
Assumptions (auto-decided — not confirmed by user)
────────────────────────────────────────
  - {decision point}: {assumed choice} ({rationale})
  Note: These decisions were applied without user confirmation.
        Re-run with --interactive to override.
────────────────────────────────────────

DAG: {output from hoyeon-cli spec plan}
Constraints: {n} items
```

### Extraction Rules

| Section | Source in spec.json | When |
|---------|---------------------|------|
| Non-goals | `meta.non_goals[]` — strategic scope exclusions | When non_goals exist |
| Task Overview | `tasks[]` — id, action, type, risk, depends_on | Always |
| Verification | Derived from `requirements[].scenarios` — A/H/S classification (see Phase 5e rules) | Always |
| Pre-work | `external_dependencies.pre_work` — list all, mark blocking=true as Blocking | Always |
| Post-work | `external_dependencies.post_work` — list all | Always |
| Key Decisions | `context.decisions[]` — decision, rationale | Always |
| Assumptions | `context.assumptions[]` — belief, rationale | quick/autopilot only |

### Then Ask Next Step (Interactive only)

> **Autopilot**: Skip this step. Summary output is the final action.

```
AskUserQuestion(
  question: "Plan approved. Select the next step.",
  options: [
    { label: "/execute", description: "Start implementation immediately" }
  ]
)
```

**Based on user selection**:
- `/execute` → `Skill("execute", args="{name}")`

---

## Rules

- **spec.json is the ONLY output** — no DRAFT.md, no PLAN.md, no state.json
- **Always use cli** — `hoyeon-cli spec init`, `spec merge`, `spec validate`, `spec check`
- **Never hand-write spec.json** — always go through `spec merge` for auto-validation
- **--append for arrays** — use `--append` when adding to existing arrays (decisions, assumptions, known_gaps)
- **Validate before presenting** — Phase 5 must pass before Phase 6
- **Every task needs must_not_do** — at minimum `["Do not run git commands"]`
- **Every task needs acceptance_criteria** — functional + static + runtime at minimum
- **known_gaps gate** — no `severity: "critical"` gaps may remain at Phase 4 entry
- **Incremental merge** — merge after every phase and every user response; do not batch
- **Requirements = single source of truth** — all verification lives in `requirements[].scenarios` with `verified_by` + `execution_env`; `verification_summary` is derived, not stored independently

## Checklist Before Stopping

### Common (all modes)
- [ ] spec.json exists at `.dev/specs/{name}/spec.json`
- [ ] `hoyeon-cli spec validate` passes
- [ ] `hoyeon-cli spec check` passes
- [ ] All tasks have `status: "pending"`
- [ ] All tasks have `must_not_do` and `acceptance_criteria`
- [ ] All tasks have `inputs` field
- [ ] `requirements` section populated with Given-When-Then scenarios + `verified_by` + `execution_env`
- [ ] `external_dependencies` populated (if applicable)
- [ ] `history` includes `spec_created` entry
- [ ] `meta.mode` is set
- [ ] `context.intent_classification` merged (Phase 0.1)
- [ ] `meta.non_goals` populated (collect during Phase 2 Interview)
- [ ] Plan Approval Summary presented

### Standard mode (additional)
- [ ] `context.research` is structured object (not string)
- [ ] AC Quality Gate passed (Phase 5d) — all ACs classified + semantically valid
- [ ] `verification_summary` derived from `requirements[].scenarios` (A/H/S classification presented in Phase 5e/6)
- [ ] `constraints` populated from gap-analyzer
- [ ] Analysis agents ran (gap + tradeoff + verification-planner)
- [ ] TESTING.md pre-read and inlined into verification-planner prompt
- [ ] S-items fallback rules applied (Tier 4 reclassification, UI screenshot check)
- [ ] Codex strategist attempted (standard only)
- [ ] plan-reviewer returned OKAY

### Quick mode (overrides)
- [ ] Only 2 exploration agents used
- [ ] Only tradeoff-lite analysis ran
- [ ] Interview skipped; assumptions populated
- [ ] Max 1 plan-reviewer round (or skipped)

### Interactive mode (additional)
- [ ] Standard + Interactive: user explicitly triggered plan generation (not auto-transitioned)
- [ ] Verification Summary Confirmation presented and confirmed (Phase 5e)
- [ ] Decision Summary presented and confirmed (Phase 5f)
- [ ] All HIGH risk decision_points resolved with user

### Autopilot mode (overrides)
- [ ] No AskUserQuestion calls (except HIGH risk)
- [ ] All autonomous decisions logged in assumptions
- [ ] Decision Summary logged to spec.json only (not presented to user)
