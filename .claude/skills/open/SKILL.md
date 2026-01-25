---
name: dev.open
description: |
  "dev.open", "create PR", "open PR", "create PR from spec", "Draft PR creation"
  Spec-based Draft PR creation. Starting point for SDD (Spec Driven Development) workflow.
allowed-tools:
  - Bash
  - Read
  - Glob
---

# dev.open - Spec-based Draft PR Creation

## Purpose

Create Draft PR based on Spec document. Following **PR = Single Source of Truth** principle, PR becomes the center of all work state.

---

## Reference

- **PR Body template**: `${baseDir}/references/pr-body-template.md`

---

## Input

| Input | Action |
|-------|------|
| `/open user-auth` | Create PR based on `specs/user-auth.md` |
| `/open` | Use most recent spec or ask user |

---

## Prerequisites

1. Spec file exists: `specs/<name>.md`
2. gh CLI authenticated: `gh auth status`

---

## Workflow

### Step 1: Verify Spec Exists
```
Check if specs/<name>.md exists
If not → Error: "Spec not found. Run '/specify <name>' first."
```

### Step 2: Check Existing PR
```
Check if PR exists for feat/<name> branch
If exists → Error: "PR already exists for feat/<name>"
```

### Step 3: Create and Push Branch
```
Create feat/<name> branch from main → Push to remote
```

### Step 4: Create Draft PR
Reference `pr-body-template.md` to create Draft PR.

---

## Output

**Success**:
```
✅ PR #123 created successfully
   View: gh pr view 123 --web
```

**Failure**:
```
Error: Spec not found at specs/user-auth.md
```

---

## Related Commands

| Command | Description |
|---------|------|
| `/specify <name>` | Write Spec document (run before open) |
| `/state queue <PR#>` | Add to auto-execution queue |
| `/execute <PR#>` | Start implementation |
