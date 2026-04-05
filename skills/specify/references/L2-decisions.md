## L2: Decisions + Constraints

**Output**: `context.decisions[]`, `constraints[]`, `context.known_gaps[]`

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
3. **Ask** — 2 scenario questions targeting those checkpoints
4. **Resolve** — classify answer depth, merge decisions (see 3-state resolution)
5. **Scan** — detect unknown/unknowns (structured 3-tier check)
6. **Display** — show scoreboard + next action

**Question rules:**
- Frame as concrete situations, not abstract choices
- User can skip ("Agent decides") → checkpoint marked resolved, `assumed: true`
- User says "I don't know" → checkpoint stays unresolved, add to `known_gaps`
- After each round: merge decisions, show scoreboard

#### 3-State Checkpoint Resolution (Step 4)

Answers are classified into 3 states, not binary resolved/unresolved:

| State | Score weight | When |
|-------|-------------|------|
| **resolved** | 1.0 | Answer contains a **discriminator**: number, threshold, named actor, explicit behavior, or condition/exception |
| **provisional** | 0.5 | Answer lacks discriminators (short, vague, single option with no detail) |
| **unresolved** | 0.0 | No answer yet, or "I don't know" |

**After classifying as provisional**, check if the checkpoint is **high-impact** (Core Behavior or Error/Edge dimension):
- YES → ask ONE follow-up probing the most likely edge case, then re-classify
- NO → keep provisional, move on (re-evaluate at round end or Unresolved Sweep)

```
Example:
Q: "게임 오버 후 어떻게 되나요?"
A: "재시작 버튼" → no discriminator → provisional
   → Core Behavior (high-impact) → follow-up:
   "재시작하면 링/점수가 리셋되나요, 스테이지 처음부터인가요?"
A2: "전부 리셋, 스테이지 1부터" → discriminator (explicit behavior) → resolved
```

**Composite score** uses weighted states: `(1.0 × resolved + 0.5 × provisional + 0.0 × unresolved) / total`

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
| All conditions met | Inversion Probe → Unresolved Sweep → L2 Approval |
| round >= 7 | Soft warning: "diminishing returns likely" |
| round >= 10 | Circuit breaker. Strongly recommend proceed |

**Per-dimension floor effect**: With 2 checkpoints, 1/2 = 0.50 < 0.60 → blocked (must resolve both). With 3 checkpoints, 2/3 = 0.67 >= 0.60 → passes. This prevents high-composite scores from masking under-explored dimensions.

**User override**: If the user types "proceed" as free text (not via button) at any point, honor it regardless of score. The button is hidden below thresholds, but explicit user intent is always respected.

### Inversion Probe (triggered when composite first reaches >= 0.80)

Two questions:

1. **Inversion**: "Given the decisions so far, what scenario could cause this to fail even if every individual requirement is met correctly?"
2. **Implication**: "You decided [most impactful decision]. Does that also mean [likely consequence]?"

If inversion reveals new gaps → add checkpoints → score may drop below 0.80 → continue interviewing.
If no new gaps → proceed to Unresolved Checkpoint Sweep → L2 Approval.

**Edge case**: If L1 auto-resolves push score >= 0.80 at Step 0 (before any user questions), Inversion Probe fires immediately as a safety gate before skipping the interview entirely. This is intentional — it validates that L1's auto-resolved decisions are sufficient.

### Merge Decisions (incremental — runs in Interview Loop step 4)

After each round, merge that round's decisions immediately. Do NOT batch decisions to the end.

**Rationale must include rejected alternatives**: When writing the `rationale` field, mention alternatives that were considered and why they were rejected (e.g., `"REST over GraphQL (team unfamiliar) and gRPC (browser incompatible)"`). This prevents workers from re-evaluating already-rejected approaches during execution.

Run `hoyeon-cli spec guide context --schema v1` to check field types, then:

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin --append << 'EOF'
{decisions array matching guide output — include status field}
EOF
```

Use `--append` to add to existing decisions array. First round uses no flag (initial write).

### Constraints

Collect constraints naturally during the interview — things that must NOT be violated.

Sources: user statements, L1 research findings, inversion probe answers.

Run `hoyeon-cli spec guide constraints --schema v1`, then merge at L2 end.
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

Present all decisions + constraints to user. Then spawn **L2-reviewer** before user approval:

```
Task(subagent_type="general-purpose", prompt="""
You are an L2 clarity reviewer. Given:
- The checkpoint table with scores
- All merged decisions
- The complexity classification

Check:
1. Is complexity classification correct? Count signals from decisions.
2. Any dimension below 0.70 that should have more checkpoints?
3. Any decision that is too vague to derive requirements from?
4. Any cross-decision tension not caught by Unknown/Unknown detection?
5. Steelman test: For the most impactful decision, construct the strongest possible argument AGAINST the chosen option (not a strawman — the real reason a smart person would disagree). If this counterargument is not addressed in the decision's rationale, flag it as NEEDS_FIX.

Return: PASS or NEEDS_FIX with specific issues.
""")
```

- **PASS** → present AskUserQuestion (Approve/Revise/Abort) to user
- **NEEDS_FIX** → address issues (add checkpoints, re-interview, clarify decisions), then re-run reviewer (max 2 retries)

### L2 Gate

```bash
hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json --layer decisions
```

Pass → advance to L3.
