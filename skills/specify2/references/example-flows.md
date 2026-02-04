# Example Flows

Detailed step-by-step examples for each mode combination.

---

## Standard + Interactive (Default)

```
User: "Add authentication to the API"

[Triage]
1. Parse: No flags → standard + interactive
2. Extract: feature_name = "api-auth"

[Explore - 4 agents in parallel]
3. Launch agents (single message, parallel foreground):
   - Explore #1: Find existing middleware patterns
   - Explore #2: Find project structure + commands
   - docs-researcher: Find ADRs, conventions, constraints
   - ux-reviewer: Evaluate UX impact
4. Classify intent: New Feature → Pattern exploration strategy
5. Present exploration summary, wait for user confirmation

[Draft]
6. Create: .dev/specs/api-auth/DRAFT.md
7. Populate Agent Findings from exploration results

[Interview]
8. Detect: "authentication" → Potential tech choice needed
   Ask: "기술 선택이 필요해 보입니다. tech-decision으로 깊이 분석할까요?"
   → User selects "예, 분석 진행"
9. Call: Skill("tech-decision", args="JWT vs Session for REST API auth")
10. Update draft with tech-decision results
11. PROPOSE based on exploration:
    "Based on tech-decision analysis, JWT recommended. jsonwebtoken already installed."
12. Wait for user: "make it a plan"

[Analysis]
13. Run tradeoff-analyzer, gap-analyzer, verification-planner
14. Present HIGH risk decision_points if any

[Plan]
15. Generate PLAN.md from DRAFT
16. Present Decision Summary checkpoint

[Review]
17. Submit to reviewer agent
18. If REJECT (cosmetic): auto-fix and resubmit
19. If OKAY: Delete DRAFT, output plan location
20. Guide to next steps: /open, /execute, /worktree
```

---

## Quick + Autopilot

```
User: "/specify2 fix-typo --quick"

[Triage]
1. Parse: --quick → quick + autopilot (default for quick)
2. Extract: feature_name = "fix-typo"

[Explore - 2 agents]
3. Launch 2 Explore agents (lite exploration)
4. Classify intent: Bug Fix

[Draft]
5. Create DRAFT with Assumptions section populated

[Interview: SKIPPED]

[Analysis - lite]
6. Run tradeoff-analyzer only
7. No AskUserQuestion (autopilot)

[Plan]
8. Generate PLAN.md with Assumptions notice

[Review - 1x]
9. Single review attempt, auto-fix if cosmetic
10. Output plan location and stop
```

---

## Quick + Interactive

```
User: "/specify2 fix-typo --quick --interactive"

[Triage]
1. Parse: --quick --interactive
2. Extract: feature_name = "fix-typo"

[Explore - 2 agents]
3. Launch 2 Explore agents (lite exploration)
4. Classify intent: Bug Fix
5. 🙋 Present exploration summary, wait for confirmation

[Draft]
6. Create DRAFT with Assumptions section
   ⚠️ "Quick 모드: Interview가 스킵되어 Assumptions가 자동 적용됩니다"

[Interview: SKIPPED]

[Analysis - lite]
7. Run tradeoff-analyzer only
8. No decision_points (lite mode)

[Plan]
9. Generate PLAN.md with Assumptions notice

[Review - 1x]
10. Single review attempt, auto-fix if cosmetic
11. Output plan location and stop
```

---

## Standard + Autopilot

```
User: "/specify2 add-auth --autopilot"

[Triage]
1. Parse: --autopilot → standard + autopilot
2. Extract: feature_name = "add-auth"

[Explore - 4 agents]
3. Launch 4 agents in parallel
4. Classify intent: New Feature
5. Output summary, proceed immediately (no wait)

[Draft]
6. Create DRAFT with Assumptions section pre-filled

[Interview - auto]
7. 🤖 Apply standard choices automatically
8. 🤖 Skip tech-decision (use existing stack)
9. Log all decisions in Assumptions

[Analysis]
10. Run 4 agents
11. 🤖 HIGH risk: apply conservative choice, log

[Plan]
12. Generate PLAN.md
13. Skip checkpoints (logging only)

[Review - auto loop]
14. Submit to reviewer
15. 🤖 auto-fix on reject (halt if scope change)
16. Output plan location and stop
```

---

## Thorough + Interactive

```
User: "/specify2 migrate-db --thorough"

[Triage]
1. Parse: --thorough → thorough + interactive
2. Extract: feature_name = "migrate-db"

[Explore - 4 agents, deep prompts]
3. Launch 4 agents with enhanced prompts
4. Classify intent: Migration → Phased approach strategy
5. 🙋 Present detailed exploration summary

[Draft]
6. Create DRAFT with extended structure

[Interview - deep, 2+ rounds]
7. 🙋 Multiple rounds of requirements gathering
8. 🙋 Tech-decision proposal likely triggered
9. Deep probing for edge cases, rollback needs
10. Wait for explicit "make it a plan"

[Analysis - strict]
11. Run all 4 agents with strict prompts
12. 🙋 Present ALL decision_points (not just HIGH)
13. Require rollback plan for MEDIUM+

[Plan]
14. Generate comprehensive PLAN.md
15. 🙋 Decision Summary checkpoint
16. 🙋 Verification Summary checkpoint

[Review - strict, unlimited]
17. Submit to reviewer
18. 🙋 Even cosmetic rejections shown to user
19. 🙋 Semantic rejections always ask user
20. Repeat until OKAY
21. Guide to next steps
```

---

## Thorough + Autopilot

```
User: "/specify2 migrate-db --thorough --autopilot"

[Triage]
1. Parse: --thorough --autopilot
2. Extract: feature_name = "migrate-db"
   ⚠️ "Thorough + Autopilot: 검토 단계가 자동화됩니다"

[Explore - 4 agents, deep prompts]
3. Launch 4 agents with enhanced prompts
4. Classify intent: Migration
5. Output summary, proceed (no wait)

[Draft]
6. Create DRAFT with Assumptions pre-filled

[Interview - auto, 2+ rounds worth]
7. 🤖 Apply standard choices (multiple passes)
8. 🤖 Skip tech-decision
9. Log extensive Assumptions

[Analysis - strict]
10. Run all 4 agents with strict prompts
11. 🤖 Apply conservative choices for decision_points
12. Rollback plans auto-generated

[Plan]
13. Generate PLAN.md
14. Skip checkpoints (logging only)

[Review - auto, unlimited attempts]
15. Submit to reviewer
16. 🤖 auto-fix cosmetic AND semantic (interaction wins)
17. ⛔ HALT only if scope change detected
18. Output plan location and stop
```
