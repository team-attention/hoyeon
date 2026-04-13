> **MUST-READ-FIRST** — Reading this file is mandatory before executing L2. The SKILL.md L2 row is a 1-line summary; the real protocol (Step 0 checkpoint generation, Interview Loop, 3-state resolution, Unknown/Unknown 3-tier detection, Scoreboard, Unresolved Sweep, L2-reviewer) lives below. Skipping any step = protocol violation. Do not "ad-hoc interview" — execute steps in order.

## L2: Decisions + Constraints

**Output**: `context.decisions[]`, `constraints[]`, `context.known_gaps[]`

### Mandatory Step Order (do not skip, do not reorder)

1. **Step 0** — Complexity classify (signal count) + per-dimension checkpoint generation + L1 auto-resolve
2. **Interview Loop** — Score → Target lowest dim → Ask 2 scenario questions → 3-state resolve → Unknown/Unknown 3-tier scan → Scoreboard
3. **Termination check** — composite ≥ 0.80 AND every dim ≥ 0.60 AND unknowns == 0 (else continue loop)
4. **Unresolved Checkpoint Sweep** — append every unresolved/provisional checkpoint to `known_gaps[]`
5. **L2-reviewer Task** — fresh-context subagent runs Clarity + Blind-spot audit (includes steelman + "what breaks first" + "most suspicious assumption"). User-in-loop on NEEDS_FIX, max 3 reviewer rounds.
6. **L2 Approval** — AskUserQuestion (Approve/Revise/Abort) + `spec validate --layer decisions`

### Step 0: Checkpoint Generation (runs once at L2 start)

Read L1 research + confirmed_goal, then generate project-specific checkpoints per dimension.

**Checkpoint count** — scale by project complexity inferred from L1.

Classify by **signal count** (not delivery format — a "playground" can still be Medium):

| Signal | Examples |
|--------|----------|
| External resource loading | GLTF, API calls, CDN assets, DB |
| 3+ independent subsystems | physics + rendering + input + AI |
| State machine / multi-stage flow | level progression, wizard, pipeline |
| Async resources | model loading, network, workers |
| Multi-actor interaction | admin + user, client + server |
| Data schema design | custom DB schema, complex state shape |

- **Simple** (0-1 signals) → 2-3 per dimension
- **Medium** (2-3 signals) → 4-5 per dimension
- **Complex** (4+ signals) → 6-8 per dimension

Output complexity classification with evidence before generating checkpoints:
```
Complexity: Medium (3 signals)
- External resource loading: GLTF model via GLTFLoader
- 3+ subsystems: physics, rendering, input, collision
- State machine: stage progression with Game Over flow
```

| # | Dimension | Weight | Example checkpoints |
|---|-----------|--------|-------------------|
| 1 | **Core Behavior** | 25% | Primary action, success outcome, main loop/flow |
| 2 | **Scope Boundaries** | 20% | Out-of-scope items, actor coverage, platform |
| 3 | **Error/Edge Cases** | 20% | Primary failure mode, recovery, edge case |
| 4 | **Data Model** | 15% | State persistence, data flow, schema shape, API contract/payload format |
| 5 | **Implementation** | 20% | Tech stack, delivery format, dependencies, service communication pattern, protocol choice |

**Brownfield adjustment**: When L1 detects existing codebase, Implementation checkpoints auto-resolve from existing patterns. Redistribute weight: Core 30%, Scope 20%, Error 25%, Data 15%, Implementation 10%.

**L1 Auto-Resolve**: Before generating questions, check each checkpoint against L1 research. If L1 already answers it → mark resolved, record as decision with `assumed: true`. These count toward the score.

Output the checkpoint table (visible to user):

```
## L2 Checkpoints (auto-generated from L1)

### Core Behavior (25%) — 0/3 resolved
- [ ] Primary user action defined
- [ ] Success/failure outcome clear
- [ ] Main loop or flow defined

### Scope Boundaries (20%) — 1/3 resolved
- [x] Platform decided (L1: web browser, Canvas) <- auto-resolved
- [ ] Explicit out-of-scope items
- [ ] Actor coverage

... (all dimensions)
```

