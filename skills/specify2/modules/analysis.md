# Module: Analysis

Risk assessment and verification planning.

## Input

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- draft_path: from Draft/Interview
- intent_type: from Explore

## Output

- gap_analysis: (standard/thorough only)
- tradeoff_analysis: risk tags per item
- verification_plan: (standard/thorough only)
- external_research: (thorough only, or conditional)
- status: `complete` | `high_risk_detected`

## Variable Convention

> **IMPORTANT**: When invoking Task, replace `{variable}` placeholders:
> - `{draft_*}` → Read from DRAFT file at `{draft_path}`, extract the corresponding section
> - `{intent_type}` → from Input
> - `(summarize: X)` → Claude generates from DRAFT content
>
> **Draft Section Mapping:**
> - `{draft_what_why}` → DRAFT's "What & Why" section
> - `{draft_work_breakdown}` → DRAFT's "Direction > Work Breakdown" section
> - `{draft_approach}` → DRAFT's "Direction > Approach" section
> - `{draft_boundaries}` → DRAFT's "Boundaries" section
> - `{draft_agent_findings}` → DRAFT's "Agent Findings" section

## Behavior by Depth

| Depth | gap-analyzer | tradeoff-analyzer | verification-planner | external-researcher |
|-------|--------------|-------------------|---------------------|---------------------|
| quick | ❌ | ✅ lite (risk only) | ❌ | ❌ |
| standard | ✅ | ✅ | ✅ | conditional |
| thorough | ✅ strict | ✅ strict | ✅ strict | ✅ |

---

## Logic

### Quick Depth (tradeoff-lite only)

```
Task(subagent_type="tradeoff-analyzer",
     prompt="""
Mode: lite (risk tagging only)

Work Breakdown from DRAFT:
{draft_work_breakdown}

For each item, assign risk level:
- LOW: Reversible, isolated change
- MEDIUM: Multiple files, API changes
- HIGH: DB schema, auth, breaking changes

Output format:
| Item | Risk | Reason |
|------|------|--------|

⚠️ If any HIGH detected, recommend upgrading to standard depth.
""")
```

**If HIGH risk detected:**
```
⚠️ HIGH 위험 항목 감지됨: {high_risk_items}
standard depth로 재실행을 권장합니다.

Continue anyway? (autopilot: proceed with warning)
```

### Standard Depth (4 agents)

```
# All 4 in parallel

Task(subagent_type="gap-analyzer",
     prompt="""
User's Goal: {draft_what_why}
Current Understanding: (summarize: brief overview of the proposed feature from DRAFT)
Intent Type: {intent_type}

Analyze for:
- Missing requirements
- AI pitfalls (common mistakes)
- Must-NOT-do items
""")

Task(subagent_type="tradeoff-analyzer",
     prompt="""
Proposed Approach: {draft_approach}
Work Breakdown: {draft_work_breakdown}
Boundaries: {draft_boundaries}

Assess:
- Risk per change area (LOW/MEDIUM/HIGH)
- Simpler alternatives (SWITCH verdicts)
- Dangerous changes requiring approval

Generate decision_points for HIGH risk items.
""")

Task(subagent_type="verification-planner",
     prompt="""
Work Breakdown: {draft_work_breakdown}
Agent Findings: {draft_agent_findings}

Classify verification points:
- A-items: Agent-verifiable (commands, tests)
- H-items: Human-required (UX, business logic)

Explore test infrastructure.
""")

# Conditional: only if migration/new library/unfamiliar tech
Task(subagent_type="external-researcher",
     prompt="Research official docs for {library_name}: {specific_question}")
```

> **external-researcher trigger conditions:**
> - Intent is Migration
> - DRAFT mentions new/unfamiliar library
> - User explicitly requested external research
>
> Extract `{library_name}` and `{specific_question}` from DRAFT context.

### Thorough Depth (strict versions)

Same agents with enhanced prompts:
- gap-analyzer: Include edge cases, security concerns
- tradeoff-analyzer: Require rollback plan for all MEDIUM+
- verification-planner: Require 100% coverage strategy
- external-researcher: Always run

---

## Decision Points (HIGH Risk)

When tradeoff-analyzer returns `decision_points`:

### Interactive Mode

```
# For each decision_point:
AskUserQuestion(
  question: decision_point.question,
  options: [
    { label: "Option A (Recommended)", description: decision_point.options[0] },
    { label: "Option B", description: decision_point.options[1] }
  ]
)
```

Record in Draft's User Decisions.

### Autopilot Mode

Apply conservative choice:
- Choose option with lower risk
- Choose option closer to existing patterns
- Log in Assumptions section

```markdown
## Autopilot HIGH Risk Decisions

| Decision Point | Auto-Choice | Rationale |
|----------------|-------------|-----------|
| DB schema change approach | Migration script | Safer than direct ALTER |
```

---

## Output Aggregation

Combine all agent results:

```markdown
## Analysis Summary

### Gap Analysis (standard/thorough)
- Missing: {missing_items}
- Pitfalls: {pitfall_items}
- Must NOT Do: {must_not_do_items}

### Risk Assessment
| Item | Risk | Notes |
|------|------|-------|
| Config setup | LOW | Isolated file |
| API endpoint | MEDIUM | Multiple files |
| DB schema | HIGH | Requires migration |

### Verification Strategy
#### A-items (Agent-verifiable)
- A-1: npm test passes
- A-2: TypeScript compiles

#### H-items (Human-required)
- H-1: UX flow review
- H-2: Business logic validation

### External Research (if applicable)
{external_research_summary}
```

---

## Precondition Check

Before running analysis, validate Draft completeness:

- [ ] What & Why completed
- [ ] Boundaries specified
- [ ] Success Criteria defined
- [ ] Direction > Work Breakdown sketched

**If incomplete (standard/thorough):** Return to Interview module

**If incomplete (quick):** Proceed with Assumptions
