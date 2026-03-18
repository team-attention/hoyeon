---
name: specify
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

After spec init, spawn the full team with 3 teammates:

```
TeamCreate("specify-session")
```

**Teammates (3):**

| Name | Role | Active During | Spawn Prompt Focus |
|------|------|---------------|-------------------|
| **gate-keeper** | Layer-transition reviewer | L0~L4 gate | Check for DRIFT, GAP, CONFLICT, BACKTRACK. Return PASS or REVIEW_NEEDED with numbered items. Read-only: use Read, Grep, Glob only. Do NOT write files, run Bash, or create Tasks. |
| **L3-drafter** | Requirements + scenarios author | L3 pingpong | Derive requirements from goal+decisions. Generate Given-When-Then scenarios per requirement. Output structured JSON with requirements[] and scenarios[]. |
| **L3-reviewer** | Gap and quality reviewer | L3 pingpong | Review drafter output for: missing requirements, scenario coverage gaps (HP/EP/BC minimum), verify field quality, requirement-decision traceability. Return gap list or PASS. |

> All teammates are general-purpose agents. Specialization is defined entirely through spawn prompts.
> L3-drafter and L3-reviewer are idle during L0~L2 and L4~L5. They are pre-spawned because TeamCreate can only be called once per session.

**gate-keeper return contract:**
- `PASS` — layer transition proceeds
- `REVIEW_NEEDED` + numbered items — orchestrator classifies each as DRIFT/GAP/CONFLICT/BACKTRACK and routes accordingly. The gate-keeper does NOT return these types directly.

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
    { label: "Apply suggested fix", description: "Apply the gate-keeper's recommendation" },
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

1. Run `hoyeon-cli spec guide context` to check field names
2. Merge `context.confirmed_goal` (the user-confirmed goal statement)
3. Merge `meta.non_goals` (use empty array `[]` if none)

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json
```

> C4: confirmed_goal stays in `context.confirmed_goal`, NOT in `meta`.
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

1. Run `hoyeon-cli spec guide context` to check `research` field structure
2. Construct JSON with: `context.request`, `context.research` (summary, patterns, structure, commands, documentation, ux_review)
3. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)"`

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
**Gate**: `spec coverage --layer decisions` + gate-keeper via SendMessage
**User trigger**: "proceed to planning" required (interactive mode)

### Execution

> **Mode Gate**:
> - **Quick**: SKIP entirely → merge assumptions only
> - **Autopilot**: Auto-decide → merge assumptions
> - **Interactive**: AskUserQuestion → merge decisions

#### Quick / Autopilot → Assumptions

Apply Autopilot Decision Rules, then:

1. Run `hoyeon-cli spec guide context` to check `assumptions` field structure
2. Construct JSON with `context.assumptions[]` (id, belief, if_wrong, impact)
3. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)"`

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

1. Run `hoyeon-cli spec guide context` to check `decisions` field structure
2. Construct JSON with `context.decisions[]` (id, decision, rationale, alternatives_rejected)
3. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)"`

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
- **"Enough, proceed to planning"** → advance to L2 gate
- **Max 5 interview rounds** (circuit breaker). After round 5, auto-transition to L2 gate. Set `source.type: "implicit"` for requirements inferred without explicit user confirmation.

> No separate step-back check here — the gate-keeper handles goal alignment review as part of the L2 gate.

