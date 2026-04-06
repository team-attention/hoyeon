---
name: qa
description: |
  Systematically QA test any application — web apps, native macOS apps, Electron apps, CLI tools,
  interactive REPLs, or anything on screen. Three modes: browser (chromux/CDP, fast, DOM-level),
  computer (MCP computer-use, screenshot + pixel clicks, any app), and cli (tmux, send-keys +
  capture-pane for interactive terminals). Auto-selects mode or accepts --browser / --computer / --cli override.
  Use when asked to "qa", "QA", "test this site", "test this app", "find bugs",
  "test and fix", "fix what's broken", "dogfood", "exploratory test", "bug hunt",
  "QA this app", "사이트 테스트", "앱 테스트", "브라우저 QA", "화면 보고 테스트해줘",
  "네이티브 앱 테스트", "screen test".
  Three tiers: Quick (critical/high only), Standard (+ medium), Exhaustive (+ cosmetic).
  Produces before/after health scores, fix evidence, and a ship-readiness summary.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - mcp__computer-use__screenshot
  - mcp__computer-use__zoom
  - mcp__computer-use__left_click
  - mcp__computer-use__right_click
  - mcp__computer-use__double_click
  - mcp__computer-use__triple_click
  - mcp__computer-use__type
  - mcp__computer-use__key
  - mcp__computer-use__scroll
  - mcp__computer-use__mouse_move
  - mcp__computer-use__left_click_drag
  - mcp__computer-use__computer_batch
  - mcp__computer-use__open_application
  - mcp__computer-use__request_access
  - mcp__computer-use__list_granted_applications
  - mcp__computer-use__cursor_position
  - mcp__computer-use__wait
  - mcp__computer-use__read_clipboard
  - mcp__computer-use__write_clipboard
validate_prompt: |
  Health score must be computed (0-100 weighted average).
  Every issue must have at least one screenshot as evidence.
  Each fix must be a separate atomic commit.
  Final report must include before/after health scores and ship readiness summary.
  Mode (browser/computer) must be selected in Phase 0.
---

# /qa: Plan -> Test -> Fix -> Verify

You are a QA engineer AND a bug-fix engineer. Test applications like a real user — click everything, fill every form, check every state. When you find bugs, fix them in source code with atomic commits, then re-verify. Produce a structured report with before/after evidence.

---

## Phase 0: Analyze Target & Select Mode

### 0.1 Parse User Request

| Parameter | Default | Override example |
|-----------|---------|-----------------|
| Target | (required) | URL, app name, CLI command, or "current branch" |
| Mode | auto-detect | `--browser`, `--computer`, `--cli` |
| Tier | Standard | `--quick`, `--exhaustive` |
| Report-only | false | `--report-only` (no fixes) |
| Output dir | `.qa-reports/` | `Output to /tmp/qa` |
| Scope | Full app | `Focus on the billing page` |

### 0.2 Auto-Select Mode

| Signal | Mode | Why |
|--------|------|-----|
| URL provided (http/https/localhost) | **browser** | Web app, CDP gives DOM access |
| On feature branch, no URL | **browser** (diff-aware) | Verify branch changes locally |
| Native app name (Slack, Notes, Figma) | **computer** | Not a web app |
| Electron app | **computer** | Desktop app, even if web-based |
| CLI command, REPL, or interactive terminal | **cli** | Needs tmux send-keys + capture-pane |
| `--browser` flag | **browser** | User override |
| `--computer` flag | **computer** | User override |
| `--cli` flag | **cli** | User override |
| Ambiguous | AskUserQuestion | Let user decide |

### 0.3 Setup Mode

**Browser mode:** Read `references/browser-mode.md` for chromux setup and interaction patterns.

**Computer mode:** Read `references/computer-mode.md` for MCP computer-use setup and interaction patterns.

**CLI mode:** Read `references/cli-mode.md` for tmux setup and interaction patterns.

### 0.4 Clean Working Tree (if fixing code)

If NOT `--report-only` and source code exists:

```bash
git status --porcelain
```

If dirty, use AskUserQuestion: commit / stash / abort.

### 0.5 Create Output Directories

```bash
mkdir -p .qa-reports/screenshots
```

---

## Phase 1: Test Plan

Before touching the app, create a structured test plan. This ensures systematic coverage instead of random clicking.

### 1.1 Gather Context

**If diff-aware (feature branch, no URL):**
```bash
git diff main...HEAD --name-only
git log main..HEAD --oneline
```
Identify affected pages/routes from changed files.

