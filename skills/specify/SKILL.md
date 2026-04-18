---
name: specify
description: |
  "/specify", "specify", "요구사항 정의", "requirements", "스펙 잡기",
  "뭘 만들어야 하는지", "기획 정리", "인터뷰해서 스펙"
  Turn a goal into structured requirements through systematic interview.
  Three phases: Interview → Extract → Cross-check.
  Writes requirements.md in the cli format (consumed by /blueprint).
---

# specify: Goal → Requirements via Systematic Interview

## Overview

Transform a vague goal into structured, traceable requirements through:
0. **WHERE Grounding** — establish project type, situation, ambition, and risk modifiers
0.5. **Context Research** (brownfield only) — scan existing codebase before asking the user
1. **Interview** — systematic Q&A across Business/Interaction/Tech axes (depth-calibrated by WHERE)
2. **Extract** — parallel requirements extraction by domain experts
3. **Cross-check** — conflict/gap/duplicate detection
4. **Confirmation** — user accepts assumptions + final `requirements.md` committed in cli format

## Handoff contract

The final deliverable is `<spec_dir>/requirements.md` in the format that `/blueprint` consumes:
- Frontmatter: `type` (greenfield|feature|refactor|bugfix), `goal`, `non_goals[]`
- Body: flat list of `## R-X<num>:` parent requirements, each with nested `#### R-X<num>.Y:` sub-requirements carrying `given/when/then`
- `X` in the ID is axis code: **B**=Business, **U**=Interaction (user), **T**=Tech
- Optional `## Open Decisions` section with `### OD-N:` blocks

All intermediate files (qa-log.md, reqs-business.md, reqs-interaction.md, reqs-tech.md) stay in `<spec_dir>/` for traceability but are NOT read by /blueprint.

## Phase 0: WHERE Grounding

The **WHERE** is the combination of current situation and intended scope. It calibrates how deep the interview goes on each axis — without it, every project gets the same heavyweight treatment, which over-engineers toys and under-specs production systems.

### Step 0.1: Mirror (prove understanding before asking)

Before asking for goal/non-goals, present your understanding of the user's request using this template:

```markdown
**Mirror — Here's what I understood**

**Understanding:**
<1–2 sentences paraphrasing the user's request in your own words. Not a verbatim echo.>

**Goal:**
- <bullet 1: concrete outcome>

**Non-Goal (explicitly out of scope):**
- <bullet 1: exclusion — at least one must be inferred by you, not stated by user>

**Ambiguous (scope-level unknowns):**
- <ambiguity about what "done" means, what's included, or who the user is>
```

Then confirm via AskUserQuestion:
```
AskUserQuestion(
  question: "Does this match your intent?",
  options: [
    { label: "Approve", description: "Proceed to WHERE grounding" },
    { label: "Revise", description: "Fix goal/non-goal/scope" }
  ]
)
```

**Rules:**
- At least one Non-Goal and one Ambiguous item must be **inferred** by you — a pure echo is a violation
- Ambiguous items are **scope-level** only ("what are we building / for whom / done when?"), NOT tech choices
- Max 2 revision rounds. If still unclear, proceed and record residual ambiguities for Phase 1
- On Approve: extract `goal` and `non_goals` from the mirror (no need to re-ask in free-text)

### Step 0.2: PROJECT_TYPE + SITUATION + AMBITION (batched AskUserQuestion)

Use **one AskUserQuestion call with 3 questions batched**:

```
questions: [
  {
    question: "What kind of thing are you building?",
    header: "Project type",
    options: [
      { label: "User-facing app", description: "Web, mobile, or desktop app with end-user UI" },
      { label: "API / Service", description: "Backend API, data pipeline, or background service" },
      { label: "Dev tool / Library", description: "CLI tool, SDK, library, automation script" },
      { label: "Infrastructure", description: "Infra change, deployment config, platform work" }
    ]
  },
  {
    question: "What's the current codebase situation?",
    header: "Situation",
    options: [
      { label: "Greenfield", description: "Brand new project, no existing code" },
      { label: "Brownfield extension", description: "Adding to an existing codebase, minimal changes to what's there" },
      { label: "Brownfield refactor", description: "Reworking existing code; structural changes expected" },
      { label: "Hybrid", description: "New module inside existing project, both new and integration work" }
    ]
  },
  {
    question: "What's the ambition level?",
    header: "Ambition",
    options: [
      { label: "Toy / Experiment", description: "Days of work, personal/internal, failure acceptable" },
      { label: "Feature / MVP", description: "1-2 weeks, real users, core functionality only" },
      { label: "Product", description: "Long-term, external customers, reliability and security matter" }
    ]
  }
]
```

