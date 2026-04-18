---
type: "{greenfield | feature | refactor | bugfix}"
goal: "{one-line goal}"
non_goals:
  - "{non-goal 1}"
---

# Requirements

## R-B1: {Business requirement title}
- behavior: {one-sentence system behavior}

#### R-B1.1: {sub-requirement title}
- given: {precondition}
- when: {trigger}
- then: {expected outcome}

## R-U1: {Interaction requirement title}
- behavior: {one-sentence system behavior}

#### R-U1.1: {sub-requirement title}
- given: {precondition}
- when: {trigger}
- then: {expected outcome}

## R-T1: {Tech requirement title}
- behavior: {one-sentence system behavior}

#### R-T1.1: {sub-requirement title}
- given: {precondition}
- when: {trigger}
- then: {expected outcome}

## Open Decisions

### OD-1: {title}
- context: {why undecided}
- options: [{option A}, {option B}]
- impact: {what is blocked without this decision}

<!--
Format (consumed by /blueprint via cli):
  - Frontmatter fields: type, goal, non_goals (no extra keys)
  - Parent req IDs at H2: ## R-X<num>: where X ∈ {B=Business, U=Interaction, T=Tech}
  - Sub req IDs at H4:    #### R-X<num>.Y: with given/when/then lines
  - No axis grouping headings in the body — axis is encoded in the ID letter
  - Open Decisions is optional; omit the section if none
-->
