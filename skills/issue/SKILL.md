---
name: issue
description: |
  GitHub issue creation skill. Analyzes the entire codebase impact based on user request,
  then creates a structured issue with AI-verified/human-judgment-needed/caution sections.
  /issue "issue description"
  Trigger: "/issue", "이슈 만들어", "issue 만들자", "깃헙 이슈"
allowed_tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Agent
  - AskUserQuestion
validate_prompt: |
  Must complete with one of:
  1. GitHub issue created (URL returned)
  2. User cancelled after preview
  Must NOT: create issue without user confirmation, skip impact analysis.
---

# /issue — Structured GitHub Issue Creator

Investigate the codebase based on the user's request and create a GitHub issue with clearly defined confidence boundaries.

## Input

The text the user typed after `/issue` is the original request. Preserve it verbatim.

Examples:
- `/issue Duplicate Shorts URL fetches in YouTube subscription feed`
- `/issue Add notification settings tab to Settings page`
- `/issue Scheduler occasionally runs twice`

If the input is too vague (e.g., "there's a bug"), ask ONE clarifying question. Otherwise, start investigating immediately.

## Phase 1: Impact Analysis

Perform a **full impact analysis** based on the user's request. Use Agent to investigate in parallel.

### What to Investigate

Launch agents in parallel where possible:

1. **Related code exploration** — Identify files, functions, and modules directly related to the request
2. **Dependency analysis** — Where is this code referenced, and which modules are affected
3. **Existing test coverage** — Whether related tests exist and what they cover
4. **Related issues/history** — Relevant change history from git log, known issues

### Classifying Findings

Classify all findings into three confidence levels:

#### ✅ AI Verified
**Objective facts confirmed through code exploration.** No need for human re-verification.
- Function/file locations, call relationships
- Whether tests exist
- Current behavior (as read directly from code)
- Relevant config values, environment variables

#### 🤔 Decision Required
**Decision points that AI cannot make on your behalf.**
- Trade-off choices (performance vs. accuracy, UX vs. security, etc.)
- Business logic decisions
- Scope decisions (how much to fix)
- Priority judgment

#### ⚠️ Human Verify
**Risks and caveats AI may have missed.**
- Potential side effects
- Risks from production environment differences
- External service dependencies
- Whether data migration is needed
- Areas AI could not verify (external systems, real user data, etc.)

## Phase 2: Preview & Confirm

After investigation, show the user a preview of the issue body.

### Issue Body Template

```markdown
## Request

> {original text the user typed after /issue, verbatim}

## Impact Analysis

### Related Code
- `file:line` — description
- ...

### Scope of Impact
- List of affected modules/features

---

## ✅ AI Verified
> Facts confirmed through code exploration. No further verification needed.

- [ ] Confirmed fact 1
- [ ] Confirmed fact 2

## 🤔 Decision Required
> Decision points requiring human judgment.

- [ ] Decision point 1 — Option A vs B, considerations
- [ ] Decision point 2

## ⚠️ Human Verify
> Risks AI may have missed. Needs human review before and/or after implementation.

- [ ] Verification point 1 — why this needs checking
- [ ] Verification point 2
```

After showing the preview, confirm with AskUserQuestion:

```
AskUserQuestion(
  question: "Should I create a GitHub issue with this content?",
  header: "Issue Preview",
  options: [
    { label: "Create", description: "Create the issue as-is" },
    { label: "Edit then create", description: "I want to make changes first" },
    { label: "Cancel", description: "Do not create the issue" }
  ]
)
```

- **Create** → Proceed to Phase 3
- **Edit then create** → Incorporate user feedback, then show preview again
- **Cancel** → "Issue creation cancelled." → Stop

## Phase 3: Create Issue

Create the issue with `gh issue create`.

```bash
gh issue create --title "Issue title" --body "$(cat <<'EOF'
Issue body
EOF
)"
```

### Title Rules
- Under 70 characters
- Use a prefix: `feat:`, `fix:`, `refactor:`, `chore:`, etc. (based on content)
- English or Korean OK

### Label Auto-mapping

Based on the issue content, add matching labels via the `--label` flag using the table below.
Multiple labels allowed. If no match, create without labels.

| Issue type | Label |
|-----------|------|
| Bug, error, broken behavior | `bug` |
| New feature, addition, improvement | `enhancement` |
| Documentation related | `documentation` |
| Question, investigation, needs clarification | `question` |

After creation, return the issue URL to the user.

## Hard Rules

1. **Investigate first** — Never create an issue without investigation
2. **Confirm first** — Never create an issue without user confirmation
3. **Preserve original** — The user's original request must be included verbatim in the "Request" section
4. **Facts only** — AI Verified contains only things directly confirmed from code. No speculation.
5. **Be honest** — Anything unverified goes into Human Verify. Never pretend to know.
6. **Keep it concise** — Do not let the issue body grow unnecessarily long

## Checklist Before Stopping

- [ ] Codebase impact analysis completed
- [ ] Findings classified into three confidence levels
- [ ] User's original request included verbatim
- [ ] User reviewed the preview
- [ ] `gh issue create` executed and URL returned (or user cancelled)
