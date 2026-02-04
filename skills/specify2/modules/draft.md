# Module: Draft

Initial DRAFT.md creation and update rules.

## Input

- depth: `quick` | `standard` | `thorough`
- interaction: `interactive` | `autopilot`
- feature_name: from Triage
- exploration_results: from Explore
- intent_type: from Explore

## Output

- draft_path: `.dev/specs/{feature_name}/DRAFT.md`
- status: `created`

## Logic

### 1. Create Draft File

```
Write(".dev/specs/{feature_name}/DRAFT.md", initial_draft)
```

### 2. Initial Draft Structure

Follow `templates/DRAFT_TEMPLATE.md`:

```markdown
# DRAFT: {feature_name}

## Meta
- Intent: {intent_type}
- Depth: {depth}
- Interaction: {interaction}
- Created: {timestamp}

## What & Why
{extracted from user's request}

## Agent Findings
### Patterns
{from exploration_results.patterns}

### Structure
{from exploration_results.structure}

### Project Commands
{from exploration_results.commands}

### Documentation
{from exploration_results.documentation}

### UX Review
{from exploration_results.ux_review}

## Open Questions
### Critical
- [ ] {initial questions based on intent}

### Nice to Have
- [ ] ...

## User Decisions
| Question | Decision | Notes |
|----------|----------|-------|

## Boundaries
- Must NOT: ...

## Success Criteria
- [ ] ...

## Direction
### Approach
(to be filled during interview)

### Work Breakdown
(to be filled during interview)

## Assumptions (autopilot/quick only)
| Decision | Assumption | Rationale |
|----------|------------|-----------|
```

## Behavior by Depth

| Depth | Draft Content |
|-------|---------------|
| quick | Include Assumptions section, pre-fill with standard choices |
| standard | Standard structure |
| thorough | Extended structure with Risk Analysis section |

## Behavior by Interaction

| Interaction | Assumptions Section |
|-------------|---------------------|
| interactive | Empty (decisions made via AskUser) |
| autopilot | Pre-filled with standard choices |

---

## Update Rules

> **Note:** Interview module is responsible for executing these updates.

### After User Response

1. Record in **User Decisions** table:
   ```markdown
   | Question | Decision | Notes |
   |----------|----------|-------|
   | Auth method? | JWT | Using existing library |
   ```

2. Remove resolved items from **Open Questions > Critical**

3. Update **Boundaries** if constraints mentioned

4. Update **Success Criteria** if acceptance conditions mentioned

### After Exploration (if re-run)

1. Update **Agent Findings > Patterns** (file:line format)
2. Update **Agent Findings > Structure**
3. Update **Agent Findings > Documentation**

### When Direction Agreed

1. Update **Direction > Approach** with high-level strategy

2. Sketch **Direction > Work Breakdown**:
   ```markdown
   1. Create Config → outputs: `config_path`
   2. Implement Middleware → depends on: Config
   3. Connect Router → depends on: Middleware
   ```

---

## Validation Rules

Before transitioning to Plan:

- [ ] **What & Why** completed
- [ ] **Boundaries** specified (at least one)
- [ ] **Success Criteria** defined (at least one)
- [ ] **Critical Open Questions** empty
- [ ] **Agent Findings** has Patterns and Commands
- [ ] **Direction > Work Breakdown** sketched (standard/thorough only)

**Quick depth:** Validation relaxed (Assumptions cover missing items)