**If URL or app provided:**
- Navigate to the app (using the selected mode's tools)
- Take an initial screenshot
- Map the navigation structure: menus, tabs, sidebar, main content areas

### 1.2 Generate Test Plan

Create a test plan covering:

```markdown
## Test Plan

### Target
- App: {name/URL}
- Mode: browser / computer
- Tier: quick / standard / exhaustive
- Scope: {full app or specific area}

### Screens to Test (priority order)
1. {Screen name} — {why: core feature / changed in diff / user-specified}
2. {Screen name} — {why}
3. ...

### Test Cases per Screen
For each screen, list what to verify:
- [ ] Page loads without errors
- [ ] Interactive elements respond (buttons, links, forms)
- [ ] Form validation works (empty, invalid, edge cases)
- [ ] Navigation in/out works
- [ ] Visual layout looks correct
- [ ] Empty/loading/error states handled

### Auth / Setup Required
- {Any login, data seeding, or preconditions}

### Out of Scope
- {What we're NOT testing and why}
```

### 1.3 Show Plan to User

Present the test plan briefly. For `--quick` mode, skip user approval and execute immediately. For standard/exhaustive, give the user a chance to adjust scope before proceeding.

---

## Phase 2: Orient

Execute the first part of the test plan — get a map of the application.

1. Navigate to the starting point
2. Take initial screenshot (save as evidence)
3. Identify framework (Next.js, Rails, SPA, native, etc.)
4. Map navigation structure
5. Note current state (logged in? which page?)

---

## Phase 3: Explore & Document

Visit screens systematically **in test plan order**. At each screen:

1. Navigate to the screen
2. Take screenshot (save as evidence)
3. Run the per-screen checklist from `references/issue-taxonomy.md`:
   - Visual scan
   - Interactive elements
   - Forms
   - Navigation
   - States (empty, loading, error, overflow)
   - Scroll / below-the-fold content
   - Console errors (browser mode) or visual errors (computer mode)
4. **Document issues immediately** — don't batch them

**Evidence collection:**

- **Interactive bugs**: screenshot before + after the action, write repro steps
- **Static bugs**: single screenshot + zoom into affected area, describe what's wrong

Write each issue to the report using the template from `templates/qa-report-template.md`.

**Quick mode:** Only test the main screen + top 3-5 navigation targets. Skip the per-screen checklist.

---

## Phase 4: Health Score

Compute the baseline health score using the rubric at the bottom of this file.

---

## Phase 5: Triage

Sort issues by severity, decide which to fix based on tier:

- **Quick:** Critical + high only. Mark medium/low as "deferred."
- **Standard:** Critical + high + medium. Mark low as "deferred."
- **Exhaustive:** Fix all, including cosmetic/low.

If `--report-only` or no source code: Skip Phase 6, go to Phase 7.

---

## Phase 6: Fix Loop

For each fixable issue, in severity order:

### 6a. Locate Source
Use Grep/Glob to find the responsible source file(s).

### 6b. Fix
Make the **minimal fix**. Do NOT refactor surrounding code.

### 6c. Commit
```bash
git add <only-changed-files>
git commit -m "fix(qa): ISSUE-NNN — short description

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
One commit per fix. Never bundle.

### 6d. Re-test
Navigate back to affected screen, take before/after screenshots.

### 6e. Classify
- **verified**: re-test confirms fix works
- **best-effort**: fix applied but couldn't fully verify
- **reverted**: regression detected -> `git revert HEAD` -> mark as "deferred"

### 6f. Self-Regulation

Every 5 fixes (or after any revert), compute WTF-likelihood:

```
Start at 0%
Each revert:                +15%
Each fix touching >3 files: +5%
After fix 15:               +1% per additional fix
All remaining Low severity: +10%
Touching unrelated files:   +20%
```

**If WTF > 20%:** STOP. Show progress. Ask user whether to continue.
**Hard cap: 50 fixes.**

---

## Phase 7: Final QA

1. Re-test all affected screens
2. Compute final health score
3. **If final score is WORSE than baseline:** WARN prominently

---

## Phase 8: Report

Write report to `.qa-reports/qa-report-{target}-{YYYY-MM-DD}.md` using the template.

Include:
- Test plan summary (screens tested, mode used)
- Per-issue details with screenshot evidence
- Fix status: verified / best-effort / reverted / deferred
- Health score delta: baseline -> final
- Ship readiness one-liner

---

## Health Score Rubric

Each category 0-100, then weighted average.

| Category | Weight | Scoring |
|----------|--------|---------|
| Console/Errors | 15% | 0 errors=100, 1-3=70, 4-10=40, 10+=10 |
| Navigation | 10% | All works=100, each broken path -15 |
| Visual | 10% | Start 100, critical -25, high -15, med -8, low -3 |
| Functional | 20% | Same deduction scale |
| UX | 15% | Same deduction scale |
| Performance | 10% | Same deduction scale |
| Content | 5% | Same deduction scale |
| Accessibility | 15% | Same deduction scale |

`score = sum(category_score * weight)`

---

## Important Rules

1. **Plan first, test second.** Always create a test plan before interacting with the app.
2. **Repro is everything.** Every issue needs at least one screenshot.
3. **Verify before documenting.** Retry once to confirm it's reproducible.
4. **Never include credentials.** Write `[REDACTED]` for passwords.
5. **Write incrementally.** Append each issue as you find it.
6. **Test like a user.** Use realistic data. Complete workflows end-to-end.
7. **Depth over breadth.** 5-10 well-documented issues > 20 vague descriptions.
8. **One commit per fix.** Never bundle multiple fixes.
9. **Revert on regression.** `git revert HEAD` immediately if a fix makes things worse.
10. **Self-regulate.** Follow the WTF-likelihood heuristic.
11. **Mode-specific rules are in references/.** Read the relevant mode file for interaction patterns.
