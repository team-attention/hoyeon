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
   Total TODOs:               {count} ({planned} planned + {dynamic} adapted)
   Completed:                 {count}
   Failed:                    {count}

COMMITS CREATED:
   {hash} {message}
   ...

FILES MODIFIED:
   {file_path}
   ...

ADAPTATIONS MADE:
   {from context/audit.md "Adapt" entries, or "None"}

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

SANDBOX TESTING:
   {If context/sandbox-report.md exists, summarize per-TODO results:}
   TODO {N}: {PASS|FAIL} — {teardown: SUCCESS|FAILED} — {brief summary}
   TODO {M}: {PASS|FAIL} — {teardown: SUCCESS|FAILED} — {brief summary}
   ...
   Full report: .dev/specs/{name}/context/sandbox-report.md
   {or "No sandbox testing performed"}

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
- **ADAPTATIONS MADE**: Dynamic plan changes made during execution — tasks added/modified/removed from original plan due to discovered dependencies, blockers, or scope changes. Pull from context/audit.md (filter for "Adapt" entries). Shows the difference between what was planned vs what was actually executed.
- **SANDBOX TESTING**: Summary of sandbox infrastructure tests run during verification. Pull from `context/sandbox-report.md`. Shows per-TODO sandbox results and teardown status. If no sandbox was used, print "No sandbox testing performed". If teardown FAILED for any TODO, flag it in POST-WORK.
- **POST-WORK**: Remaining tasks that execution could not complete — things requiring human action, deployment steps, cross-repo changes, manual QA. Pull from context/issues.md + any FAILED A-items that were not resolved.