### Step 0.2b: Risk Modifiers (multiSelect AskUserQuestion)

Some projects are "small but dangerous" — a toy that handles real money, a refactor that touches a public API. Risk modifiers catch these cases by forcing relevant axes to `deep` regardless of Ambition.

```
questions: [
  {
    question: "Select any that apply to this project (pick none if none apply):",
    header: "Risk factors",
    multiSelect: true,
    options: [
      { label: "Sensitive data", description: "Handles PII, payments, health, secrets, or regulated data" },
      { label: "External exposure", description: "Accessible from public internet or external customers" },
      { label: "Irreversible ops", description: "Migrations, destructive actions, public contract changes" },
      { label: "High scale", description: "High traffic, large data volumes, or strict latency targets" }
    ]
  }
]
```

If the user picks none, proceed with base calibration. Otherwise, modifiers will escalate specific nodes to `deep` in Step 0.4.

### Step 0.3: Spec Name & Output Setup

- Determine **spec name** (kebab-case, e.g., `user-dashboard`)
- Decide `spec_dir`: default `.hoyeon/specs/{spec-name}/`
- **Bootstrap via cli** — creates the directory AND writes a `requirements.md` stub with the correct frontmatter so /blueprint can read it later:
  ```bash
  hoyeon-cli req init <spec_dir> --type <greenfield|feature|refactor|bugfix> --goal "<one-line goal>"
  ```
  Map `WHERE.SITUATION` → `--type`:
  - `greenfield` → `greenfield`
  - `brownfield-extension` → `feature`
  - `brownfield-refactor` → `refactor`
  - `hybrid` → `feature` (or `refactor` if structural churn dominates)
  The stub is overwritten at Phase 4.3 once the interview is complete. If `<spec_dir>/requirements.md` already exists from a prior run, skip `req init` and proceed (the user is re-running specify on the same spec).
- Read the Q&A log template from `${baseDir}/templates/qa-log.md`
- Initialize `<spec_dir>/qa-log.md` with spec name, goal, non-goals, and the WHERE context filled in

### Step 0.4: Derive Axis Depth Calibration

Combine SITUATION × AMBITION × RISK_MODIFIERS to assign each taxonomy node a depth level (**light**, **standard**, or **deep**). Apply rules in order — later rules escalate, never downgrade.

**Step A — SITUATION base**:
- **Greenfield** → TECH.ARCH/DATA standard
- **Brownfield extension** → TECH.ARCH **deep**, TECH.COMPAT **deep**; BUSINESS.WHO **light**
- **Brownfield refactor** → TECH.ARCH **deep**, TECH.COMPAT **deep**, TECH.DATA **deep**
- **Hybrid** → blend Greenfield + Extension rules

**Step B — AMBITION modulation**:
- **Toy** → TECH.SECURITY **light**, BUSINESS.RISK **light**, INTERACTION.ACCESS **light**. Keep INTERACTION.JOURNEY/HAPPY standard.
- **Feature/MVP** → default standard; only honor deeps from Step A.
- **Product** → TECH.SECURITY **deep**, INTERACTION.ACCESS **deep**, BUSINESS.RISK **deep**, TECH.COMPAT **deep**.

**Step C — RISK_MODIFIERS escalation (override Step B downgrades)**:
- **sensitive-data** → TECH.SECURITY **deep**, TECH.DATA **deep**
- **external-exposure** → TECH.SECURITY **deep**, INTERACTION.ACCESS **deep**
- **irreversible** → BUSINESS.RISK **deep**, TECH.COMPAT **deep**
- **high-scale** → TECH.INFRA **deep**, TECH.ARCH **deep**

**Examples**:
- User-facing + Greenfield + Toy + no modifiers → light SECURITY/RISK/ACCESS, standard elsewhere
- User-facing + Greenfield + Toy + sensitive-data → SECURITY/DATA escalated to **deep** (small-but-dangerous)
- API-service + Brownfield-refactor + Product + external-exposure → virtually everything deep

