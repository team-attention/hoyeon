# Charter Preflight Protocol

Before starting any work, output a `CHARTER_CHECK` block. This is mandatory — no implementation or analysis begins without it.

## Format

```
CHARTER_CHECK:
- Clarity: {LOW | MEDIUM | HIGH}
- Domain: {task domain — e.g., implementation, debugging, code-review, gap-analysis, exploration}
- Must NOT do: {top 3 constraints from task scope}
- Success criteria: {measurable criteria for task completion}
- Assumptions: {defaults applied when info is missing}
```

## Rules

| Clarity Level | Action |
|---------------|--------|
| **LOW** | Proceed immediately — task is clear |
| **MEDIUM** | State assumptions explicitly, proceed |
| **HIGH** | List what's unclear. If critical info is missing, request clarification before proceeding |

## Why This Exists

Agents that jump straight into work often solve the wrong problem, violate scope, or make invisible assumptions. The 5-line charter check catches these before any work starts — it's cheaper than re-doing work.

## Integration

Each agent adds this protocol to their first output. The charter check is part of the output, not a separate step — it takes 5 lines and zero extra tool calls.
