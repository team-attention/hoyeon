---
name: specify-v2
description: |
  Layer-based spec generator (L0-L5 derivation chain) outputting unified spec.json v5 via cli.
  Layer sequence: Goal→Context→Decisions→Requirements+Scenarios→Tasks→Review.
  Each layer has a merge checkpoint and a gate (spec coverage + step-back gate-keeper).
  Mode support: quick/standard × interactive/autopilot.
  Use when: "/specify", "specify", "plan this", "계획 짜줘", "스펙 만들어줘"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Write
  - AskUserQuestion
  - SendMessage
  - TeamCreate
validate_prompt: |
  Must produce a valid spec.json that passes both hoyeon-cli spec validate and hoyeon-cli spec check.
  spec.json must include: meta.mode, context.research (structured), tasks with acceptance_criteria,
  requirements with scenarios, context.confirmed_goal.
  Standard mode must include: constraints, meta.non_goals.
  SKILL.md must have exactly 6 sections starting with "## L0:" through "## L5:".
  Output files must be in .dev/specs/{name}/ directory.
---

# /specify-v2 — Layer-Based Spec Generator (spec.json v5)

Generate a schema-validated, machine-executable spec.json through a structured derivation chain.
Layer structure: **Goal → Context → Decisions → Requirements+Scenarios → Tasks → Review**.
Each layer builds on the previous — no skipping, no out-of-order merges.

## Core Principles

1. **cli is the writer** — Never hand-write spec.json. Use `spec init`, `spec merge`, `spec task`
2. **Validate on every write** — `spec merge` auto-validates. Errors caught immediately
3. **Mode-aware** — Depth and interaction control agent count and user involvement
4. **Incremental build** — spec.json evolves from v0 (meta only) to final (all sections)
5. **Layers gate progress** — each layer has a spec coverage check + step-back gate-keeper review
6. **No intermediate files** — No DRAFT.md. spec.json IS the draft until finalized

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

## Session Initialization

### spec init

```bash
hoyeon-cli spec init {name} --goal "{goal}" --type dev --depth {depth} --interaction {interaction} \
  .dev/specs/{name}/spec.json
```

**Naming**: `{name}` = kebab-case, derived from goal (e.g., "fix-login-bug", "add-auth-middleware").

Output: minimal spec.json with `meta` + placeholder `tasks` + `history`.

Immediately update session state with the spec path:

```bash
SESSION_ID="[session ID from UserPromptSubmit hook]"
hoyeon-cli session set --sid $SESSION_ID --spec ".dev/specs/{name}/spec.json"
```

> **Merge JSON Passing Convention**: All `spec merge --json '...'` examples below show JSON inline for readability. In practice, **always use file-based passing** to avoid zsh shell escaping issues:
> ```bash
> cat > /tmp/spec-merge.json << 'EOF'
> { "meta": { "non_goals": ["...", "..."] } }
> EOF
> hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
> ```
> Also: **always run `hoyeon-cli spec guide <section>` before constructing merge JSON** to verify field names and types.

### Team Mode Setup (standard mode only)

> **Mode Gate**: Quick mode — SKIP team mode entirely. No TeamCreate, no SendMessage gates.

After spec init, spawn the step-back gate-keeper as a persistent team member:

```
TeamCreate("specify-session")
```

Then add the gate-keeper as a teammate by invoking the phase2-stepback agent as a team member. The gate-keeper persists throughout the session and is called via SendMessage at each layer gate.

**Gate-keeper configuration:**
- Agent: reuse existing `phase2-stepback` agent (do NOT create a new agent file)
- Role: layer-transition reviewer — checks for DRIFT, GAP, CONFLICT, BACKTRACK
- Tools allowed: Read, Grep, Glob — read-only analysis only
- disallowed-tools: Write, Edit, Task, Skill, Bash (enforced per C3 + read-only contract)

The gate-keeper is called once per layer transition with the current layer artifacts as context. It returns:
- `PASS` — layer transition proceeds
- `REVIEW_NEEDED` + items for user confirmation (drift findings, blind spots, simplification suggestions)

> **Return contract**: phase2-stepback returns `PASS` or `REVIEW_NEEDED` with numbered items. The orchestrator classifies each item as DRIFT/GAP/CONFLICT/BACKTRACK and routes accordingly. The agent does NOT return these types directly.

### Intent Classification (internal, not merged)

After `spec init`, classify the task intent internally to guide layer execution:

| Intent Type | Keywords | Strategy |
|-------------|----------|----------|
| **Refactoring** | "refactoring", "cleanup", "improve", "migrate" | Safety first, regression prevention |
| **New Feature** | "add", "new", "implement" | Pattern exploration, integration points |
| **Bug Fix** | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix |
| **Architecture** | "design", "structure", "architecture" | Trade-off analysis |
| **Research** | "investigate", "analyze", "understand" | Investigation only, NO implementation |
| **Migration** | "migration", "upgrade", "transition" | Phased approach, rollback plan |
| **Performance** | "performance", "optimize", "slow" | Measure first, profile → optimize |

