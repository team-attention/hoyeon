---
spec: "{spec-name}"
phase: extract
axis: "{business | ux | tech}"
count: 0
---

# {Axis} Requirements

## R-{A}1: {requirement title}
- **type**: {functional | constraint | quality}
- **behavior**: {what the system must do, one sentence}
- **source**: [{AXIS_NODE.Q reference from qa-log}]
- **confidence**: {high | medium | low}
- **open_questions**: {unresolved aspect, or "none"}

### Sub-requirements

#### R-{A}1.1: {sub-requirement title}
- **given**: {precondition}
- **when**: {trigger}
- **then**: {expected outcome}

#### R-{A}1.2: {sub-requirement title}
- **given**: {precondition}
- **when**: {trigger}
- **then**: {expected outcome}

---

<!-- 
Parsing hints:
  - Requirement ID:     ^## R-[BUT]\d+: (.+)
  - Field:              ^- \*\*(\w+)\*\*: (.+)
  - Sub-requirement ID: ^#### R-[BUT]\d+\.\d+: (.+)
  - GWT fields:         given/when/then under sub-requirement
  - Axis codes:         B=Business, U=UX, T=Tech
-->
