---
spec: "{spec-name}"
phase: interview
status: in_progress
where:
  goal: "{one-sentence goal}"
  non_goals:
    - "{non-goal 1}"
  project_type: "{user-facing | api-service | dev-tool | infrastructure | other}"
  situation: "{greenfield | brownfield-extension | brownfield-refactor | hybrid}"
  ambition: "{toy | feature | product}"
  risk_modifiers:
    - "{sensitive-data | external-exposure | irreversible | high-scale}"
depth_calibration:
  business:
    WHO: "{light | standard | deep}"
    WHY: "standard"
    WHAT: "standard"
    SUCCESS: "standard"
    SCOPE: "standard"
    RISK: "{light | standard | deep}"
  interaction:
    JOURNEY: "standard"
    HAPPY: "standard"
    EDGE: "standard"
    STATE: "standard"
    FEEDBACK: "standard"
    ACCESS: "{light | standard | deep}"
  tech:
    ARCH: "{light | standard | deep}"
    DATA: "{light | standard | deep}"
    INFRA: "standard"
    DEPEND: "standard"
    COMPAT: "{light | standard | deep}"
    SECURITY: "{light | standard | deep}"
coverage:
  business: 0.0
  interaction: 0.0
  tech: 0.0
---

# Q&A Log

## Research
<!--
Populated in Phase 0.5 for brownfield/hybrid situations.
Omit this section for greenfield.
Contents:
- Existing architecture (1-3 sentences)
- Relevant files/modules (file:line)
- Toolchain (build/test/lint)
- Constraints or conventions discovered
- Impact surface (for refactors)
-->

## Axis: Business

### WHO

### WHY

### WHAT

### SUCCESS

### SCOPE

### RISK

## Axis: Interaction

### JOURNEY

### HAPPY

### EDGE

### STATE

### FEEDBACK

### ACCESS

## Axis: Tech

### ARCH

### DATA

### INFRA

### DEPEND

### COMPAT

### SECURITY

## Open Items
