# Specify2 Checklist

## Before Stopping

### Mode Selection
- [ ] Depth determined (quick/standard/thorough)
- [ ] Interaction determined (interactive/autopilot)

### Explore Phase
- [ ] Parallel agents executed (2/4/6 based on depth)
- [ ] Intent classified
- [ ] Exploration summary presented

### Draft Phase
- [ ] DRAFT.md created at `.dev/specs/{name}/DRAFT.md`
- [ ] What & Why completed
- [ ] Agent Findings populated

### Interview Phase (standard/thorough only)
- [ ] Critical questions resolved
- [ ] User Decisions recorded
- [ ] Success Criteria defined
- [ ] Boundaries specified

### Quick Mode Specifics
- [ ] Assumptions section populated
- [ ] Standard choices documented

### Analysis Phase
- [ ] tradeoff-analyzer executed (all depths)
- [ ] Risk tags assigned
- [ ] gap-analyzer executed (standard/thorough)
- [ ] verification-planner executed (standard/thorough)
- [ ] HIGH risk decision_points resolved

### Plan Phase
- [ ] PLAN.md created at `.dev/specs/{name}/PLAN.md`
- [ ] Context section complete
- [ ] Work Objectives defined
- [ ] Must NOT Do specified
- [ ] Definition of Done clear

### Plan - Orchestrator Section
- [ ] Task Flow defined
- [ ] Dependency Graph complete
- [ ] Commit Strategy specified (standard/thorough)

### Plan - TODO Section
- [ ] All TODOs have Type field
- [ ] All TODOs have Inputs/Outputs
- [ ] All TODOs have Steps (checkbox)
- [ ] All TODOs have "Do not run git commands" in Must NOT do
- [ ] All TODOs have Acceptance Criteria
- [ ] All TODOs have Verify block with risk tag
- [ ] HIGH risk TODOs have rollback steps (thorough)
- [ ] References populated from Agent Findings

### Plan - Verification
- [ ] TODO Final: Verification exists
- [ ] Verification Summary present
- [ ] A-items (agent-verifiable) listed
- [ ] H-items (human-required) listed

### Review Phase
- [ ] Reviewer returned OKAY
- [ ] DRAFT.md deleted
- [ ] Next steps guidance provided

---

## Depth-Specific Checklists

### Quick Mode
- [ ] Assumptions clearly documented
- [ ] No HIGH risk without warning
- [ ] Single review attempt

### Standard Mode
- [ ] Interview loop completed
- [ ] All checkpoints passed (interactive)
- [ ] Review loop completed

### Thorough Mode
- [ ] 2+ interview rounds
- [ ] All MEDIUM+ have rollback
- [ ] Strict review completed
- [ ] All cosmetic fixes confirmed

---

## Autopilot Mode Specifics

- [ ] All auto-decisions logged
- [ ] Assumptions section complete
- [ ] Checkpoints skipped with logging
- [ ] Plan includes autopilot notice
