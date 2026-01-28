---
name: compound
description: |
  This skill should be used when the user says "/compound", "compound this",
  "document learnings", "save what we learned", or after completing a PR.
  Extracts knowledge from PR context and saves to docs/learnings/.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
  - AskUserQuestion
---

# Compound Skill

Extracts knowledge from PR context and saves structured documentation to `docs/learnings/`.

## Workflow

### Phase 1: Context Collection

1. **Identify PR number/branch**
   - Use PR number if provided as argument
   - Otherwise, find PR from current branch: `gh pr view --json number,body,title`
   - **If no PR exists**: Prompt user to enter PR number directly or confirm proceeding without PR

2. **Extract Plan path**
   - Find Plan path pattern in PR body: `.dev/specs/{name}/PLAN.md`
   - Regex: `\.dev/specs/[^/]+/PLAN\.md`
   - **If no Plan path found**: Prompt user to enter spec name directly or select from `.dev/specs/` directory listing

3. **Derive Context path**
   - Extract spec name from Plan path
   - Context directory: `.dev/specs/{name}/context/`

4. **Parallel collection** (run following commands simultaneously, skip if files don't exist)
   ```bash
   # Context files (treat as empty if not found)
   cat .dev/specs/{name}/context/learnings.md 2>/dev/null || echo ""
   cat .dev/specs/{name}/context/decisions.md 2>/dev/null || echo ""
   cat .dev/specs/{name}/context/issues.md 2>/dev/null || echo ""

   # PR comments and reviews (collect as JSON for stability)
   gh pr view {pr_number} --json comments,reviews
   ```

**Error Handling:**
- If no context files exist AND no PR comments → Notify user and request manual input
- At least 1 source required to proceed with document generation

### Phase 2: Knowledge Extraction & Classification

#### 2.1 Extract Valuable Feedback from PR Comments

**Criteria for valuable feedback:**
- Code improvement suggestions
- Bug/issue identification
- Pattern/best practice mentions
- "This would be better" type advice
- Comments left with approval

**Filter out:**
- Simple questions ("What is this?")
- Confirmation requests ("Is this correct?")
- Approval-only comments ("LGTM", "Approved")
- Bot comments

**Extraction keywords:**
- "suggest", "recommend", "better", "instead"
- "pattern", "practice", "convention"
- "issue", "bug", "fix"
- "learned", "TIL", "note"

**Extracted information:**
- author
- body
- file_path (if inline comment)
- created_at

#### 2.2 Analyze Context Files

| File | Purpose |
|------|---------|
| learnings.md | Direct learnings |
| decisions.md | Decision rationale |
| issues.md | Out of scope issues (for future reference) |

#### 2.3 Synthesize

1. Assess documentation value from collected sources
2. Check for duplicates: Search `docs/learnings/`
3. Classify problem type - Refer to `references/problem-types.md` (relative to this skill directory)
4. Generate tags

### Phase 3: Document Generation

1. **Generate YAML frontmatter**
   ```yaml
   pr_number: {PR_NUMBER}
   date: {YYYY-MM-DD}
   problem_type: {TYPE}
   tags: [{TAGS}]
   plan_path: {PLAN_PATH}
   ```

2. **Write document using template**
   - Template location: `templates/LEARNING_TEMPLATE.md` (relative to this skill directory)
   - Read template and substitute placeholders

3. **Determine filename**
   - Format: `{YYYY-MM-DD}-{short-title}.md`
   - Example: `2024-01-15-api-error-handling.md`

4. **Save**
   - Path: `docs/learnings/{filename}.md`

5. **Add cross-references** (if related documents exist)
   - Add new document link to Related section of existing documents

## Usage Examples

```
# Specify PR number
/compound 123

# Use PR from current branch
/compound
```

## Output

Outputs the created document path and summary:

```
Created: docs/learnings/2024-01-15-api-error-handling.md

Summary:
- Problem Type: error-handling
- Tags: api, typescript, validation
- Sources: learnings.md, 2 PR comments
```

---

<!-- TODO: Future extensions -->
<!-- - [ ] Session ID based user feedback collection -->
<!-- - [ ] CLAUDE.md auto-update suggestions -->
<!-- - [ ] Detect existing document UPDATEs -->
<!-- - [ ] Auto-categorization by problem_type (docs/solutions/{type}/) -->
