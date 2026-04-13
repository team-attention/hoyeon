---
name: specify
model: opus
description: |
  Turn a goal into an implementation plan (spec.json v2).
  Simplified layer chain: L0:Goal → L1:Context → L2:Decisions → L3:Requirements → L4:Verification.
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

Generate a spec.json (v2 schema) through a structured derivation chain.
Each layer builds on the previous — no skipping, no out-of-order merges.

Before starting, run `hoyeon-cli spec guide full --schema v2` to see the complete schema.

---

## Core Rules

1. **CLI is the writer** — `spec init`, `spec merge`, `spec validate`. Never hand-write spec.json.
2. **Stdin merge** — Pass JSON via heredoc stdin. No temp files.
   ```bash
   hoyeon-cli spec merge .hoyeon/specs/{name}/spec.json --stdin << 'EOF'
   {"context": {"decisions": [...]}}
   EOF
   ```
3. **Guide before merge** — Run `hoyeon-cli spec guide <section> --schema v2` before constructing JSON. Guide output is the source of truth.
4. **Validate at layer transitions** — `hoyeon-cli spec validate .hoyeon/specs/{name}/spec.json` once per layer (before advancing), not after every merge.
5. **One merge per section** — Never merge multiple sections in parallel.
6. **Merge failure** — Read error → run guide → fix JSON → retry (max 2). Don't retry with same JSON.
7. **--append for arrays** — When adding to existing arrays (decisions). **No flag** for first-time writes.
8. **Revision Merge Protocol** — When user selects "Revise" at an approval gate:
   - **Modify existing item** (e.g. update D3's rationale) → `--patch`
   - **Add new item** (e.g. add D5) → `--append`
   - **Remove + rewrite entire section** → no flag (intentional full replace)
   - **NEVER** use no-flag merge with a subset of items — this silently replaces the entire array.
9. **MUST READ reference before each layer** — Before executing layer N, you MUST `Read` the corresponding `references/{layer}.md` file. The SKILL.md summary is NOT sufficient — each reference contains mandatory sub-steps (Step 0, Interview Loop, Inversion Probe, etc.) that the summary does not enumerate. Skipping the Read = protocol violation; you will silently miss required sub-procedures (this has happened in past sessions, most often at L2).

---

## Layer Flow

Per-layer protocol (apply to every layer): **Read MUST-READ-FIRST file → Execute all sub-steps in that file → Merge → CLI validate → Gate**. Do NOT shortcut from this table's "What" column — it is a 1-line summary, not the spec.

| Layer | MUST Read First | What (summary only — full procedure in file) | Gate |
|-------|-----------------|-----------------------------------------------|------|
| L0 | `${baseDir}/references/L0-L1-context.md` | Mirror → confirmed_goal, non_goals | User confirms mirror |
| L1 | (same file) | Codebase research → context.research | Auto-advance |
| L2 | `${baseDir}/references/L2-decisions.md` | **7 mandatory steps**: (0) Complexity classify + checkpoint generation per dimension → (1) Score-driven Interview Loop with 3-state resolution → (2) Unknown/Unknown 3-tier detection each round → (3) Scoreboard display → (4) Termination check (composite ≥ 0.80, every dim ≥ 0.60, unknowns = 0) → (5) Inversion Probe + Unresolved Sweep into `known_gaps` → (6) L2-reviewer Task (steelman). Skipping any = violation. | CLI validate + L2-reviewer + User approval |
| L3 | `${baseDir}/references/L3-requirements.md` | Scaffold from 4 context sources (confirmed_goal / non_goals / research / decisions) → reshape requirements → fill GWT (given/when/then required, no TBD) → coverage check (every decision traced, research reflected, non_goals respected) | CLI validate + User approval |
| L4 | `${baseDir}/references/L4-verification.md` | Derive verification journeys composing 2+ sub-reqs into end-to-end flows (may be empty after explicit confirmation) → AskUserQuestion flow → merge | CLI validate + User approval |

### Session Init (before L0)

```bash
hoyeon-cli spec init {name} --goal "{goal}" --type dev --schema v2 --interaction {interaction} \
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
- [ ] All sub-requirements have GWT filled
- [ ] verification.journeys[] composes resolves (or explicit 0-journey confirmation)
- [ ] Plan Summary presented to user
- [ ] `meta.approved_by` and `meta.approved_at` written after approval
