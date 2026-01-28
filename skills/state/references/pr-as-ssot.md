# PR as Single Source of Truth

## Overview

According to the **PR = Single Source of Truth** principle, all work states are recorded in the PR.

### PR Roles

| Role | Description |
|------|------|
| **Implementation Container** | Contains all code changes for a single work item (spec) |
| **State Storage** | GitHub PR itself stores state without external DB |
| **History Tracking** | All state changes are recorded as Comments |
| **Collaboration Hub** | Review, discussion, and approval happen in the PR |

### Core Principles

```
┌────────────────────────────────────────────────────────────┐
│  1 Spec = 1 PR = 1 Branch                                  │
│  PR = Single Source of Truth                               │
│  Commands = Environment-Agnostic (same everywhere)         │
│  Auto-execution = Optional Layer (can exist or not)        │
└────────────────────────────────────────────────────────────┘
```

### Lifecycle

```
Write Spec → Create PR → Implement → Complete → Merge
              │
              ▼
     ┌─────────────────────────────────────────┐
     │  created → queued → executing → ready  │
     │                 ↓                       │
     │              blocked                    │
     └─────────────────────────────────────────┘
```

1. **Write Spec**: Create `.dev/specs/<name>/PLAN.md` document
2. **Create PR**: Create Draft PR, `feat/<name>` branch
3. **Implement**: Implement spec automatically or manually
4. **Complete**: PR ready, request review
5. **Merge**: Merge code

---

## Branch Naming

```
feat/<spec-name>
```

- Branch name identical to spec name
- Example: `feat/user-auth`, `feat/payment-flow`
- 1 Spec = 1 Branch = 1 PR

---

## PR Data Structure

### Role Separation

| Storage | Purpose | Characteristics | Example |
|--------|------|------|------|
| **Labels** | State + auto-execution opt-in | Fast queries | `state:queued`, `auto-execute` |
| **Body** | Static metadata | YAML frontmatter | spec path |
| **Comments** | History log | Append-only | State change records |
| **Draft** | In-progress vs awaiting review | Boolean | `true` / `false` |

### Why This Separation?

- **Labels**: Fast filtering/querying (`gh pr list --label`) + auto-execution opt-in
- **Body**: Rarely changed metadata (no history when modified)
- **Comments**: Track all change history (append-only)
- **Draft**: Simple boolean to express "work completion status"

### Run Information

Use `Run` field in comments to identify execution environment:

| Environment | Value | Example |
|------|-----|------|
| **GitHub Actions** | Run URL | `https://github.com/owner/repo/actions/runs/12345` |
| **Local** | hostname | `macbook-pro` |

```bash
# Generate Run value
if [ -n "$GITHUB_RUN_ID" ]; then
  RUN_INFO="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
else
  RUN_INFO="$(hostname -s)"
fi
```

---

## Labels

### Namespace

```
state:<status>
```

- Separate namespace with `state:` prefix
- Prevent conflicts with other labels
- Clear meaning

### Defined Labels

| Label | Meaning | Description |
|-------|------|------|
| `state:queued` | Queued | In auto-execution queue |
| `state:executing` | Executing | Implementation work in progress |
| `state:blocked` | Blocked | Requires human intervention (issue occurred) |
| `auto-execute` | Auto-execution opt-in | Must have this label for auto-execution |

### Rules

1. **Always only 1 state**: Replacement method (remove → add)
2. **created/ready/done don't need labels**: Distinguished by Draft status and Merged status
3. **Auto-execution condition**: Both `state:queued` + `auto-execute` must be satisfied
4. **Prevent duplicate execution**: Don't execute if `state:executing` exists

### Query Examples

```bash
# Queued PRs (auto-execution targets)
gh pr list --label "state:queued" --label "auto-execute" --draft

# Blocked PRs (require human intervention)
gh pr list --label "state:blocked"

# PRs in progress
gh pr list --label "state:executing"

# All dev workflow PRs
gh pr list --label "state:queued,state:executing,state:blocked"

# All PRs opted into auto-execution
gh pr list --label "auto-execute"
```

### Label Verification and Creation

Before using labels, verify they exist in the repository and create them if they don't.

#### Required Labels

| Label | Color | Description |
|-------|-------|-------------|
| `state:queued` | `#0E8A16` (green) | PR queued for auto-execution |
| `state:executing` | `#1D76DB` (blue) | PR currently being executed |
| `state:blocked` | `#D93F0B` (red) | PR blocked, needs human intervention |
| `auto-execute` | `#5319E7` (purple) | Opt-in for automatic execution |

#### Label Existence Check

```bash
# Check if specific label exists
gh label list --json name -q '.[].name' | grep -q "^state:queued$" && echo "exists" || echo "not found"

# Check all state: labels
gh label list --json name -q '.[].name' | grep "^state:"
```

#### Label Creation

