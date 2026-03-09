# Rule Authoring Principles

## Purpose

Rules are **tools for catching cascading impacts of changes**. They encode the knowledge of "if you change this, you must also check that" — without requiring anyone to read through the code every time.

## Structure

Each rule file lives in the `.dev/rules/` directory. It declares graph edges via YAML frontmatter and contains checklist content in the markdown body.

```yaml
---
category:      # Classification (domain | concern | pipeline)
  domain
triggers:      # File glob patterns that activate this rule (required)
  - "apps/client/src/**/*.tsx"
depends_on:    # Other rules to check alongside this one (optional)
  - term
agents:        # Automated verification agents (optional)
  - analytics-auditor
commands:      # Commands to run (optional)
  - "pnpm generate:api"
---

# Checklist content (markdown)
```

### Execution Flow

```
git diff -> collect changed files
  -> glob-match against rules/*.md frontmatter triggers
  -> select active rules
  -> follow depends_on to add related rules
  -> verify per-rule checklists
  -> run agents field agents
  -> surface commands field commands
```

## Right Level of Abstraction

Checklist items should be at the **"what to verify"** level.

| Level | Example | Verdict |
|-------|---------|---------|
| Too abstract | "Check if UI is correct" | X — verify what exactly? |
| Just right | "CTA button text matches policy for each plan state (Free/Trial/Pro)" | O |
| Too specific | "Check `ctaButton` var at `PlanSection.tsx:138` for `isTrial && isOverLimit` branch" | X — breaks when code changes |

**Principle: Verify policies and rules, not specific lines of code.**

## Qualities of a Good Checklist Item

1. **Sync targets are explicit** — "Values in 5 scattered locations must match" with each location named
2. **Brief rationale** — A one-line reason such as "if any is missed, works locally but breaks in production"
3. **Verifiable** — Clear what to do to check the box. "Ensure good code quality" is not verifiable

## Frontmatter Guide

### category — Rule Classification

The `category` field declares what kind of concern a rule addresses.

| Value | Definition | Examples |
|-------|-----------|----------|
| `domain` | Invariants valid only within a specific business domain. Cross-cutting concerns should be delegated via `depends_on` | billing, digest, scheduling |
| `concern` | Cross-cutting patterns applied regardless of domain (performance, infra, UX, etc.) | performance, infra, ux, term |
| `pipeline` | File change -> command execution automation. Declares only `commands`, no checklist body | api-codegen |

**depends_on direction rules:**

- `domain -> concern` **allowed** — domain rules may reference cross-cutting concerns
- `domain -> pipeline` **allowed** — domain changes may trigger pipeline commands
- `concern -> domain` **forbidden** — cross-cutting patterns must not couple to specific domains, or reusability breaks

**Keep domain rules LEAN:**

Do not duplicate cross-cutting concern content in domain rule bodies. Use `depends_on` to reference the relevant concern rule instead. Duplication creates coupling — when the concern rule updates, the domain rule must also be modified.

```yaml
# Bad: billing.md directly includes infra checklist items
---
category: domain
triggers:
  - "**/billing/**"
---
- [ ] Added env block to terraform config  # <- belongs in infra.md

# Good: delegate via depends_on
---
category: domain
triggers:
  - "**/billing/**"
depends_on:
  - infra
---
- [ ] If new env vars added, check infra rule
```

### triggers — When This Rule Activates

**Principle: Start narrow, widen only when misses are discovered.**

| Pattern | Scope | Good for |
|---------|-------|----------|
| `"apps/server/src/**/*.dto.ts"` | Specific app, specific file type | Clearly scoped domains |
| `"**/billing/**"` | All apps, billing directory | Cross-app domains |
| `"apps/client/src/**/*.tsx"` | One app, broad scope | App-wide concerns (UI) |

- Patterns starting with `**` match across all apps — verify this is intentional
- Too broad: unnecessary rules activate on every change (noise)
- Too narrow: new files slip through without rule coverage

### depends_on — Rules to Check Alongside

**Principle: "When checking A, would skipping B cause a miss?" — if yes, add the dependency.**

- Circular dependencies are forbidden (A->B->A)
- Only 1-depth resolution — if A->B->C, activating A adds B but not C

### agents — Automated Verification for Repetitive Patterns

**"If someone is running the same grep check every time, turn it into an agent."**

- Agents are defined by name in the project's `.claude/agents/` directory
- Report-only agents (no code modifications) are the best fit

### commands — Commands to Execute

**"When a file change always requires running a specific command."**

- Best suited for deterministic commands: code generation, migration creation, type regeneration

## Adding / Modifying Rules

- **Filename**: lowercase kebab-case, singular domain name (`billing.md`, `api-codegen.md`)
- **`triggers` is required** — rules without triggers are never matched
- Organize sections by concern (policy, UI, tests, infra, etc.)
- If 3 or fewer items, a flat list without sections is acceptable
- Link related policy documents at the top of the file

## Maintenance

- Update rules when policies or architecture change
- If a checklist item breaks due to code refactoring (file renames, function renames), the item was too specific
