# Greeting Component

> Add a simple static greeting component following existing Button component pattern.

## Context

### Original Request
Add a simple greeting component that displays static text.

### Interview Summary
**Key Discussions**:
- Content type: Static text (hardcoded "Hello, World!")
- Structure: Follow existing Button component pattern (folder-based)

**Research Findings**:
- Project uses React + Vite (JavaScript, not TypeScript)
- Component pattern: `ComponentName/ComponentName.jsx`, `ComponentName.css`, `index.js`
- No test framework configured; lint available via `npm run lint`

## Work Objectives

### Core Objective
Create a simple Greeting component that displays static text, following the existing component patterns.

### Concrete Deliverables
- `web/src/components/Greeting/Greeting.jsx` - Component file
- `web/src/components/Greeting/Greeting.css` - Styles file
- `web/src/components/Greeting/index.js` - Export file

### Definition of Done
- [ ] All three files exist in `web/src/components/Greeting/`
- [ ] Component renders static greeting text
- [ ] `cd web && npm run lint` passes with no errors

### Must NOT Do (Guardrails)
- Do not add unnecessary props (variant, onClick, etc.) - this is static text only
- Do not use TypeScript or add type annotations
- Do not add PropTypes (project doesn't use them)
- Do not inline CSS - must use separate .css file
- Do not add external dependencies
- Do not over-engineer - keep it simple

## Task Flow

```
TODO-1 → TODO-Final
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `component_path`, `css_path`, `index_path` | work |
| Final | all outputs | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Sequential execution (single work task) |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(web): add Greeting component` | `web/src/components/Greeting/*` | always |

> **Note**: No commit after Final (Verification is read-only).

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `env_error` | Permission denied, npm not found | `/EACCES\|ENOENT\|command not found/i` |
| `code_error` | Lint failure, syntax error | `/eslint\|SyntaxError\|Parsing error/i` |
| `unknown` | Unclassifiable errors | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → (see below) |
| verification fails | Analyze immediately (no retry) → (see below) |

### After Analyze

| Category | Action |
|----------|--------|
| `env_error` | Halt + log to `issues.md` |
| `code_error` | Create Fix Task (depth=1 limit) |
| `unknown` | Halt + log to `issues.md` |

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Not needed |
| Package Install | Denied |
| File Access | Repository only |
| Max Execution Time | 2 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## TODOs

### [x] TODO 1: Create Greeting component files

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `component_path` (file): `web/src/components/Greeting/Greeting.jsx` - Main component file
- `css_path` (file): `web/src/components/Greeting/Greeting.css` - Styles file
- `index_path` (file): `web/src/components/Greeting/index.js` - Export file

**Steps**:
- [ ] Create directory `web/src/components/Greeting/`
- [ ] Create `Greeting.jsx` with CSS import and static "Hello, World!" text
- [ ] Create `Greeting.css` with basic `.greeting` class styling
- [ ] Create `index.js` that re-exports the default from `Greeting.jsx`

**Must NOT do**:
- Do not add props like `variant`, `onClick`, `children` - this is static text
- Do not use TypeScript syntax
- Do not add PropTypes validation
- Do not inline styles - use the CSS file
- Do not run git commands

**References**:
- `web/src/components/Button/Button.jsx:1-9` - Component pattern (CSS import, default export)
- `web/src/components/Button/index.js` - Re-export pattern
- `web/src/components/Button/Button.css:1-18` - CSS class naming

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `web/src/components/Greeting/Greeting.jsx`
- [ ] File exists: `web/src/components/Greeting/Greeting.css`
- [ ] File exists: `web/src/components/Greeting/index.js`
- [ ] Greeting.jsx imports `./Greeting.css`
- [ ] Greeting.jsx exports default function
- [ ] index.js re-exports from `./Greeting`

*Static:*
- [ ] `cd web && npm run lint -- src/components/Greeting/` → no errors

*Runtime:*
- [ ] (No tests - test framework not configured)

---

### [x] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: npm

**Inputs**:
- `component_path` (file): `${todo-1.outputs.component_path}`
- `css_path` (file): `${todo-1.outputs.css_path}`
- `index_path` (file): `${todo-1.outputs.index_path}`

**Outputs**: (none)

**Steps**:
- [ ] Verify all deliverable files exist
- [ ] Run lint on entire web project
- [ ] Verify component structure matches pattern

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] All deliverables from Work Objectives exist
- [ ] `component_path` file contains default export function
- [ ] `css_path` file contains `.greeting` class
- [ ] `index_path` file re-exports Greeting

*Static:*
- [ ] `cd web && npm run lint` → exit 0 (no errors)

*Runtime:*
- [ ] (No tests - test framework not configured, SKIP)
