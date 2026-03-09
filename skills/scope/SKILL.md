---
name: scope
description: |
  Fast parallel change-scope analyzer. Launches 5+ agents concurrently to identify
  what files need changing, what could break, and the recommended approach.
  Lighter than /specify — no interview, no spec.json, just a quick scoped report.
  Use this skill whenever the user wants to understand the blast radius of a change
  before diving into implementation. Also use when the user has a bug or feature
  request and wants to know where to look and what to touch.
  Trigger phrases: "/scope", "scope this", "impact analysis", "change scope",
  "what needs to change", "blast radius", "what would break",
  Korean: "변경범위", "스코프 분석", "뭘 바꿔야 해", "어디를 고쳐야 해",
  "영향범위", "어디 건드려야 돼", "뭐가 깨질 수 있어"
---

# /scope — Parallel Change-Scope Analyzer

Analyze a requirement and produce a change-scope report by running multiple analysis
agents in parallel. Two rounds of concurrent execution, then synthesis.

The whole point is speed: instead of sequential analysis that takes 5 minutes,
launch everything at once and get results in ~1 minute.

## Input

The user provides a requirement, bug description, or feature request. Examples:
- "hook 시스템을 리팩토링하고 싶어"
- "check 스킬에 auto-fix 기능 추가"
- "spec.json validation이 너무 느려"

If the requirement is too vague to search for (e.g., "improve things"), ask ONE
clarifying question. Otherwise, proceed immediately.

## Phase 1: State Discovery

Two steps: first parallel agents, then /check skill.

### Step 1A: Parallel Agents (3 concurrent)

Launch **all three agents in a single message** so they run concurrently.

#### Agent 1: code-explorer
Find all code directly related to the requirement.

```
Prompt template:
"Find all code related to: {requirement}
Focus on: entry points, core logic, data flow, and test files.
Project root: {project_root}"
```

#### Agent 2: docs-researcher
Find internal documentation, ADRs, and conventions relevant to the change.

```
Prompt template:
"Find internal documentation relevant to: {requirement}
Look for: architecture decisions, conventions, constraints, related past changes.
Project root: {project_root}"
```

#### Agent 3: code-explorer (git state)
Understand current git state and recent changes in the affected area.

```
Prompt template:
"Analyze the current git state for areas related to: {requirement}
1. Run: git log --oneline -10 for recent changes in relevant areas
2. Run: git diff --name-only to find uncommitted changes
3. Identify any in-progress work that might interact
Project root: {project_root}"
```

**Implementation**: Use three parallel Agent tool calls with `subagent_type` set to
`code-explorer` for Agents 1 and 3, and `docs-researcher` for Agent 2.

### Step 1B: /check Skill

After the three parallel agents complete, invoke the `/check` skill via Skill tool.
This runs the full rule-based verification against `.dev/rules/` to surface any
cascading change requirements or rule violations in the affected area.

```
Skill("check")
```

Wait for /check to complete. Its PASS/WARN results feed into Phase 2 as
`check_results`.

**Skip condition**: If `.dev/rules/` does not exist, skip Step 1B and proceed
directly to Phase 2 (note "no rules configured" in the report).

## Phase 2: Deep Analysis (Parallel)

After Phase 1 (Step 1A + 1B) completes, launch **three more agents in a single
message**. Inject Phase 1 findings as context into each prompt.

### Agent 4: gap-analyzer

```
Prompt template:
"Analyze gaps for this change:

Requirement: {requirement}

Code findings:
{agent_1_results}

Documentation findings:
{agent_2_results}

Current state:
{agent_3_results}

Check results (rule violations/warnings):
{check_results}

Focus on: missing requirements, edge cases, things that must NOT be changed."
```

### Agent 5: tradeoff-analyzer

```
Prompt template:
"Analyze tradeoffs for this change:

Requirement: {requirement}

Code findings:
{agent_1_results}

Focus on: risk per file/module, simpler alternatives, over-engineering warnings.
Skip decision_point YAML — just give the risk table and alternatives."
```

### Agent 6: codex-strategist

```
Prompt template:
"Synthesize a strategic view of this change:

Requirement: {requirement}

Code findings:
{agent_1_results}

Documentation context:
{agent_2_results}

Gap analysis:
{agent_4_results — if available, otherwise pass Phase 1 summary}

Focus on: blind spots, cross-cutting concerns, architectural fit."
```

**Note on Phase 2 ordering**: Agents 4, 5, and 6 can all launch together because
they each receive Phase 1 results directly. Agent 6 (codex-strategist) works with
Phase 1 results — it does not need to wait for Agent 4's output. The codex-strategist
provides independent strategic synthesis, not a review of the gap analysis.

## Phase 3: Synthesis

After all agents complete, synthesize results into a single report.
Do this yourself — no subagent needed.

### Output Format

```markdown
## Scope Analysis: {requirement_title}

### 1. Change Map
| File/Module | Change Type | Risk | Reason |
|-------------|-------------|------|--------|
| path/to/file.ts | MODIFY | LOW | {why} |
| path/to/other.ts | MODIFY | HIGH | {why} |
| path/to/new.ts | CREATE | MED | {why} |

### 2. Impact Radius
- **Direct**: {files that must change}
- **Indirect**: {files that might need adjustment}
- **Tests**: {test files to update/create}
- **Docs**: {documentation to update}

### 3. Risk Summary
| Risk | Count | Key Items |
|------|-------|-----------|
| HIGH | N | {list} |
| MED | N | {list} |
| LOW | N | {list} |

### 4. Gaps & Warnings
- {gap or warning from gap-analyzer}
- {over-engineering warning from tradeoff-analyzer}
- {blind spot from codex-strategist}

### 5. Recommended Approach
{1-3 sentences: the simplest path to implement this change}

**Suggested order**:
1. {first thing to do}
2. {second thing to do}
3. {third thing to do}

### 6. Must NOT Do
- {prohibition from gap-analyzer}
- {prohibition from tradeoff-analyzer}
```

### Output Rules

- Every file path must be **absolute** or **repo-relative** (no vague references)
- Risk levels must be justified (not arbitrary)
- Keep the report under 80 lines — brevity is the point
- If any agent returned DEGRADED/SKIPPED, note it but don't block the report

## Constraints

- Do NOT generate spec.json — this is a lighter tool than /specify
- Do NOT start implementing changes — only analyze
- Do NOT interview the user beyond one clarifying question
- Do NOT run agents sequentially when they can run in parallel
- Maximum wall-clock time target: ~90 seconds (two parallel rounds)