Do NOT merge intent_classification into spec.json (not in schema).

---

## Gate Protocol

Each layer ends with a gate before advancing to the next layer.

### Gate Steps (standard mode)

1. Run `hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer {layer}` (if applicable)
2. Check exit code — non-zero blocks advancement
3. Send layer artifacts to gate-keeper via SendMessage
4. Gate-keeper returns PASS or REVIEW_NEEDED (with items for user confirmation)

### Gate Failure Handling

> **Mode Gate**: Quick — no gates, no SendMessage. Auto-advance after merge.

When a gate fails:

```
AskUserQuestion(
  question: "Step-back review found items to confirm before advancing:",
  header: "Gate Review at L{n}",
  options: [
    { label: "Apply suggested fix", description: "{suggested_fix}" },
    { label: "Provide correction", description: "I'll describe the correction needed" },
    { label: "Force proceed (skip gate)", description: "Accept current state and advance" },
    { label: "Abort", description: "Stop specification process" }
  ]
)
```

After user provides correction → re-run gate (both coverage check and step-back). Max 3 retries per gate. After 3 failures, always present force-proceed and abort options.

**Failure type routing:**
- `STRUCTURAL` — auto-fix via spec merge (no user prompt needed), re-run gate
- `DRIFT` — escalate to user (scope has drifted from goal)
- `GAP` — escalate to user (missing requirements or decisions)
- `CONFLICT` — escalate to user (contradictory decisions or requirements)
- `BACKTRACK` — escalate to user (decision gap found in L3 → must go back to L2)

---

## L0: Goal

**Who**: Orchestrator
**Output**: `meta.goal`, `meta.non_goals`, `context.confirmed_goal`
**Merge**: `spec init` + `spec merge` for non_goals and confirmed_goal
**Gate**: User confirmation via Mirror protocol

### Execution

`spec init` is already run in Session Initialization. This layer focuses on confirming the goal and non-goals with the user.

#### Mirror Protocol

Before asking any questions, mirror the user's goal back to confirm alignment:

```
"I understand you want [goal]. Scope: [what's included / what's excluded].
 Done when: [success criteria].
 I'll handle [agent scope]. You'll need to [human scope, if any].
 Does this match?"
```

**Mirror rules:**
- Mirror confirms **goal, scope, and done criteria ONLY**. Do NOT make technology choices, implementation decisions, or architectural picks in the mirror — those belong in L2.
- Mirror must include at least one **inference** beyond the literal request (assumed scope boundary or success criterion). A parrot echo confirms nothing. An interpretive mirror reveals scope assumptions the user can correct.
- If the goal is ambiguous, mirror must surface the ambiguity explicitly — do not write `confirmed_goal` until the user has confirmed or corrected the interpretation.
- If you cannot fill goal, scope, or done criteria → ask that specific item directly instead of mirroring
- Max 3 mirror attempts. If still unclear after 3 → ask the unfilled items directly

#### Merge after Mirror confirmation

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
  "context": {
    "confirmed_goal": "[confirmed goal statement from mirror — what user agreed to]"
  }
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

> C4: confirmed_goal stays in `context.confirmed_goal`, NOT in `meta`.

If non-goals are apparent from the user's request, merge them:

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
  "meta": {
    "non_goals": ["...", "..."]
  }
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

> `meta.non_goals` must be present (use empty array `[]` if no non-goals).
> Non-goals are strategic scope exclusions — "What this project is NOT trying to achieve." They are NOT verifiable rules (those go in `constraints`).

### L0 Gate

- **Quick**: Auto-advance after spec init. No mirror, no gate.
- **Standard**: User must confirm mirror before advancing to L1.

Gate-keeper is called with: goal statement, confirmed_goal, non_goals.

---

## L1: Context

**Who**: Orchestrator (Glob/Grep/Read), optionally code-explorer agent for large codebases
**Output**: `context.research`
**Merge**: `spec merge context`
**Gate**: Step-back via SendMessage only (no spec coverage — L1 produces context.research, not decisions)

### Execution

> **Mode Gate**:
> - **Quick**: Orchestrator performs minimal codebase scan (2-3 key directories). No agents. Merge abbreviated research.
> - **Standard**: Launch exploration agents in parallel.

**Standard Mode** (exploration agents in parallel):

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

### Merge research

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
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
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

> Quick mode: omit `documentation` and `ux_review` from research.

### L1 Gate

- **Quick**: Auto-advance. No gate.
- **Standard**: Send research summary to gate-keeper via SendMessage (step-back only — no spec coverage call at L1). Gate-keeper checks whether research is relevant to the goal. PASS → advance to L2. FAIL → handle per Gate Protocol.

---

## L2: Decisions

