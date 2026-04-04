# QA Report: {APP_NAME}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **Target** | {URL or App Name} |
| **Mode** | Browser / Computer |
| **Branch** | {BRANCH} |
| **Commit** | {COMMIT_SHA} ({COMMIT_DATE}) |
| **Tier** | Quick / Standard / Exhaustive |
| **Scope** | {SCOPE or "Full app"} |
| **Duration** | {DURATION} |
| **Screens tested** | {COUNT} |
| **Screenshots** | {COUNT} |
| **Framework** | {DETECTED or "Unknown"} |

## Test Plan Summary

{Brief summary of what was planned to test and why}

## Health Score: {SCORE}/100

| Category | Score |
|----------|-------|
| Console/Errors | {0-100} |
| Navigation | {0-100} |
| Visual | {0-100} |
| Functional | {0-100} |
| UX | {0-100} |
| Performance | {0-100} |
| Content | {0-100} |
| Accessibility | {0-100} |

## Top 3 Things to Fix

1. **{ISSUE-NNN}: {title}** -- {one-line description}
2. **{ISSUE-NNN}: {title}** -- {one-line description}
3. **{ISSUE-NNN}: {title}** -- {one-line description}

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | visual / functional / ux / content / performance / console / accessibility |
| **Screen** | {screen name or URL} |

**Description:** {What is wrong, expected vs actual.}

**Repro Steps:**

1. Navigate to {screen}
   ![Step 1](screenshots/issue-001-step-1.png)
2. {Action}
   ![Step 2](screenshots/issue-001-step-2.png)
3. **Observe:** {what goes wrong}
   ![Result](screenshots/issue-001-result.png)

---

## Fixes Applied (if applicable)

| Issue | Fix Status | Commit | Files Changed |
|-------|-----------|--------|---------------|
| ISSUE-NNN | verified / best-effort / reverted / deferred | {SHA} | {files} |

### Before/After Evidence

#### ISSUE-NNN: {title}
**Before:** ![Before](screenshots/issue-NNN-before.png)
**After:** ![After](screenshots/issue-NNN-after.png)

---

## Ship Readiness

| Metric | Value |
|--------|-------|
| Health score | {before} -> {after} ({delta}) |
| Issues found | N |
| Fixes applied | N (verified: X, best-effort: Y, reverted: Z) |
| Deferred | N |

**PR Summary:** "QA found N issues, fixed M, health score X -> Y."
