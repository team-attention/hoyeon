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
1. `/specify` - Interview and plan generation
2. `/open` - Draft PR creation
3. `/execute` - Implementation

## How It Works

The pipeline is fully autonomous via **Stop hooks**:
- Specify runs in `--autopilot` mode (no user questions)
- When specify creates PLAN.md + plan-content.json → Hook triggers `/open`
- When PR is created → Hook triggers `/execute`
- When all TODOs complete → Pipeline ends

**You don't need to manually trigger the next step** — hooks handle all transitions.

## Your Role

1. **Extract the feature name** from user's request
2. **Start specify in autopilot mode** — no user interaction, fully autonomous
3. The rest happens automatically via hooks (open → execute → done)

## Execution

### Step 1: Parse User Request

Extract a short, kebab-case name for the feature:
- "Add user authentication" → `user-auth`
- "Implement payment processing" → `payment-processing`
- "Fix login bug" → `fix-login-bug`

> **Note:** State initialization is handled automatically by `UserPromptSubmit` hook (`ultrawork-init-hook.sh`).

### Step 2: Announce Ultrawork Mode

```
🚀 Ultrawork Mode Activated

Feature: {name}
Pipeline: specify → open → execute

Starting interview phase...
```

### Step 3: Invoke Specify (Autopilot)

```
Skill("specify", args="--autopilot {name}")
```

**CRITICAL**: Always pass `--autopilot`. This makes specify:
- Skip user interview questions (auto-assume based on codebase patterns)
- Skip Decision Summary Checkpoint (log to DRAFT instead)
- Skip Verification Summary Confirmation
- Complete without AskUserQuestion — plan generated and approved autonomously

Without `--autopilot`, specify will ask interactive questions and the pipeline stalls.

### Step 4: Hooks Handle the Rest

After specify completes (PLAN.md + plan-content.json created):
1. Stop hook detects plan ready → blocks with "Run /open"
2. Claude runs `Skill("open", args="{name}")` → creates Draft PR
3. Stop hook detects PR exists → blocks with "Run /execute"
4. Claude runs `Skill("execute", args="{name}")` → implements all TODOs
5. Stop hook detects all TODOs checked → cleanup, pipeline done

## User Interruption

User can stop the pipeline at any time by saying:
- "stop"
- "pause"
- "wait"

This will halt the current phase and await further instructions.

## State Tracking

The hook tracks progress in `.dev/state.local.json`:
```json
{
  "session-id": {
    "ultrawork": {
      "name": "feature-name",
      "phase": "specify_interview",
      "iteration": 0
    }
  }
}
```

Phases: `specify_interview` → `specify_plan` → `opening` → `executing` → `done`

## Example Flow

```
User: "/ultrawork add dark mode support"

[Hook auto-initializes state: name="add-dark-mode-support"]

[You]
1. Parse: feature name = "add-dark-mode-support"

2. Announce:
   🚀 Ultrawork Mode Activated
   Feature: add-dark-mode-support
   Pipeline: specify → open → execute

3. Invoke: Skill("specify", args="--autopilot add-dark-mode-support")

[Specify runs autonomously — no user questions]
[DRAFT.md → PLAN.md + plan-content.json created]
[Claude stops → Stop hook blocks: "Run /open"]
[Claude runs Skill("open", args="add-dark-mode-support")]
[PR created → Stop hook blocks: "Run /execute"]
[Claude runs Skill("execute", args="add-dark-mode-support")]
[All TODOs completed → Stop hook cleans up]
[Pipeline done]
```

## Important Notes

- **State is auto-initialized** by `UserPromptSubmit` hook — no manual setup needed
- **Always use `--autopilot`** for specify — interactive mode will stall the pipeline
- **Do NOT manually call /open or /execute** — hooks handle transitions
- **The pipeline is fully autonomous** — just start it and let it run
- **User can interrupt** at any time for manual control