### L2 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer decisions
```

If exit code non-zero → gate failure. Handle per Gate Protocol.

**Quick**: No gate. Auto-advance after assumptions merged.
**Standard**: Run coverage check + send decisions to gate-keeper via SendMessage. PASS → advance to L3.

---

## L3: Requirements + Scenarios

**Who**: L3-drafter (teammate) + L3-reviewer (teammate) — Draft-Review pingpong
**Input**: goal + decisions + provisional requirements (as seed)
**Output**: `requirements[]` with source fields + `scenarios[]` with category/verified_by/verify
**Merge**: `spec merge requirements` (atomic, with scenarios)
**Gate**: `spec coverage --layer scenarios` + gate-keeper via SendMessage
**Backtracking**: If decision gap found → AskUserQuestion → spec merge decisions (L2) → re-run L3

### Pre-read: VERIFICATION.md

Before starting the pingpong, read VERIFICATION.md to inline into L3-drafter's prompt:

```bash
# ${baseDir} is provided as header context to the main agent.
# Resolve: ${baseDir}/references/VERIFICATION_GUIDE.md
TESTING_MD_CONTENT = Read("${baseDir}/references/VERIFICATION_GUIDE.md")
```

> Why inline? Teammates cannot resolve `${baseDir}`. The orchestrator reads the file and passes content directly into the SendMessage prompt.

### Quick Mode Shortcut

> **Mode Gate**: Quick → orchestrator derives requirements + scenarios directly (no pingpong, no teammates). Merge and auto-advance.

### Draft-Review Pingpong (standard mode)

The orchestrator mediates a structured conversation between L3-drafter and L3-reviewer.
**Convergence condition**: L3-reviewer returns `PASS` (gap count = 0).
**Circuit breaker**: Max 3 rounds. If not converged after 3 rounds, orchestrator escalates remaining gaps to user.

#### Round 1: Initial Draft

```
SendMessage(to="L3-drafter", message="
Derive requirements and scenarios from goal and decisions.

Goal: {confirmed_goal}

Decisions:
{FOR EACH d in context.decisions: D{d.id}: {d.decision} — {d.rationale}}

Provisional requirements (from interview — use as seed, validate and complete):
{FOR EACH r in provisional_requirements: {r.behavior} ← {r.source}}

## Output: Requirements

For EACH requirement, output:
- id: R1, R2, ... (sequential)
- behavior: observable behavior statement (not implementation detail)
- priority: 1 (critical) | 2 (important) | 3 (nice-to-have)
- source: {type: 'goal'|'decision'|'implicit', ref: 'D{id}' (when type=decision)}

If you find missing decisions required to define a requirement clearly,
output them as 'decision_gaps' — the orchestrator will handle backtracking.

## Output: Scenarios (per requirement)

For EACH requirement, generate Given-When-Then scenarios:

### Scenario Coverage Categories (MANDATORY)

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

### Scenario Fields (ALL required)

Each scenario MUST include:
- id: {req_id}-S{n} (e.g., R1-S1, R1-S2)
- category: HP | EP | BC | NI | IT
- given / when / then: concrete, testable statements
- verified_by: 'machine' (automated command), 'agent' (AI assertion), or 'human' (manual inspection)
- execution_env: 'host' (local), 'sandbox' (docker/container), or 'ci' (CI pipeline) — default 'host'
- verify: object matching verified_by type (command for machine, assertion for agent, instruction for human)

## Testing Strategy (from VERIFICATION.md)
{TESTING_MD_CONTENT}

Use the 4-Tier testing model above:
- Tier 1-3 items → verified_by: 'machine', execution_env: 'host'
- Tier 4 items → verified_by: 'machine', execution_env: 'sandbox'
- AI-checkable items → verified_by: 'agent'
- Subjective/UX items → verified_by: 'human' (LAST RESORT — see conversion rules below)

## Human Minimization (MANDATORY)

Before marking ANY scenario as verified_by: 'human', you MUST attempt conversion in this order:
1. Can an agent verify via screenshot comparison? → verified_by: 'agent', execution_env: 'sandbox' (browser)
2. Can an agent verify via DOM/accessibility assertion? → verified_by: 'agent', execution_env: 'host'
3. Can a machine verify via output pattern matching? → verified_by: 'machine', execution_env: 'host'
4. Can a machine verify via docker-based integration test? → verified_by: 'machine', execution_env: 'sandbox'
5. ONLY if none of the above → verified_by: 'human' with a 'conversion_rejected' field explaining WHY agent/machine cannot replace it

Example sandbox conversions:
- 'UI looks correct' → agent + sandbox (browser-explorer screenshot diff)
- 'API returns expected response' → machine + sandbox (docker-compose mock server + curl)
- 'User flow feels intuitive' → human (subjective judgment, no mechanical proxy)

Target: human scenarios should be < 30% of total scenarios.
")
```

**If drafter reports decision_gaps** → L3 backtracking:

```
AskUserQuestion(
  question: "L3-drafter found missing decisions needed to finalize requirements. Shall we return to L2?",
  header: "Decision Gap Found",
  options: [
    { label: "Yes, go back to L2", description: "I'll answer the missing decision questions" },
    { label: "Agent decides", description: "Use best judgment and log as assumptions" }
  ]
)
```

If user selects "Yes, go back to L2" → merge additional decisions, then re-run L3 from Round 1.

**L3→L2 backtracking — state cleanup (mandatory):**
1. Clear `provisional_requirements` from session state:
   `hoyeon-cli session set --sid $SESSION_ID --json '{"provisional_requirements": []}'`
2. On re-run: start fresh — do NOT reuse previous L3 output.
3. Requirements merge overwrites entirely (no `--append`, no `--patch`).

#### Review Loop

```
FOR round IN 1..3:
  IF round == 1:
    draft = [drafter output from Round 1 above]
  ELSE:
    # Send reviewer's gaps back to drafter for revision
    SendMessage(to="L3-drafter", message="
    L3-reviewer found these gaps in your draft. Please revise:

    {FOR EACH gap in review.gaps: - {gap.id}: {gap.description} ({gap.category})}

    Revise the affected requirements and scenarios. Output the FULL updated
    requirements[] array (not just the changed items).")

    draft = [drafter revised output]

  # Send draft to reviewer
  SendMessage(to="L3-reviewer", message="
  Review the following requirements and scenarios for completeness and quality.

  {draft}

  ## Review Checklist

  **Requirement completeness:**
  - Every decision has at least one requirement tracing back to it
  - No requirement is an implementation detail (must be observable behavior)
  - Source tracing is correct (goal/decision/implicit with correct ref)

  **Scenario coverage:**
  - Every requirement has HP + EP + BC minimum (3 scenarios)
  - NI scenarios present for user-input/auth requirements
  - IT scenarios present for external-system requirements

  **Scenario quality:**
  - Machine: verify.run is executable shell command, verify.expect has concrete value
  - Agent: verify.checks is falsifiable (can be proven wrong)
  - Human: verify.ask is actionable (step-by-step instructions)

  **Sandbox/execution_env diversity:**
  - Tier 4 items have execution_env: 'sandbox'
  - UI changes have screenshot-based sandbox scenarios
  - IF sandbox capability is available (docker/browser) AND all scenarios are execution_env: 'host':
    → Flag as gap (category: 'sandbox_underuse') — sandbox-capable projects MUST use sandbox for at least some UI/integration scenarios
  - Count execution_env distribution: if 100% host when sandbox is available → GAPS

  **Human minimization:**
  - Every verified_by: 'human' scenario MUST have a 'conversion_rejected' justification
  - If human_ratio > 30% of total scenarios → flag as gap (category: 'human_overuse')
  - Challenge each human scenario: could browser-explorer (screenshot diff), DOM assertion, or docker-based test replace it?
  - Suggest specific H→A/M conversions with concrete verify objects

  ## Output

  Return one of:
  - PASS — all checks satisfied, gap count = 0
  - GAPS — list of gaps with {id, description, category, affected_requirement}
  - SUGGESTED_ADDITIONS — behaviors not covered by any requirement (new requirements needed)
  ")

  review = [reviewer output]

  IF review.status == "PASS":
    print("L3 Draft-Review converged in {round} round(s)")
    BREAK

  IF round == 3 AND review.status != "PASS":
    # Circuit breaker: escalate remaining gaps to user
    print("L3 Draft-Review did not converge after 3 rounds. Remaining gaps:")
    FOR EACH gap in review.gaps:
      print("  - {gap.id}: {gap.description}")
    AskUserQuestion(
      question: "L3 pingpong did not fully converge. How should we proceed?",
      header: "L3 Convergence",
      options: [
        { label: "Accept current draft", description: "Proceed with remaining gaps noted" },
        { label: "I'll fix manually", description: "I'll provide corrections for the gaps" },
        { label: "Abort", description: "Stop specification process" }
      ]
    )
```

#### Handle suggested_additions

```
IF review.suggested_additions is non-empty:
  AskUserQuestion(
    "The review found behaviors not covered by any requirement. Add these?",
    options: review.suggested_additions
  )
  # Only merge user-approved suggestions as new requirements
```

#### Sandbox Capability Check (conditional, before merge)

```
# Collect all sandbox scenarios from the final draft
sandbox_scenarios = [s for r in draft.requirements for s in r.scenarios if s.execution_env == "sandbox"]

IF sandbox_scenarios is non-empty:
  # Check if capability already recorded in spec.json context
  existing_capability = spec.context.sandbox_capability  # from previous specify session or L2

  IF existing_capability is NOT set:
    # First time — ask user (once per project, stored in spec.json context)
    AskUserQuestion(
      question: "The following scenarios require sandbox environments:\n" +
        {FOR EACH s in sandbox_scenarios: "- {s.id}: {s.given} → {s.execution_env}\n"} +
        "\nWhich sandbox environments are available?",
      header: "Sandbox Capability Check",
      options: [
        { label: "Docker (local)", description: "Container-based testing (docker-compose, etc.)" },
        { label: "Browser sandbox (chromux)", description: "Browser automation for UI verification" },
        { label: "Both Docker + Browser", description: "Full sandbox capability" },
        { label: "No sandbox available", description: "Convert all sandbox scenarios to agent+host alternatives" }
      ]
    )

    # Map user response to capability object
    capability = {
      "docker": user_selected "Docker" or "Both",
      "browser": user_selected "Browser" or "Both",
      "confirmed_at": "{today}"
    }

    # Store in spec.json context (persists for future specify runs)
    hoyeon-cli spec merge .dev/specs/{name}/spec.json --json '{"context": {"sandbox_capability": {capability}}}'

  ELSE:
    capability = existing_capability

  # Apply capability filter: convert unsupported sandbox scenarios to agent+host
  FOR EACH s in sandbox_scenarios:
    IF s uses docker AND NOT capability.docker:
      s.execution_env = "host"
      s.verified_by = "agent"  # fallback: agent assertion on host
      s.verify = {type: "assertion", checks: [adapted from original verify]}
      s.conversion_note = "sandbox→host: docker unavailable, converted to agent assertion"
    IF s uses browser AND NOT capability.browser:
      s.execution_env = "host"
      s.verified_by = "agent"
      s.verify = {type: "assertion", checks: [adapted from original verify]}
      s.conversion_note = "sandbox→host: browser sandbox unavailable, converted to agent assertion"
```

### Merge requirements (atomic, with scenarios)

> **Merge flag**: Use NO flag (default deep-merge) on the first-time write — this replaces the placeholder `requirements[]`.
> On backtrack re-run, still use NO flag — overwrites the entire `requirements[]` array.
> Do NOT use `--append` (would duplicate) or `--patch` (not appropriate for full replacement).

1. Run `hoyeon-cli spec guide requirements`, `spec guide scenario`, and `spec guide verify` to check field structures
2. Construct JSON with `requirements[]` — each requirement has: id, behavior, priority, source, scenarios[]
3. Each scenario has: id, category, given, when, then, verified_by, execution_env, verify (type-specific object)
4. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)"`

### L3 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer scenarios
```

Then call gate-keeper via SendMessage with requirements + scenario summary.

**Quick**: No coverage check, no gate. Auto-advance after requirements merge.
**Standard**: Run coverage check + gate-keeper SendMessage. PASS → advance to L4.

---

## L4: Tasks

**Who**: Orchestrator
**Output**: `tasks[]` with acceptance_criteria.scenarios referencing scenario IDs
**Merge**: `spec merge tasks`
**Gate**: `spec coverage --layer tasks` + gate-keeper via SendMessage

### Task Structure Guidelines

- Task IDs: `T1`, `T2`, ... with final `TF` (type: `verification`)
- Every task: `must_not_do: ["Do not run git commands"]`
- Every task: `acceptance_criteria` with `scenarios` (scenario ID refs) + `checks` (runnable commands)
- Every task: `inputs` listing dependencies from previous tasks (use task output IDs)
- HIGH risk tasks: include rollback steps in `steps`
- Map `research.patterns` → `tasks[].references`
- Map `research.commands` → `TF.acceptance_criteria.checks` (type: build/lint/static)

#### file_scope = hint, not constraint

`file_scope` lists the **most likely files** to be modified based on L1 research. Workers MAY touch additional files discovered during implementation. The field helps workers know where to start, NOT where to stop.

- Write as: `["src/auth/middleware.ts", "src/config/auth.json"]` — likely starting points
- Do NOT write exhaustive lists. Workers will discover additional files from imports, tests, etc.
- If two tasks have overlapping `file_scope`, they MUST have a `depends_on` relationship

#### steps = strategy, not prescription

`steps` describes the **approach and intent** (why), not line-by-line instructions (what). Workers read the actual code and adapt. Steps that are too prescriptive become wrong the moment code differs from expectation.

- Good: `"Add rate limiting middleware to auth endpoints using existing RateLimiter class"`
- Bad: `"Open src/auth/middleware.ts, go to line 42, add import for RateLimiter"`
- Good: `"Write integration tests covering the 3 scenarios referenced in acceptance_criteria"`
- Bad: `"Create file tests/auth.test.ts with exactly 3 test cases"`

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

1. Run `hoyeon-cli spec guide tasks` and `spec guide acceptance-criteria` to check field structures
2. Construct JSON with `tasks[]` — each task has: id, action, type (work/verification), status, risk, file_scope, steps, acceptance_criteria (scenarios[], checks[])
3. Include TF (full verification) task with `depends_on` referencing all work tasks
4. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)"`

> Requirements were confirmed in L2 (with source fields) and scenarios were generated in L3 by the L3-drafter/L3-reviewer pingpong. Do NOT merge requirements again here.

### L4 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer tasks
```

Then call gate-keeper via SendMessage with tasks + scenario coverage summary + **L4-specific review checklist**:

```
SendMessage(to="gate-keeper", message="
Review the following tasks for L4 gate.

{tasks summary with scenario mappings}

## L4-Specific Review Checklist (in addition to standard DRIFT/GAP/CONFLICT/BACKTRACK)

**Task granularity:**
- Each work task should be completable in a single worker session (1-3 files, clear scope)
- If a task touches 5+ files or has 5+ steps, suggest splitting
- TF (verification) task should depend on ALL work tasks

**Dependency DAG quality:**
- No circular dependencies in depends_on chains
- Tasks with overlapping file_scope MUST have depends_on relationship
- Identify parallelizable tasks (disjoint file_scope + no depends_on) — flag if unnecessarily serialized

**file_scope as hint:**
- file_scope should list likely starting points, not exhaustive file lists
- Flag any task where file_scope has 6+ files (likely needs splitting)

**steps as strategy:**
- Steps should describe intent/approach, not line-level instructions
- Flag steps that reference specific line numbers or exact code to write (these will be stale at execution)

**Acceptance criteria completeness:**
- Every scenario referenced in a task should be verifiable by the checks + scenarios in AC
- checks[] should have at least one runnable command per work task
")
```

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

### Step 5: AC Quality Gate (standard mode only — DO NOT SKIP)

> **Mode Gate**: Quick → skip. Proceed directly to Step 6.
> **⚠️ MANDATORY**: This step MUST run in standard mode. Do NOT skip even if L3 pingpong covered scenarios — L3 checks drafter output quality, L5 checks the MERGED spec.json (which may have drifted during L4 task mapping and coverage fixes). These are different validation scopes.

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

### Step 6: Plan Approval Summary

Present a comprehensive Plan Approval Summary before asking the user to proceed. This is the user's last chance to review the full spec before execution — make it thorough.

> **Mode Gate**:
> - **Interactive**: Print summary + `AskUserQuestion`
> - **Autopilot**: Print summary and spec path, then stop (no `AskUserQuestion`)

The summary follows a logical derivation order: Goal → Scope → Decisions → Requirements → Gaps → Tasks → Human work.

```
spec.json ready! .dev/specs/{name}/spec.json
Mode: {depth}/{interaction}

Goal
────────────────────────────────────────
{context.confirmed_goal}
────────────────────────────────────────

Non-goals (explicitly out of scope)
────────────────────────────────────────
  - {non_goal_1}
  - {non_goal_2}
────────────────────────────────────────

Key Decisions ({n} total)
────────────────────────────────────────
  D1: {decision} — {rationale (1-line)}
  D2: {decision} — {rationale (1-line)}
  ...
────────────────────────────────────────

Requirements ({n} total, {m} scenarios)
────────────────────────────────────────
  R1: {behavior} [priority:{1|2|3}] ← {source.type}:{source.ref}
    Scenarios: {scenario_count} (HP:{n} EP:{n} BC:{n} NI:{n} IT:{n})
  R2: {behavior} [priority:{1|2|3}] ← {source.type}:{source.ref}
    Scenarios: {scenario_count} (HP:{n} EP:{n} BC:{n})
  ...
────────────────────────────────────────

Known Gaps
────────────────────────────────────────
  {IF known_gaps exist:}
  - [{severity}] {gap} → mitigation: {mitigation} {IF auto_merged: "(auto-merged)"}
  {ELSE:}
  (none)
────────────────────────────────────────

Pre-work (human actions — must complete before /execute)
────────────────────────────────────────
{pre_work items or "(none)"}
────────────────────────────────────────

Task Overview
────────────────────────────────────────
T1: {action}                             [work|{risk}] — pending
T2: {action}                             [work|{risk}] — pending
  depends on: T1
TF: Full verification                    [verification] — pending
────────────────────────────────────────

DAG: {output from hoyeon-cli spec plan}

Post-work (human actions after completion)
────────────────────────────────────────
{post_work items or "(none)"}
────────────────────────────────────────

Constraints: {n} items
Verification: Auto {auto_count} | Manual {manual_count} | Sandbox {sandbox_count}
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

1. Run `hoyeon-cli spec guide meta` to check field names
2. Merge `meta.approved_by` ("user") and `meta.approved_at` (ISO timestamp) via `spec merge` && rm /tmp/spec-merge.json
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
| L3 | Orchestrator derives requirements + scenarios directly (no teammates, no Task agents) |
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
- **gate-keeper** — teammate spawned via TeamCreate, role defined by spawn prompt (not a custom agent file)
- **L3-drafter** — teammate for requirements + scenarios drafting (spawned at session start, active during L3)
- **L3-reviewer** — teammate for gap/quality review of drafter output (spawned at session start, active during L3)
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
- [ ] TeamCreate called with 3 teammates: gate-keeper, L3-drafter, L3-reviewer
- [ ] Gate-keeper defined via spawn prompt (DRIFT/GAP/CONFLICT/BACKTRACK review, read-only)
- [ ] SendMessage called at each layer gate (L0, L1, L2, L3, L4)
- [ ] `context.research` is structured object (not string)
- [ ] AC Quality Gate passed (L3 + L5)
- [ ] `context.decisions[]` populated from interview
- [ ] `constraints` populated (if applicable)
- [ ] L3 pingpong ran (L3-drafter + L3-reviewer, max 3 rounds)
- [ ] VERIFICATION.md pre-read and inlined into L3-drafter SendMessage prompt
- [ ] Sandbox Scenario Fallback Rules applied
- [ ] Human minimization applied (every `verified_by: human` has `conversion_rejected` justification)
- [ ] Human scenario ratio < 30% (or justified exception)
- [ ] Sandbox Capability Check completed (if sandbox scenarios exist and `context.sandbox_capability` was not set)
- [ ] L3-reviewer checked execution_env diversity (sandbox_underuse gap if applicable)
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