### Interview Loop (score-driven)

Each round:
1. **Score** — compute coverage per dimension (see 3-state scoring below)
2. **Target** — pick lowest-scoring dimension(s) for next questions
3. **Ask** — 2 scenario questions targeting those checkpoints (see persona rotation + snapshot hint below)
4. **Resolve** — classify answer depth, merge decisions (see 3-state resolution)
5. **Scan** — detect unknown/unknowns (structured 3-tier check)
6. **Display** — show scoreboard + next action

**Question rules:**
- Frame as concrete situations, not abstract choices
- User can skip ("Agent decides") → checkpoint marked resolved, `assumed: true`
- User says "I don't know" → checkpoint stays unresolved, add to `known_gaps`
- After each round: merge decisions, show scoreboard

#### Persona Rotation (round-aware question framing)

Before asking, pick the persona lens based on round number. Personas are **prompt scaffolding**, not separate agents — they shape how you phrase the question, not who asks it.

| Round | Active personas | What they push for |
|-------|-----------------|--------------------|
| 1–2 (early) | **Goal Clarifier** + **Breadth Keeper** | Who is the user? What's the bounding scope? Cover unexplored dimensions first. |
| 3–5 (mid) | **Constraint Prober** + **Architect** | What must NOT be violated? What are the structural dependencies between decisions? |
| 6+ (late) | **Edge-Case Hunter** + **Closer** | What breaks under stress? What's left to resolve so we can stop? |

Rotation is a hint, not a hard rule — if a low-scoring dimension clearly needs early-persona treatment in round 6 (e.g., scope suddenly reopened), use it. The orchestrator picks 1–2 personas per round and silently conditions question wording accordingly. Do NOT enumerate personas in the user-facing question text.

#### Ambiguity Snapshot (prepended to internal reasoning each round)

Before composing the 2 questions, surface the current weak-signal snapshot to yourself:

```
Current snapshot:
  Scoreboard:  Scope 0.55 / Impl 0.82 / Data 0.60 / NF 0.30
  Lowest 2:    NF (0.30), Scope (0.55)
  Unknowns:    1 pending (Tier 2 — D4 implies asset sourcing)
  Persona set: Constraint Prober + Architect (round 4)
```

Use the snapshot to self-select which checkpoint to probe — do NOT mechanically drain the single lowest dimension if a higher-impact unknown is flagged. The snapshot is **advisory**: if NF is 0.30 but its checkpoints are trivial ("no performance target needed — playground"), skip and target Scope instead. The `recommendation` field in round logs records your reasoning.

#### 4-State Checkpoint Resolution (Step 4)

Answers are classified into 4 states (not binary). A named choice alone is NOT enough — "SQLite + Prisma" is a stack pick, not a resolved data layer.

| State | Weight | Requires |
|-------|--------|----------|
| **resolved** | 1.0 | **All three**: (1) discriminator (number/threshold/named actor/explicit behavior/condition), (2) rationale (why this over alternatives), (3) at least ONE downstream implication or constraint acknowledged |
| **actionable** | 0.75 | Discriminator + rationale, but downstream implication not yet surfaced |
| **provisional** | 0.5 | Discriminator only (named choice with no rationale) |
| **unresolved** | 0.0 | No answer, or "I don't know" |

**Examples:**

| Answer | State | Why |
|--------|-------|-----|
| "SQLite + Prisma" | provisional (0.5) | Named stack, no rationale, no implication |
| "SQLite + Prisma because this is a single-user playground and we don't need concurrency" | actionable (0.75) | Discriminator + rationale, but migration/schema-evolution implication unstated |
| "SQLite + Prisma (single-user playground, no concurrency needed). Schema evolution via `prisma migrate dev`, reset DB is fine when schema changes" | resolved (1.0) | All three present |
| "DB 뭐가 좋을까?" → "음... 알아서" | provisional (0.5) | `assumed: true` + orchestrator picks, but user signaled no opinion — treat as weakly held |
| "모르겠어" | unresolved (0.0) | Add to `known_gaps` |

