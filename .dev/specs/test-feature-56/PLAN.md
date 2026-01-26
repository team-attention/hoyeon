# Add Secondary Button Variant

> Add a secondary (outline) variant to the existing Button component while maintaining backward compatibility.

---

## Context

### Original Request
Add a Secondary variant to the existing Button component with outline styling (transparent background with colored border).

### Interview Summary
**Key Discussions**:
- Component type: Button variant (UI component)
- Variant style: Outline (transparent background with colored border)
- Backward compatibility: Must work when variant prop is omitted

**Research Findings**:
- Existing Button at `web/src/components/Button/Button.jsx` uses hardcoded `className="button-primary"`
- Uses plain CSS (not modules or Tailwind)
- Project has ESLint but no tests configured

---

## Work Objectives

### Core Objective
Add a `variant` prop to the Button component that supports "primary" (default) and "secondary" variants, with secondary using an outline style.

### Concrete Deliverables
- Modified `web/src/components/Button/Button.jsx` with variant prop support
- Modified `web/src/components/Button/Button.css` with secondary styles

### Definition of Done
- [ ] Button accepts `variant` prop with values "primary" and "secondary"
- [ ] `<Button>` without variant prop renders as primary (backward compatible)
- [ ] `<Button variant="secondary">` renders with outline styling
- [ ] `npm run lint` passes in web directory

### Must NOT Do (Guardrails)
- Do not add component state (useState) - use CSS pseudo-selectors
- Do not change onClick prop signature or make it optional
- Do not modify the default export pattern or index.js
- Do not create cascading styles where secondary inherits from primary
- Do not add TypeScript or PropTypes
- Do not modify global styles in index.css
- Do not install new packages

---

## Task Flow

```
TODO-1 (Button.jsx) → TODO-2 (Button.css) → TODO-Final (Verification)
```

---

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `component_path` (file) | work |
| 2 | `todo-1.component_path` | `css_path` (file) | work |
| Final | all outputs | - | verification |

---

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Sequential execution required (CSS depends on JSX changes) |

---

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 2 | `feat(web): add secondary button variant` | `web/src/components/Button/*` | always |

> **Note**: Single commit after CSS is complete since both changes are part of the same feature.

---

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `code_error` | Lint failure, syntax error | `/SyntaxError\|lint\|eslint/i` |
| `unknown` | Unclassifiable errors | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → Fix Task or halt |
| verification fails | Analyze immediately (no retry) → Fix Task or halt |

---

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Package Install | Denied (use existing deps only) |
| File Access | Repository only |
| Max Execution Time | 5 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## TODOs

### [ ] TODO 1: Update Button component with variant prop

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `component_path` (file): `web/src/components/Button/Button.jsx` - Modified Button component

**Steps**:
- [ ] Read current Button.jsx implementation
- [ ] Add `variant` prop with default value "primary"
- [ ] Change className to use template literal: `button-${variant}`
- [ ] Ensure backward compatibility (no variant = primary)

**Must NOT do**:
- Do not add useState or any React hooks
- Do not change onClick behavior
- Do not add prop validation (PropTypes/TypeScript)
- Do not modify index.js
- Do not run git commands

**References**:
- `web/src/components/Button/Button.jsx:1-9` - Current implementation

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `web/src/components/Button/Button.jsx`
- [ ] Component accepts `variant` prop
- [ ] Default variant is "primary" when prop omitted

*Static:*
- [ ] `cd web && npm run lint -- src/components/Button/Button.jsx` → no errors

*Runtime:*
- [ ] (no tests - SKIP)

---

### [ ] TODO 2: Add secondary button CSS styles

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `component_path` (file): `${todo-1.outputs.component_path}` - Button component with variant support

**Outputs**:
- `css_path` (file): `web/src/components/Button/Button.css` - CSS with secondary styles

**CSS Specification** (exact values to implement):
```css
.button-secondary {
  background-color: transparent;
  color: #646cff;
  border: 1px solid #646cff;
}

.button-secondary:hover {
  background-color: rgba(100, 108, 255, 0.1);
}
```

**Design Rationale**:
- Uses same brand color (#646cff) as primary for consistency
- Transparent background with colored border = standard outline pattern
- Hover adds subtle background tint (10% opacity of brand color)

**Steps**:
- [ ] Read current Button.css
- [ ] Add `.button-secondary` class with exact styles from CSS Specification above
- [ ] Add `.button-secondary:hover` state with exact styles from CSS Specification above
- [ ] Keep `.button-primary` styles unchanged

**Must NOT do**:
- Do not modify `.button-primary` styles
- Do not use CSS variables (keep it simple like existing code)
- Do not add focus/disabled states (out of scope)
- Do not run git commands

**References**:
- `web/src/components/Button/Button.css:1-8` - Current styles (primary uses #646cff)

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `web/src/components/Button/Button.css`
- [ ] `.button-secondary` has `background-color: transparent`
- [ ] `.button-secondary` has `color: #646cff`
- [ ] `.button-secondary` has `border: 1px solid #646cff`
- [ ] `.button-secondary:hover` has `background-color: rgba(100, 108, 255, 0.1)`
- [ ] `.button-primary` styles unchanged (still has `background-color: #646cff`)

*Static:*
- [ ] CSS is valid (no syntax errors)

*Runtime:*
- [ ] (no tests - SKIP)

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: npm

**Inputs**:
- `component_path` (file): `${todo-1.outputs.component_path}`
- `css_path` (file): `${todo-2.outputs.css_path}`

**Outputs**: (none)

**Steps**:
- [ ] Run ESLint on web directory
- [ ] Verify Button.jsx has variant prop
- [ ] Verify Button.css has secondary styles

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] `component_path` file exists
- [ ] `css_path` file exists
- [ ] Button.jsx contains `variant` prop handling

*Static:*
- [ ] `cd web && npm run lint` → exit 0

*Runtime:*
- [ ] (no tests configured - SKIP)
