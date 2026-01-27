# Button Variants

> Add primary/secondary variant support to the existing Button component.

## Context

### Original Request
Add primary/secondary variant support to the existing Button component.

### Interview Summary
**Key Discussions**:
- Component type: Button (extending existing)
- Variants needed: Basic (primary/secondary)
- Approach: Extend existing Button component with variant prop

**Research Findings**:
- Project uses React 19.2.0 + Vite (JavaScript, not TypeScript)
- Component pattern: `ComponentName/ComponentName.jsx`, `.css`, `index.js`
- Current Button has hardcoded `className="button-primary"`
- No test framework configured; lint available via `npm run lint`

## Work Objectives

### Core Objective
Add a `variant` prop to the Button component that supports "primary" (default) and "secondary" styles while maintaining backward compatibility.

### Concrete Deliverables
- Updated `web/src/components/Button/Button.jsx` - Add variant prop with default
- Updated `web/src/components/Button/Button.css` - Add secondary styles

### Definition of Done
- [ ] Button with no variant prop renders as primary (backward compatible)
- [ ] Button with variant="primary" renders as primary
- [ ] Button with variant="secondary" renders with secondary styles
- [ ] `cd web && npm run lint` passes with no errors

### Must NOT Do (Guardrails)
- Do not add unnecessary props beyond variant
- Do not use TypeScript or add type annotations
- Do not add PropTypes validation
- Do not change existing primary style colors
- Do not add external dependencies (no classnames/clsx library)
- Do not use inline styles for variant theming
- Do not modify the export structure in index.js
- Do not over-engineer with complex className merging

## Task Flow

```
TODO-1 → TODO-Final
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `component_path`, `css_path` | work |
| Final | all outputs | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Sequential execution (single work task) |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(button): add primary/secondary variants` | `web/src/components/Button/*` | always |

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

### [ ] TODO 1: Add variant prop to Button component

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `component_path` (file): `web/src/components/Button/Button.jsx` - Updated component file
- `css_path` (file): `web/src/components/Button/Button.css` - Updated styles file

**Steps**:
- [ ] Update `Button.jsx` to accept `variant` prop with default value "primary"
- [ ] Apply className based on variant using simple ternary or template literal
- [ ] Add `.button-secondary` styles to `Button.css` with: background `#6c757d`, text `#ffffff`, hover background `#5a6268`
- [ ] Add `.button-secondary:hover` rule for hover state

**Must NOT do**:
- Do not add classnames or clsx library - use simple template literal
- Do not add TypeScript or PropTypes
- Do not change existing `.button-primary` colors (#646cff, #535bf2)
- Do not modify `index.js` export structure
- Do not add props beyond `variant` (keep children, onClick as-is)
- Do not run git commands

**References**:
- `web/src/components/Button/Button.jsx:1-9` - Current component structure
- `web/src/components/Button/Button.css:1-8` - Current primary styles

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `web/src/components/Button/Button.jsx`
- [ ] File exists: `web/src/components/Button/Button.css`
- [ ] Button.jsx accepts `variant` prop with default "primary"
- [ ] Button.jsx applies `button-primary` class when variant is "primary" or undefined
- [ ] Button.jsx applies `button-secondary` class when variant is "secondary"
- [ ] Button.css contains `.button-secondary` class with background `#6c757d` and color `#ffffff`
- [ ] Button.css contains `.button-secondary:hover` rule with background `#5a6268`

*Static:*
- [ ] `cd web && npm run lint -- src/components/Button/` → no errors

*Runtime:*
- [ ] (No tests - test framework not configured)

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: npm

**Inputs**:
- `component_path` (file): `${todo-1.outputs.component_path}`
- `css_path` (file): `${todo-1.outputs.css_path}`

**Outputs**: (none)

**Steps**:
- [ ] Verify all deliverable files exist
- [ ] Verify component accepts variant prop
- [ ] Verify CSS contains both primary and secondary styles
- [ ] Run lint on entire web project

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] All deliverables from Work Objectives exist
- [ ] `component_path` file contains `variant` prop handling
- [ ] `component_path` file has default value "primary" for variant
- [ ] `css_path` file contains `.button-primary` class
- [ ] `css_path` file contains `.button-secondary` class
- [ ] `css_path` file contains `.button-secondary:hover` rule

*Static:*
- [ ] `cd web && npm run lint` → exit 0 (no errors)

*Runtime:*
- [ ] (No tests - test framework not configured, SKIP)