**Follow-up rule** (applies to provisional and actionable):
- **provisional** on a **high-impact dim** (Core Behavior / Error-Edge / Security) → ask ONE follow-up probing rationale OR implication; re-classify
- **actionable** → ask ONE follow-up ONLY if the missing implication is likely load-bearing (e.g., "migration story" for a chosen DB); otherwise leave at 0.75 and move on
- Cap: no checkpoint gets more than 2 total follow-ups — after that, accept final state and record to `known_gaps` if still < 0.75

```
Example:
Q: "게임 오버 후 어떻게 되나요?"
A: "재시작 버튼" → no discriminator → provisional
   → Core Behavior (high-impact) → follow-up:
   "재시작하면 링/점수가 리셋되나요, 스테이지 처음부터인가요?"
A2: "전부 리셋, 스테이지 1부터" → discriminator (explicit behavior) → resolved
```

**Composite score** uses weighted states: `(1.0 × resolved + 0.75 × actionable + 0.5 × provisional + 0.0 × unresolved) / total`

**Question format — RIGHT (scenario):**
```
AskUserQuestion(
  question: "A user's token expires while filling a form. They click Submit. What should happen?",
  options: [
    { label: "Silent refresh + retry", description: "Transparent re-auth" },
    { label: "Redirect to login", description: "Interrupts but simpler" },
    { label: "Agent decides" }
  ]
)
```

**Question format — WRONG (abstract):**
```
AskUserQuestion(question: "How should authentication work?", ...)
```

### Unknown/Unknown Detection (runs after step 4 each round)

Structured 3-tier check on every NEW decision merged this round. Not a vague "scan" — execute each tier mechanically.

#### Tier 1: Actor Check (always run)

1. List all actors implied by ALL decisions so far (user, admin, external API, scheduler, etc.)
2. Any actor with 0 decisions covering their behavior? → add checkpoint to **Scope Boundaries**

```
Decisions: D1 (player collision), D2 (goal ring), D3 (WASD controls)
Actors: player ✓ (D1,D2,D3), game system ✓ (D1,D2), camera ✗ (0 decisions)
→ Add checkpoint: "Camera behavior during gameplay (follow, fixed, user-controlled?)"
```

#### Tier 2: Implication Check (always run)

For each NEW decision, ask: "This decision also requires deciding ___"

1. State the implication concretely (not "maybe something about X")
2. Check if any existing decision already covers it
3. If uncovered → add checkpoint to the relevant dimension

```
D4: "Use GLTF models via GLTFLoader"
→ Implies: asset sourcing strategy (where to get models?)
→ Implies: loading failure fallback (what if GLTF fails to load?)
→ Existing decisions: none cover this → add 2 checkpoints
```

#### Tier 3: Pair Tension Check (conditional — high-risk decisions only)

Only run for decisions involving these high-interaction domains:
- Physics / collision / movement
- Concurrency / sync / multiplayer
- Permissions / roles / access control
- Performance / security / reliability constraints

For qualifying decisions: cross with each existing decision and ask:
"If both are simultaneously true, what edge case arises?"

```
D1 (collision = ring scatter + invincibility) × D3 (full free movement at high speed)
→ "At very high speed, collision detection may miss obstacles entirely (tunneling)"
→ Add checkpoint to Error/Edge: "High-speed collision detection reliability"
```

Skip Tier 3 entirely if no decisions touch the high-interaction domains listed above.

#### When detected

Add new checkpoint → relevant dimension → score recalculated → may force more questions.

Output detection results visibly:
```
## Round 2 — Unknown/Unknown Detection

Tier 1 (Actor): camera (0 decisions) → +1 checkpoint to Scope
Tier 2 (Implication): D4 implies asset sourcing → +1 checkpoint to Implementation
Tier 3 (Pair): D1×D3 high-speed tunneling → +1 checkpoint to Error/Edge

Error/Edge score: 1/4 → 0.25 (was 1/3 → 0.33)
```

