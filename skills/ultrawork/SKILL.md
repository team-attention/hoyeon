---
name: ultrawork
description: |
  This skill should be used when the user says "/ultrawork", "ultrawork", or wants to run the full
  specify → execute pipeline automatically with a single command.
  Automated end-to-end workflow that chains specify and execute skills.
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

You are initiating an **ultrawork** session — a fully automated pipeline that chains:
1. `/specify` — Systematic requirements derivation producing `requirements.md`
2. `/blueprint` — Contract-first planning producing `plan.json` from requirements
3. `/execute` — Reads `plan.json`, dispatches workers, and implements

## How It Works

The ultrawork pipeline runs automatically through **Stop hooks**:
- When specify finishes L4 with user approval → Hook triggers `/execute {spec-path}`
- `/execute` then derives `plan.json` from the approved spec and runs tasks to completion
- When all tasks complete → Pipeline ends

**You don't need to manually trigger the next step** — the hooks handle transitions.

### v2 schema note

In spec-v2, `spec.json` contains **only** requirements + sub-requirements (with GWT) + verification journeys.
It does **not** contain `tasks[]`. Task breakdown lives in a sibling `plan.json` derived by `/execute`.
Ultrawork is just the glue: specify produces the spec, execute produces and runs the plan.

## Your Role

1. **Extract the feature name** from user's request
2. **Initialize ultrawork state** (handled by UserPromptSubmit hook)
3. **Start the specify skill** with the feature name
4. **Follow specify's layer flow** normally (approve at L2, L3, L4)
5. The rest happens automatically via hooks

## Execution

### Step 1: Parse User Request

Extract a short, kebab-case name for the feature:
- "Add user authentication" → `user-auth`
- "Implement payment processing" → `payment-processing`
- "Fix login bug" → `fix-login-bug`

> **Note:** State initialization is handled automatically by `UserPromptSubmit` hook (`ultrawork-init-hook.sh`).

### Step 2: Announce Ultrawork Mode

```
Ultrawork Mode Activated

Feature: {name}
Pipeline: specify (spec.json v2) → execute (plan.json + run)

Starting specify L0...
```

### Step 3: Invoke Specify

```
Skill("specify", args="{name}")
```

The specify skill will:
1. L0: Goal mirror + confirmed_goal
2. L1: Codebase research
3. L2: Decisions + constraints (user approves)
4. L3: Requirements + sub-requirements with GWT (user approves)
5. L4: Verification journeys (user approves)
6. Write approved `spec.json` at `.hoyeon/specs/{name}/spec.json`

### Step 4: Let Hooks Handle the Rest

After specify completes with an approved spec:
- `ultrawork-stop-hook.sh` detects an approved `spec.json` (meta.approved_by populated)
- Hook automatically injects `/execute .hoyeon/specs/{name}/spec.json`
- `/execute` prompts (via AskUserQuestion) for dispatch/work/verify mode selections,
  derives `plan.json`, and runs tasks to completion

## User Interruption

User can stop the pipeline at any time by saying:
- "stop"
- "pause"
- "wait"

This will halt the current phase and await further instructions.

## State Tracking

The hook tracks progress in `.hoyeon/state.local.json`:
```json
{
  "session-id": {
    "ultrawork": {
      "name": "feature-name",
      "phase": "specify",
      "iteration": 0
    }
  }
}
```

Phases: `specify` → `executing` → `done`

## Example Flow

```
User: "/ultrawork add dark mode support"

[Hook auto-initializes state for "dark-mode"]

[You]
1. Parse: feature name = "dark-mode"

2. Announce:
   Ultrawork Mode Activated
   Feature: dark-mode
   Pipeline: specify → execute
   Starting specify L0...

3. Invoke: Skill("specify", args="dark-mode")

[Specify L0→L1→L2(approve)→L3(approve)→L4(approve)]
[spec.json written and approved at .hoyeon/specs/dark-mode/spec.json]
[Hook detects approved spec → triggers "/execute .hoyeon/specs/dark-mode/spec.json"]
[/execute prompts for dispatch/work/verify, derives plan.json, runs tasks]
[All tasks completed]
[Pipeline ends]
```

## Important Notes

- **State is auto-initialized** by `UserPromptSubmit` hook — no manual setup needed
- **Do NOT manually call /execute** — hooks handle this
- **Follow specify's layer flow** — approve at L2/L3/L4 gates
- **spec.json has no tasks** in v2 — `/execute` derives `plan.json` as a sibling file
- **Mode selection is interactive** — `/execute` asks for dispatch/work/verify via AskUserQuestion (no CLI flags)
- **The pipeline is autonomous** — just start it and let it run
- **User can interrupt** at any time for manual control