**Who**: Orchestrator (AskUserQuestion), iterative interview loop
**Output**: `context.decisions[]`, `context.assumptions[]`
**Also**: Provisional requirements in session state only (NOT spec.json) — D7/D13
**Merge**: `spec merge decisions`, `spec merge assumptions`
**Gate**: `spec coverage --layer decisions` + step-back via SendMessage
**User trigger**: "proceed to planning" required (interactive mode)

### Execution

> **Mode Gate**:
> - **Quick**: SKIP entirely → merge assumptions only
> - **Autopilot**: Auto-decide → merge assumptions
> - **Interactive**: AskUserQuestion → merge decisions

#### Quick / Autopilot → Assumptions

Apply Autopilot Decision Rules, then:

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
  "context": {
    "assumptions": [
      {"id": "A1", "belief": "...", "if_wrong": "...", "impact": "minor"}
    ]
  }
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

#### Interactive → Interview + Decisions

##### Step 1: Structured Questions (iterative)

Ask only what you cannot discover. Evaluate internally: scope boundaries? dependencies? constraints? success criteria? technology choices? — then surface gaps as questions.

**Question rules:**
- **Minimum 2 questions, max 5 per round**, prioritized by importance
- Each question includes a **recommended answer** based on L1 research
- Technology/framework choices deferred from mirror MUST appear here
- User can **skip** any question ("leave it to the agent's judgment")
- Propose based on research; don't ask what you can discover

```
AskUserQuestion(
  question: "[specific question about boundary/trade-off]",
  options: [
    { label: "[Option A] (Recommended)", description: "[why, based on research]" },
    { label: "[Option B]", description: "[trade-off]" },
    { label: "Agent decides", description: "Use your best judgment" }
  ]
)
```

After each round, immediately merge decisions:

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
  "context": {
    "decisions": [
      {"id": "D1", "decision": "...", "rationale": "...",
       "alternatives_rejected": [{"option": "...", "reason": "..."}]}
    ]
  }
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

##### Step 2: Mini-Mirror Progress Check (iterative loop)

After each question round, show mini-mirror with provisional requirements visible:

```markdown
## Interview Progress

### Understanding
Goal: [confirmed goal from L0]
Scope: [what's included] / Excluded: [what's excluded]
Done when: [success criteria]

### Decisions
- D1: [decision] (confirmed)
- D2: [decision] (confirmed)

### Provisional Requirements (not yet in spec.json — will be finalized in L3)
- [behavior statement] ← goal
- [behavior statement] ← D1
- ??? (anything missing?)

### Open Items
- [remaining gap — e.g., "error handling strategy not discussed"]
- [or "None — all major areas covered"]
```

> Provisional requirements are shown here for UX feedback but are NOT merged into spec.json yet (D7).
> They are saved to session state via: `hoyeon-cli session set --sid $SESSION_ID --json '{"provisional_requirements": [...]}'` (D13)

Then ask:

```
AskUserQuestion(
  question: "How should we proceed?",
  header: "Interview Progress",
  options: [
    { label: "Continue interviewing", description: "Clarify the open items above" },
    { label: "Enough, proceed to planning", description: "Use agent judgment for remaining gaps" }
  ]
)
```

- **"Continue interviewing"** → refresh mini-mirror, add new provisional requirements, generate 2-5 new questions targeting open items, loop back to Step 2
- **"Enough, proceed to planning"** → run step-back check, then advance to L3
- **Max 5 interview rounds** (circuit breaker). After round 5, auto-transition to L3. Set `source.type: "implicit"` for requirements inferred without explicit user confirmation.

##### Step 3: Step-back Check (before L2 gate)

> **Mode Gate**: Quick → skip. Autopilot → run but auto-apply conservative choices.

```
result = Task(subagent_type="phase2-stepback",
     prompt="Review goal alignment before planning.

Goal: {confirmed_goal}

Decisions:
{FOR EACH d in context.decisions: D{d.id}: {d.decision} — {d.rationale}}

Provisional Requirements (so far):
{FOR EACH r in provisional_requirements: {r.id}: {r.behavior} ← {r.source}}")
```

**If PASS** → proceed to L2 gate.

**If REVIEW_NEEDED** → present to user:

```
AskUserQuestion(
  question: "Step-back review found items to confirm before planning:",
  header: "Goal Alignment Check",
  options: [
    { label: "Accept all suggestions", description: "Apply drift removals + add missing requirements" },
    { label: "Let me pick", description: "I'll decide each item" },
    { label: "Ignore, proceed as-is", description: "Keep current scope" }
  ]
)
```

> **Autopilot**: Auto-apply conservative choices: remove DRIFT items, add blind spot requirements with `source.type: "implicit"`, keep ENHANCEMENT items. Log changes as assumptions.