### Scoreboard (shown after each round)

```
## Interview Progress — Round N

| Dimension | R | P | U | Total | Score | Status |
|-----------|---|---|---|-------|-------|--------|
| Core Behavior | 2 | 1 | 0 | 3 | 0.83 | |
| Scope | 1 | 0 | 2 | 3 | 0.33 | <- next |
| Error/Edge | 0 | 0 | 4 | 4 | 0.00 | <- next |
| Data Model | 1 | 0 | 1 | 2 | 0.50 | |
| Implementation | 2 | 0 | 0 | 2 | 1.00 | done |

R=resolved(1.0) P=provisional(0.5) U=unresolved(0.0)
**Composite: 0.53** (threshold: 0.80, floor: 0.60/dim)
Unknown/Unknowns: 1 pending

### Decisions so far
- D1: ... (resolved)
- D2: ... (provisional — needs discriminator)
...
```

### Termination

Proceed requires ALL conditions met (AND):

| Condition | Check |
|-----------|-------|
| composite >= 0.80 | Weighted average across dimensions |
| **every dimension >= 0.60** | Per-dimension floor — no single dimension left half-empty |
| unknowns == 0 | All unknown/unknowns resolved |

| State | Action |
|-------|--------|
| Any condition unmet | Must continue. "Proceed" button NOT shown in options |
| All conditions met | Unresolved Sweep → L2-reviewer → L2 Approval |
| round >= 7 | Soft warning: "diminishing returns likely" |
| round >= 10 | Circuit breaker. Strongly recommend proceed |

**Per-dimension floor effect**: With 2 checkpoints, 1/2 = 0.50 < 0.60 → blocked (must resolve both). With 3 checkpoints, 2/3 = 0.67 >= 0.60 → passes. This prevents high-composite scores from masking under-explored dimensions.

**User override**: If the user types "proceed" as free text (not via button) at any point, honor it regardless of score. The button is hidden below thresholds, but explicit user intent is always respected.

### Merge Decisions (incremental — runs in Interview Loop step 4)

After each round, merge that round's decisions immediately. Do NOT batch decisions to the end.

**Rationale must include rejected alternatives**: When writing the `rationale` field, mention alternatives that were considered and why they were rejected (e.g., `"REST over GraphQL (team unfamiliar) and gRPC (browser incompatible)"`). This prevents workers from re-evaluating already-rejected approaches during execution.

Run `hoyeon-cli spec guide context --schema v2` to check field types, then:

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin --append << 'EOF'
{decisions array matching guide output — include status field}
EOF
```

Use `--append` to add to existing decisions array. First round uses no flag (initial write).

### Constraints

Collect constraints naturally during the interview — things that must NOT be violated.

Sources: user statements, L1 research findings, inversion probe answers.

Run `hoyeon-cli spec guide constraints --schema v2`, then merge at L2 end.
If no constraints: merge `"constraints": []` explicitly.

### Known Gaps

If things couldn't be decided (pending decisions that need investigation):

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin --append << 'EOF'
{"context": {"known_gaps": ["Performance target TBD"]}}
EOF
```

### Unresolved Checkpoint Sweep (runs before L2 Approval)

After Inversion Probe, before presenting approval to user:

1. Scan all checkpoints — collect any still **unresolved** or **provisional**
2. Append each to `known_gaps[]`:
   - Unresolved: `"L2 unresolved: {dimension} — {checkpoint description}"`
   - Provisional: `"L2 provisional: {dimension} — {checkpoint description} (answer: {user's answer})"`
