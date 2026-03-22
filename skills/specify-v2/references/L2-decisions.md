## L2: Decisions + Constraints

**Output**: `context.decisions[]`, `constraints[]`, `context.known_gaps[]`

### Step 0: Checkpoint Generation (runs once at L2 start)

Read L1 research + confirmed_goal, then generate project-specific checkpoints per dimension.

**Checkpoint count** — scale by project complexity inferred from L1:
- Simple (single-file, toy, playground) → 2-3 per dimension
- Medium (multi-file feature, API endpoint) → 4-5 per dimension
- Complex (multi-service, migration, infra) → 6-8 per dimension

| # | Dimension | Weight | Example checkpoints |
|---|-----------|--------|-------------------|
| 1 | **Core Behavior** | 25% | Primary action, success outcome, main loop/flow |
| 2 | **Scope Boundaries** | 20% | Out-of-scope items, actor coverage, platform |
| 3 | **Error/Edge Cases** | 20% | Primary failure mode, recovery, edge case |
| 4 | **Data Model** | 15% | State persistence, data flow, schema shape |
| 5 | **Implementation** | 20% | Tech stack, delivery format, dependencies |

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
1. **Score** — compute coverage per dimension (resolved / total checkpoints)
2. **Target** — pick lowest-scoring dimension(s) for next questions
3. **Ask** — 2 scenario questions targeting those checkpoints
4. **Resolve** — mark covered checkpoints, merge decisions
5. **Scan** — detect unknown/unknowns (cross-decision gaps outside checkpoints)
6. **Display** — show scoreboard + next action

**Question rules:**
- Frame as concrete situations, not abstract choices
- User can skip ("Agent decides") → checkpoint marked resolved, `assumed: true`
- User says "I don't know" → checkpoint stays unresolved, add to `known_gaps`
- After each round: merge decisions, show scoreboard

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

After resolving checkpoints, scan for gaps OUTSIDE the checkpoint list:

1. **Cross-decision tension** — do any two decisions conflict in an unexamined scenario?
2. **Implication chain** — does decision A force a choice B that we haven't addressed?
3. **Actor gap** — is there an actor (admin, scheduler, external API) with zero decisions?

When detected → **add new checkpoint** to the relevant dimension → score drops → forces more questions on that area.

```
## Round 2 — Unknown/Unknown Detected

Added checkpoint to Error/Edge:
- [ ] "What happens when speed is very high + ring scatter physics?" (D1+D2 tension)

Error/Edge score: 1/4 -> 0.25 (was 1/3 -> 0.33)
```

### Scoreboard (shown after each round)

```
## Interview Progress — Round N

| Dimension | Covered | Total | Score | Status |
|-----------|---------|-------|-------|--------|
| Core Behavior | 3 | 3 | 1.00 | done |
| Scope | 1 | 3 | 0.33 | <- next |
| Error/Edge | 0 | 4 | 0.00 | <- next |
| Data Model | 1 | 2 | 0.50 | |
| Implementation | 2 | 2 | 1.00 | done |

**Composite: 0.59** (threshold: 0.80)
Unknown/Unknowns: 1 pending

### Decisions so far
- D1: ... (resolved)
- D2: ... (resolved)
...
```

### Termination

| Condition | Action |
|-----------|--------|
| composite < 0.80 | Must continue. "Proceed" button NOT shown in options |
| composite >= 0.80 AND unknowns > 0 | Resolve unknowns first, then offer proceed |
| composite >= 0.80 AND unknowns == 0 | Auto-suggest "proceed to planning" |
| round >= 7 | Soft warning: "diminishing returns likely" |
| round >= 10 | Circuit breaker. Strongly recommend proceed |

**User override**: If the user types "proceed" as free text (not via button) at any point, honor it regardless of score. The button is hidden below 0.80, but explicit user intent is always respected.

### Inversion Probe (triggered when composite first reaches >= 0.80)

Two questions:

1. **Inversion**: "Given the decisions so far, what scenario could cause this to fail even if every individual requirement is met correctly?"
2. **Implication**: "You decided [most impactful decision]. Does that also mean [likely consequence]?"

If inversion reveals new gaps → add checkpoints → score may drop below 0.80 → continue interviewing.
If no new gaps → proceed to approval.

**Edge case**: If L1 auto-resolves push score >= 0.80 at Step 0 (before any user questions), Inversion Probe fires immediately as a safety gate before skipping the interview entirely. This is intentional — it validates that L1's auto-resolved decisions are sufficient.

### Merge Decisions (incremental — runs in Interview Loop step 4)

After each round, merge that round's decisions immediately. Do NOT batch decisions to the end.

Run `hoyeon-cli spec guide context --schema v7` to check field types, then:

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --stdin --append << 'EOF'
{decisions array matching guide output — include status field}
EOF
```

Use `--append` to add to existing decisions array. First round uses no flag (initial write).

### Constraints

Collect constraints naturally during the interview — things that must NOT be violated.

Sources: user statements, L1 research findings, inversion probe answers.

Run `hoyeon-cli spec guide constraints --schema v7`, then merge at L2 end.
If no constraints: merge `"constraints": []` explicitly.

### Known Gaps

If things couldn't be decided (pending decisions that need investigation):

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --stdin --append << 'EOF'
{"context": {"known_gaps": ["Performance target TBD"]}}
EOF
```

### L2 Approval

Present all decisions + constraints to user, then AskUserQuestion (Approve/Revise/Abort).

### L2 Gate

```bash
hoyeon-cli spec validate .dev/specs/{name}/spec.json --layer decisions
```

Pass → advance to L3.
