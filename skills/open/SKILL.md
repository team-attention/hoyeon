---
name: open
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

Create Draft PR from a `/specify` plan. The PR body references PLAN.md and summarizes objectives from `plan-content.json`.

---

## Reference

- **PR Body template**: `${baseDir}/references/pr-body-template.md`

---

## Input

| Input | Action |
|-------|--------|
| `/open user-auth` | Create PR from `.dev/specs/user-auth/` |
| `/open` | Use most recent spec or ask user |

---

## Prerequisites

1. Spec directory exists: `.dev/specs/{name}/`
2. Plan file exists: `.dev/specs/{name}/PLAN.md`
3. Plan content exists: `.dev/specs/{name}/plan-content.json`
4. `gh` CLI authenticated: `gh auth status`

---

## Workflow

### Step 1: Resolve Spec

```
1. If {name} given → specDir = .dev/specs/{name}/
2. If no {name} → scan .dev/specs/*/PLAN.md, pick most recently modified
3. Verify PLAN.md exists in specDir
4. Verify plan-content.json exists in specDir
5. If missing → Error: "Spec not found. Run '/specify {name}' first."
```

### Step 2: Check Existing PR

```
gh pr list --head "feat/{name}" --json number -q '.[0].number'
If PR exists → Error: "PR #N already exists for feat/{name}"
```

### Step 3: Read Plan for PR Body

```
1. Read plan-content.json → extract objectives.core for summary
2. Read PLAN.md path for spec reference link
3. Read ${baseDir}/references/pr-body-template.md for template structure
4. Compose PR body from template
```

### Step 4: Create Branch and Draft PR

```
1. git checkout -b feat/{name}
2. git push -u origin feat/{name}
3. gh pr create --draft \
     --title "{title from objectives.core}" \
     --body "{composed PR body}" \
     --base develop
```

> **Base branch**: Use `develop` (per project git branching convention). If `develop` doesn't exist, fall back to `main`.

---

## Output

**Success**:
```
✅ PR #123 created (Draft)
   Branch: feat/{name}
   View: gh pr view 123 --web
```

**Failure**:
```
Error: Spec not found at .dev/specs/{name}/PLAN.md
       Run '/specify {name}' first.
```

---

## Related Commands

| Command | Description |
|---------|-------------|
| `/specify {name}` | Generate plan (run before open) |
| `/execute {name}` or `/execute #{PR}` | Start implementation |
| `/state queue #{PR}` | Add to auto-execution queue |
