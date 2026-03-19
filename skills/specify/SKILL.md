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
  Standard mode must include: constraints, external_dependencies, meta.non_goals.
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

After spec init, spawn the full team with 4 teammates:

```
TeamCreate("specify-session")
```

**Teammates (4):**

| Name | Role | Active During | Spawn Prompt Focus |
|------|------|---------------|-------------------|
| **gate-keeper** | Layer-transition reviewer | L0~L4 gate | Check for DRIFT, GAP, CONFLICT, BACKTRACK + information sufficiency (EXTERNAL_REF_UNVERIFIED, CODEBASE_CLAIM_UNVERIFIED, ASSUMPTION_LOAD). Return PASS or REVIEW_NEEDED with numbered items. Read-only: use Read, Grep, Glob only. Do NOT write files, run Bash, or create Tasks. |
| **L3-user-advocate** | User journey mapper + priority judge | L3 | From decisions, derive user personas and their journeys. For every screen/feature, enumerate ALL reachability paths (navigation, deep link, URL direct access, back button, redirect). Judge gap severity from user perspective. |
| **L3-requirement-writer** | Requirements + scenarios author | L3 | Receive user journeys from L3-user-advocate. Structure into formal Requirements + Given-When-Then Scenarios. Ensure every journey path becomes a requirement or scenario. Output structured JSON with requirements[] and scenarios[]. |
| **L3-devil's-advocate** | Adversarial completeness tester | L3 | Attack requirements: find missing paths, contradictions, impossible assumptions. When uncertain about external API/library constraints or codebase state, request research from orchestrator. Return PASS (no more gaps) or GAPS (with specific issues). |

