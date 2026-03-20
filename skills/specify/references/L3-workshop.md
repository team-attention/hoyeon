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

### Sandbox Scenario Subject Classification

When creating scenarios with `execution_env: "sandbox"`, you MUST include a `subject` field.
Classify based on what the scenario verifies:

| Signal in scenario | subject |
|-------------------|---------|
| Browser, UI, page, click, render, visual, CSS, DOM | `"web"` |
| API, endpoint, HTTP, REST, GraphQL, request, response, status code | `"server"` |
| Command, CLI, terminal, argv, flag, stdout, stderr, exit code | `"cli"` |
| Database, query, SQL, table, row, record, migration, schema | `"database"` |

The subject determines which verification recipe the Verifier agent will follow.

> `subject` is ONLY required when `execution_env: "sandbox"`. Do NOT add it to host or ci scenarios.

## verify Abstraction Rules (MANDATORY)

verify describes OBSERVABLE BEHAVIOR, not implementation details.

### Prohibited in verify fields:
- File paths (src/auth/login.ts)
- Function/class names (validatePassword(), AuthService)
- Code patterns (if(!pw) throw)
- Line numbers
- Internal variable names

### Allowed in verify fields:
- API contracts (POST /login with empty body → 400)
- Input/output relations (empty password → validation error message)
- Behavior properties (invalid input does not trigger database query)
- UI states (login success → dashboard shows username)

### Self-check: "If all implementation file names changed, would this verify still be valid?"
  Yes → correct abstraction level. No → rewrite.

### Examples

WRONG (implementation-coupled):
  machine: {"type": "command", "run": "grep 'validation' src/auth/login.ts", "expect": {"exit_code": 0}}
  agent: {"type": "assertion", "checks": ["src/auth/login.ts has validation guard before db.query call"]}

RIGHT (behavior-level):
  machine: {"type": "command", "run": "curl -s -w '%{http_code}' -X POST localhost:3000/login -d '{}'", "expect": {"stdout_contains": "400"}}
  agent: {"type": "assertion", "checks": ["Empty password request returns HTTP 400 with error message containing 'required' or 'validation'", "Invalid input does not trigger database query"]}

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

**verify abstraction level (BLOCKING):**
- IF verify.run or verify.checks reference specific file paths → REJECT ("verify coupled to implementation: {path}")
- IF verify.run or verify.checks reference function/class names → REJECT ("verify coupled to implementation: {name}")
- IF verify.checks contain vague words: "works", "correctly", "properly", "as expected" → REJECT ("verify not falsifiable: {check}")
- Self-check per scenario: "If implementation files were renamed, would this verify still hold?" No → REJECT

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

Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE (MANDATORY) — check ALL three schemas before constructing
hoyeon-cli spec guide requirements
hoyeon-cli spec guide scenario
hoyeon-cli spec guide verify

# STEP 2+3: CONSTRUCT + WRITE
# ⚠️ source must be {type, ref} OBJECT, not a string
# ⚠️ verify must be {type, run} OBJECT, not a string
# ⚠️ each scenario needs: id, category, given, when, then, verified_by, execution_env, verify
cat > /tmp/spec-merge.json << 'EOF'
{
  "requirements": [
    {
      "id": "R1",
      "behavior": "observable behavior statement",
      "priority": 1,
      "source": {"type": "decision", "ref": "D1"},
      "scenarios": [
        {
          "id": "R1-S1",
          "category": "HP",
          "given": "precondition",
          "when": "action",
          "then": "expected result",
          "verified_by": "machine",
          "execution_env": "host",
          "verify": {"type": "command", "run": "npm test -- --grep R1-S1"}
        },
        {
          "id": "R1-S2",
          "category": "HP",
          "given": "precondition",
          "when": "action in browser",
          "then": "expected UI result",
          "verified_by": "machine",
          "execution_env": "sandbox",
          "subject": "web",
          "verify": {"type": "command", "run": "npx playwright test --grep R1-S2"}
        }
      ]
    }
  ]
}
EOF

# STEP 4: MERGE (no flag — replaces placeholder)
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json

# STEP 5: VERIFY
hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

If merge fails → follow Merge Failure Recovery (SKILL.md). Do NOT proceed to L3 gate with a broken merge.

### L3 User Approval (mandatory before gate)

Before running the gate, present ALL requirements and their scenarios to the user as **text output first**, then ask for approval.

**Step 1 — Display full details as text output (NOT inside AskUserQuestion):**

Print all requirements with their scenarios in full detail. This is regular text output, not a tool call:

