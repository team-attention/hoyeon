# Draft Template

> Reference document for draft file structure during Interview Mode.

---

## File Location

`.dev/specs/{name}/DRAFT.md`

---

## Structure

```markdown
# Draft: {name}

## Intent Classification
- **Type**: [Refactoring|New Feature|Bug Fix|Architecture|Research|Migration|Performance]
- **Strategy**: [Applied strategy based on type]

## Current Understanding
- [What we know so far]
- [Key decisions made]
- [Constraints identified]

## Open Questions
- [Unresolved items]
- [Pending clarifications]

## Exploration Results
- [Findings from background Explore agents]
- [Code patterns discovered]
- [Relevant files identified]

## Tentative Approach
- [Current thinking, subject to change]
- [Possible implementation direction]
```

---

## Field Descriptions

### Intent Classification

Identify the task type from these categories:

| Intent Type | Keywords | Strategy |
|-------------|----------|----------|
| **Refactoring** | "리팩토링", "정리", "개선", "migrate" | Safety first, regression prevention |
| **New Feature** | "추가", "새로운", "구현", "add" | Pattern exploration, integration points |
| **Bug Fix** | "버그", "오류", "안됨", "fix" | Reproduce → Root cause → Fix |
| **Architecture** | "설계", "구조", "아키텍처" | Trade-off analysis, oracle consultation |
| **Research** | "조사", "분석", "이해", "파악" | Investigation only, NO implementation |
| **Migration** | "마이그레이션", "업그레이드", "전환" | Phased approach, rollback plan |
| **Performance** | "성능", "최적화", "느림" | Measure first, profile → optimize |

### Current Understanding

What has been established through conversation:
- User's goals and constraints
- Technical requirements
- Scope boundaries

### Open Questions

Items that need clarification before plan generation:
- Ambiguous requirements
- Technical choices pending
- Scope decisions

### Exploration Results

Findings from background agents:
- Relevant code patterns
- Existing implementations
- File references

### Tentative Approach

Current direction (may change):
- Preliminary design thoughts
- Potential implementation strategy
- Trade-offs being considered

---

## Usage

1. Create draft when user describes a task
2. Update after each user response
3. Update when background tasks complete
4. Delete after plan is approved