> All teammates are general-purpose agents. Specialization is defined entirely through spawn prompts.
> L3 agents (L3-user-advocate, L3-requirement-writer, L3-devil's-advocate) are idle during L0~L2 and L4~L5. They are pre-spawned because TeamCreate can only be called once per session.

**Teammate lifecycle:**
- L0~L2: gate-keeper active, L3 agents idle
- L3: all 4 active
- L3 complete → **shutdown L3 agents** via `SendMessage(to="L3-user-advocate", message={type: "shutdown_request"})` (repeat for L3-requirement-writer and L3-devil's-advocate). Gate-keeper excluded.
- L4~L5: gate-keeper only

**gate-keeper return contract:**
- `PASS` — layer transition proceeds
- `REVIEW_NEEDED` + numbered items — orchestrator classifies each as DRIFT/GAP/CONFLICT/BACKTRACK and routes accordingly. The gate-keeper does NOT return these types directly.

**gate-keeper information sufficiency checks** (in addition to structural checks):
- `EXTERNAL_REF_UNVERIFIED` — spec references an external API, library, or service by name with specific behavioral claims, but no verification evidence exists. Example: "Stripe webhook retries 3 times" without citing docs.
- `CODEBASE_CLAIM_UNVERIFIED` — spec references existing code patterns, classes, or methods without evidence from L1 research. Example: "reuse the existing RateLimiter class" but L1 research didn't mention it.
- `ASSUMPTION_LOAD` — 3 or more unverified assumptions about external systems or codebase state accumulated in the current layer. Triggers a research recommendation.

When gate-keeper flags these, orchestrator treats them as a special GAP subtype — see Gate Protocol for research dispatch.

### Intent Classification (internal, not merged)

After `spec init`, classify the task intent internally to guide layer execution:

| Intent Type | Keywords | Strategy |
|-------------|----------|----------|
| **Refactoring** | "refactoring", "cleanup", "improve", "migrate" | Safety first, regression prevention |
| **New Feature** | "add", "new", "implement" | Pattern exploration, integration points |
| **Bug Fix** | "bug", "error", "broken", "fix" | Reproduce → Root cause → Fix |
| **Architecture** | "design", "structure", "architecture" | Trade-off analysis |
| **Research** | "investigate", "analyze", "understand" | Investigation only, NO implementation |
| **Migration** | "migration", "upgrade", "transition" | Phased approach, rollback plan, infra interview |
| **Infrastructure** | "infra", "database", "deploy", "server" | Infra interview, pre/post-work, constraints |
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
- `GAP` — classify further (see below)
- `CONFLICT` — escalate to user (contradictory decisions or requirements)
- `BACKTRACK` — escalate to user (decision gap found in L3 → must go back to L2)

**GAP sub-classification and research dispatch:**

When gate-keeper returns GAP items, orchestrator classifies each:

| GAP Subtype | Signal | Action |
|-------------|--------|--------|
| **Decision gap** | Missing user decision or preference | Escalate to user |
| **Research-resolvable (internal)** | GAP mentions codebase patterns, classes, file structure, or CODEBASE_CLAIM_UNVERIFIED flagged | Dispatch `code-explorer` Task subagent with specific query |
| **Research-resolvable (external)** | GAP mentions external API, library, version constraints, or EXTERNAL_REF_UNVERIFIED flagged | Dispatch `external-researcher` Task subagent with specific query |
| **Unresolvable** | Ambiguous requirement, scope question | Escalate to user |

**Research dispatch protocol:**
1. Orchestrator extracts the specific question from the GAP item
2. Dispatch Task subagent: `Task(subagent_type="code-explorer"|"external-researcher", prompt="Verify: {specific question}. Report findings with source file:line or URL.")`
3. On result: append findings to the current layer's context (do NOT rewrite layer output)
4. Re-run gate with enriched context
5. If re-gate still fails → escalate to user (do NOT dispatch another researcher for the same GAP)

**Circuit breaker:** Max **4 researcher dispatches per entire specify run**. After 4, all subsequent research-resolvable GAPs escalate to user. Track in session state:
```bash
hoyeon-cli session set --sid $SESSION_ID --json '{"research_dispatch_count": N}'
```

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
**Output**: `context.decisions[]` (with `implications[]`), `context.assumptions[]`
**Also**: Provisional requirements in session state only (NOT spec.json) — D7/D13
**Merge**: `spec merge decisions`, `spec merge assumptions`
**Gate**: `spec coverage --layer decisions` + gate-keeper via SendMessage
**User trigger**: "proceed to planning" required (interactive mode)

### Core Principle: "뭘 쓸래?" → "뭘 하고 싶어?"

L2 questions ask about **desired behavior**, not technology choices. Concrete scenarios force concrete answers. Technology follows from behavior — the agent derives technical implications post-decision.

### Execution

> **Mode Gate**:
> - **Quick**: SKIP interview → L2.5 derivation only (derive implications from L0 goal + L1 research)
> - **Autopilot**: Auto-decide → merge assumptions → L2.5 derivation
> - **Interactive**: Scenario interview → post-decision implications → L2.5 derivation → merge decisions

#### Quick / Autopilot → Assumptions

Apply Autopilot Decision Rules, then:

1. Run `hoyeon-cli spec guide context` to check `assumptions` field structure
2. Construct JSON with `context.assumptions[]` (id, belief, if_wrong, impact)
3. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)"`
4. Proceed to L2.5 Derivation Step

#### Interactive → Scenario Interview + Decisions

##### Step 1: Scenario-Based Questions (iterative)

Ask about **behavior**, not technology. Frame every question as a concrete situation the user can picture.

**Question rules:**
- **2-3 questions per round** (fewer but richer than abstract questions), prioritized by importance
- **Scenario format**: Present a concrete situation → ask what should happen
- **Adaptive framing**: Match vocabulary to user's expertise (detected from L1 context and prior answers)
- User can **skip** any question ("Agent decides") — but track skip rate as friction signal
- **Internal completeness checklist** (invisible to user): scope boundaries, error/edge cases, data model, auth/permissions, performance constraints, UX behavior. Ensure coverage across rounds.
- **Infra-aware questions** (when Intent = Migration | Infrastructure): The standard checklist MUST also cover the items below. These are often missed in behavior-focused interviews but are critical for DB/infra changes:
  - Downtime tolerance: "서비스 중단 없이 배포 가능해야 하나요?" → constraint seed
  - Backward compatibility: "기존 API/스키마와 호환성 유지해야 하나요?" → constraint seed
  - Environment variables / secrets: "새로 필요한 환경변수나 시크릿이 있나요?" → external_dependencies seed
  - Rollback strategy: "문제 생기면 어떻게 되돌리나요?" → constraint seed + task step
  - Pre-deployment manual steps: "코드 배포 전에 수동으로 해야 할 게 있나요?" (e.g., DB extension activation, infra provisioning) → external_dependencies.pre_work seed
  - Post-deployment actions: "배포 후 실행해야 할 스크립트나 확인 사항이 있나요?" → external_dependencies.post_work seed
  These answers feed into L2.7 (Constraints) and L4.5 (External Dependencies) — capture them as provisional constraints/external_deps in session state.

**Question format — WRONG (abstract):**
```
AskUserQuestion(
  question: "How should authentication be handled?",
  options: [
    { label: "JWT (Recommended)", description: "Stateless, scalable" },
    { label: "Session-based", description: "Simpler, server-side state" },
    { label: "Agent decides" }
  ]
)
```

**Question format — RIGHT (scenario-based):**
```
AskUserQuestion(
  question: "A user's access token expires while they're filling out a long form. When they click Submit, what should happen?",
  options: [
    { label: "Silent refresh + retry (Recommended)", description: "Use refresh token to get new access token, resubmit transparently. Requires refresh token storage." },
    { label: "Redirect to login, preserve form", description: "Show login page, restore form data after re-auth. Simpler but interrupts flow." },
    { label: "Redirect to login, lose form", description: "Simplest. Acceptable if forms are short." },
    { label: "Agent decides" }
  ]
)
```

> A single scenario question can extract 2-3 decisions (auth method + refresh strategy + UX behavior) that abstract questions would need separately.

##### Step 2: Post-Decision Implication Derivation

After user answers each round, the orchestrator derives implications from the decision + L1 research context.

**Three implication types:**
1. **Deterministic** — always true given the decision. E.g., "JWT → tokens have expiry." Auto-set `status: "confirmed"`.
2. **Context-dependent** — true given decision + project context. E.g., "JWT + SPA → client-side token storage needed." Auto-set `status: "confirmed"`.
3. **Intent-dependent** — depends on user preference, agent cannot determine. E.g., "Refresh token storage: httpOnly cookie or localStorage?" Set `status: "pending"`.

**Rules:**
- Deterministic and context-dependent implications are auto-confirmed (no extra questions)
- Intent-dependent implications become **the next round's scenario questions** (auto-trigger)
- When uncertain whether an implication is deterministic or intent-dependent, default to `pending` (ask, don't assume)

After derivation, merge decisions WITH implications:

1. Run `hoyeon-cli spec guide context` to check `decisions` field structure
2. Construct JSON with `context.decisions[]` including `implications[]` field:
   ```json
   {
     "id": "D1",
     "decision": "Silent refresh + retry on token expiry",
     "rationale": "Preserves form data, seamless UX. User explicitly chose this over redirect.",
     "alternatives_rejected": [
       { "option": "Redirect to login", "reason": "Interrupts user flow, may lose form data" }
     ],
     "implications": [
       { "implication": "Refresh token storage mechanism required", "type": "deterministic", "status": "confirmed" },
       { "implication": "Need silent token refresh before API calls", "type": "deterministic", "status": "confirmed" },
       { "implication": "Store refresh token in httpOnly cookie", "type": "context-dependent", "status": "pending", "conditional_on": "D2" }
     ]
   }
   ```
3. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)"`

##### Step 3: Mini-Mirror Progress Check (iterative loop)

After each round, show mini-mirror with **all decisions and implications visible**. Nothing is hidden.

```markdown
## Interview Progress — Round N

### Confirmed Decisions
- D1: Silent refresh on token expiry ✓ (user)
  → Refresh token storage required ✓ (deterministic)
  → Silent refresh before API calls ✓ (deterministic)
  → httpOnly cookie storage ⏳ (pending — needs confirmation)
- D2: PostgreSQL for primary data ✓ (user)
  → Single-server deployment sufficient ✓ (context: <1k users from L1)

### Agent-Derived (awaiting confirmation)
- D1+D2 → "Token rotation on refresh" ⏳
  ← Rationale: security best practice for long-lived refresh tokens
  [Confirm] [Different approach]

### Unresolved (???)
- Error handling strategy? (no scenario asked yet)
- Concurrent editing behavior? (not discussed)

### Completeness
[████████░░] 4/6 categories covered (scope ✓, auth ✓, data ✓, perf ✓, errors ✗, UX ✗)
```

> **Key principle**: Every agent-derived implication is shown. Nothing is silently decided.
> Provisional requirements are saved to session state via: `hoyeon-cli session set --sid $SESSION_ID --json '{"provisional_requirements": [...]}'` (D13)

Then ask:

```
AskUserQuestion(
  question: "How should we proceed?",
  header: "Interview Progress",
  options: [
    { label: "Continue interviewing", description: "Cover the unresolved items above" },
    { label: "Enough, proceed to planning", description: "Use agent judgment for remaining gaps" }
  ]
)
```

**Loop logic:**
- **Pending implications exist** → auto-generate scenario questions for them (next round)
- **"Continue interviewing"** → generate scenario questions for `???` items, loop back to Step 1
- **"Enough, proceed to planning"** → auto-confirm all `pending` implications, advance to L2.5
- **Max 5 interview rounds** (circuit breaker). After round 5, auto-transition to L2.5.
- **All `???` resolved + no `pending` implications** → auto-suggest "proceed to planning"

> No separate step-back check here — the gate-keeper handles goal alignment review as part of the L2 gate.

#### L2.5: Implication Derivation Step (non-interactive)

After the interview completes, run a single agent pass that sees ALL decisions together and derives **cross-decision implications** invisible during the interview.

**Why L2.5 exists**: During the interview, decisions arrive one at a time. Cross-decision implications ("JWT + microservices → token forwarding between services") only become visible when all decisions are present.

**Execution:**
1. Read all `context.decisions[]` from spec.json
2. Read L1 research context and provisional requirements from session state
3. For each pair/group of decisions, derive cross-decision implications:
   - Type 1+2 (deterministic, context-dependent): auto-add to relevant decision's `implications[]`
   - Type 3 (intent-dependent): flag for user confirmation in mini-mirror
4. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --patch --json "$(cat /tmp/spec-merge.json)"`
5. If any `intent-dependent` implications found → show mini-mirror one final time for user confirmation
6. Otherwise → advance to L2 gate

> **Quick mode**: L2.5 runs on autopilot-derived decisions/assumptions. All implications auto-confirmed.

#### L2.7: Constraints Derivation (non-interactive)

> **Mode Gate**: Quick — SKIP. No constraints derived.

After L2.5 cross-decision implications, derive constraints from decisions, user statements, and L1 research context.

**Constraints are non-functional guardrails** — things that must NOT be violated during implementation. Unlike requirements (what the system does), constraints define boundaries (what the system must not break).

**Derivation sources:**
1. **User statements** — explicit constraints from interview (e.g., "기존 로직에 영향가면 안되고" → backward compatibility constraint)
2. **Decision implications** — each decision may have constraint implications (e.g., "fire-and-forget embedding" → "pipeline must not block on embedding failure")
3. **L1 research** — infrastructure limits discovered during context scan (e.g., connection pool size, API rate limits, read-only filesystem)
4. **Intent-based** — Migration/Infrastructure intents auto-derive:
   - Migration: "migration must be idempotent", "migration must be reversible (down migration path)"
   - Infrastructure: "no service downtime during deployment", "backward compatible with existing clients"
5. **Infra interview seeds** — provisional constraints captured during L2 infra-aware interview questions

**Constraint fields** (run `hoyeon-cli spec guide constraints` first):
```json
{
  "id": "C1",
  "type": "operational|security|compatibility|performance",
  "rule": "Embedding generation must not block the summarization pipeline",
  "verified_by": "machine|agent|human",
  "verify": {"type": "assertion|command", "run|checks": "..."}
}
```

**Merge:**
```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)"
```

> If no constraints are derivable (rare for standard mode), merge `"constraints": []` explicitly and note in the L5 summary. An empty constraints section is better than a missing one.

### L2 User Approval (mandatory before gate)

Before running the gate, present ALL decisions to the user for explicit approval:

```
AskUserQuestion(
  question: "L2 decisions are ready. Please review and approve before proceeding:\n\n{FOR EACH d in decisions: D{d.id}: {d.decision}\n}{FOR EACH c in constraints: C{c.id}: [{c.type}] {c.rule}\n}",
  header: "L2 Decision Approval",
  options: [
    { label: "Approve all", description: "Decisions look good — proceed to L3" },
    { label: "Revise", description: "I want to change or add decisions" },
    { label: "Abort", description: "Stop specification process" }
  ]
)
```

- **Approve all** → proceed to L2 Gate
- **Revise** → user provides corrections, orchestrator merges changes, re-present for approval (loop until approved)
- **Abort** → stop

> This approval is **mandatory** — even in autopilot mode, L2 decisions MUST be user-approved before gate-keeper runs. Decisions are the foundation for all downstream layers.

### L2 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer decisions
```

