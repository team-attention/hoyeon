---
name: state
description: |
  "/state", "dev state", "PR status", "state change", "queue", "pause", "continue", "status", "list"
  Integrated skill for PR state management - queue, pause, resume, status check, list view
allowed-tools:
  - Bash
  - Read
  - Glob
context: fork
---

# state - PR State Management

## Purpose

An integrated skill for managing PR states. Handles queue addition, pause, resume, status check, and list view in a single skill.

---

## Required Reference Documents

**You must read `${baseDir}/references/pr-as-ssot.md` before execution.**

Sections to reference from this document:
- **Labels** → Label definitions and rules by state
- **Comments (History)** → State change record format
- **State Machine** → State transition rules
- **CLI Reference** → gh commands

---

## Label Initialization (Run before all actions)

**Before executing any action**, verify that required Labels exist in the repository and create them if they don't exist.

### Required Labels

| Label | Color | Description |
|-------|-------|-------------|
| `state:queued` | `#0E8A16` (green) | PR queued for auto-execution |
| `state:executing` | `#1D76DB` (blue) | PR currently being executed |
| `state:blocked` | `#D93F0B` (red) | PR blocked, needs human intervention |
| `auto-execute` | `#5319E7` (purple) | Opt-in for automatic execution |

### Verification and Creation Logic

```bash
# Function definition
ensure_label() {
  local name="$1"
  local color="$2"
  local desc="$3"

  if ! gh label list --json name -q '.[].name' | grep -q "^${name}$"; then
    gh label create "$name" --color "$color" --description "$desc"
  fi
}

# Verify/create all required Labels
ensure_label "state:queued" "0E8A16" "PR queued for auto-execution"
ensure_label "state:executing" "1D76DB" "PR currently being executed"
ensure_label "state:blocked" "D93F0B" "PR blocked, needs human intervention"
ensure_label "auto-execute" "5319E7" "Opt-in for automatic execution"
```

---

## Input

```
/state <action> [PR#] [options]

actions:
  queue <PR#>                  # Add to queue
  begin <PR#>                  # Start execution
  pause <PR#> <reason>         # Block
  continue <PR#> [--run]       # Resume (--run: execute immediately)
  complete <PR#>               # Execution complete → ready
  status [PR#]                 # Check status (current branch if omitted)
  list [--queued|--executing|--blocked|--all]  # List view
```

---

## Actions

### queue

**Purpose**: Add PR to auto-execution queue

**Precondition**: `created` state (No Label, Draft)

**State Transition**: `created → queued`

**Workflow**:
1. Verify current state (must have no Label)
2. Execute with reference to SSOT:
   - **Labels** → Add `state:queued` (create if not exists)
   - **Comments** → Post comment using "Queued" template:
     ```bash
     # Get run info
     if [ -n "$GITHUB_RUN_ID" ]; then
       RUN_INFO="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
     else
       RUN_INFO="$(hostname -s)"
     fi

     # Post comment
     gh pr comment $PR --body "### 🤖 Queued

**State**: \`created\` → \`queued\`
**Run**: $RUN_INFO

PR queued for auto-execution."
     ```

**Output**: `✅ PR #123 queued for auto-execution`

---

### begin

**Purpose**: Start implementation execution

**Precondition**: `created` or `queued` state

**State Transition**: `created/queued → executing`

**Workflow**:
1. Verify current state (must have no Label or `state:queued`)
2. Check for duplicate execution (must not be `state:executing`)
3. Execute with reference to SSOT:
   - **Labels** → Remove `state:queued` (if exists), add `state:executing` (create if not exists)
   - **Comments** → Post comment using "Execution Started" template:
     ```bash
     # Get spec path from PR body
     SPEC_PATH=$(gh pr view $PR --json body -q '.body' | sed -n '/^---$/,/^---$/p' | grep '^spec:' | sed 's/spec: //')

     # Get run info
     if [ -n "$GITHUB_RUN_ID" ]; then
       RUN_INFO="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
     else
       RUN_INFO="$(hostname -s)"
     fi

     # Post comment
     gh pr comment $PR --body "### 🤖 Execution Started

**Plan**: $SPEC_PATH
**Run**: $RUN_INFO"
     ```

**Output**: `✅ PR #123 execution started`

---

### pause

**Purpose**: Stop work when issue occurs

**Precondition**: `executing` state

**State Transition**: `executing → blocked`

