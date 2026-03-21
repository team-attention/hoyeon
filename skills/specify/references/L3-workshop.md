## L3: Requirements + Sub-requirements

**Who**: Orchestrator (default) OR L3-user-advocate + L3-requirement-writer + L3-devil's-advocate (with `--workshop`)
**Input**: goal + decisions + provisional requirements (as seed)
**Output**: `requirements[]` with source fields + `sub[]` (sub-requirements per requirement)
**Merge**: `spec merge requirements` (atomic, with sub[])
**Gate**: `spec coverage --layer requirements` + gate-keeper via SendMessage
**Backtracking**: If decision gap found → AskUserQuestion → spec merge decisions (L2) → re-run L3

### Default Flow (without --workshop)

Orchestrator derives requirements and sub-requirements directly from goal + decisions.

For each confirmed decision and implication:
1. Identify observable behaviors (requirements)
2. For each requirement, derive at least 1 sub-requirement describing a concrete, testable behavior

Skip to "Merge requirements" after deriving. No SendMessage to L3 agents, no workshop.

### 3-Agent Requirements Workshop (with --workshop flag) — Collaborative Communication

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
You will receive user journeys from L3-user-advocate. Structure them into formal Requirements + Sub-requirements.

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

- Every user journey path MUST produce at least one requirement or sub-requirement
- Group related journey paths into single requirements (e.g., 'Profile accessible via feed avatar click, search result click, and URL direct access' = ONE requirement with multiple sub-requirements)
- Convert each confirmed implication into at least one requirement
- If you find missing decisions, output as 'decision_gaps' — orchestrator will handle backtracking

## Output: Requirements

For EACH requirement:
- id: R1, R2, ... (sequential)
- behavior: observable behavior statement (not implementation detail)
- priority: 1 (critical) | 2 (important) | 3 (nice-to-have)
- source: {type: 'goal'|'decision'|'gap'|'implicit'|'negative', ref: 'D{id}'}

## Output: Sub-requirements (per requirement)

Each requirement MUST have at least 1 sub-requirement. Sub-requirements describe concrete, testable behaviors that together fulfill the parent requirement.

### Sub-requirement Fields

Each sub-requirement MUST include:
- id: {req_id}.{n} (e.g., R1.1, R1.2)
- behavior: concrete, observable behavior statement
- verify: (optional) object describing how to verify — `{type: 'command'|'assertion'|'manual', run?: '...', checks?: [...], ask?: '...'}`

### verify Abstraction Rules (MANDATORY)

verify describes OBSERVABLE BEHAVIOR, not implementation details.

#### Prohibited in verify fields:
- File paths (src/auth/login.ts)
- Function/class names (validatePassword(), AuthService)
- Code patterns (if(!pw) throw)
- Line numbers
- Internal variable names

#### Allowed in verify fields:
- API contracts (POST /login with empty body → 400)
- Input/output relations (empty password → validation error message)
- Behavior properties (invalid input does not trigger database query)
- UI states (login success → dashboard shows username)

#### Self-check: 'If all implementation file names changed, would this verify still be valid?'
  Yes → correct abstraction level. No → rewrite.
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
You will receive requirements+sub-requirements from L3-requirement-writer. Your job is to BREAK them — find missing paths, contradictions, impossible assumptions, and untested behaviors.

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

**Sub-requirement coverage:**
- Every requirement has at least 1 sub-requirement
- Sub-requirements together cover the full behavior of the parent requirement
- No sub-requirement is duplicated across requirements

**Sub-requirement quality:**
- verify fields (when present) are at behavior level — not coupled to implementation
- verify.run (if present): executable shell command with concrete expected value
- verify.checks (if present): falsifiable assertions (can be proven wrong)
- verify.ask (if present): actionable step-by-step instructions

**verify abstraction level (BLOCKING):**
- IF verify.run or verify.checks reference specific file paths → REJECT ('verify coupled to implementation: {path}')
- IF verify.run or verify.checks reference function/class names → REJECT ('verify coupled to implementation: {name}')
- IF verify.checks contain vague words: 'works', 'correctly', 'properly', 'as expected' → REJECT ('verify not falsifiable: {check}')
- Self-check per sub-requirement: 'If implementation files were renamed, would this verify still hold?' No → REJECT

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

