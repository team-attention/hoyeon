---
name: dev.publish
description: |
  "/dev.publish", "publish PR", "PR ready", "publish PR", "remove Draft"
  Convert Draft PR to Ready for review
allowed-tools:
  - Bash
  - Read
  - Glob
---

# dev.publish - PR Ready Processing

## Purpose

Convert Draft PR to Ready state for review.

---

## Input

| Input | Action |
|-------|------|
| `/dev.publish` | Auto-detect PR from current branch |
| `/dev.publish 123` | Publish PR #123 |
| `/dev.publish <PR URL>` | Extract PR# from URL |

---

## Execution Conditions

- PR must be in `state:executing` state
- If `state:blocked` → Run `/dev.state continue` first
- Error if already Ready

**State verification**: Check with `/dev.state status`

---

## Workflow

### STEP 1: Check PR Info

1. Parse argument (find PR from current branch if none)
2. Check current state with `/dev.state status <PR#>`

### STEP 2: Validate State

| Condition | Result |
|------|------|
| `state:executing` | ✅ Proceed |
| `state:blocked` | ❌ "Run '/dev.state continue' first" |
| No label (created) | ❌ "Not executed yet" |
| isDraft = false | ❌ "Already published" |

### STEP 3: Execute Publish

**Call `/dev.state complete <PR#>`:**
- Remove `state:executing` label
- Convert Draft → Ready
- Record "Published" comment

### STEP 4: Output Result

**Success**:
```
✅ PR #123 published successfully
   URL: https://github.com/owner/repo/pull/123
   Status: Ready for review
```

---

## Error Handling

| Error | Message |
|-------|--------|
| No PR | "No PR found for current branch" |
| Created state | "Run '/dev.execute {PR#}' first" |
| Blocked state | "Run '/dev.state continue {PR#}' first" |
| Already ready | "Already published (not a draft)" |

---

## State Transition

```
executing → ready  (via /dev.state complete)
```

**Note**: From `blocked`, first transition to `executing` with `/dev.state continue`