If exit code non-zero → gate failure. Handle per Gate Protocol.

**Quick**: No gate. Auto-advance after L2.5 completes.
**Standard**: Run coverage check + send decisions (with implications and constraints) to gate-keeper via SendMessage. PASS → advance to L3.

---

## L3: Requirements + Scenarios

**Who**: L3-user-advocate + L3-requirement-writer + L3-devil's-advocate (teammates) — 3-Agent Requirements Workshop
**Input**: goal + decisions + provisional requirements (as seed)
**Output**: `requirements[]` with source fields + `scenarios[]` with category/verified_by/verify
**Merge**: `spec merge requirements` (atomic, with scenarios)
**Gate**: `spec coverage --layer scenarios` + gate-keeper via SendMessage
**Backtracking**: If decision gap found → AskUserQuestion → spec merge decisions (L2) → re-run L3

### Pre-read: VERIFICATION.md

Before starting the workshop, read VERIFICATION.md to inline into L3-requirement-writer's prompt:

```bash
# ${baseDir} is provided as header context to the main agent.
# Resolve: ${baseDir}/references/VERIFICATION_GUIDE.md
TESTING_MD_CONTENT = Read("${baseDir}/references/VERIFICATION_GUIDE.md")
```

> Why inline? Teammates cannot resolve `${baseDir}`. The orchestrator reads the file and passes content directly into the SendMessage prompt.