### Merge requirements (atomic, with sub[])

> **Merge flag**: Use NO flag (default deep-merge) on the first-time write — this replaces the placeholder `requirements[]`.
> On backtrack re-run, still use NO flag — overwrites the entire `requirements[]` array.
> Do NOT use `--append` (would duplicate) or `--patch` (not appropriate for full replacement).

Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE (MANDATORY) — check schema before constructing
hoyeon-cli spec guide requirements

# STEP 2+3: CONSTRUCT + WRITE
# ⚠️ source must be {type, ref} OBJECT, not a string
# ⚠️ source.type ENUM: goal|decision|gap|implicit|negative (NOT "implication")
# ⚠️ verify (when present) must be {type, run|checks|ask} OBJECT, not a string
# ⚠️ NEVER truncate guide output (no head/tail) — read the FULL output
cat > /tmp/spec-merge.json << 'EOF'
{
  "requirements": [
    {
      "id": "R1",
      "behavior": "observable behavior statement",
      "priority": 1,
      "source": {"type": "decision", "ref": "D1"},
      "sub": [
        {
          "id": "R1.1",
          "behavior": "concrete testable behavior"
        },
        {
          "id": "R1.2",
          "behavior": "another concrete behavior",
          "verify": {"type": "command", "run": "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health"}
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

Before running the gate, present ALL requirements and their sub-requirements to the user as **text output first**, then ask for approval.

**Step 1 — Display full details as text output (NOT inside AskUserQuestion):**

Print all requirements with their sub-requirements in full detail. This is regular text output, not a tool call:

```markdown
---
## L3 Requirements & Sub-requirements for Approval

### R1 [P1]: {behavior}
- **R1.1**: {sub-requirement behavior}
- **R1.2**: {sub-requirement behavior}

### R2 [P2]: {behavior}
- **R2.1**: {sub-requirement behavior}
- ...

{repeat for ALL requirements}

**Total: {N} requirements, {M} sub-requirements**
---
```

> Show EVERY requirement and EVERY sub-requirement. Do not summarize or truncate even if the list is long. The user needs to see everything before approving.

**Step 2 — Ask for approval (simple choice only):**

```
AskUserQuestion(
  question: "Review the requirements and sub-requirements above. Ready to proceed?",
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
4. **Constraint-to-requirement traceability** — for each L2 constraint, is there a requirement whose sub-requirements actually verify it? Flag constraints that no sub-requirement exercises.

##### Axis 2: Depth — "Which existing requirements need richer sub-requirements?"

5. **Sub-requirement coverage** — for each requirement, check that sub-requirements cover: happy path behavior, failure/error handling, and boundary conditions. Flag requirements with only one sub-requirement that doesn't address failures.
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
- Between R2 and R4, what happens when [transition sub-requirement]?
- C3 (constraint) has no sub-requirement that exercises it

### Depth Gaps (existing requirements need richer sub-requirements)
- R1 only covers happy path — what if [failure behavior]?
- R3: behavior differs for empty state vs populated state? (not specified)
- R2: what if two users submit simultaneously? (not addressed)

### Conflicts
- R1 and R5 may conflict when [situation]
```

Then auto-generate the missing requirements/sub-requirements as proposals — **prioritize breadth gaps first** (a missing requirement is a bigger blind spot than a missing sub-requirement), then depth gaps. Merge them and re-present for approval.

> **Circuit breaker**: Challenge can be selected at most **2 times** per L3 cycle. After 2 rounds, only Approve/Revise/Abort remain.

> This approval is **mandatory** — even in autopilot mode, L3 requirements MUST be user-approved before gate-keeper runs. Requirements are what gets built — wrong requirements = wrong implementation.

### L3 Gate

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json
```

Then call gate-keeper via SendMessage with requirements + sub-requirement summary.

**Standard**: Run coverage check + gate-keeper SendMessage. PASS → advance to L4.

If coverage check fails → read the ENTIRE gap list, then fix ALL gaps in a single `--patch` merge. Do NOT fix one gap at a time (causes O(n) coverage loops). Handle per Gate Protocol in SKILL.md.
