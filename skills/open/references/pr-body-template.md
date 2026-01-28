# PR Body Template

## Overview

PR body contains work summary and Spec reference. Written in simple markdown format.

## Template Structure

```markdown
## Summary

<1-3 sentence work summary>

## Spec Reference

→ [.dev/specs/<name>/PLAN.md](.dev/specs/<name>/PLAN.md)

## Checklist

- [ ] Spec reviewed
- [ ] Implementation complete
- [ ] Tests passing
```

## Sections

### Summary
Summarize Spec's core content in 1-3 sentences.

### Spec Reference
Markdown link to Spec file. Click to view spec directly.

### Checklist
Basic checklist. Can be extended as needed.

## Example

### Input: `.dev/specs/user-auth/PLAN.md`

```markdown
# User Authentication

> Implement user authentication. Handle login/logout with JWT.
```

### Output: PR Body

```markdown
## Summary

Implement user authentication. Handle login/logout with JWT.

## Spec Reference

→ [.dev/specs/user-auth/PLAN.md](.dev/specs/user-auth/PLAN.md)

## Checklist

- [ ] Spec reviewed
- [ ] Implementation complete
- [ ] Tests passing
```

## Spec Path Parsing

```bash
# Extract path from Spec Reference link
gh pr view $PR_NUMBER --json body -q '.body' | grep -oP '(?<=→ \[)[^\]]+'
# Result: .dev/specs/user-auth/PLAN.md
```

## Metadata Management

| Info | Location | Query Method |
|------|----------|----------|
| State | Labels | `gh pr view --json labels` |
| Tags | Labels | `gh pr view --json labels` |
| Author | PR metadata | `gh pr view --json author` |
| Created | PR metadata | `gh pr view --json createdAt` |
