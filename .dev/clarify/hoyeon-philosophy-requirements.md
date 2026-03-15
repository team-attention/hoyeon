# Requirement Clarification: Hoyeon Philosophy & Identity
> Date: 2026-03-12

## Before (Original)
"The philosophy of the hoyeon plugin is vague. I've built a structure where all work runs consistently through spec.json, and I want to: (1) have natural language requests also go through spec.json before execute so they follow a consistent pipeline, and (2) have something that ambiently recommends better skills/agents."

## After (Clarified)

**Identity**: hoyeon = **Spec-driven dev system** — A system that structures all work through spec.json to ensure consistent quality

**Goal**:
- All work goes through spec.json and follows a consistent execute pipeline
- Ambient recommendations help users discover better skills/agents

**Scope**:
- Included: All work goes through spec.json (lightweight spec for simple tasks, full spec for complex tasks)
- Included: Ambient recommendations — information-level only ("Tip: /bugfix is suitable for this task")
- Excluded: No automatic transitions or forced interventions

**Constraints**:
- Recommendations are information-only (preserve user choice, nudge not force)
- Lightweight spec support already exists (quick-plan, etc.)

**Success Criteria**:
- Skill usage rate rises meaningfully from 3%
- Things missed when working in natural language (tests, commits, reviews) decrease (reduced friction)

## Decisions Made

| Question | Decision |
|----------|----------|
| Root cause of missing philosophy | Missing external identity + practical problem (not being used) |
| spec.json scope | All work (lightweight/full distinction) |
| Ambient intervention level | Information only (nudge, not force) |
| Identity in one sentence | Spec-driven dev system |
| Success criteria | Usage rate increase + friction reduction |

## Context
- Analysis of 323 prompts revealed 3% skill usage rate (derived from deep-interview session)
- Other projects in .references/ (GSD, etc.) have clear philosophies, but hoyeon did not
- Refactoring to spec.json-centric architecture is already complete