### L2 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer decisions
```

If exit code non-zero → gate failure. Handle per Gate Protocol.

**Quick**: No gate. Auto-advance after assumptions merged.
**Standard**: Run coverage check + send decisions to gate-keeper via SendMessage. PASS → advance to L3.

---

## L3: Requirements + Scenarios

**Who**: phase2-stepback agent (requirement completeness) → verification-planner agent (scenarios) — D11/D12
**Input**: goal + decisions + provisional requirements (as seed)
**Output**: `requirements[]` with source fields + `scenarios[]` with category/verified_by/verify
**Merge**: `spec merge requirements` (atomic, with scenarios)
**Gate**: `spec coverage --layer scenarios` + AC quality agent (max 2 rounds) + step-back via SendMessage
**Backtracking**: If decision gap found → AskUserQuestion → spec merge decisions (L2) → re-run L3 — D8

### Pre-read: VERIFICATION.md

Before launching agents, read VERIFICATION.md to inline into verification-planner's prompt:

```bash
# ${baseDir} is provided as header context to the main agent.
# Resolve: ${baseDir}/references/VERIFICATION_GUIDE.md
TESTING_MD_CONTENT = Read("${baseDir}/references/VERIFICATION_GUIDE.md")
```

> Why inline? Subagents cannot resolve `${baseDir}`. The main agent reads the file and passes content directly into the subagent prompt.

### Step A: Requirements derivation (phase2-stepback agent)

> **Mode Gate**: Quick → skip this step. Orchestrator derives requirements directly from goal + decisions.

```
req_result = Task(subagent_type="phase2-stepback",
     prompt="Derive requirements from goal and decisions.

Goal: {confirmed_goal}

Decisions:
{FOR EACH d in context.decisions: D{d.id}: {d.decision} — {d.rationale}}

Provisional requirements (from interview — use as seed, validate and complete):
{FOR EACH r in provisional_requirements: {r.behavior} ← {r.source}}

For EACH requirement, output:
- id: R1, R2, ... (sequential)
- behavior: observable behavior statement (not implementation detail)
- priority: 1 (critical) | 2 (important) | 3 (nice-to-have)
- source: {type: 'goal'|'decision'|'implicit', ref: 'D{id}' (when type=decision)}

If you find missing decisions that are required to define a requirement clearly,
output them as 'decision_gaps' — the orchestrator will ask the user before backtracking to L2.

Do NOT generate scenarios here. scenarios field should be empty array for each requirement.")
```

**If req_result.decision_gaps is non-empty** → L3 backtracking:

```
AskUserQuestion(
  question: "L3 found missing decisions needed to finalize requirements. Shall we return to L2 to fill these?",
  header: "Decision Gap Found",
  options: [
    { label: "Yes, go back to L2", description: "I'll answer the missing decision questions" },
    { label: "Agent decides", description: "Use best judgment and log as assumptions" }
  ]
)
```

If user selects "Yes, go back to L2" → merge additional decisions, then re-run L3 from Step A.

**L3→L2 backtracking — state cleanup (mandatory):**
1. Clear `provisional_requirements` from session state before returning to L2:
   `hoyeon-cli session set --sid $SESSION_ID --json '{"provisional_requirements": []}'`
2. When L3 re-runs after backtracking: start fresh — do NOT reuse scenarios or requirements from the previous L3 run.
3. Requirements merged in the previous L3 run must be **replaced** (not appended) on re-run — the new merge overwrites the existing `requirements[]` array entirely (no `--append`, no `--patch`).

### Step B: Scenario generation (verification-planner agent)

```
Task(subagent_type="verification-planner",
     prompt="Generate Given-When-Then scenarios for EACH existing requirement.

Requirements:
{FOR EACH r in req_result.requirements: R{r.id}: {r.behavior} (priority: {r.priority}, source: {r.source})}

## Scenario Coverage Categories (MANDATORY)

For EACH requirement, generate scenarios across these categories:

| Category | Code | When Required | Example |
|----------|------|---------------|---------|
| Happy Path | HP | Always | Valid input → expected output |
| Error/Failure | EP | Always | System fails gracefully on error |
| Boundary/Edge | BC | Always | Empty input, max values, zero |
| Negative/Invalid | NI | User input or auth | Rejected input, unauthorized |
| Integration | IT | External system | Dependency unavailable |

**Minimum: HP + EP + BC per requirement (3 scenarios minimum).**
NI: required if requirement involves user input, authentication, or authorization.
IT: required if requirement touches external systems, APIs, or databases.
If a category does not apply, skip with a 1-line justification.

**Self-check before output**: count scenarios per requirement. If any has < 3, add missing categories.

## Scenario Fields (ALL required)

Each scenario MUST include:
- id: {req_id}-S{n} (e.g., R1-S1, R1-S2)
- category: HP | EP | BC | NI | IT
- given / when / then: concrete, testable statements
- verified_by: 'machine' (automated command), 'agent' (AI assertion), or 'human' (manual inspection)
- execution_env: 'host' (local), 'sandbox' (docker/container), or 'ci' (CI pipeline) — default 'host'
- verify: command (for machine), assertion (for agent), or instruction (for human)

## Testing Strategy (from VERIFICATION.md)
[Paste TESTING_MD_CONTENT here — the full content read in the pre-read step above.]

Use the 4-Tier testing model above. Output format:
- Tier 1-3 items → verified_by: 'machine', execution_env: 'host'
- Tier 4 items → verified_by: 'machine', execution_env: 'sandbox'
- Subjective/UX items → verified_by: 'human'
- AI-checkable items → verified_by: 'agent'

Do NOT generate new requirements. Only fill in scenarios for provided requirements.
If you find behaviors not covered by any requirement, output them as 'suggested_additions' only.")
```

### Sandbox Scenario Fallback Rules

When merging verification-planner results, apply these rules:

- **Misclassified Tier 4**: Tier 4 items without `execution_env: "sandbox"` → fix them (Tier 4 MUST have sandbox)
- **Missing sandbox items**: Project has sandbox infra but no sandbox scenarios → flag warning, check Tier 4 misclassification
- **UI screenshot scenarios**: UI/frontend changes without screenshot-based sandbox scenarios → add them

### Handle suggested_additions

```
IF verification_planner.suggested_additions is non-empty:
  AskUserQuestion(
    "The analysis found behaviors not covered by confirmed requirements. Add these?",
    options: verification_planner.suggested_additions
  )
  # Only merge user-approved suggestions as new requirements
```

### Merge requirements (atomic, with scenarios)

> **Merge flag**: Use NO flag (default deep-merge) on the first-time write — this replaces the placeholder `requirements[]`.
> On backtrack re-run (L3 re-runs after L3→L2 backtracking), still use NO flag — the new merge replaces the entire `requirements[]` array.
> Do NOT use `--append` (would duplicate) or `--patch` (ID-based update — not appropriate for full requirement replacement).

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
  "requirements": [
    {
      "id": "R1",
      "behavior": "...",
      "priority": 1,
      "source": {"type": "goal"},
      "scenarios": [
        {
          "id": "R1-S1",
          "category": "HP",
          "given": "...",
          "when": "...",
          "then": "...",
          "verified_by": "machine",
          "execution_env": "host",
          "verify": {"type": "command", "run": "...", "expect": {"exit_code": 0}}
        },
        {
          "id": "R1-S2",
          "category": "EP",
          "given": "...",
          "when": "...",
          "then": "...",
          "verified_by": "machine",
          "execution_env": "host",
          "verify": {"type": "command", "run": "...", "expect": {"exit_code": 1}}
        },
        {
          "id": "R1-S3",
          "category": "BC",
          "given": "...",
          "when": "...",
          "then": "...",
          "verified_by": "agent",
          "verify": {"type": "assertion", "checks": ["..."]}
        }
      ]
    }
  ]
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

### L3 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer scenarios
```

**AC quality check** (max 2 rounds):

Inspect every AC across `requirements[].scenarios` for classification completeness and semantic quality:

**Classification completeness:**
- Every scenario has `verified_by` set (`machine` | `agent` | `human`)
- Every scenario has a non-empty `verify` object matching its type
- Every requirement has at least 3 scenarios covering HP + EP + BC

**Semantic quality:**
- **Machine**: `verify.run` is an executable shell command (not pseudocode). `verify.expect` has a concrete value.
- **Agent**: `verify.checks` is falsifiable — can be proven wrong by inspecting code/output.
- **Human**: `verify.ask` is actionable — a person can follow it step-by-step.

Run the `ac-quality-gate` agent for each round:

```
FOR iteration IN 1..2:
  result = Task(subagent_type="ac-quality-gate",
    prompt="Check AC quality for spec: .dev/specs/{name}/spec.json")
  IF result.status == "PASS": BREAK
  # Agent applies fixes via spec merge; loop continues to re-check
  hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

Then call gate-keeper via SendMessage with requirements + scenario summary.

**Quick**: No coverage check, no AC gate, no step-back. Auto-advance after requirements merge.
**Standard**: Run coverage check + AC quality (max 2 rounds) + gate-keeper SendMessage. PASS → advance to L4.

---

## L4: Tasks

**Who**: Orchestrator
**Output**: `tasks[]` with acceptance_criteria.scenarios referencing scenario IDs
**Merge**: `spec merge tasks`
**Gate**: `spec coverage --layer tasks` + step-back via SendMessage

### Task Structure Guidelines

- Task IDs: `T1`, `T2`, ... with final `TF` (type: `verification`)
- Every task: `must_not_do: ["Do not run git commands"]`
- Every task: `acceptance_criteria` with `scenarios` (scenario ID refs) + `checks` (runnable commands)
- Every task: `inputs` listing dependencies from previous tasks (use task output IDs)
- HIGH risk tasks: include rollback steps in `steps`
- Map `research.patterns` → `tasks[].references`
- Map `research.commands` → `TF.acceptance_criteria.checks` (type: build/lint/static)

#### Task Type Field

| Type | Retry on Fail | Edit/Write Tools | Failure Handling |
|------|---------------|------------------|------------------|
| `work` | Up to 2x | Yes | Analyze → Fix Task or halt |
| `verification` | No | Forbidden | Analyze → Fix Task or halt |

#### Acceptance Criteria Structure (v5)

| Field | Required | Description |
|-------|----------|-------------|
| `scenarios` | Yes | Scenario IDs from `requirements[].scenarios[].id` this task fulfills |
| `checks` | Yes | Automated checks: `[{type: "static"|"build"|"lint"|"format", run: "<command>"}]` |

**Worker completion condition**: All referenced scenarios verified AND all checks pass

#### Sandbox Scenario Infra Auto-task

When any scenario has `execution_env: "sandbox"`:

```bash
# Auto-generates T_SANDBOX (infra prep) + T_SV1~N (per-scenario verification) tasks
hoyeon-cli spec sandbox-tasks .dev/specs/{name}/spec.json
```

### Merge tasks

> **Merge flag**: Use NO flag (default deep-merge) on first-time write — this replaces the placeholder `tasks[]`.
> On backtrack re-run (L4 re-runs after rejection), use `--patch` to update existing tasks by ID without duplicating.
> First-time merge replaces the placeholder task array. On backtrack re-run, use --patch to update by ID.

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
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
        "scenarios": ["R1-S1", "R1-S2"],
        "checks": [
          {"type": "static", "run": "node -e \"require('./src/config/auth.json')\""},
          {"type": "build", "run": "npm test"}
        ]
      }
    },
    {
      "id": "TF", "action": "Full verification", "type": "verification", "status": "pending",
      "depends_on": ["T1"],
      "inputs": [{"from_task": "T1", "artifact": "all_outputs"}],
      "must_not_do": ["Do not modify any files", "Do not run git commands"],
      "acceptance_criteria": {
        "scenarios": ["R1-S1", "R1-S2", "R2-S1"],
        "checks": [
          {"type": "lint", "run": "npm run lint"},
          {"type": "build", "run": "npm test"}
        ]
      }
    }
  ]
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

> Requirements were confirmed in L2 (with source fields) and scenarios were attached in L3 by the verification-planner. Do NOT merge requirements again here.

### L4 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer tasks
```

Then call gate-keeper via SendMessage with tasks + scenario coverage summary.

**Quick**: No gate. Auto-advance after tasks merge.
**Standard**: Run coverage check + gate-keeper SendMessage. PASS → advance to L5.

---

## L5: Review

**Who**: CLI + Orchestrator + Agent
**Output**: Plan Approval Summary → user confirmation, meta.approved_by + meta.approved_at
**Merge**: `spec merge meta` (approved_by + approved_at on approval)
**Gate**: User approval (AskUserQuestion)
**On rejection**: Route back to L3 or L4

### Step 1: Mechanical Validation

```bash
hoyeon-cli spec validate .dev/specs/{name}/spec.json
hoyeon-cli spec check .dev/specs/{name}/spec.json
```

If either fails → fix and retry (max 2 attempts).

### Step 2: Full Coverage Check

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json
```

Check exit code. Non-zero → L5 blocks, show failure to user, ask for correction before proceeding.

### Step 3: DAG Visualization

```bash
hoyeon-cli spec plan .dev/specs/{name}/spec.json
```

Show output to user.

### Step 4: Semantic Review (standard mode only)

> **Mode Gate**: Quick → skip plan-reviewer. Mechanical validation is sufficient.

```
Task(subagent_type="plan-reviewer",
     prompt="Review spec: .dev/specs/{name}/spec.json
Read the file and evaluate all layers:
1. Meta & Context — goal clarity, decisions, assumptions, gaps
2. Requirements & Scenarios — behavior coverage, verify quality
3. Tasks — goal alignment, requirement coverage, granularity, dependencies, AC
4. Cross-cutting — constraints, simplicity, verification strategy")
```

**If REJECT** — classify:
- **Cosmetic** (formatting, missing fields): auto-fix via `spec merge`, re-review (max 1 additional round)
- **Semantic** (scope change, logic issue): ask user, then fix

**If REJECT routes back to a specific layer:**
- Rejected at requirements level → route to L3 (re-run L3 from Step A)
- Rejected at tasks level → route to L4

```
AskUserQuestion(
  question: "Plan reviewer rejected the spec. Reason: {rejection_reason}. Route to {L3|L4} for corrections?",
  options: [
    { label: "Yes, go back to {L3|L4}", description: "Fix the issues and re-run review" },
    { label: "Override and proceed", description: "Accept current state" },
    { label: "Abort", description: "Stop specification process" }
  ]
)
```

**If OKAY** → proceed to Step 5.

> **Quick**: Max 1 review round. Semantic rejection → HALT.
> **Autopilot**: Cosmetic auto-fix. Semantic without scope change → auto-fix + log assumption. Scope change → HALT.

### Step 5: AC Quality Gate (standard mode only)

> **Mode Gate**: Quick → skip. Proceed directly to Step 6.

Run the full AC quality check (max 2 rounds in L3 was L3-scoped; L5 does a final pass with max 5 rounds):

```
FOR iteration IN 1..5:
  result = Task(subagent_type="ac-quality-gate",
    prompt="Final AC quality check for spec: .dev/specs/{name}/spec.json")
  IF result.status == "PASS":
    print("AC Quality Gate: PASS ({iteration} iteration(s))")
    BREAK
  hoyeon-cli spec validate .dev/specs/{name}/spec.json

IF iteration > 5 AND result.status == "FAIL":
  AskUserQuestion(
    question: "These ACs could not be auto-fixed. How should we proceed?",
    options: [
      { label: "Fix manually", description: "I'll provide specific verify commands" },
      { label: "Accept as-is", description: "Proceed with current quality level" },
      { label: "Abort", description: "Stop and rethink requirements" }
    ]
  )
```

### Step 6: Verification Summary Confirmation (standard + interactive only)

> **Mode Gate**: Quick → skip. Autopilot → skip.

Derive Verification Summary from `requirements[].scenarios`:

- **Auto** = scenarios where `verified_by` is `"machine"` or `"agent"` AND `execution_env` is `"host"` (or omitted)
- **Auto [sandbox]** = scenarios where `verified_by` is `"machine"` or `"agent"` AND `execution_env` is `"sandbox"`
- **Manual** = scenarios where `verified_by` is `"human"`

> verification_summary is DERIVED, never stored — do NOT merge it into spec.json.

**Step 1**: Output assistant text with full details:

```
## Verification Summary

### Auto (machine-verified): {count}
- Auto-1: {criterion} → {method}

### Manual (human review): {count}
- Manual-1: {criterion} — {reason}

### Gaps
{gap summary or "none"}
```

**Step 2**: Then ask:

```
AskUserQuestion(
  question: "Shall we proceed with this verification strategy?",
  options: [
    { label: "Confirmed" },
    { label: "Corrections needed" }
  ]
)
```

### Step 7: Plan Approval Summary

Present a comprehensive Plan Approval Summary before asking the user to proceed.

> **Mode Gate**:
> - **Interactive**: Print summary + `AskUserQuestion`
> - **Autopilot**: Print summary and spec path, then stop (no `AskUserQuestion`)

```
spec.json ready! .dev/specs/{name}/spec.json
Mode: {depth}/{interaction}

Non-goals (explicitly out of scope)
────────────────────────────────────────
  - {non_goal_1}
────────────────────────────────────────

Task Overview
────────────────────────────────────────
T1: {action}                             [work|LOW] — pending
T2: {action}                             [work|MED] — pending
  depends on: T1
TF: Full verification                    [verification] — pending
────────────────────────────────────────

Verification (recap)
────────────────────────────────────────
Auto (machine-verified): {count}
  - {criterion} → {method}
Manual (human review): {count}
  - {criterion} — {reason}
Gaps: {gap summary or "none"}
────────────────────────────────────────

Pre-work (human actions — must complete before /execute)
────────────────────────────────────────
{pre_work items or "(none)"}
────────────────────────────────────────

Post-work (human actions after completion)
────────────────────────────────────────
{post_work items or "(none)"}
────────────────────────────────────────

Key Decisions
────────────────────────────────────────
  - {decision point}: {chosen approach}
────────────────────────────────────────

{If auto-merged gaps exist:}
Auto-merged Gaps
────────────────────────────────────────
  - {gap}: {mitigation} (severity: medium)
────────────────────────────────────────

DAG: {output from hoyeon-cli spec plan}
Constraints: {n} items
```

Then ask (interactive only):

```
AskUserQuestion(
  question: "Plan approved. Select the next step.",
  options: [
    { label: "/execute", description: "Start implementation immediately" },
    { label: "Revise requirements (L3)", description: "Go back to refine requirements and scenarios" },
    { label: "Revise tasks (L4)", description: "Go back to refine task breakdown" }
  ]
)
```

**On user rejection or selecting revision:**
- "Revise requirements (L3)" → route back to L3 Step A (with current decisions preserved)
- "Revise tasks (L4)" → route back to L4 with reason

**On approval or `/execute`:**

```bash
cat > /tmp/spec-merge.json << 'EOF'
{
  "meta": {
    "approved_by": "user",
    "approved_at": "[ISO timestamp]"
  }
}
EOF
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

Then shut down the Team (gate-keeper and any spawned team members) before proceeding:

```
SendMessage(to="gate-keeper", message={type: "shutdown_request", reason: "Specify session complete"})
TeamDelete()
```

Then if user selected `/execute`:
```
Skill("execute", args="{name}")
```

---

## Quick Mode Flow

Quick mode compresses the layer sequence: L0 → L2 → L3 → L5.

| Layer | Quick Behavior |
|-------|---------------|
| L0 | spec init only, no mirror (autopilot assumption of goal) |
| L1 | **SKIPPED** — minimal orchestrator scan only, merged directly |
| L2 | **SKIPPED** — assumptions only, no interview |
| L3 | 1 agent (tradeoff-lite assessment), orchestrator derives requirements, verification-planner for scenarios |
| L4 | Tasks created directly, no gate |
| L5 | spec validate + spec check only, no plan-reviewer, no AC gate |

No TeamCreate, no SendMessage gates in quick mode. Max 1 plan-reviewer round if run.

**Quick mode L1**: Orchestrator performs a minimal codebase scan (Glob/Grep, 2-3 key directories) and merges `context.research` with an abbreviated summary. No agent spawns (no Task calls). Merge directly after scan.

---

## Rules

- **spec.json is the ONLY output** — no DRAFT.md, no PLAN.md, no state.json
- **Always use cli** — `hoyeon-cli spec init`, `spec merge`, `spec validate`, `spec check`
- **Never hand-write spec.json** — always go through `spec merge` for auto-validation
- **Read guide before EVERY merge** — run `hoyeon-cli spec guide <section>` before constructing merge JSON. Field names, types (especially `verify` which must be an object `{type, run}`, not a string), and allowed properties vary per section. Also run `hoyeon-cli spec guide merge` to choose the right mode.
- **File-based JSON passing** — never pass JSON directly as `--json '...'` argument. Always write to `/tmp/spec-merge.json` via heredoc with quoted EOF (`<< 'EOF'`), pass via `--json "$(cat /tmp/spec-merge.json)"`, clean up with `rm /tmp/spec-merge.json`.
- **Merge failure recovery** — when `spec merge` fails: (1) run `hoyeon-cli spec guide <failed-section>`, (2) fix JSON to match schema, (3) retry. Do NOT attempt multiple blind retries.
- **One merge per section** — call `spec merge` once per top-level key. Never merge multiple sections in parallel.
- **--append for arrays** — use `--append` when adding to existing arrays (decisions, assumptions, known_gaps)
- **--patch for updates** — use `--patch` when updating specific items by id
- **Every task needs must_not_do** — at minimum `["Do not run git commands"]`
- **Every task needs acceptance_criteria** — `scenarios` (refs to requirement scenario IDs) + `checks` (runnable commands)
- **Requirements = single source of truth** — all verification lives in `requirements[].scenarios` with `verified_by` + `execution_env`; `verification_summary` is derived, not stored independently
- **Incremental merge** — merge after every layer and every user response; do not batch
- **confirmed_goal in context** — NEVER move `confirmed_goal` to `meta` (C4)
- **phase2-stepback agent** — reuse existing agent file, do NOT rename or create a new one (C5)
- **Team mode members** — disallowed-tools MUST include Task and Skill (C3)

## Checklist Before Stopping

### Common (all modes)
- [ ] spec.json exists at `.dev/specs/{name}/spec.json`
- [ ] `hoyeon-cli spec validate` passes
- [ ] `hoyeon-cli spec check` passes
- [ ] All tasks have `status: "pending"`
- [ ] All tasks have `must_not_do` and `acceptance_criteria` (`scenarios` + `checks`)
- [ ] All tasks have `inputs` field
- [ ] `requirements` section populated with Given-When-Then scenarios + `verified_by` + `execution_env`
- [ ] `context.confirmed_goal` populated (NOT `meta.confirmed_goal`)
- [ ] `meta.non_goals` populated (use empty array `[]` if none)
- [ ] `history` includes `spec_created` entry
- [ ] `meta.mode` is set
- [ ] Plan Approval Summary presented
- [ ] `meta.approved_by` and `meta.approved_at` written after approval

### Standard mode (additional)
- [ ] TeamCreate called at session start
- [ ] Gate-keeper (phase2-stepback) added as team member with disallowed-tools: Task, Skill
- [ ] SendMessage called at each layer gate (L0, L1, L2, L3, L4)
- [ ] `context.research` is structured object (not string)
- [ ] AC Quality Gate passed (L3 + L5)
- [ ] `context.decisions[]` populated from interview
- [ ] `constraints` populated (if applicable)
- [ ] analysis agents ran (verification-planner minimum)
- [ ] VERIFICATION.md pre-read and inlined into verification-planner prompt
- [ ] Sandbox Scenario Fallback Rules applied
- [ ] plan-reviewer returned OKAY
- [ ] `spec coverage` passes (full chain + per-layer at each transition)

### Quick mode (overrides)
- [ ] No TeamCreate, no SendMessage
- [ ] No layer gates
- [ ] No plan-reviewer (or max 1 round if run)
- [ ] assumptions populated instead of decisions

### Interactive mode (additional)
- [ ] User explicitly triggered plan generation ("proceed to planning") — not auto-transitioned
- [ ] Verification Summary Confirmation presented (L5 Step 6)
- [ ] All HIGH risk decision_points resolved with user

### Autopilot mode (overrides)
- [ ] No AskUserQuestion calls (except HIGH risk)
- [ ] All autonomous decisions logged in assumptions
- [ ] Decision Summary logged to spec.json only (not presented to user)
