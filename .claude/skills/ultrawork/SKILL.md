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

The ultrawork pipeline runs automatically through **Stop hooks**:
- When you complete Interview (DRAFT.md created) → Hook triggers Plan generation
- When Plan is approved → Hook triggers `/open`
- When PR is created → Hook triggers `/execute`
- When all TODOs complete → Pipeline ends

**You don't need to manually trigger the next step** - the hooks handle transitions.

## Your Role

1. **Extract the feature name** from user's request
2. **Initialize ultrawork state** (CRITICAL - must do before anything else)
3. **Start the specify skill** with the feature name
4. **Follow specify's interview process** normally
5. The rest happens automatically via hooks

## Execution

### Step 1: Parse User Request

Extract a short, kebab-case name for the feature:
- "Add user authentication" → `user-auth`
- "Implement payment processing" → `payment-processing`
- "Fix login bug" → `fix-login-bug`

### Step 2: Initialize Ultrawork State (CRITICAL)

**You MUST run this Bash command BEFORE announcing or calling specify:**

```bash
mkdir -p .dev && \
SESSION_ID="${SESSION_ID:-$(uuidgen | tr '[:upper:]' '[:lower:]')}" && \
FEATURE_NAME="{name}" && \
STATE_FILE=".dev/state.local.json" && \
if [[ ! -f "$STATE_FILE" ]]; then echo '{}' > "$STATE_FILE"; fi && \
jq --arg sid "$SESSION_ID" \
   --arg name "$FEATURE_NAME" \
   --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.[$sid] = {
     "created_at": $ts,
     "agents": {},
     "ultrawork": {
       "name": $name,
       "phase": "specify_interview",
       "iteration": 0,
       "max_iterations": 10
     }
   }' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE" && \
echo "Ultrawork state initialized for $FEATURE_NAME"
```

Replace `{name}` with the actual feature name (kebab-case).

### Step 3: Announce Ultrawork Mode

```
🚀 Ultrawork Mode Activated

Feature: {name}
Pipeline: specify → open → execute

Starting interview phase...
```

### Step 4: Invoke Specify

```
Skill("specify", args="{name}")
```

The specify skill will:
1. Run Interview Mode (gather requirements)
2. Wait for DRAFT.md to be created
3. **[Hook auto-triggers]** → Generate Plan when DRAFT is ready
4. Run Reviewer approval
5. **[Hook auto-triggers]** → Call /open when Plan is approved

### Step 5: Let Hooks Handle the Rest

After specify completes with an approved plan:
- `ultrawork-stop-hook.sh` detects PLAN.md with "APPROVED"
- Hook automatically injects `/open {name}`
- After PR creation, hook injects `/execute`
- Execute runs until all TODOs complete

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

[You]
1. Parse: feature name = "dark-mode"

2. Initialize state (Bash command):
   mkdir -p .dev && ... (run the full command)

3. Announce:
   🚀 Ultrawork Mode Activated
   Feature: dark-mode
   Pipeline: specify → open → execute
   Starting interview phase...

4. Invoke: Skill("specify", args="dark-mode")

[Specify Interview runs...]
[DRAFT.md created]
[Hook detects → triggers "Generate the plan"]
[Plan created, Reviewer approves]
[Hook detects → triggers "/open dark-mode"]
[PR created]
[Hook detects → triggers "/execute"]
[TODOs completed]
[Pipeline ends]
```

## Important Notes

- **ALWAYS initialize state first** - hooks won't work without it
- **Do NOT manually call /open or /execute** - hooks handle this
- **Follow specify's interview process** - gather requirements properly
- **The pipeline is autonomous** - just start it and let it run
- **User can interrupt** at any time for manual control
