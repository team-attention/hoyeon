# Orchestration Report Template

Output this report **verbatim**, replacing only `{placeholders}` with actual values.
If a section has no data, print "None" — do NOT omit the section.

```
═══════════════════════════════════════════════════════════
                    ORCHESTRATION COMPLETE
═══════════════════════════════════════════════════════════

PLAN: {plan_path}
MODE: {Local | PR #N}

TASK SUMMARY:
   Total TODOs:               {count}
   Completed:                 {count}
   Failed:                    {count}

COMMITS CREATED:
   {hash} {message}
   ...

FILES MODIFIED:
   {file_path}
   ...

───────────────────────────────────────────────────────────
                    VERIFICATION SUMMARY
───────────────────────────────────────────────────────────

AGENT-VERIFIED (A-items):
   {id}  {PASS|FAIL}  {description}
   {id}  {PASS|FAIL}  {description}
   ...

   Result: {N}/{total} passed

HUMAN REVIEW REQUIRED (H-items):
   {id}  {description}                    → {review material / file to check}
   {id}  {description}                    → {review material / file to check}
   ...

───────────────────────────────────────────────────────────
                      POST-WORK
───────────────────────────────────────────────────────────

{Actionable items remaining after execution, e.g.:}
   - [ ] {Manual testing needed for X}
   - [ ] {Deploy/migration step}
   - [ ] {Dependency update in other repo}
   - [ ] {Documentation to update}
   {or "None"}

───────────────────────────────────────────────────────────
                      CONTEXT
───────────────────────────────────────────────────────────

LEARNINGS:
   {from context/learnings.md, or "None"}

ISSUES:
   {from context/issues.md, or "None"}

═══════════════════════════════════════════════════════════
```

## Section Guide

- **A-items**: Acceptance criteria the verify worker checked with deterministic commands (test -f, npm test, tsc --noEmit, etc.). Pull from each `:Verify` worker's `acceptance_criteria.results[]`.
- **H-items**: Judgment-required items that agents cannot verify — UX quality, design review, naming conventions, documentation clarity, manual integration testing. Pull from Plan's acceptance criteria that have no automated check, plus any `side_effects.suspicious_passes` from verify workers.
- **POST-WORK**: Remaining tasks that execution could not complete — things requiring human action, deployment steps, cross-repo changes, manual QA. Pull from context/issues.md + any FAILED A-items that were not resolved.
