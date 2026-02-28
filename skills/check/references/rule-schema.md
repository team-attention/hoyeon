# Rule File Schema

## File Location

```
.dev/rules/*.md
```

Each file is a Markdown document with YAML frontmatter.

## Frontmatter Schema

### Level 0 (Required — Phase 1)

```yaml
---
triggers:
  - "**/billing/**"
  - "apps/client/src/**/Pricing*"
---
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `triggers` | `string[]` | Yes | Glob patterns matched against changed file paths (from `git diff --name-only`). At least one must match for the rule to activate. Use `**/` prefix for patterns that should match at any depth. |

> **Phase 1**: Only `triggers` is read. `keywords` and `depends_on` are ignored even if present.

### Level 1 (Optional — Phase 2)

```yaml
---
triggers:
  - "**/billing/**"
keywords:
  - "billing"
  - "payment"
depends_on:
  - "ux"
  - "infra"
---
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keywords` | `string[]` | No | Domain keywords for semantic matching (when triggers alone aren't sufficient). Phase 2 only. |
| `depends_on` | `string[]` | No | Other rule names that should also be checked when this rule triggers. Phase 2 only. |

## Body Format

The body contains natural-language verification rules organized in Markdown sections:

```markdown
# {Domain} Checklist

> One-line principle or policy doc link

{When to use this checklist}:

## Section Name
- **Item name** — Description of what to verify and why
- **Another item** — With specific things to check listed
```

Rules can be written in any language — they are project-specific content.

### Authoring Principles

Rules are a tool for **catching cascading effects of changes**. They encode "if you change X, also verify Y" so you don't have to read all the code to know.

#### Right Level of Detail

Items should specify **what to verify**, not which code line to check. Verify policies and rules, not specific code locations.

| Level | Example | Verdict |
|-------|---------|---------|
| Too abstract | "Check if UI is correct" | X — What to check, how? |
| Right level | "CTA button text matches policy for each plan state (Free/Trial/Pro)" | O |
| Too detailed | "Check `PlanSection.tsx:138` variable `ctaButton` for `isTrial && isOverLimit` branch" | X — Breaks when code changes |

#### Good Item Criteria

1. **Sync targets are explicit** — "These 5 places must have matching values" with the places listed
2. **Includes why in one line** — "If one is missing, works locally but breaks in production" helps AI judge severity
3. **Verifiable** — Clear PASS/FAIL condition. "Write good code" is not verifiable

#### Maintenance

- Update rules when policies or architecture change
- If a rule breaks due to code refactoring (file/function renames), the rule was too detailed
- When adding new rules, check that triggers don't excessively overlap with existing rules

## Trigger Pattern Syntax

Triggers use glob patterns relative to the project root:

| Pattern | Matches | Notes |
|---------|---------|-------|
| `**/billing/**` | Any file under any `billing/` dir recursively | Use `**/` for monorepo paths |
| `apps/client/src/**/*.tsx` | All `.tsx` files under client src | Full path prefix when scope is known |
| `**/*.controller.ts` | Controller files at any depth | `**/` required for bare filenames |
| `terraform/**` | Files under `terraform/` recursively | Already at project root, no `**/` needed |
| `**/Dockerfile*` | `Dockerfile`, `Dockerfile.server`, etc. | `**/` ensures match at any depth |

> **Important**: `git diff --name-only` returns repo-relative paths like `apps/server/src/modules/billing/billing.service.ts`. A trigger `billing/**` would NOT match this path — it only matches if the path starts with `billing/`. Use `**/billing/**` to match `billing/` at any depth in the path.

## Subagent Prompt Template

When a rule matches, the /check skill constructs this prompt for each subagent:

```
You are a change verification agent. Your job is to check whether a code diff
follows the rules defined below.

## Rules to verify

{full content of the .dev/rules/{name}.md file, including frontmatter}

## Changed files that triggered this rule

{list of matched file paths}

## Diff

{git diff output for matched files only}

## Instructions

For EACH checklist item in the rules above:
1. Check if the diff is relevant to this item
2. If relevant: verify whether the diff follows the rule → PASS or WARN
3. If not relevant: mark as NA

Return ONLY a JSON array (no markdown fences, no explanation outside JSON):
[
  {
    "section": "Section name from the rule",
    "item": "Brief item summary (max 15 words)",
    "status": "PASS" | "WARN" | "NA",
    "reason": "1-2 sentence explanation of your judgment"
  }
]

IMPORTANT:
- Be specific in reasons. "Looks fine" is not acceptable for PASS. State WHAT you verified.
- For WARN, explain exactly what is missing or wrong.
- For NA, a brief "Not relevant to this diff" suffices.
- Do NOT invent issues. Only WARN on things you can actually see in the diff or deduce from missing changes.
```

## Migration from .docs/checklists/

When converting from the legacy checklist format:

1. Take the trigger patterns from the CLAUDE.md pattern mapping table
2. Copy the checklist body as-is
3. Add `keywords` from `.dev/impact-map.yml` domains (commented out for Phase 2)
4. Place in `.dev/rules/{name}.md`

Example:
```
.docs/checklists/core/billing.md  →  .dev/rules/billing.md
```

The pattern mapping table entries become `triggers` (with `**/` prefix for monorepo compatibility):
```
"billing/" → triggers: ["**/billing/**"]
```
