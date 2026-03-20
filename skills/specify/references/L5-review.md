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

If either fails → fix and retry (max 2 attempts). If still failing after 2 retries → HALT and show error to user.

### Step 2: Full Coverage Check

```bash
hoyeon-cli spec coverage .dev/specs/{name}/spec.json
```

Check exit code. Non-zero → L5 blocks, show failure to user, ask for correction before proceeding.

### Step 3: DAG Visualization

```bash
hoyeon-cli spec plan .dev/specs/{name}/spec.json
```

Show output to user. Capture output for inclusion in Step 6 Plan Approval Summary.

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
> **MANDATORY**: This step MUST run in standard mode. Do NOT skip even if L3 workshop covered scenarios — L3 checks requirement quality, L5 checks the MERGED spec.json (which may have drifted during L4 task mapping and coverage fixes). These are different validation scopes.

Run the full AC quality check (max 5 rounds):

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
    question: "These ACs could not be auto-fixed after 5 rounds. How should we proceed?",
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
If signals found, also append: "Review these before /execute — they may require coordination, backups, or rollback plans."
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

Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE (MANDATORY)
hoyeon-cli spec guide meta

# STEP 2+3: CONSTRUCT + WRITE
cat > /tmp/spec-merge.json << 'EOF'
{
  "approved_by": "user",
  "approved_at": "{ISO_TIMESTAMP}"
}
EOF

# STEP 4: MERGE
hoyeon-cli spec merge .dev/specs/{name}/spec.json meta --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json

# STEP 5: VERIFY
hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

If merge fails → follow Merge Failure Recovery (SKILL.md).

3. Shut down the Team (gate-keeper and any spawned team members):

```
SendMessage(to="gate-keeper", message={type: "shutdown_request", reason: "Specify session complete"})
TeamDelete()
```

4. If user selected `/execute`:

```
Skill("execute", args="{name}")
```
