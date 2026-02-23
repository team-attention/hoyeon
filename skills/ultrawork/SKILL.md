---
name: ultrawork
description: |
  This skill should be used when the user says "/ultrawork", "ultrawork", or wants to run the full
  specify → open → execute pipeline automatically with a single command.
  Automated end-to-end workflow that chains specify, open, and execute skills.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Write
  - Bash
  - Edit
  - Skill
  - AskUserQuestion
---

# /ultrawork Skill - Automated Development Pipeline

You are initiating an **ultrawork** session - a fully automated pipeline that chains:
1. `/specify` - Interview and plan generation (autopilot mode)
2. Draft PR creation (inline)
3. `/execute` - Implementation

**You drive each step sequentially.** No hooks, no external state tracking.

## Execution

### Step 1: Parse User Request

Extract a short, kebab-case name for the feature:
- "Add user authentication" → `user-auth`
- "Implement payment processing" → `payment-processing`
- "Fix login bug" → `fix-login-bug`

### Step 2: Announce Ultrawork Mode

Output:
```
Ultrawork Mode Activated

Feature: {name}
Pipeline: specify → open → execute

Starting specify phase (autopilot)...
```

### Step 3: Run Specify (Autopilot)

```
Skill("specify", args="--autopilot {name}")
```

Wait for specify to complete. Verify outputs exist:
- `.dev/specs/{name}/PLAN.md`
- `.dev/specs/{name}/plan-content.json`

If specify fails or outputs are missing, stop and report the error.

### Step 4: Create Draft PR

Inline the PR creation workflow (no separate `/open` call):

1. **Read plan content**: Read `.dev/specs/{name}/plan-content.json` → extract `objectives.core` for PR title/summary
2. **Read PR body template**: Read `${baseDir}/../open/references/pr-body-template.md` for template structure
3. **Verify gh auth**: Run `gh auth status`
4. **Check existing PR**: `gh pr list --head "feat/{name}" --json number -q '.[0].number'` — if exists, skip to Step 5
5. **Create branch**: `git checkout -b feat/{name}`
6. **Push branch**: `git push -u origin feat/{name}`
7. **Determine base branch**: Use `develop` if it exists (check with `git rev-parse --verify origin/develop`), else `main`
8. **Create PR**: `gh pr create --draft --title "feat: {summary}" --body "{composed body}" --base {base}`
9. **Output**: `PR #{number} created (Draft) — Branch: feat/{name}`

### Step 5: Run Execute

```
Skill("execute", args="{name}")
```

Wait for execute to complete (all TODOs checked, report output).

### Step 6: Done

Output final summary:
```
Ultrawork Complete

Feature: {name}
- Specify: PLAN.md created
- PR: #{number} (Draft)
- Execute: All TODOs completed

Pipeline finished.
```

## User Interruption

User can stop the pipeline at any time by saying:
- "stop"
- "pause"
- "wait"

This will halt the current phase and await further instructions.

## Example Flow

```
User: "/ultrawork add dark mode support"

[You]
1. Parse: feature name = "dark-mode"

2. Announce:
   Ultrawork Mode Activated
   Feature: dark-mode
   Pipeline: specify → open → execute
   Starting specify phase (autopilot)...

3. Run: Skill("specify", args="--autopilot dark-mode")
   → PLAN.md + plan-content.json created

4. Create Draft PR:
   → Read plan-content.json for summary
   → git checkout -b feat/dark-mode
   → gh pr create --draft ...
   → PR #42 created (Draft)

5. Run: Skill("execute", args="dark-mode")
   → TODOs dispatched and completed

6. Done:
   Ultrawork Complete
   Feature: dark-mode
   - Specify: PLAN.md created
   - PR: #42 (Draft)
   - Execute: All TODOs completed
   Pipeline finished.
```

## Important Notes

- **Agent drives sequentially** — no hooks, no state machine
- **Specify runs in autopilot mode** — no interactive interview
- **PR creation is inlined** — avoids overhead of separate `/open` skill call
- **Each sub-skill uses its own recipe** — specify and execute are unchanged
- **User can interrupt** at any time for manual control
