## Dependencies

None (L0 is the first layer). Requires only: spec init completed, session initialized.

---

## L0: Goal

**Who**: Orchestrator
**Output**: `meta.goal`, `meta.non_goals`, `context.confirmed_goal`
**Merge**: `spec init` + `spec merge` for non_goals and confirmed_goal
**Gate**: User confirmation via Mirror protocol

### Execution

`spec init` is already run in Session Initialization. This layer focuses on confirming the goal and non-goals with the user.

#### Mirror Protocol

Before asking any questions, mirror the user's goal back to confirm alignment:

```
"I understand you want [goal]. Scope: [what's included / what's excluded].
 Done when: [success criteria].
 I'll handle [agent scope]. You'll need to [human scope, if any].
 Does this match?"
```

After displaying the mirror text above, use AskUserQuestion to ask: "Does this match your intent?"

**Mirror rules:**
- Mirror confirms **goal, scope, and done criteria ONLY**. Do NOT make technology choices, implementation decisions, or architectural picks in the mirror — those belong in L2.
- Mirror must include at least one **inference** beyond the literal request (assumed scope boundary or success criterion). A parrot echo confirms nothing. An interpretive mirror reveals scope assumptions the user can correct.
- If the goal is ambiguous, mirror must surface the ambiguity explicitly — do not write `confirmed_goal` until the user has confirmed or corrected the interpretation.
- If you cannot fill goal, scope, or done criteria → ask that specific item directly instead of mirroring.
- Max 3 mirror attempts. If still unclear after 3 → ask the unfilled items directly.

#### Merge after Mirror confirmation

Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE — check field names and types (MANDATORY)
hoyeon-cli spec guide context
hoyeon-cli spec guide meta

# STEP 2+3: CONSTRUCT + WRITE — match guide output exactly
cat > /tmp/spec-merge.json << 'EOF'
{
  "context": { "confirmed_goal": "user-confirmed goal statement here" },
  "meta": { "non_goals": [] }
}
EOF

# STEP 4: MERGE
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json

# STEP 5: VERIFY
hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

If merge fails → follow Merge Failure Recovery (SKILL.md). Do NOT proceed to L1 with a broken merge.

> C4: confirmed_goal stays in `context.confirmed_goal`, NOT in `meta`.
> `meta.non_goals` must be present (use empty array `[]` if no non-goals).
> Non-goals are strategic scope exclusions — "What this project is NOT trying to achieve." They are NOT verifiable rules (those go in `constraints`).

### L0 Gate

- **Quick**: Auto-advance after spec init. No mirror, no gate.
- **Standard**: User must confirm mirror before advancing to L1. No gate-keeper review at L0 — mirror confirmation is the gate.

> Gate-keeper starts at L2. L0 and L1 do not invoke gate-keeper.

---

## L1: Context

**Who**: Orchestrator (Glob/Grep/Read), optionally code-explorer agent for large codebases
**Output**: `context.research`
**Merge**: `spec merge context`
**Gate**: Step-back via SendMessage only (no spec coverage — L1 produces context.research, not decisions)

### Execution

> **Mode Gate**:
> - **Quick**: Orchestrator performs minimal codebase scan (2-3 key directories). No agents. Merge abbreviated research.
> - **Standard**: Launch exploration agents in parallel.

**Standard Mode** (exploration agents in parallel):

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

**Past learnings search** (run in parallel with above agents):

```bash
hoyeon-cli spec search "[goal keywords]" --json --limit 5
```

If results are found, include them in the research merge as `past_learnings`.

### Merge research

Merge all research results into spec.json. Follow the Mandatory Merge Protocol (SKILL.md):

```bash
# STEP 1: GUIDE — check research field structure (MANDATORY)
# ⚠️ research must be a structured OBJECT, not a string
hoyeon-cli spec guide context

# STEP 2+3: CONSTRUCT + WRITE — match guide output exactly
cat > /tmp/spec-merge.json << 'EOF'
{
  "context": {
    "request": "original user request",
    "research": {
      "summary": "high-level findings",
      "patterns": ["pattern1", "pattern2"],
      "structure": ["dir1/", "dir2/"],
      "commands": {"build": "npm run build", "test": "npm test"},
      "documentation": "relevant docs found",
      "ux_review": "UX impact assessment",
      "past_learnings": "relevant learnings from spec search (omit if no matches)"
    }
  }
}
EOF

# STEP 4: MERGE
hoyeon-cli spec merge .dev/specs/{name}/spec.json --json "$(cat /tmp/spec-merge.json)" && rm /tmp/spec-merge.json

# STEP 5: VERIFY
hoyeon-cli spec validate .dev/specs/{name}/spec.json
```

> Quick mode: omit `documentation` and `ux_review` from research.

If merge fails → follow Merge Failure Recovery (SKILL.md). Do NOT proceed to L2 with a broken merge.

### L1 Gate

- **Quick**: Auto-advance. No gate.
- **Standard**: Auto-advance after research merge. No gate-keeper review at L1 — research relevance is validated implicitly when gate-keeper reviews L2 decisions (which depend on L1 research).