**Project-type notes** — PROJECT_TYPE doesn't change calibration numbers, but it changes what each INTERACTION node *means* (the interaction-extractor reads project_type for lens selection).

Write the derived calibration into `qa-log.md` frontmatter as `depth_calibration:` so Phase 1 and the gap-auditor can read it.

## Phase 0.5: Context Research (brownfield only)

**Skip this phase entirely if `where.situation == greenfield`.** Run it for `brownfield-extension`, `brownfield-refactor`, and `hybrid`.

Why: brownfield work depends on existing code that the user may not fully remember. Asking the user "what's the architecture?" when the codebase is right there is wasteful and unreliable. Scan the code first, then interview them on decisions — not facts.

### Dispatch subagents in parallel

```
Task(subagent_type="code-explorer",
     prompt="Goal: {goal}. Find: existing patterns, modules, or files relevant to this change. Report as file:line format with brief summary.")

Task(subagent_type="code-explorer",
     prompt="Find project structure and toolchain: package manifests, build/test/lint commands, entry points, deployment config. Report as file:line format.")

Task(subagent_type="docs-researcher",
     prompt="Goal: {goal}. Search ADRs, READMEs, docs/, CLAUDE.md, config files for conventions, architecture decisions, and constraints relevant to this work. Report as file:line format.")
```

For `brownfield-refactor` specifically, add:

```
Task(subagent_type="code-explorer",
     prompt="Find all call sites and dependents of {the area being refactored}. Report impact surface as file:line format.")
```

### Consolidate into `qa-log.md` → `research:` section

Write findings into `qa-log.md` under a new top-level heading `## Research` (before the axis sections). Include:
- Existing architecture summary (1-3 sentences)
- Relevant files/modules (with file:line anchors)
- Toolchain (build/test/lint)
- Existing constraints or conventions discovered
- Potential impact surface (for refactors)

Also add `research_done: true` to the `where:` frontmatter block so later phases can rely on it.

### Interview uses research as baseline

During Phase 1, when asking Tech axis questions:
- Reference the research findings ("I see you use Vite + TypeScript — is that still the target?" instead of "what's your build tool?")
- Only ask the user for **decisions** (what they want) and **intent** (why), not **facts** (what exists — we already found those)

## Phase 1: Interview

### Interview Protocol

You are the interviewer. Ask questions **one axis at a time**, following this taxonomy:

```
Axis 1: BUSINESS    — WHO, WHY, WHAT, SUCCESS, SCOPE, RISK
Axis 2: INTERACTION — JOURNEY, HAPPY, EDGE, STATE, FEEDBACK, ACCESS
Axis 3: TECH        — ARCH, DATA, INFRA, DEPEND, COMPAT, SECURITY
```

**The INTERACTION axis is consumer-generic.** Reinterpret nodes based on `where.project_type`:

| project_type | JOURNEY | HAPPY | FEEDBACK | ACCESS |
|--------------|---------|-------|----------|--------|
| user-facing | User entry → outcome | Core UI flow | Visual/audio reactions | Permissions, a11y |
| api-service | Consumer integration flow | Canonical API call | HTTP responses, errors | Auth, rate limits |
| dev-tool | Install → invoke → result | `--help` / canonical use | stdout+exit codes | Install, platform |
| infrastructure | Operator procedure | Green deploy path | Dashboards, alerts | RBAC, IAM |

EDGE/STATE are universal: failures & conditional behavior apply everywhere.

### Question Rules

**PRIMARY: Use AskUserQuestion tool for all interview questions.**
Free-text prompting should only be a fallback when options genuinely cannot be enumerated.

#### Why AskUserQuestion

- Directly implements **Recognition over Recall** — user picks from concrete options
- Options with `description` field show consequences/trade-offs per choice
- "Other" is auto-added — user can always override with custom answer
- Supports **batching** (1-4 questions per call) — pair related questions together
- `multiSelect: true` for non-exclusive choices

#### Batching Guidance

**Batch when**:
- Questions are within the same axis node and mutually informative (e.g., WHO + WHAT)
- Questions are orthogonal and won't confuse the user (e.g., STATE + FEEDBACK)
- User has already given broad context and is ready for several specifics

