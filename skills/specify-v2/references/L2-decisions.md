## L2: Decisions + Constraints

**Output**: `context.decisions[]`, `constraints[]`, `context.known_gaps[]`

### Interview Loop

Walk through 5 dimensions in fixed order. For each dimension, ask 2 scenario-based questions.

| # | Dimension | Skip if L1 answers it |
|---|-----------|----------------------|
| 1 | **Core Behavior** | Primary use case actions + outcomes already clear from context |
| 2 | **Scope Boundaries** | In/out of scope already stated in goal + non_goals |
| 3 | **Error/Edge Cases** | Failure scenarios already covered by existing patterns |
| 4 | **Data Model** | Data flow/storage already determined by codebase conventions |
| 5 | **Implementation** | Tech choices already locked by existing stack (brownfield) |

**L1 Skip Gate**: Before each dimension, check L1 research. If the answer is already clear in one sentence → state the decision, mark `status: "resolved"`, skip to next dimension.

**Per dimension**: Ask 2 concrete scenario questions targeting that dimension.

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

**Rules:**
- Frame as concrete situations, not abstract choices
- User can skip ("Agent decides") → `status: "resolved"`, `assumed: true`
- User says "I don't know" → `status: "pending"`
- After each round: merge decisions, show progress (checked/unchecked dimensions + decisions so far)

### Inversion Probe (mandatory, after all dimensions)

After completing the dimension pass, ask these two questions:

1. **Inversion**: "Given the decisions so far, what scenario could cause this to fail even if every individual requirement is met correctly?"
2. **Implication**: "You decided [most impactful decision]. Does that also mean [likely consequence]?"

If all dimensions were skipped (simple project, < round 5), run the probe immediately before terminating.

### Merge Decisions

Run `hoyeon-cli spec guide context --schema v7` to check field types, then:

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --stdin --append << 'EOF'
{decisions array matching guide output — include status field}
EOF
```

Use `--append` to add to existing decisions array.

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

### Termination

Exit when: all 5 dimensions checked + inversion probe fired, OR user says "proceed", OR round 10.

### L2 Approval

Present all decisions + constraints to user, then AskUserQuestion (Approve/Revise/Abort).

### L2 Gate

```bash
hoyeon-cli spec validate .dev/specs/{name}/spec.json --layer decisions
```

Pass → advance to L3.