```bash
# Create state:queued
gh label create "state:queued" --color "0E8A16" --description "PR queued for auto-execution"

# Create state:executing
gh label create "state:executing" --color "1D76DB" --description "PR currently being executed"

# Create state:blocked
gh label create "state:blocked" --color "D93F0B" --description "PR blocked, needs human intervention"

# Create auto-execute
gh label create "auto-execute" --color "5319E7" --description "Opt-in for automatic execution"
```

#### Automation: Check and Create If Missing

```bash
# Function definition
ensure_label() {
  local name="$1"
  local color="$2"
  local desc="$3"

  if ! gh label list --json name -q '.[].name' | grep -q "^${name}$"; then
    echo "Creating label: $name"
    gh label create "$name" --color "$color" --description "$desc"
  else
    echo "Label exists: $name"
  fi
}

# Check/create all required labels
ensure_label "state:queued" "0E8A16" "PR queued for auto-execution"
ensure_label "state:executing" "1D76DB" "PR currently being executed"
ensure_label "state:blocked" "D93F0B" "PR blocked, needs human intervention"
ensure_label "auto-execute" "5319E7" "Opt-in for automatic execution"
```

---

## Auto-Execute Label

### Purpose

Explicit label for auto-execution opt-in. `state:queued` alone doesn't trigger auto-execution.

### Why a Separate Label?

- **Prevent mistakes**: `state:queued` alone won't auto-execute
- **Explicit opt-in**: Add `auto-execute` only when auto-execution is desired
- **GitHub App limitation**: Bots can't be assigned as assignees, use labels instead

### Usage Examples

```bash
# Add to auto-execution queue (manual execution also possible)
gh pr edit $PR --add-label "state:queued"

# Auto-execution opt-in (remote worker will execute automatically)
gh pr edit $PR --add-label "state:queued" --add-label "auto-execute"

# Auto-execution opt-out (manual execution only)
gh pr edit $PR --remove-label "auto-execute"
```

---

## Body (YAML Frontmatter)

### Purpose

Store static metadata. Only information that doesn't change frequently.

### Why YAML Frontmatter?

1. **Easy parsing**: Easy to read with standard YAML parser
2. **Extensibility**: Free to add fields
3. **Readability**: Easy for humans to read
4. **Compatibility**: Same format as static site generators like Jekyll, Hugo

### Template Structure

```markdown
---
spec: .dev/specs/<name>
---

## Summary

<1-3 sentence work summary>

## Spec Reference

→ [PLAN.md](./.dev/specs/<name>/PLAN.md)
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|------|
| `spec` | string | ✅ | Spec folder path |

### Body Sections

| Section | Description |
|---------|------|
| **Summary** | 1-3 sentence summary of spec's core content |
| **Spec Reference** | Link to spec file |

### Parsing

```bash
# Extract spec path with sed
gh pr view $PR --json body -q '.body' | \
  sed -n '/^---$/,/^---$/p' | \
  grep '^spec:' | \
  sed 's/spec: //'

# Parse with yq (more stable)
gh pr view $PR --json body -q '.body' > /tmp/pr-body.md
sed -n '2,/^---$/p' /tmp/pr-body.md | head -n -1 | yq -r '.spec'
```

---

## Comments (History)

### Purpose

Record all state change history in append-only manner.

### Rules

1. **Append-only**: Add only, no modification/deletion
2. **Auto-record**: Automatically add on all state changes
3. **For debugging**: Track history when issues occur

---

### Comment Templates

> **Note**: Time and Author are automatically recorded by GitHub, so omitted.
> **Run** is added to identify execution environment (GitHub Actions → run URL, local → hostname).

---

#### 1. Created

**When to use**: When PR is created

```markdown
### 🤖 Created

**State**: `none` → `created`
**Run**: <run-info>

PR created for spec: <spec-path>
```

---

#### 2. Queued

**When to use**: When adding PR to queue (`/dev.state queue`)

```markdown
### 🤖 Queued

**State**: `created` → `queued`
**Run**: <run-info>

PR queued for auto-execution.
```

---

#### 3. Continued

**When to use**: When unblocking and resuming

```markdown
### 🤖 Continued

**State**: `blocked` → `<queued|executing>`
**Run**: <run-info>

Resuming after: <previous blocked reason summary>
```

---

#### 4. Execution Started

```markdown
### 🤖 Execution Started

**Plan**: <spec path>
**Run**: <run-info>
```

---

#### 5. Blocked

**When to use**: When blocking occurs during execution (automatic pause)

```markdown
### 🚨 Blocked

**Run**: <run-info>
**Reason**: <specific failure details>
**Failed at**: TODO #<N> - <task title>
**Retry count**: <n>/3

Next steps:
1. After fixing the issue, re-run `/dev.execute <PR#>`
2. Or `/dev.state continue <PR#>`
```

---

#### 6. Execution Complete

**When to use**: When all TODOs are completed

```markdown
### 🤖 Execution Complete

**Plan**: <spec path>
**Tasks**: <completed>/<total>
**Run**: <run-info>
```

---

#### 7. Published

**When to use**: When converting PR to Ready

```markdown
### 🤖 Published

**Run**: <run-info>

