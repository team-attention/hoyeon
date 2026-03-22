## L0: Goal

**Output**: `meta.goal`, `meta.non_goals`, `context.confirmed_goal`

### Mirror Protocol

Before asking questions, mirror the user's goal:

```
"I understand you want [goal]. Scope: [included / excluded].
 Done when: [success criteria].
 Does this match?"
```

Then `AskUserQuestion`: "Does this match your intent?"

**Rules:**
- Mirror confirms goal, scope, done criteria ONLY. No tech choices (those are L2).
- Include at least one inference beyond the literal request.
- If ambiguous, surface the ambiguity explicitly.
- Max 3 mirror attempts. If still unclear, ask directly.

### Merge

Run `hoyeon-cli spec guide context --schema v7` and `spec guide meta --schema v7` to check fields, then:

```bash
hoyeon-cli spec merge .dev/specs/{name}/spec.json --stdin << 'EOF'
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

Run `hoyeon-cli spec guide context --schema v7` to check fields, then merge research via `--stdin`.

### Gate

Auto-advance after merge. No reviewer, no user approval at L1.