### Sandbox Capability Check (before workshop)

Run **before** the 3-agent workshop so L3-requirement-writer knows whether to generate sandbox scenarios.

```
IF context.sandbox_capability is NOT set:
  ⚠️ MANDATORY: Read references/sandbox-guide.md — DO NOT skip, approximate, or infer capability.
  Execute all 3 phases in strict order:

  Phase A — Auto-detect existing infra:
    Glob for: playwright.config.*, cypress.config.*, docker-compose.*, Dockerfile,
              *.xcodeproj, *.xcworkspace, electron-builder.yml, tauri.conf.json
    Check package.json for: @vitest/browser, testcontainers, playwright, cypress
    IF any detected → record capability from detection evidence → DONE

  Phase B — No infra detected → MUST ask user:
    Classify project signals: has_ui, has_api, has_db, has_cli, has_native_app, has_desktop_app
    Build dynamic options based on signals (see sandbox-guide.md for option mapping)
    MUST call AskUserQuestion — NEVER set capability without user response or Phase A evidence

  Phase C — User approved scaffold:
    Add T-sandbox-* scaffold tasks → record capability in spec.json

  ⚠️ NEVER set sandbox_capability without EITHER:
     (a) Phase A detection evidence (specific file paths found), OR
     (b) Phase B user response (AskUserQuestion result)
  Setting capability based on general assumptions (e.g., "Docker is available") is FORBIDDEN.
```

Pass the resolved `context.sandbox_capability` into L3-requirement-writer's SendMessage prompt so it knows what sandbox environments are available.

### Quick Mode Shortcut

> **Mode Gate**: Quick → orchestrator derives requirements + scenarios directly (no workshop, no teammates). Merge and auto-advance.

### 3-Agent Requirements Workshop (standard mode) — Collaborative Communication

