---
name: tribunal
description: |
  This skill should be used when the user says "/tribunal", "tribunal", "review this",
  "3-way review", "risk-value-feasibility check", or wants multi-perspective adversarial review.
  Also triggered by: "트리뷰널", "리뷰 해줘", "3관점 리뷰", "위험성 검토".
  Runs 3 agents (Risk/Value/Feasibility) in parallel and synthesizes a verdict.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - AskUserQuestion
validate_prompt: |
  Must contain:
  1. Three parallel agent launches (codex-risk-analyst, value-assessor, feasibility-checker)
  2. A Tribunal Verdict section with scores table and final verdict
  3. Required Actions if verdict is REVISE or REJECT
---

# /tribunal — 3-Perspective Adversarial Review

You are a tribunal orchestrator. You launch 3 review agents with distinct perspectives,
then synthesize their findings into a unified verdict.

## Architecture

```
            ┌─ codex-risk-analyst (Codex)  ── "What can go wrong?"
Input ──────┼─ value-assessor (Claude)     ── "What value does this deliver?"
            └─ feasibility-checker (Claude) ── "Can this actually be built?"
                         ↓
               You synthesize all 3
               → APPROVE / REVISE / REJECT
```

---

## Step 1: Parse Input

Determine the review target from arguments:

| Input | How to get content |
|-------|-------------------|
| `file.md` or path | `Read(file_path)` |
| `--pr <number>` | `Bash("gh pr diff <number>")` and `Bash("gh pr view <number>")` |
| `--diff` | `Bash("git diff HEAD")` or `Bash("git diff main...HEAD")` |
| No args | Ask user what to review via `AskUserQuestion` |

**Collect the full content** — all 3 agents need the same input.

If reviewing a PLAN.md, also read the corresponding DRAFT.md (if exists) for context.

---

## Step 2: Launch Tribunal (3 Agents in Parallel)

Launch all 3 agents **simultaneously in a single message**:

```
# Risk Analysis (Codex-powered — adversarial)
Task(subagent_type="codex-risk-analyst",
     prompt="""
Review Target: [type - plan/PR/diff/proposal]

## Content
[Full content to review]

## Context (if available)
[Project structure, related patterns, constraints]

Perform adversarial risk analysis. Find everything that could go wrong.
""")

# Value Assessment (Claude — constructive)
Task(subagent_type="value-assessor",
     prompt="""
Review Target: [type - plan/PR/diff/proposal]

## Content
[Full content to review]

## Original Goal
[What was the intent/requirement behind this work]

Assess the value this delivers. Be genuinely constructive but honest.
""")

# Feasibility Check (Claude — pragmatic)
Task(subagent_type="feasibility-checker",
     prompt="""
Review Target: [type - plan/PR/diff/proposal]

## Content
[Full content to review]

## Codebase Context
[Relevant patterns, dependencies, test infrastructure]

Evaluate practical feasibility. Can this actually be built/merged?
""")
```

**CRITICAL**: All 3 in ONE message (parallel). Do NOT run sequentially.

---

## Step 3: Synthesize Verdict

After all 3 agents return, synthesize their findings.

### 3.1 Extract Ratings

From each report, extract the summary rating:
- **Risk**: BLOCK / CAUTION / CLEAR (from risk analyst)
- **Value**: STRONG / ADEQUATE / WEAK (from value assessor)
- **Feasibility**: GO / CONDITIONAL / NO-GO (from feasibility checker)

### 3.2 Verdict Matrix

| Risk | Value | Feasibility | Verdict |
|------|-------|-------------|---------|
| CLEAR | STRONG | GO | **APPROVE** |
| CLEAR | ADEQUATE | GO | **APPROVE** |
| CAUTION | STRONG | GO | **APPROVE** (with notes) |
| CAUTION | ADEQUATE | GO | **REVISE** |
| CAUTION | * | CONDITIONAL | **REVISE** |
| BLOCK | * | * | **REVISE** (or REJECT if critical count > 2) |
| * | WEAK | * | **REVISE** |
| * | * | NO-GO | **REJECT** |
| BLOCK | WEAK | * | **REJECT** |

Use judgment for combinations not in the matrix.

### 3.3 Identify Contention Points

Find areas where agents **disagree**:
- Risk says dangerous, but Value says high-impact → worth the risk?
- Feasibility says hard, but Value says critical → invest the effort?
- Risk says fine, but Feasibility says blocked → hidden dependency?

### 3.4 Compile Required Actions

From all 3 reports, extract actionable items:
- **Must fix** (from BLOCK risks or NO-GO feasibility)
- **Should address** (from CAUTION risks or CONDITIONAL feasibility)
- **Nice to have** (from missed opportunities in value assessment)

---

## Step 4: Present Tribunal Report

```markdown
## Tribunal Verdict

### Panel Scores

| Dimension | Agent | Rating | Key Finding |
|-----------|-------|--------|-------------|
| Risk | codex-risk-analyst | [BLOCK/CAUTION/CLEAR] | [1-line summary] |
| Value | value-assessor | [STRONG/ADEQUATE/WEAK] | [1-line summary] |
| Feasibility | feasibility-checker | [GO/CONDITIONAL/NO-GO] | [1-line summary] |

### Verdict: [APPROVE / REVISE / REJECT]

[1-2 sentence rationale]

### Contention Points
[Where agents disagreed and the resolution reasoning]

### Required Actions
**Must Fix (before proceeding):**
1. [action from risk/feasibility]

**Should Address:**
1. [action]

**Consider:**
1. [action from value missed opportunities]

### Strengths to Preserve
[Key positives identified by value-assessor that should NOT be lost in revisions]

---

<details>
<summary>Full Risk Analysis</summary>

[Complete risk analyst report]

</details>

<details>
<summary>Full Value Assessment</summary>

[Complete value assessor report]

</details>

<details>
<summary>Full Feasibility Report</summary>

[Complete feasibility checker report]

</details>
```

---

## Step 5: Handle Verdict

After presenting the report:

| Verdict | Action |
|---------|--------|
| **APPROVE** | Inform user: "Tribunal approves. Proceed with confidence." |
| **REVISE** | Present required actions. Ask user how to proceed. |
| **REJECT** | Present blockers clearly. Recommend returning to planning. |

For REVISE:
```
AskUserQuestion(
  question: "Tribunal recommends revisions. How do you want to proceed?",
  options: [
    { label: "Apply fixes", description: "Address the required actions and re-review" },
    { label: "Override — proceed anyway", description: "Acknowledge risks and continue (Disagree & Commit)" },
    { label: "Back to planning", description: "Return to /specify to rethink approach" }
  ]
)
```

---

## Usage Examples

```bash
# Review a plan
/tribunal .dev/specs/auth-feature/PLAN.md

# Review a PR
/tribunal --pr 421

# Review current uncommitted changes
/tribunal --diff

# Review with no args (will ask what to review)
/tribunal
```

---

## Checklist Before Stopping

- [ ] All 3 agents launched in parallel (single message)
- [ ] Verdict synthesized with scores table
- [ ] Contention points identified (where agents disagreed)
- [ ] Required actions listed (if REVISE or REJECT)
- [ ] Full reports included in collapsible details
- [ ] User action presented based on verdict
