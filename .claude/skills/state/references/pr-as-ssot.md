# PR as Single Source of Truth

## Overview

**PR = Single Source of Truth** - All work states are recorded in the PR.

### Role of PR

| Role | Description |
|------|------|
| **Container for Implementation** | Contains all code changes for a single spec |
| **State Storage** | PR itself stores state without external DB |
| **History Tracking** | All state changes recorded as Comments |
| **Collaboration Hub** | Reviews, discussions, approvals happen in PR |

### Core Principles

```
1 Spec = 1 PR = 1 Branch
PR = Single Source of Truth
Commands = Environment-Agnostic
Auto-execution = Optional Layer
```

### Lifecycle

```
Spec → PR → Implementation → Complete → Merge
         │
         ▼
  created → queued → executing → ready
                 ↓
              blocked
```

---

## Branch Naming

```
feat/<spec-name>
```

---

## Labels

| Label | Meaning |
|-------|------|
| `state:queued` | In auto-execution queue |
| `state:executing` | Implementation in progress |
| `state:blocked` | Human intervention needed |
| `auto-execute` | Auto-execute opt-in |

### Rules

1. Only one state at a time (replace method)
2. Auto-execute needs both `state:queued` + `auto-execute`

---

## State Machine

| State | Draft | Label |
|------|-------|-------|
| created | ✓ | (none) |
| queued | ✓ | `state:queued` |
| executing | ✓ | `state:executing` |
| blocked | ✓ | `state:blocked` |
| ready | ✗ | (none) |

### Transitions

| From | To | Command |
|------|----|--------|
| created → queued | `/dev.state queue <PR#>` |
| → executing | `/dev.state begin <PR#>` |
| executing → blocked | `/dev.state pause <PR#>` |
| blocked → queued | `/dev.state continue <PR#>` |
| executing → ready | `/dev.state complete <PR#>` |

---

## Comment Templates

### Execution Started
```markdown
### 🤖 Execution Started
**Plan**: <spec path>
**Run**: <run-info>
```

### Blocked
```markdown
### 🚨 Blocked
**Run**: <run-info>
**Reason**: <failure details>
**Failed at**: TODO #<N>
```

### Published
```markdown
### 🤖 Published
**Run**: <run-info>
PR is now ready for review.
```

---

## CLI Reference

```bash
# Label
gh pr edit $PR --add-label "state:queued"
gh pr edit $PR --remove-label "state:queued" --add-label "state:executing"

# Draft
gh pr ready $PR
gh pr view $PR --json isDraft -q '.isDraft'
```
