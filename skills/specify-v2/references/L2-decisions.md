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

Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE (MANDATORY)
hoyeon-cli spec guide context

# STEP 2+3: CONSTRUCT + WRITE
cat > /tmp/spec-merge.json << 'EOF'
{
  "context": {
    "assumptions": [
      {"id": "A1", "belief": "...", "if_wrong": "...", "impact": "low|medium|high"}
    ]
  }
}
EOF

# STEP 4: MERGE (--append for array addition)
hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json

# STEP 5: VERIFY
hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

If merge fails → follow Merge Failure Recovery (SKILL.md).

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

After derivation, merge decisions WITH implications. Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE (MANDATORY)
hoyeon-cli spec guide context

# STEP 2+3: CONSTRUCT + WRITE — decisions[] with implications[]
cat > /tmp/spec-merge.json << 'EOF'
{
  "context": {
    "decisions": [
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
    ]
  }
}
EOF

# STEP 4: MERGE (--append for adding to existing decisions array)
hoyeon-cli spec merge .dev/specs/{name}/spec.json --append --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json

# STEP 5: VERIFY
hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

If merge fails → follow Merge Failure Recovery (SKILL.md).

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
> Provisional requirements are saved to session state via: `hoyeon-cli session set --sid $SESSION_ID --json '{"provisional_requirements": [...]}'`  (D13)

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

**Merge constraints.** Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE (MANDATORY) — verify constraint field types
hoyeon-cli spec guide constraints

# STEP 2+3: CONSTRUCT + WRITE
# ⚠️ verify must be {type, run} OBJECT, not a string
cat > /tmp/spec-merge.json << 'EOF'
{
  "constraints": [
    {
      "id": "C1",
      "type": "operational|security|compatibility|performance",
      "rule": "Embedding generation must not block the summarization pipeline",
      "verified_by": "machine|agent|human",
      "verify": {"type": "assertion", "run": "npm test -- --grep pipeline"}
    }
  ]
}
EOF

# STEP 4: MERGE
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json

# STEP 5: VERIFY
hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

If merge fails → follow Merge Failure Recovery (SKILL.md).

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
