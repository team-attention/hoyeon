## L0: Goal

**Output**: `meta.goal`, `meta.non_goals`, `context.confirmed_goal`

### Mirror Protocol

Before asking any questions, present your understanding using this **exact template** (4 sections, in this order):

```markdown
**🪞 Mirror — Here's what I understood**

**Understanding:**
<1–2 sentences paraphrasing the user's request in your own words. Not a verbatim echo.>

**Goal:**
- <bullet 1: concrete outcome>
- <bullet 2: concrete outcome>

**Non-Goal (explicitly out of scope this round):**
- <bullet 1: exclusion — at least one must be inferred, not stated by user>
- <bullet 2: exclusion>

**Ambiguous (scope-level unknowns — NOT tech choices):**
- <ambiguity about what "done" means, what's included, or who the user is>
- <ambiguity about boundaries of the feature>
```

Then immediately call `AskUserQuestion`:
```
AskUserQuestion(
  question: "Does this Mirror match your intent?",
  options: [
    { label: "Approve", description: "Matches — proceed to L1" },
    { label: "Revise",  description: "Fix goal/non-goal/scope" },
    { label: "Clarify", description: "Resolve the Ambiguous items first" }
  ]
)
```

### L0 Ambiguous vs L2 Decisions — no overlap

They look similar but answer different questions. Use this test before writing an Ambiguous bullet:

| Axis | L0 Ambiguous | L2 Decisions |
|------|--------------|--------------|
| Question type | "What are we building / for whom / done when?" | "How are we building it?" |
| Resolves into | `meta.goal`, `meta.non_goals`, `context.confirmed_goal` | `context.decisions[]`, `constraints[]` |
| Example (good) | "Is this single-user local-only, or multi-user shared?" | "SQLite vs Postgres?" |
| Example (good) | "Does 'dashboard' include historical charts, or only current values?" | "Recharts vs Chart.js?" |
| Example (good) | "Is this a throwaway playground or a reusable internal tool?" | "Next.js vs vanilla HTML?" |
| Resolution method | User says yes/no in Mirror approval | Step-0 checkpoints → Interview Loop → score ≥ 0.80 |

**Rule of thumb:** if answering the ambiguity would add an entry to `decisions[]`, it belongs in L2, not L0. L0 Ambiguous items feed L2 as *scope inputs* — they shape which dimensions L2 must score, but L2 is where they get resolved with rationale.

**Rules:**
- Mirror confirms **goal / non-goal / scope ambiguity ONLY**. No tech choices at L0.
- At least one Non-Goal and one Ambiguous item must be inferred by you — a pure echo of the user's words is a protocol violation.
- Never ask clarifying questions as free-form text. Always go through `AskUserQuestion`.
- Max 3 mirror revision rounds. If still unclear after 3, advance and record residual ambiguities into `known_gaps` at L2.

**❌ Forbidden at L0** (defer to L2):
- "Which framework?" / "React vs Next.js?"
- "Which API provider / data source?"
- "Realtime or batch?" (unless the user already framed it as scope, not implementation)
- Any question whose answer would land in `context.decisions[]`.

### Merge

Run `hoyeon-cli spec guide context --schema v2` and `spec guide meta --schema v2` to check fields, then:

```bash
hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin << 'EOF'
{constructed JSON matching guide output — confirmed_goal in context, non_goals in meta}
EOF
```

> `confirmed_goal` stays in `context`, NOT `meta`.
> `non_goals`: strategic scope exclusions. Use `[]` if none.

### Gate

User confirms mirror → advance to L1. No reviewer.

---

## L1: Context Research

**Output**: `context.research`

### Execution

Orchestrator scans the codebase with Glob/Grep/Read to find:
- Existing patterns relevant to the goal
- Project structure, build/test/lint commands
- Internal docs, ADRs, READMEs

For larger codebases, optionally dispatch like below:

```
Task(subagent_type="code-explorer",
     prompt="Find: existing patterns for [feature type]. Report findings as file:line format.")

Task(subagent_type="code-explorer",
     prompt="Find: project structure, package.json scripts for lint/test/build commands. Report as file:line format.")

Task(subagent_type="docs-researcher",
     prompt="Find internal documentation relevant to [feature/task]. Search docs/, ADRs, READMEs, config files for conventions, architecture decisions, and constraints. Report as file:line format.")

Task(subagent_type="ux-reviewer",
     prompt="User's Goal: [goal]. Evaluate how this change affects existing UX.")
```


Also search past learnings:
```bash
hoyeon-cli spec search "[goal keywords]" --json --limit 5
```

### Merge

Run `hoyeon-cli spec guide context --schema v2` to check fields, then merge research via `--stdin`.

### Gate

Auto-advance after merge. No reviewer, no user approval at L1.
