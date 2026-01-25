---
name: dev.state
description: |
  "/dev.state", "dev.state", "PR state", "state change", "queue", "pause", "continue", "status", "list"
  Unified PR state management skill - queue, pause, resume, status check, list
allowed-tools:
  - Bash
  - Read
  - Glob
context: fork
---

# dev.state - PR State Management

## Purpose

Unified skill for managing PR state. Handles queue, pause, resume, status check, list in one skill.

---

## Required Reference

**Must read `${baseDir}/references/pr-as-ssot.md` before execution.**

---

## Input

```
/dev.state <action> [PR#] [options]

actions:
  queue <PR#>                  # Add to queue
  begin <PR#>                  # Start execution
  pause <PR#> <reason>         # Block
  continue <PR#> [--run]       # Resume (--run: execute immediately)
  complete <PR#>               # Complete → ready
  status [PR#]                 # Check status (current branch if omitted)
  list [--queued|--executing|--blocked|--all]  # List
```

---

## Actions

### queue
**Transition**: `created → queued`
Add `state:queued` label, record "Queued" comment.

### begin
**Transition**: `created/queued → executing`
Check duplicate execution, add `state:executing` label.

### pause
**Transition**: `executing → blocked`
Add `state:blocked` label, record reason.

### continue
**Transition**: `blocked → queued` (or `→ executing` with --run)

### complete
**Transition**: `executing → ready`
Remove label, convert Draft to Ready.

### status
Check PR status. Auto-detect from current branch if PR# omitted.

### list
List PRs by state filter.

---

## Error Handling

| Action | Error | Message |
|--------|-------|--------|
| queue | Already has state label | "Not in 'created' state" |
| begin | Already executing | "Already executing" |
| begin | Blocked | "PR is blocked - use 'continue' first" |
| pause | Not executing | "Not executing - nothing to pause" |
| continue | Not blocked | "Not blocked - nothing to continue" |