3. Merge via `spec merge --stdin --append`

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin --append << 'EOF'
{"context": {"known_gaps": [
  "L2 unresolved: Data Model — Level/stage data format",
  "L2 provisional: Core Behavior — Character movement model (answer: 'free movement' — no physics detail)"
]}}
EOF
```

This ensures no incomplete checkpoint is silently dropped. L3 can reference these gaps when deriving requirements.

### L2 Approval

Present all decisions + constraints to user. Then spawn **L2-reviewer** (fresh-context subagent) before user approval:

```
Task(subagent_type="general-purpose", prompt="""
You are an adversarial L2 reviewer. Your job is NOT to rubber-stamp — flag NEEDS_FIX on anything weak.

## Input
Read the spec file directly (do not trust any summary):
  spec path: .hoyeon/specs/{name}/spec.json
  Load: meta.goal, meta.non_goals, context.confirmed_goal, context.research,
        context.decisions, context.known_gaps, constraints, and any checkpoint/score
        state present in the spec.

## Part A — Clarity Audit
1. Is the complexity classification correct? Count signals from decisions.
2. Any dimension still below 0.70 that needed more checkpoints?
3. Any decision too vague to derive requirements from?
4. Cross-decision tension not caught by Unknown/Unknown detection?
5. Steelman: for the most impactful decision, construct the strongest argument
   AGAINST the chosen option (real reason a smart person would disagree — not a
   strawman). If the rationale does not address it → NEEDS_FIX.

## Part B — Blind-spot Audit (Unknown/Unknown + Inversion coverage)
Find things NOT mentioned in any decision or known_gap. For each axis, look for
concrete scenarios the current decisions would silently fail on:
  a. **Missing actor** — who else interacts (admin, cron, external service,
     future maintainer) that no decision models?
  b. **Missing lifecycle phase** — first-run, error, shutdown, migration,
     rollback, empty-state — any phase no decision covers?
  c. **Missing failure mode / "what breaks first"** — name at least ONE concrete
     scenario that would break the system even if every requirement is met
     (network partition, rate limit, quota, stale cache, clock skew, partial
     write, upstream API deprecation, etc.). If you cannot identify a
     plausible break, explain why in `evidence`.
  d. **Missing non-functional dimension** — performance / a11y / i18n / security
     / observability — any axis not even scored?
  e. **Most suspicious assumption** — for the most impactful decision, name the
     single load-bearing assumption that, if wrong, invalidates the decision.
     If that assumption is not validated in research or rationale → NEEDS_FIX.
For each miss: name the category, the concrete scenario, and which dimension
should have caught it. ≥1 material miss → NEEDS_FIX.

## Output (strict JSON — single object, no prose)
{
  "verdict": "PASS" | "NEEDS_FIX",
  "issues": [
    { "part": "A"|"B", "category": "<short>", "evidence": "<spec excerpt or path>",
      "recommendation": "<concrete fix: add checkpoint / re-interview dim / clarify D#>" }
  ]
}
""")
```

- **PASS** → present AskUserQuestion (Approve/Revise/Abort) to user
- **NEEDS_FIX** → do NOT silently auto-fix. User owns ambiguity. Present the issue list to the user and loop until resolved:

  ```
  Show issues (grouped by Part A / Part B, most impactful first).
  For each issue, call AskUserQuestion:
    question: "<issue.category>: <issue.evidence>\nReviewer recommends: <issue.recommendation>"
    options:
      - "Resolve"         → user answers clarifying question(s) → merge into decisions[] (--patch or --append)
      - "Accept as gap"   → append to context.known_gaps[] with issue.evidence as rationale
      - "Out of scope"    → append to meta.non_goals[]
      - "Skip"            → ignore this issue only (do not re-surface)
  After all issues processed → re-run L2-reviewer.
  ```

  **Loop termination**:
  - reviewer returns `PASS` → proceed to Step 7
  - round counter hits **3** (reviewer ran 3× total) → stop looping. Surface any still-open issues to user one final time with a single AskUserQuestion: "Reviewer still flags N issues after 3 rounds. Proceed with these as known_gaps, or continue iterating?" → user's choice is final.
  - User selects "Skip" on every remaining issue → treat as PASS and proceed.

  **Anti-pattern**: the orchestrator must NOT invent answers to resolve NEEDS_FIX issues on the user's behalf. If `issue.recommendation` reads "re-interview Scope dim on admin actor", the next step is an AskUserQuestion to the user — not an orchestrator-guessed decision merge.

### L2 Gate

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --layer decisions
```

Pass → advance to L3.