```markdown
---
## L3 Requirements & Scenarios for Approval

### R1 [P1]: {behavior}
- **S1.1** (HP): Given {given}, When {when}, Then {then}
- **S1.2** (EP): Given {given}, When {when}, Then {then}
- **S1.3** (BC): Given {given}, When {when}, Then {then}

### R2 [P2]: {behavior}
- **S2.1** (HP): Given {given}, When {when}, Then {then}
- ...

{repeat for ALL requirements}

**Total: {N} requirements, {M} scenarios**
---
```

> Show EVERY requirement and EVERY scenario. Do not summarize or truncate even if the list is long. The user needs to see everything before approving.

**Step 2 — Ask for approval (simple choice only):**

```
AskUserQuestion(
  question: "Review the requirements and scenarios above. Ready to proceed?",
  header: "L3 Requirements Approval",
  options: [
    { label: "Approve all", description: "Requirements look good — proceed to L4" },
    { label: "Revise", description: "I want to change, add, or remove requirements" },
    { label: "Challenge", description: "Think harder — what requirements are we missing?" },
    { label: "Abort", description: "Stop specification process" }
  ]
)
```

- **Approve all** → proceed to L3 Gate
- **Revise** → user provides corrections, orchestrator re-runs workshop (or merges changes directly), re-present for approval (loop until approved)
- **Challenge** → orchestrator runs Requirements Completeness Audit (see below), proposes additional requirements, re-present for approval
- **Abort** → stop

#### Requirements Completeness Audit (triggered by "Challenge")

When the user selects "Challenge", the orchestrator self-audits the current requirement set across **two axes**:

##### Axis 1: Breadth — "What entire requirements are missing?"

1. **Decision coverage check** — for each L2 decision, verify at least one requirement traces back to it. Flag orphan decisions (decided but never specified as a requirement).
2. **Negative requirements** — what should the system explicitly NOT do? Look for missing "must not" requirements implied by decisions or constraints.
3. **User journey walk** — mentally walk through the primary user flow end-to-end. Flag any step where behavior is unspecified (e.g., "user lands on page — but what's the empty state?").
4. **Constraint-to-requirement traceability** — for each L2 constraint, is there a requirement whose scenarios actually verify it? Flag constraints that no scenario exercises.

##### Axis 2: Depth — "Which existing requirements need richer scenarios?"

5. **Scenario category coverage** — for each requirement, check HP (happy path), EP (error path), BC (boundary/edge case), NI (negative/invalid input), IT (integration/interaction) categories. Flag requirements with only HP scenarios.
6. **State variation scan** — for each requirement, ask: "Does behavior change based on state?" (empty vs populated, first-time vs returning, logged-in vs anonymous, mobile vs desktop). Flag unaddressed state variations.
7. **Concurrency/timing scan** — for each requirement, ask: "What if two users/processes do this simultaneously?" or "What if this happens during a pending operation?" Flag race conditions or timing-dependent behavior left unspecified.

##### Cross-axis check

8. **Cross-requirement conflict check** — look for pairs of requirements that could contradict each other when implemented together.

**Output format** — present findings grouped by axis:

```markdown
## Challenge Results — {N} potential gaps found

### Breadth Gaps (missing requirements)
- D2 decided [X] but no requirement specifies the behavior
- Nothing says what happens when [boundary condition]
- Between R2 and R4, what happens when [transition scenario]?
- C3 (constraint) has no scenario that exercises it

### Depth Gaps (existing requirements need richer scenarios)
- R1 only has happy path — what if [failure scenario]?
- R3: behavior differs for empty state vs populated state? (not specified)
- R2: what if two users submit simultaneously? (not addressed)

### Conflicts
- R1 and R5 may conflict when [scenario]
```

Then auto-generate the missing requirements/scenarios as proposals — **prioritize breadth gaps first** (a missing requirement is a bigger blind spot than a missing scenario), then depth gaps. Merge them and re-present for approval.

> **Circuit breaker**: Challenge can be selected at most **2 times** per L3 cycle. After 2 rounds, only Approve/Revise/Abort remain.

> This approval is **mandatory** — even in autopilot mode, L3 requirements MUST be user-approved before gate-keeper runs. Requirements are what gets built — wrong requirements = wrong implementation.

### L3 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json --layer scenarios
```

Then call gate-keeper via SendMessage with requirements + scenario summary.

**Quick**: No coverage check, no gate. Auto-advance after requirements merge.
**Standard**: Run coverage check + gate-keeper SendMessage. PASS → advance to L4.

If coverage check fails → gate failure. Handle per Gate Protocol in SKILL.md.