Three L3 teammates (L3-user-advocate, L3-requirement-writer, L3-devil's-advocate) are **activated simultaneously** and collaborate freely via SendMessage. The orchestrator sends all 3 initial prompts **in a single message**, then monitors for convergence.

**Key principle**: This is a **workshop, not a pipeline**. All 3 agents are alive and can message each other at any time. The orchestrator does NOT sequence their work — they self-organize.

**Expected natural flow** (not enforced):
1. User-advocate starts by deriving journeys (fastest to produce initial output)
2. Requirement-writer begins structuring as journeys arrive
3. Devil's-advocate attacks requirements as they form
4. Devil's-advocate asks L3-user-advocate about gap severity
5. Requirement-writer revises based on L3-devil's-advocate feedback
6. Cross-talk continues until L3-devil's-advocate sends PASS

**Convergence condition**: L3-devil's-advocate sends `PASS` to orchestrator (no more gaps found).
**Circuit breaker**: After 3 writer→L3-devil's-advocate exchanges without PASS, orchestrator escalates remaining gaps to user.

> All agents can have micro-conversations freely (e.g., L3-devil's-advocate asks L3-user-advocate "is this path critical?", L3-user-advocate asks L3-requirement-writer "did you cover the search→profile journey?"). These do NOT count as cycles. A 'cycle' is: L3-devil's-advocate sends GAPS → writer revises → L3-devil's-advocate reviews again.

#### Initial Prompts (sent simultaneously)

The orchestrator sends all 3 prompts **in one message** to activate the workshop. User-advocate starts first naturally (journeys are the input), but all agents are alive and can interact immediately.

**Prompt 1 — L3-user-advocate:**
```
SendMessage(to="L3-user-advocate", message="
You are in a 3-agent requirements workshop with L3-requirement-writer and L3-devil's-advocate.
Derive user journeys from the confirmed goal, decisions, and their implications.

Send your journeys to L3-requirement-writer via SendMessage(to='L3-requirement-writer').
Stay alive throughout the workshop — L3-devil's-advocate will ask you to judge gap severity,
and L3-requirement-writer may ask about journey coverage. You can also proactively flag
issues you notice in requirements as they develop.

Goal: {confirmed_goal}

Decisions with implications:
{FOR EACH d in context.decisions:
  D{d.id}: {d.decision} — {d.rationale}
  Implications:
  {FOR EACH impl in d.implications (where status=confirmed):
    - [{impl.type}] {impl.implication}
  }
}

## Your Task

1. **Identify user personas** — who uses this system? (e.g., new user, content consumer, admin)
2. **For each persona, list their key journeys** — what do they want to accomplish?
3. **For EVERY screen/feature/endpoint mentioned in decisions:**
   - List ALL reachability paths: navigation click, deep link, URL direct access, back button, redirect, search result
   - This is CRITICAL — missing reachability paths cause 404s and broken routing in implementation
4. **Flag any decisions that seem to imply features without clear user-facing behavior**

## Output Format

For each persona:
- Persona: {name} — {description}
- Journeys:
  1. {journey name}: {step} → {step} → {step} → {outcome}
     Reachability: {how the user reaches the starting point}
  2. ...

Also output:
- decision_gaps[]: decisions that need user clarification to define journeys
- reachability_map[]: {screen/feature} → [{path1}, {path2}, ...]
")
```

**Prompt 2 — L3-requirement-writer** (sent simultaneously with Prompt 1 and 3):
```
SendMessage(to="L3-requirement-writer", message="
You are in a 3-agent requirements workshop with L3-user-advocate and L3-devil's-advocate.
You will receive user journeys from L3-user-advocate. Structure them into formal Requirements + Scenarios.

Send your requirements to L3-devil's-advocate via SendMessage(to='devil\'s-advocate').
If L3-devil's-advocate sends GAPS back, revise and re-send to L3-devil's-advocate.
You can also ask L3-user-advocate for clarification on journey coverage at any time.
When L3-devil's-advocate sends PASS, it goes to the orchestrator — you're done.

Goal: {confirmed_goal}

Constraints (from L2.7):
{FOR EACH c in constraints:
  C{c.id}: [{c.type}] {c.rule}
}

Decisions with implications:
{FOR EACH d in context.decisions:
  D{d.id}: {d.decision} — {d.rationale}
}

Provisional requirements (from interview — use as seed, validate and complete):
{FOR EACH r in provisional_requirements: {r.behavior} ← {r.source}}

## Structuring Rules

- Every user journey path MUST produce at least one requirement or scenario
- Group related journey paths into single requirements (e.g., 'Profile accessible via feed avatar click, search result click, and URL direct access' = ONE requirement with multiple scenarios)
- Convert each confirmed implication into at least one requirement
- If you find missing decisions, output as 'decision_gaps' — orchestrator will handle backtracking

## Output: Requirements

For EACH requirement:
- id: R1, R2, ... (sequential)
- behavior: observable behavior statement (not implementation detail)
- priority: 1 (critical) | 2 (important) | 3 (nice-to-have)
- source: {type: 'goal'|'decision'|'implication', ref: 'D{id}'}

## Output: Scenarios (per requirement)

### Scenario Coverage Categories (MANDATORY)

| Category | Code | When Required | Example |
|----------|------|---------------|---------|
| Happy Path | HP | Always | Valid input → expected output |
| Error/Failure | EP | Always | System fails gracefully on error |
| Boundary/Edge | BC | Always | Empty input, max values, zero |
| Negative/Invalid | NI | User input or auth | Rejected input, unauthorized |
| Integration | IT | External system | Dependency unavailable |

**Minimum: HP + EP + BC per requirement (3 scenarios minimum).**
**Self-check before output**: count scenarios per requirement. If any has < 3, add missing categories.

### Scenario Fields (ALL required)

Each scenario MUST include:
- id: {req_id}-S{n} (e.g., R1-S1, R1-S2)
- category: HP | EP | BC | NI | IT
- given / when / then: concrete, testable statements
- verified_by: 'machine' | 'agent' | 'human'
- execution_env: 'host' | 'sandbox' | 'ci'
- verify: object matching verified_by type

## Sandbox Capability
{IF sandbox_capability is set:
  Available: {sandbox_capability.tools} (docker: {sandbox_capability.docker}, browser: {sandbox_capability.browser})
  → USE execution_env: 'sandbox' for scenarios where these tools apply
ELSE:
  No sandbox available — use execution_env: 'host' for all scenarios
}

## Testing Strategy (from VERIFICATION.md)
{TESTING_MD_CONTENT}

## Human Minimization (MANDATORY)

Before marking ANY scenario as verified_by: 'human', attempt conversion:
1. Agent via screenshot comparison? → 'agent', execution_env: 'sandbox'
2. Agent via DOM/accessibility assertion? → 'agent', execution_env: 'host'
3. Machine via output pattern matching? → 'machine', execution_env: 'host'
4. Machine via docker-based integration test? → 'machine', execution_env: 'sandbox'
5. ONLY if none → 'human' with 'conversion_rejected' justification

Target: human scenarios < 30% of total.
")
```

**If L3-requirement-writer reports decision_gaps** → L3 backtracking:

```
AskUserQuestion(
  question: "L3 L3-requirement-writer found missing decisions needed to finalize requirements. Shall we return to L2?",
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

**Prompt 3 — L3-devil's-advocate** (sent simultaneously with Prompt 1 and 2):
```
SendMessage(to="L3-devil's-advocate", message="
You are in a 3-agent requirements workshop with L3-user-advocate and L3-requirement-writer.
You will receive requirements+scenarios from L3-requirement-writer. Your job is to BREAK them — find missing paths, contradictions, impossible assumptions, and untested edge cases.

IMPORTANT: Communication protocol:
- If you find GAPS: send them DIRECTLY to L3-requirement-writer via SendMessage(to='L3-requirement-writer'). Include cycle counter.
- If you need user perspective on a gap's severity: ask L3-user-advocate via SendMessage(to='L3-user-advocate').
- If you need research to verify a claim: send RESEARCH_REQUEST to orchestrator via SendMessage(to='team-lead') with format: {type: 'research', query: '...', target: 'internal'|'external'}. Orchestrator will dispatch a Task subagent and send findings back to you.
- If PASS (no more gaps): send the final converged requirements JSON to orchestrator via SendMessage(to='team-lead').

## Attack Checklist

**Reachability completeness:**
- For every screen/feature in requirements: can the user reach it from ALL expected paths?
- Check: navigation click, URL direct access, deep link, back button, redirect, search result
- Missing reachability → GAPS (this is the #1 source of 404s in implementation)

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
- IF sandbox capability is available AND all scenarios are execution_env: 'host':
  → Flag as gap (category: 'sandbox_underuse')
- IF `context.sandbox_capability` is NOT set:
  → Flag as **BLOCKING** gap (category: 'sandbox_capability_unknown')
- IF `sandbox_capability.browser == false` AND project has UI signals:
  → Flag as gap (category: 'browser_sandbox_skipped_for_ui_project')

**Human minimization:**
- Every verified_by: 'human' scenario MUST have 'conversion_rejected' justification
- If human_ratio > 30% → flag as gap (category: 'human_overuse')

**External/codebase claim verification:**
- If a requirement assumes external API behavior → flag for research if unverified
- If a requirement references existing code → flag for research if not confirmed by L1

## Output Protocol

- **PASS** (no more gaps): Send final converged requirements JSON to **team-lead**. Include complete requirements[] array.
- **GAPS** (cycle N/3): Send gap list to **L3-requirement-writer**. Include cycle counter. Writer will revise and re-send.
- **ESCALATE** (cycle 3 exhausted): Send remaining gaps to **team-lead**. Orchestrator presents to user.
- **RESEARCH_REQUEST**: Send to **team-lead** with {type: 'research', query: '...', target: 'internal'|'external'}. Wait for response before continuing review.

A 'cycle' is: you send GAPS → writer revises → you review again.
Micro-conversations (asking L3-user-advocate about severity, clarifications) do NOT count.
")
```

**Orchestrator handles messages from L3-devil's-advocate:**
- `PASS` + requirements JSON → proceed to merge
- `RESEARCH_REQUEST` → dispatch Task subagent (code-explorer or external-researcher), send findings back to L3-devil's-advocate
- `ESCALATE` + remaining gaps → present to user:

```
AskUserQuestion(
  question: "L3 workshop did not fully converge after 3 cycles. Remaining gaps:\n{gaps}",
  header: "L3 Convergence",
  options: [
    { label: "Accept current draft", description: "Proceed with remaining gaps noted" },
    { label: "I'll fix manually", description: "I'll provide corrections for the gaps" },
    { label: "Abort", description: "Stop specification process" }
  ]
)
```

**Safety net**: If L3-devil's-advocate reports a BLOCKING gap (`sandbox_capability_unknown` or `browser_sandbox_skipped_for_ui_project`),
orchestrator MUST intervene before next cycle:
- `sandbox_capability_unknown`: read `references/sandbox-guide.md`, execute Phase A → B → C inline
- `browser_sandbox_skipped_for_ui_project`: re-run Phase B of sandbox-guide.md

#### L3 Agent Shutdown

After L3 merge completes (requirements merged into spec.json):

```
SendMessage(to="L3-user-advocate", message={type: "shutdown_request", reason: "L3 complete"})
SendMessage(to="L3-requirement-writer", message={type: "shutdown_request", reason: "L3 complete"})
SendMessage(to="L3-devil's-advocate", message={type: "shutdown_request", reason: "L3 complete"})
```

Gate-keeper remains active for L4.

#### Handle suggested_additions

```
IF review.suggested_additions is non-empty:
  AskUserQuestion(
    "The review found behaviors not covered by any requirement. Add these?",
    options: review.suggested_additions
  )
  # Only merge user-approved suggestions as new requirements
```

#### Sandbox Scenario Fallback (before merge)

```
# sandbox_capability was resolved before workshop (see "Sandbox Capability Check" above).
# This section handles the fallback: if L3-requirement-writer generated sandbox scenarios
# but the capability doesn't support them, convert to agent+host.

sandbox_scenarios = [s for r in draft.requirements for s in r.scenarios if s.execution_env == "sandbox"]

IF sandbox_scenarios is non-empty:
  # Check if capability already recorded in spec.json context
  # NOTE: In normal flow, capability is always set by the before-workshop check.
  # This branch is a defensive fallback — should not fire in happy path.
  existing_capability = spec.context.sandbox_capability

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

### L3 User Approval (mandatory before gate)

Before running the gate, present ALL requirements to the user for explicit approval:

```
AskUserQuestion(
  question: "L3 requirements are ready. Please review:\n\n{FOR EACH r in requirements: R{r.id} [{r.priority}]: {r.behavior} (scenarios: {r.scenarios.length})\n}",
  header: "L3 Requirements Approval",
  options: [
    { label: "Approve all", description: "Requirements look good — proceed to L4" },
    { label: "Revise", description: "I want to change, add, or remove requirements" },
    { label: "Abort", description: "Stop specification process" }
  ]
)
```

- **Approve all** → proceed to L3 Gate
- **Revise** → user provides corrections, orchestrator re-runs workshop (or merges changes directly), re-present for approval (loop until approved)
- **Abort** → stop

> This approval is **mandatory** — even in autopilot mode, L3 requirements MUST be user-approved before gate-keeper runs. Requirements are what gets built — wrong requirements = wrong implementation.

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
- **T1 must include dependency install + build verification** when scaffolding a new project.
  Include explicit steps: install dependencies, verify build passes, verify dev server starts.
  T1 acceptance_criteria.checks should include: `{type: "build", run: "npm run build"}` (or pnpm/yarn equivalent).
  This ensures subsequent workers have a working baseline — do NOT assume "scaffold" implicitly means "install + build verified".
- Every task: `must_not_do: ["Do not run git commands"]`
- Every task: `acceptance_criteria` with `scenarios` (scenario ID refs) + `checks` (runnable commands)
- Every task: `inputs` listing dependencies from previous tasks (use task output IDs)
- HIGH risk tasks: include rollback steps in `steps`
- **Migration/Infrastructure intent tasks**: DB migration tasks MUST include:
  - Idempotency check (`IF NOT EXISTS`, `IF EXISTS` patterns)
  - Rollback steps (e.g., "Rollback: DROP COLUMN IF EXISTS embedding")
  - `risk: "medium"` or `"high"` (never "low" for schema changes)
  - Corresponding rollback constraint from L2.7 must be referenced
- Map `research.patterns` → `tasks[].references`
- Map `research.commands` → `TF.acceptance_criteria.checks` (type: build/lint/static)
- TF checks MUST always include at minimum: `{type: "build", run: "<build command>"}`. Typecheck and lint are also expected when available.

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

#### Sandbox Scenario Infra Auto-task (MANDATORY)

⚠️ **MUST run immediately after task merge** when `context.sandbox_capability.scaffold_required == true`:

```bash
hoyeon-cli spec sandbox-tasks .dev/specs/{name}/spec.json
```

This auto-generates:
- **T_SANDBOX**: sandbox environment preparation (Docker Compose, Playwright config, seed data, healthcheck)
- **T_SV1~N**: per-scenario verification tasks for every `execution_env: "sandbox"` scenario

**Skip condition**: `scaffold_required == false` (sandbox infra already exists, detected in Phase A).
**If skipped when required**: L4 gate WILL fail — gate-keeper checks for `sandbox_tasks_missing`.
**Execution order**: Run AFTER manual task merge, BEFORE L4.5 (External Dependencies) and L4 Gate.

### Merge tasks

> **Merge flag**: Use NO flag (default deep-merge) on first-time write — this replaces the placeholder `tasks[]`.
> On backtrack re-run (L4 re-runs after rejection), use `--patch` to update existing tasks by ID without duplicating.
> First-time merge replaces the placeholder task array. On backtrack re-run, use --patch to update by ID.

1. Run `hoyeon-cli spec guide tasks` and `spec guide acceptance-criteria` to check field structures
2. Construct JSON with `tasks[]` — each task has: id, action, type (work/verification), status, risk, file_scope, steps, acceptance_criteria (scenarios[], checks[])
3. Include TF (full verification) task with `depends_on` referencing all work tasks
4. Merge via `hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)"`

> Requirements were confirmed in L2 (with source fields) and scenarios were generated in L3 by the 3-agent workshop (L3-user-advocate / L3-requirement-writer / L3-devil's-advocate). Do NOT merge requirements again here.

### L4.5: External Dependencies Derivation (non-interactive)

> **Mode Gate**: Quick — SKIP. No external dependencies derived.

After tasks are merged, scan tasks and decisions for actions that happen **outside of code** — things a human or separate process must do before or after `/execute`.

**Detection heuristics** (scan `tasks[].action`, `tasks[].steps`, `context.decisions[]`):

| Signal | Category | Example |
|--------|----------|---------|
| DB extension, migration on managed DB | pre_work | "Enable pgvector on Supabase dashboard" |
| New environment variable, secret, API key | pre_work | "Add GEMINI_API_KEY to Cloud Run env (Terraform)" |
| Infrastructure provisioning | pre_work | "Create S3 bucket", "Enable Cloud Run service" |
| One-time scripts (backfill, data migration) | post_work | "Run backfill-embeddings.ts on production DB" |
| CLI/tool deprecation | post_work | "Mark tools/content-search as deprecated" |
| DNS, CDN, or routing changes | pre_work | "Update CDN origin to new endpoint" |
| Monitoring/alerting setup | post_work | "Add search latency alert to Grafana" |

**Also check:** infra interview seeds from L2 (provisional external_deps in session state).

**External dependencies fields** (run `hoyeon-cli spec guide external` first):
```json
{
  "external_dependencies": {
    "pre_work": [
      {"action": "Enable pgvector extension on Supabase", "owner": "human", "blocking": true}
    ],
    "post_work": [
      {"action": "Run backfill script: npx ts-node scripts/backfill-embeddings.ts", "owner": "human", "blocking": false}
    ]
  }
}
```

**Merge:**
```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)"
```

> If no external dependencies detected, merge `"external_dependencies": {"pre_work": [], "post_work": []}` explicitly. An empty section is better than a missing one.

**Migration/Infrastructure intent auto-derive:**
- Migration intent → at minimum: pre_work "backup database" (if destructive), post_work "verify migration in production"
- Infrastructure intent → at minimum: pre_work "verify infrastructure prerequisites"

### L4 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer tasks
```

Then call gate-keeper via SendMessage with tasks + scenario coverage summary + external dependencies + **L4-specific review checklist**:

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

**Sandbox tasks check (BLOCKING):**
- IF context.sandbox_capability.scaffold_required == true:
  → T_SANDBOX task MUST exist in tasks[]
  → T_SV* tasks MUST cover ALL execution_env: 'sandbox' scenarios
  → Count T_SV* tasks vs sandbox scenario count — they MUST match
  → Missing → flag as BLOCKING gap (category: 'sandbox_tasks_missing')
- IF scaffold_required == false: verify sandbox infra was detected in Phase A (no scaffold needed)
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
> **⚠️ MANDATORY**: This step MUST run in standard mode. Do NOT skip even if L3 workshop covered scenarios — L3 checks requirement quality, L5 checks the MERGED spec.json (which may have drifted during L4 task mapping and coverage fixes). These are different validation scopes.

Run the full AC quality check (max 3 rounds in L3 was L3-scoped; L5 does a final pass with max 5 rounds):

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

Breaking Changes
────────────────────────────────────────
{Scan tasks and decisions for breaking change signals. For each match, show:
  [category] description ← T{id} or D{id}

Categories and detection heuristics:
  [DB]    — file_scope matches **/migrations/**, **/schema/**, prisma/schema.prisma,
             or action contains: migration, schema change, alter table, add column, drop, rename table
  [ENV]   — file_scope matches .env*, or action contains: environment variable, env var, new secret
  [API]   — action contains: breaking change, remove endpoint, rename route, change response format,
             API version, deprecate
  [INFRA] — file_scope matches docker-compose*, Dockerfile, terraform/**, k8s/**, .github/workflows/**,
             or action contains: infrastructure, deploy, container, CI/CD, pipeline
  [DEPS]  — action contains: upgrade major, replace library, remove dependency, migrate from X to Y

If no signals detected: "(none detected)"
If signals found, also append: "⚠ Review these before /execute — they may require coordination, backups, or rollback plans."
}
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
  question: "Review the plan above. Select the next step.",
  options: [
    { label: "/execute", description: "Start implementation immediately" },
    { label: "Revise requirements (L3)", description: "Go back to refine requirements and scenarios" },
    { label: "Revise tasks (L4)", description: "Go back to refine task breakdown" }
  ]
)
```

**On user rejection or selecting revision:**
- "Revise requirements (L3)" → route back to L3 Round 1 (with current decisions preserved)
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

Quick mode compresses the layer sequence: L0 → L1(minimal) → L2(assumptions) → L2.5(auto) → L3 → L4 → L5(validate only).

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
- **L3-user-advocate** — teammate for user journey mapping + gap severity judgment (spawned at session start, active during L3, shutdown after L3)
- **L3-requirement-writer** — teammate for requirements + scenarios structuring from journeys (spawned at session start, active during L3, shutdown after L3)
- **L3-devil's-advocate** — teammate for adversarial completeness testing + research requests (spawned at session start, active during L3, shutdown after L3)
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
- [ ] Plan Approval Summary presented (including Breaking Changes scan)
- [ ] Breaking Changes section shows detected signals or "(none detected)"
- [ ] `meta.approved_by` and `meta.approved_at` written after approval

### Standard mode (additional)
- [ ] TeamCreate called at session start
- [ ] TeamCreate called with 4 teammates: gate-keeper, L3-user-advocate, L3-requirement-writer, L3-devil's-advocate
- [ ] Gate-keeper defined via spawn prompt (DRIFT/GAP/CONFLICT/BACKTRACK review, read-only)
- [ ] SendMessage called at each layer gate (L0, L1, L2, L3, L4)
- [ ] `context.research` is structured object (not string)
- [ ] AC Quality Gate passed (L5 Step 5)
- [ ] `context.decisions[]` populated from interview
- [ ] `constraints` populated (L2.7 — merge empty array explicitly if none apply)
- [ ] `external_dependencies` populated (L4.5 — merge empty pre_work/post_work explicitly if none apply)
- [ ] L3 workshop ran (L3-user-advocate → L3-requirement-writer → L3-devil's-advocate, max 3 cycles)
- [ ] VERIFICATION.md pre-read and inlined into L3-requirement-writer SendMessage prompt
- [ ] L3 agents shutdown after L3 merge (gate-keeper excluded)
- [ ] Sandbox Scenario Fallback Rules applied
- [ ] Human minimization applied (every `verified_by: human` has `conversion_rejected` justification)
- [ ] Human scenario ratio < 30% (or justified exception)
- [ ] Sandbox Capability Check completed (auto-detect → scaffold if needed → re-run L3 with capability set)
- [ ] L3-devil's-advocate checked execution_env diversity (sandbox_underuse / sandbox_capability_unknown / browser_sandbox_skipped_for_ui_project gaps)
- [ ] IF `scaffold_required == true`: `hoyeon-cli spec sandbox-tasks` executed AND T_SANDBOX + T_SV* tasks present in spec
- [ ] IF `scaffold_required == false`: sandbox infra detected in Phase A (no scaffold needed)
- [ ] plan-reviewer returned OKAY
- [ ] `spec coverage` passes (full chain + per-layer at each transition)

### Quick mode (overrides)
- [ ] No TeamCreate, no SendMessage
- [ ] No layer gates
- [ ] No plan-reviewer (or max 1 round if run)
- [ ] assumptions populated instead of decisions

### Interactive mode (additional)
- [ ] User explicitly triggered plan generation ("proceed to planning") — not auto-transitioned
- [ ] Plan Approval Summary presented (L5 Step 6)
- [ ] All HIGH risk decision_points resolved with user

### Autopilot mode (overrides)
- [ ] No AskUserQuestion calls (except HIGH risk)
- [ ] All autonomous decisions logged in assumptions
- [ ] Decision Summary logged to spec.json only (not presented to user)