**Do NOT batch when**:
- A later question's options depend on the answer to an earlier one (ask sequentially)
- The first question is a depth drill that may trigger more drills (go one-at-a-time)
- User seems uncertain — a single focused question is less overwhelming

Max 4 per call (tool limit). Default: batch 2-3 related questions per turn.

#### Question Construction

Each AskUserQuestion option must have:
- `label`: 1-5 words (what the user picks)
- `description`: the consequence/implication of this choice
- First option gets "(Recommended)" suffix only when you genuinely have a recommendation

**Example** (batched):
```
questions: [
  {
    question: "Who is the primary user?",
    header: "Primary user",
    options: [
      { label: "Senior developers", description: "Power users; expect depth + customization" },
      { label: "Junior developers", description: "Learning users; expect guidance + safe defaults" },
      { label: "Both equally", description: "Dual-mode UX; complexity to serve both" }
    ]
  },
  {
    question: "What's the success signal?",
    header: "Success metric",
    options: [
      { label: "Team-wide adoption", description: "Qualitative; hard to measure" },
      { label: "Daily active use", description: "Quantitative DAU; needs tracking" },
      { label: "Time saved per task", description: "Efficiency metric; baseline needed" }
    ]
  }
]
```

### Depth Drill: Two Mechanisms

Drills happen at two distinct moments, with different judges. Both are required.

#### Type A: Inline Drill (You judge, in real time)

**When**: Immediately after an AskUserQuestion answer arrives.

**How**: Scan the selected option + any "Other" free-text for these signals. If present, the NEXT AskUserQuestion is a drill on the same node.

| Signal | Example answer | Drill question |
|--------|---------------|----------------|
| **Vague qualifier** | "fast", "easy", "simple", "good UX" | AskUserQuestion with concrete thresholds as options (e.g., "<1s", "<3s", "<10s") |
| **Hidden assumption** | "obviously X", "of course Y" | AskUserQuestion surfacing the assumption ("does X always hold? What if not?") |
| **Multiple interpretations** | A term that could mean 2+ things (e.g., "admin") | AskUserQuestion listing each interpretation as an option |
| **New stakeholder** | Mentions a role not yet covered | Add a new node under the current axis, AskUserQuestion about their perspective |

Inline drills are fast and subjective — you catch the obvious ones on the spot.

#### Type B: Post-Audit Drill (gap-auditor judges, end of axis)

**When**: After an axis ends, gap-auditor returns verdict=CONTINUE with an AMBIGUOUS list.

**How**: The auditor's AMBIGUOUS list tells you exactly which nodes still need drilling. Convert each AMBIGUOUS item into an AskUserQuestion targeting that specific ambiguity, then continue until gap-auditor returns SUFFICIENT.

Post-audit drills are systematic — they catch what inline judgment missed.

#### Why Both

Type A is a fast first-pass filter; Type B is the safety net. Relying on only Type A means subjective blind spots slip through. Relying on only Type B means needlessly long axis rounds because trivially fixable ambiguities aren't caught early.

#### When Free-Text Is Acceptable

Only use free-text Q&A (no AskUserQuestion) when:
- The answer is genuinely open-ended (e.g., "describe your current workflow")
- You cannot construct 2+ distinct options honestly
- The question is exploratory to find option candidates for the next round

#### Handling "I Don't Know" — Tentative Judgment + Open Decision

