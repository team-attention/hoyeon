# DRAFT: {feature_name}

## Meta

- **Intent:** {intent_type}
- **Depth:** {depth}
- **Interaction:** {interaction}
- **Created:** {timestamp}

---

## What & Why

### Problem
{What problem are we solving?}

### Solution
{High-level approach}

### Why Now
{Why is this needed now?}

---

## Agent Findings

### Patterns
{Discovered patterns from Explore - file:line format}

- `src/path/file.ts:10-25` - Description of pattern

### Structure
{Project structure relevant to this feature}

```
src/
├── services/
├── middleware/
└── routes/
```

### Project Commands
{Available commands for build/test/lint}

- `npm test` - Run tests
- `npm run lint` - Run linter
- `npm run build` - Build project

### Documentation
{Relevant ADRs, READMEs, conventions}

- `docs/architecture.md:15-40` - Relevant decision
- `CONTRIBUTING.md:22` - Convention to follow

### UX Review
{From ux-reviewer agent - standard/thorough only}

- Current flow: ...
- Impact: ...
- Concerns: ...

---

## Open Questions

### Critical
{Must resolve before plan}

- [ ] Question 1?
- [ ] Question 2?

### Nice to Have
{Can proceed without}

- [ ] Optional question?

---

## User Decisions

| Question | Decision | Notes |
|----------|----------|-------|
| | | |

---

## Boundaries

### Must Do
- ...

### Must NOT Do
- ...

### Out of Scope
- ...

---

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

---

## Direction

### Approach
{High-level strategy - filled during interview}

### Work Breakdown
{Rough TODO structure - filled during interview}

1. Step 1 → outputs: `output_name`
2. Step 2 → depends on: Step 1
3. Step 3 → depends on: Step 2

---

## Assumptions (autopilot/quick mode)

| Decision | Assumption | Rationale |
|----------|------------|-----------|
| Tech choice | {choice} | {why} |
| File location | {path} | {why} |
| Error handling | {approach} | {why} |

> ⚠️ 이 가정들이 틀리면 알려주세요.