PR is now ready for review.
```

---

### Field Descriptions

| Field | Format | Description |
|------|------|------|
| `Run` | URL or hostname | GitHub Actions → run URL, local → hostname |
| `State` | `` `from` → `to` `` | Display wrapped in backticks |
| `Reason` | Free format | Required for pause/blocked |
| `Plan` | Path | `.dev/specs/<name>/PLAN.md` |

---

## Draft

### Purpose

Express "work completion status" as simple boolean.

### Rules

| Draft | Meaning | Corresponding States |
|-------|------|-----------|
| `true` | In progress | created, queued, executing, blocked |
| `false` | Awaiting review | ready |

### CLI

```bash
# Remove Draft (transition to ready state)
gh pr ready $PR

# Check Draft status
gh pr view $PR --json isDraft -q '.isDraft'
```

---

## State Machine

### State Definitions

| State | Draft | Label | auto-execute | Description |
|------|-------|-------|--------------|------|
| **created** | ✓ | (none) | optional | Right after PR creation |
| **queued** | ✓ | `state:queued` | ✓ (for auto-execution) | Auto-execution queue |
| **executing** | ✓ | `state:executing` | (retained) | Implementation in progress |
| **blocked** | ✓ | `state:blocked` | (retained) | Issue occurred, requires human intervention |
| **ready** | ✗ | (none) | (retained) | Implementation complete, awaiting review |
| **done** | - | - | - | Merged, work complete |

### State Diagram

```
                         ┌──────────────┐
                         │   created    │
                         │              │
                         │  Draft PR    │
                         │  no label    │
                         └──────┬───────┘
                                │
               ┌────────────────┴────────────────┐
               │                                 │
               ▼                                 │
        ┌──────────────┐                         │
        │   queued     │                         │
        │              │                         │
        │ state:queued │                         │
        │ +auto-execute│ (for auto-execution)    │
        └──────┬───────┘                         │
               │                                 │
               └────────────────┬────────────────┘
                                │
                                ▼
                         ┌──────────────┐
              ┌──────────│  executing   │──────────┐
              │          │              │          │
              │          │ state:       │          │
              │          │ executing    │          │
              │          └──────────────┘          │
              │                                    │
              ▼                                    ▼
       ┌──────────────┐                     ┌──────────────┐
       │   blocked    │                     │    ready     │
       │              │                     │              │
       │ state:blocked│                     │  Not Draft   │
       │              │                     │  no label    │
       └──────┬───────┘                     └──────┬───────┘
              │                                    │
              │                                    ▼
              │                             ┌──────────────┐
              │                             │    done      │
              │                             │   (Merged)   │
              │                             └──────────────┘
              │
              └─────────────────► queued or executing
```

### Transition Paths

| From | To | Description |
|------|----|------|
| created | queued | Add to auto-execution queue |
| created | executing | Direct execution |
| queued | executing | Start execution |
| executing | blocked | Stopped due to issue |
| executing | ready | Work complete |
| blocked | queued | Resume (to queue) |
| blocked | executing | Resume (direct execution) |
| ready | done | PR merged |

### State Transition Methods

**Recommended: Use `/dev.state` skill**

Don't manipulate Labels/Draft directly, use `/dev.state` skill:

| Transition | Command |
|------|--------|
| created → queued | `/dev.state queue <PR#>` |
| created/queued → executing | `/dev.state begin <PR#>` |
| executing → blocked | `/dev.state pause <PR#> "<reason>"` |
| blocked → queued | `/dev.state continue <PR#>` |
| blocked → executing | `/dev.state continue <PR#> --run` |
| executing → ready | `/dev.state complete <PR#>` |

This ensures:
- Consistent state management
- Automatic Comment recording
- Error handling included

---

## Auto-Execution Conditions

For daemon to auto-execute a PR, **all conditions** must be satisfied:

```bash
gh pr list \
  --label "state:queued" \
  --label "auto-execute" \
  --draft
```

1. `Label = state:queued` (in queue)
2. `Label = auto-execute` (auto-execution opt-in)
3. `Draft = true` (in-progress state)
4. `Label != state:executing` (not already executing)

### Why Multiple Conditions?

- **state:queued only**: Manual queue could also auto-execute (unintended execution)
- **Adding auto-execute**: Prevent mistakes with explicit opt-in
- **Check state:executing**: Prevent duplicate execution

---

## CLI Reference

### Label Manipulation

```bash
# Add label
gh pr edit $PR --add-label "state:queued"

# Replace label (remove → add)
gh pr edit $PR --remove-label "state:queued" --add-label "state:executing"

# Remove label
gh pr edit $PR --remove-label "state:executing"
```

### Auto-execute Manipulation

```bash
# Auto-execution opt-in
gh pr edit $PR --add-label "auto-execute"

# Auto-execution opt-out
gh pr edit $PR --remove-label "auto-execute"
```

### Draft Manipulation

```bash
# Remove Draft
gh pr ready $PR

# Check Draft status
gh pr view $PR --json isDraft -q '.isDraft'
```
