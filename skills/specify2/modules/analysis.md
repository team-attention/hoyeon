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
{draft.direction.work_breakdown}

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
⚠️ HIGH 위험 항목 감지됨: {items}
standard depth로 재실행을 권장합니다.

Continue anyway? (autopilot: proceed with warning)
```

### Standard Depth (4 agents)

```
# All 4 in parallel

Task(subagent_type="gap-analyzer",
     prompt="""
User's Goal: {draft.what_why}
Current Understanding: {summary}
Intent Type: {intent_type}

Analyze for:
- Missing requirements
- AI pitfalls (common mistakes)
- Must-NOT-do items
""")

Task(subagent_type="tradeoff-analyzer",
     prompt="""
Proposed Approach: {draft.direction.approach}
Work Breakdown: {draft.direction.work_breakdown}
Boundaries: {draft.boundaries}

Assess:
- Risk per change area (LOW/MEDIUM/HIGH)
- Simpler alternatives (SWITCH verdicts)
- Dangerous changes requiring approval

Generate decision_points for HIGH risk items.
""")

Task(subagent_type="verification-planner",
     prompt="""
Work Breakdown: {draft.direction.work_breakdown}
Agent Findings: {draft.agent_findings}

Classify verification points:
- A-items: Agent-verifiable (commands, tests)
- H-items: Human-required (UX, business logic)

Explore test infrastructure.
""")

# Conditional: only if migration/new library/unfamiliar tech
Task(subagent_type="external-researcher",
     prompt="Research official docs for {library}: {specific_question}")
```

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
- Missing: {list}
- Pitfalls: {list}
- Must NOT Do: {list}

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
{summary of findings}
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