Users will sometimes not know the answer (especially on Tech axis, or when the PM doesn't know implementation details). Don't let the interview stall.

When the user's answer is "I don't know / not sure / up to you / whatever works" (either by Other free-text or by tone):

1. **Make a tentative judgment**: Pick the reasonable default based on the WHERE context, existing research findings, and what experienced engineers would typically choose.
2. **Log it as an assumption**: Record in `qa-log.md` with `status: assumption` and include the reasoning in `> blockquote`.
3. **Add to Open Decisions**: Append an entry to `## Open Items` in qa-log.md with:
   - The undecided question
   - Your tentative judgment
   - Why this decision can be deferred (or why it might need revisiting)
4. **Tell the user**: "I'll go with {X} for now, logged as an open decision. You can revisit it later."

Don't re-ask the same question. Move on. The Phase 4 Confirmation will let the user review and override any tentative judgment.

**Example**:
```
Q: What authentication method?
User: "Dunno, whatever works"
→ Tentative: "Given brownfield-extension + sensitive-data, I'll assume existing SSO integration"
→ Log as assumption with status: assumption
→ Add to Open Items: "OD: auth method (tentative: SSO based on existing system)"
→ Continue to next question
```

#### Recording Answers

Update `qa-log.md` after each exchange using the template format:
- `#### Q:` for the question, `> blockquote` for the answer (include the selected option label + any free-text)
- `##### Drill:` for depth follow-ups
- Mark each with `status: resolved | ambiguous | assumption`

### Gap Audit Triggers

Dispatch the **gap-auditor** agent at these specific moments:

1. **End of axis** (required) — after you believe an axis is complete, before moving to the next
2. **Stuck on axis** (early check) — after 3 consecutive AskUserQuestion turns on the same axis without moving forward
3. **Final audit** (required) — after all 3 axes look done, before transitioning to Phase 2

Do NOT call gap-auditor after every AskUserQuestion turn — that's wasteful. Call it at boundaries.

### Gap Audit Flow

Each call:
1. Write current Q&A state to `qa-log.md` first
2. Dispatch **gap-auditor** with:
   - Full `qa-log.md` content
   - Which axis just completed (or "final" for the full audit)
3. Read the verdict:
   - **CONTINUE** → ask the agent's suggested questions (use AskUserQuestion)
   - **SUFFICIENT** → move on
4. **You do NOT decide completion yourself** — only gap-auditor can say SUFFICIENT

### Interview Completion

All 3 axes must receive **SUFFICIENT** verdict, AND the final audit must also return **SUFFICIENT**.
Update `qa-log.md` frontmatter: `status: complete` with final coverage scores.

## Phase 2: Requirements Extraction

Run 3 agents **in parallel**:

1. Read `${baseDir}/templates/reqs-axis.md` template
2. Dispatch simultaneously:
   - **business-extractor** agent with: qa-log.md content + template
   - **interaction-extractor** agent with: qa-log.md content + template
   - **tech-extractor** agent with: qa-log.md content + template
3. Write outputs to:
   - `.hoyeon/specs/{spec-name}/reqs-business.md`
   - `.hoyeon/specs/{spec-name}/reqs-interaction.md`
   - `.hoyeon/specs/{spec-name}/reqs-tech.md`

## Phase 3: Cross-Check

1. Read all 3 reqs files
2. Detect issues across axes:
   - **CONFLICT**: requirements that contradict each other across axes
   - **GAP**: something mentioned in one axis but missing in others
   - **DUPLICATE**: same requirement expressed differently
3. Build a **Cross-Check Report** (in memory, not yet written to disk):
   - List each issue with the requirement IDs involved
   - Collect all `confidence: low` and `open_questions` items from extractor outputs
   - Collect all assumptions the extractors made (items inferred but not directly sourced from Q&A)

## Phase 4: User Confirmation & Finalization

Before writing the final `requirements.md`, surface everything to the user for explicit acceptance. This prevents assumptions from silently becoming "requirements."

### Step 4.1: Present Cross-Check Summary

Show the user a concise summary grouped into:

```
## Final Confirmation

### Confirmed Requirements
{count by axis: Business N, Interaction N, Tech N}

### Conflicts to Resolve ({count})
- {ID pair}: {conflict description}
  → Options to resolve

### Open Questions ({count})
- {ID}: {question} (axis: {axis})

### Assumptions to Accept ({count})
- {ID}: {assumption the extractor made} — accept / reject / replace

### Out of Scope (Non-Goals)
- {items from where.non_goals}
```

### Step 4.2: Resolve via AskUserQuestion

For each CONFLICT and ASSUMPTION, use AskUserQuestion with options (typically: accept / reject / modify / defer).

For OPEN QUESTIONS: either answer them now (free-text or AskUserQuestion) or explicitly defer them to the open_decisions list.

### Step 4.3: Preview final requirements

After all conflicts and assumptions are resolved, show the full requirements list before writing to disk:

```
[specify] Final Requirements Preview

Type: greenfield | Goal: "<goal>"
Non-goals: <list>

## R-B1: <title>
  - R-B1.1: <sub title>
    given: ... | when: ... | then: ...
  - R-B1.2: ...

## R-U1: <title>
  - R-U1.1: ...

## R-T1: <title>
  - R-T1.1: ...

Summary: {N} parent reqs, {M} sub-reqs (B:{b} U:{u} T:{t})
Open Decisions: {count or "none"}
```

Then ask:
```
AskUserQuestion(
  question: "Finalize these requirements?",
  options: [
    { label: "Approve", description: "Write requirements.md and finish" },
    { label: "Edit", description: "Modify specific requirements before writing" },
    { label: "Re-interview", description: "Go back to interview for missing coverage" }
  ]
)
```

If **Edit**: ask which requirements to change, apply edits, re-show preview. Max 3 rounds.
If **Re-interview**: return to Phase 1 with the gap identified.

### Step 4.4: Write Final `requirements.md`

Only after user has explicitly approved the preview:

1. Read `${baseDir}/templates/requirements.md` template (cli format)
2. Overwrite `<spec_dir>/requirements.md` (replacing the stub created by `hoyeon-cli req init` at Phase 0.3). Final shape:
   ```markdown
   ---
   type: greenfield | feature | refactor | bugfix
   goal: "<one-line goal>"
   non_goals:
     - "<item>"
   ---

   # Requirements

   ## R-B1: <parent title>
   - behavior: <one-sentence system behavior>

   #### R-B1.1: <sub title>
   - given: <precondition>
   - when: <trigger>
   - then: <expected outcome>

   #### R-B1.2: ...

   ## R-U1: <Interaction requirement parent>
   ...

   ## R-T1: <Tech requirement parent>
   ...

   ## Pre-work

   - [ ] <action> (blocking)
   - [ ] <action> (non-blocking)

   ## Open Decisions

   ### OD-1: <title>
   - context: <why undecided>
   - options: [<A>, <B>]
   - impact: <what is blocked>
   ```
3. **ID rules** (must match `/blueprint`'s expectations):
   - Parent: `## R-X<num>:` at H2, where `X` is axis code (`B`=Business, `U`=Interaction, `T`=Tech)
   - Sub: `#### R-X<num>.Y:` at H4 with `given/when/then` lines
   - No axis grouping headings in the body (flat list); axis is encoded in the ID letter
4. **Frontmatter** carries only `type`, `goal`, `non_goals[]`. Do NOT add extra keys like `spec`, `phase`, `date`, `total_requirements` — those broke with cli's frontmatter format.
5. Pre-work is optional — include only when the interview surfaced actions the user must complete before execution (e.g., "get API key", "run migration"). Mark each item `(blocking)` or `(non-blocking)`. execute will gate on blocking items.
6. Open Decisions is optional — omit the section if no unresolved decisions
7. Confirm completion with the user, showing final file path + next step: `/blueprint <spec_dir>/`

## Output Files

All outputs go to `<spec_dir>/` (default `.hoyeon/specs/{spec-name}/`):

| File | Phase | Description | Consumed by |
|------|-------|-------------|-------------|
| `requirements.md` | 0.3 (stub) / 4.3 (final) | Requirements in cli format (frontmatter + flat `## R-X` / `#### R-X.Y` with GWT) | `/blueprint` |
| `qa-log.md` | 1 | Full interview transcript | audit/traceability only |
| `reqs-business.md` | 2 | Axis extraction scratch | merged into requirements.md |
| `reqs-interaction.md` | 2 | Axis extraction scratch | merged into requirements.md |
| `reqs-tech.md` | 2 | Axis extraction scratch | merged into requirements.md |

**Only `requirements.md` is load-bearing for downstream skills.** The other files are internal scratch/audit — /blueprint does not read them.

## CLI Dependency

- `hoyeon-cli req init <spec_dir> --type <t> --goal "<g>"` (Phase 0.3) — creates dir + requirements.md stub
- No other cli commands are called by /specify. Phase 4.3 overwrites `requirements.md` directly via Write tool.

## Agents Used

| Agent | Phase | Purpose |
|-------|-------|---------|
| `gap-auditor` | 1 | Interview coverage validation |
| `business-extractor` | 2 | Business req extraction |
| `interaction-extractor` | 2 | Interaction req extraction (project-type-aware) |
| `tech-extractor` | 2 | Tech req extraction |
