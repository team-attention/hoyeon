---
name: specify
description: |
  Turn a goal into an implementation plan (spec.json v1).
  Simplified layer chain: L0:Goal → L1:Context → L2:Decisions → L3:Requirements → L4:Tasks.
  No reviewer agents, no verify fields. Evidence-based clarity scoring at L2.
  CLI validates schema+coverage at each layer. User approves at L2, L3, L4.
  Use when: "/specify", "specify", "plan this"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - Write
  - AskUserQuestion
---

# /specify — Spec Generator

Generate a spec.json (v1 schema) through a structured derivation chain.
Each layer builds on the previous — no skipping, no out-of-order merges.

Before starting, run `hoyeon-cli spec guide full --schema v1` to see the complete schema.

---

## Core Rules

1. **CLI is the writer** — `spec init`, `spec merge`, `spec validate`. Never hand-write spec.json.
2. **Stdin merge** — Pass JSON via heredoc stdin. No temp files.
   ```bash
   hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin << 'EOF'
   {"context": {"decisions": [...]}}
   EOF
   ```
3. **Guide before merge** — Run `hoyeon-cli spec guide <section> --schema v1` before constructing JSON. Guide output is the source of truth.
4. **Validate at layer transitions** — `hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json` once per layer (before advancing), not after every merge.
5. **One merge per section** — Never merge multiple sections in parallel.
6. **Merge failure** — Read error → run guide → fix JSON → retry (max 2). Don't retry with same JSON.
7. **--append for arrays** — When adding to existing arrays (decisions). **No flag** for first-time writes.
8. **Revision Merge Protocol** — When user selects "Revise" at an approval gate:
   - **Modify existing item** (e.g. update D3's rationale) → `--patch`
   - **Add new item** (e.g. add D5) → `--append`
   - **Remove + rewrite entire section** → no flag (intentional full replace)
   - **NEVER** use no-flag merge with a subset of items — this silently replaces the entire array.

---

## Layer Flow

Execute layers sequentially. Read each reference file just-in-time.

| Layer | Read File | What | Gate |
|-------|-----------|------|------|
| L0 | `${baseDir}/references/L0-L1-context.md` | Mirror → confirmed_goal, non_goals | User confirms mirror |
| L1 | (same file) | Codebase research → context.research | Auto-advance |
| L2 | `${baseDir}/references/L2-decisions.md` | Interview → decisions + constraints | CLI validate + L2-reviewer + User approval |
| L3 | `${baseDir}/references/L3-requirements.md` | Derive requirements + sub from decisions | CLI validate + User approval |
| L4 | `${baseDir}/references/L4-tasks.md` | Derive tasks + external_deps, Plan Summary | CLI validate + User approval |

### Session Init (before L0)

```bash
hoyeon-cli spec init {name} --goal "{goal}" --type dev --schema v1 --interaction {interaction} \
  .hoyeon/specs/{name}/spec.json
```

`{name}` = kebab-case from goal. `{interaction}` = interactive (default) or autopilot (with `--autopilot` flag).

```bash
SESSION_ID="[from UserPromptSubmit hook]"
hoyeon-cli session set --sid $SESSION_ID --spec ".hoyeon/specs/{name}/spec.json"
```

---

## User Approval Protocol

Three approval gates (L2, L3, L4). Each uses the same pattern:

```
AskUserQuestion(
  question: "Review the {items} above. Ready to proceed?",
  options: [
    { label: "Approve", description: "Looks good — proceed to next layer" },
    { label: "Revise", description: "I want to change something" },
    { label: "Abort", description: "Stop specification" }
  ]
)
```

- **Approve** → advance to next layer
- **Revise** → user provides corrections, merge changes, re-present (loop until approved)
- **Abort** → stop

Autopilot mode: skip user approval (except Plan Summary at L4).

---

## Checklist Before Stopping

- [ ] spec.json at `.hoyeon/specs/{name}/spec.json`
- [ ] `hoyeon-cli spec validate` passes
- [ ] `context.confirmed_goal` populated
- [ ] `meta.non_goals` populated (empty `[]` if none)
- [ ] `context.decisions[]` populated
- [ ] Every requirement has at least 1 sub-requirement
- [ ] Every task has `fulfills[]`
- [ ] Plan Summary presented to user
- [ ] `meta.approved_by` and `meta.approved_at` written after approval