**Workflow**:
1. Verify current state (must have `state:executing` Label)
2. Execute with reference to SSOT:
   - **Labels** → Remove `state:executing`, add `state:blocked`
   - **Comments** → Post comment using "Blocked" template:
     ```bash
     # Get run info
     if [ -n "$GITHUB_RUN_ID" ]; then
       RUN_INFO="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
     else
       RUN_INFO="$(hostname -s)"
     fi

     # Post comment (REASON is from command argument)
     gh pr comment $PR --body "### 🚨 Blocked

**Run**: $RUN_INFO
**Reason**: $REASON

Next steps:
1. After fixing the issue, re-run \`/execute <PR#>\`
2. Or \`/state continue <PR#>\`"
     ```

**Output**: `✅ PR #123 paused (reason: ...)`

---

### continue

**Purpose**: Resume paused work

**Precondition**: `blocked` state

**State Transition**:
- Default: `blocked → queued`
- `--run`: `blocked → executing`

**Workflow**:
1. Verify current state (must have `state:blocked` Label)
2. Execute with reference to SSOT:
   - **Labels** → Remove `state:blocked`, add target state Label
   - **Comments** → Post comment using "Continued" template:
     ```bash
     # Get run info
     if [ -n "$GITHUB_RUN_ID" ]; then
       RUN_INFO="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
     else
       RUN_INFO="$(hostname -s)"
     fi

     # TARGET_STATE is 'queued' or 'executing' based on --run flag
     gh pr comment $PR --body "### 🤖 Continued

**State**: \`blocked\` → \`$TARGET_STATE\`
**Run**: $RUN_INFO

Resuming work."
     ```

**Output**: `✅ PR #123 continued → queued` (or `executing`)

---

### complete

**Purpose**: Implementation complete, convert PR to Ready

**Precondition**: `executing` state

**State Transition**: `executing → ready`

**Workflow**:
1. Verify current state (must have `state:executing` Label)
2. Execute with reference to SSOT:
   - **Labels** → Remove `state:executing` (keep `auto-execute` - it's an opt-in setting)
   - **Draft** → Convert to Ready (`gh pr ready`)
   - **Comments** → Post comment using "Published" template:
     ```bash
     # Get run info
     if [ -n "$GITHUB_RUN_ID" ]; then
       RUN_INFO="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
     else
       RUN_INFO="$(hostname -s)"
     fi

     # Post comment
     gh pr comment $PR --body "### 🤖 Published

**Run**: $RUN_INFO

PR is now ready for review."
     ```

**Output**: `✅ PR #123 completed → ready for review`

---

### status

**Purpose**: Check PR status

**Input**: Auto-detect PR from current branch if PR# is omitted

**Workflow**:
1. Query PR information (`gh pr view`)
2. Determine state based on SSOT's **State Machine** section
3. Output information

**Output**:
```
PR #123: feat/user-auth
State: executing
Spec: .dev/specs/user-auth
Assignee: claude-worker
Draft: true
Updated: 10 minutes ago
```

**State Determination**: Refer to "State Definitions" table in SSOT

---

### list

**Purpose**: Query PR list

**Input**:
- `--queued`: Queued PRs
- `--executing`: Executing PRs
- `--blocked`: Blocked PRs
- `--all` or omitted: All workflow PRs

**Workflow**:
1. Reference query examples in SSOT's **Labels** section
2. Query PR list matching filter
3. Output in table format

**Output**:
```
STATE       PR#    NAME              UPDATED
executing   #123   user-auth         5 min ago
blocked     #456   payment-flow      1 hour ago
queued      #789   email-template    2 hours ago
```

---

## Error Handling

| Action | Error Situation | Message |
|--------|-----------------|---------|
| queue | Already has state Label | "Not in 'created' state" |
| begin | Already `state:executing` | "Already executing" |
| begin | In `state:blocked` state | "PR is blocked - use 'continue' first" |
| pause | Not `state:executing` | "Not executing - nothing to pause" |
| continue | Not `state:blocked` | "Not blocked - nothing to continue" |
| complete | Not `state:executing` | "Not executing - nothing to complete" |
| complete | Already Ready (Draft=false) | "Already published" |
| status | No PR found | "No PR found" |

---

## Related Commands

| Command | Description |
|---------|-------------|
| `/specify <name>` | Write Spec document |
| `/open <name>` | Create PR based on Spec |
| `/execute <PR#>` | Execute implementation |
| `/publish <PR#>` | Convert PR to Ready |
