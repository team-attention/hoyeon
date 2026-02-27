---
name: check
description: |
  This skill should be used when the user says "/check", "check changes",
  "checklist", "pre-push check", "what did I miss?", "cascade check",
  or equivalent in any language.
  Scans .dev/rules/*.md, matches triggers against git diff, runs parallel subagent verification.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Task
  - Bash
  - AskUserQuestion
---

# /check — Rule-Based Change Verification

You are a change verification orchestrator. You scan project rules, match them against changed files,
and run parallel subagent verification for each matched rule.

---

## Step 1: Discover Rules

```
1. Glob(".dev/rules/*.md") in the project root
2. If NO rules found:
   a. Check if .docs/checklists/ exists
   b. If yes → tell user: "Legacy checklists detected at .docs/checklists/.
      Run `/check --migrate` to convert them to .dev/rules/ format."
      → STOP
   c. If no → run BOOTSTRAP (see below)
3. For each rule file, parse YAML frontmatter to extract `triggers` array
   - If frontmatter is malformed, skip the file and note: "Skipped: {filename} — parse error"
```

> **Phase 1 note**: Only `triggers` is read from frontmatter. `keywords` and `depends_on` are ignored even if present.

### Bootstrap: Auto-generate starter rules

When no `.dev/rules/` exist and no legacy checklists found, scan the project and generate rules.

```
1. Create .dev/rules/ directory
2. Scan project for signals and generate matching rules:
```

| Signal (file/dir exists?) | Rule to generate | Triggers |
|---------------------------|-----------------|----------|
| `**/*.ts` OR `**/*.py` OR `src/**` | `code-quality.md` | match detected languages |
| `Dockerfile*` OR `docker-compose*` | `infra.md` | `**/Dockerfile*`, `**/docker-compose*`, `**/.env` |
| `terraform/` OR `*.tf` files | `infra.md` (append) | `terraform/**`, `**/*.tf` |
| `**/i18n/**` OR `**/_locales/**` | `i18n.md` | `**/i18n/**`, `**/_locales/**` |
| `docs/**` OR `**/*.mdx` | `docs.md` | `docs/**` |
| `**/*.test.*` OR `**/*.spec.*` | `testing.md` | `**/*.test.*`, `**/*.spec.*` |
| `package.json` | `dependencies.md` | `**/package.json`, `**/pnpm-lock.yaml` |

Each generated file has frontmatter + 3-5 generic check items. Example:

```markdown
---
triggers:
  - "**/*.ts"
  - "**/*.tsx"
---
# Code Quality
## Basics
- **Type safety** — No new `any` types introduced or existing types bypassed
- **Error handling** — Catch blocks do not silently swallow errors (at minimum, log them)
- **Hardcoded values** — No environment-specific values (URLs, keys, ports) hardcoded in source
```

```
3. Tell user: "Generated {N} starter rules in .dev/rules/. Review and customize for your project."
4. Continue to Step 2 (proceed with the check using new rules)
```

## Step 2: Collect Changed Files

```
1. Run these git commands, ignoring errors from each (e.g. HEAD~1 fails on initial commit):
   - git diff --name-only HEAD~1..HEAD    (last commit) — skip if fails
   - git diff --name-only --cached        (staged)
   - git diff --name-only                 (unstaged)
2. Merge all results and DEDUPLICATE the list
3. If no changed files found, try:
   - git diff --name-only main...HEAD     (branch changes vs main) — skip if main doesn't exist
4. Store as CHANGED_FILES array
5. If still empty → "No changes detected." → STOP
```

## Step 3: Match Triggers

```
For each rule file:
  1. Read its `triggers` array from frontmatter
  2. For each trigger glob pattern:
     - Match against every file in CHANGED_FILES
     - Use glob matching (** for recursive, * for single level)
  3. If ANY file matches ANY trigger → mark rule as MATCHED
  4. Collect matched files per rule for context

Output:
  - MATCHED_RULES: [{name, filePath, matchedFiles}]
  - SKIPPED_RULES: [{name, reason: "no trigger match"}]
```

**If no rules matched** → report "No rules matched the changed files" with list of changed files and skip to Step 6.

## Step 4: Parallel Subagent Verification

For each MATCHED rule, launch a Task agent in parallel:

```
Task(
  subagent_type = "general-purpose",
  prompt = <see references/rule-schema.md "Subagent Prompt Template">,
  model = "haiku"
)
```

**Subagent input** (constructed per rule):
- The full rule file content (frontmatter + body)
- The git diff for matched files only: `git diff HEAD -- <matched_files>`
- If diff is empty (new commit), use: `git show HEAD -- <matched_files>`

**Subagent expected output**: JSON array of check results:
```json
[
  {
    "section": "Section name",
    "item": "Item summary",
    "status": "PASS" | "WARN" | "NA",
    "reason": "Judgment rationale (1-2 sentences)"
  }
]
```

**Launch all matched rules' subagents in a SINGLE message** (parallel Task calls).

**Error handling**: If a subagent returns non-JSON or fails entirely, mark all items for that rule as WARN with reason: "Subagent verification failed — manual review required for {rule_name}".

## Step 5: Aggregate Results

Group subagent results into three categories:

```
WARN  — Items that need attention (potential issues found)
PASS  — Items verified as correct
SKIP  — Rules that had no trigger match + NA items
```

### Output Format

```markdown
## /check Results

### WARN ({count})
| Rule | Item | Reason |
|------|------|--------|
| billing | CTA button state mismatch | Upgrade button not shown in Free state |

### PASS ({count})
| Rule | Item |
|------|------|
| billing | Policy doc consistency verified |

### SKIP ({count})
{skipped rule names, comma-separated}

---
**{total_matched} rules checked, {warn_count} warnings found.**
```

## Step 6: Handle Warnings

If WARN count > 0:

```
AskUserQuestion:
  "How would you like to handle the {warn_count} warnings?"
  Options:
    - "Fix all" — Attempt to fix all warnings
    - "Select which to fix" — Let me choose
    - "Ignore all" — Acknowledge and skip
```

- **Fix all**: For each WARN item, attempt the fix directly or delegate to a Task agent.
- **Select which to fix**: List warnings with checkboxes, fix only selected.
- **Ignore all**: End with the report as-is.

---

## Flags (Phase 2 — NOT IMPLEMENTED)

| Flag | Description | Status |
|------|-------------|--------|
| `--analyze` | Deep impact analysis mode | Phase 2 |
| `--evolve` | Suggest rule improvements | Phase 2 |
| `--migrate` | Convert .docs/checklists/ to .dev/rules/ | Phase 2 |

If user passes any Phase 2 flag, respond:
> "The `{flag}` mode is planned for Phase 2 and not yet implemented. Running basic /check instead."

Then proceed with normal flow.
