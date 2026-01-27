# Plan: Button Component with Primary Variant

> Create a reusable Button component with primary styling for the React 19 web application.

**Schema Version**: 1.1

---

## Context

### Original Request
Create a reusable Button component with primary variant as a foundational UI building block.

### Interview Summary
**Key Discussions**:
- Feature type: New component (Button)
- Variants: Primary only (keep it simple, extend later)
- Sizes: Single size (no size variants needed)
- Technology: JSX only, no TypeScript

**Research Findings**:
- `web/src/App.jsx:3-9` - Function component pattern (no hooks)
- `web/src/App.jsx:1` - CSS import pattern (`import './App.css'`)
- `web/src/main.jsx:1-10` - React 19 StrictMode setup
- `web/src/index.css:38-55` - Global button element styles (inherited by all `<button>` elements):
  - `border-radius: 8px`, `padding: 0.6em 1.2em`, `font-size: 1em`, `font-weight: 500`
  - Dark mode: `background-color: #1a1a1a`
  - Hover: `border-color: #646cff` (brand color)
- Project uses plain CSS files alongside components

**Primary Variant Definition**:
The `.button-primary` class adds distinctive styling on top of global button styles:
- `background-color: #646cff` (brand color from existing hover/link styles)
- `color: #ffffff` (white text for contrast)
- Hover: `background-color: #535bf2` (darker brand color from `a:hover`)
- Inherits all other properties from global `button` selector

---

## Work Objectives

### Core Objective
Create a Button component in `web/src/components/Button/` that renders with primary styling and accepts an onClick handler.

### Concrete Deliverables
- `web/src/components/Button/Button.jsx` - Button component
- `web/src/components/Button/Button.css` - Button styles
- `web/src/components/Button/index.js` - Component export

### Definition of Done
- [ ] Button renders with primary styling
- [ ] Button accepts onClick handler
- [ ] ESLint passes (`npm run lint`)
- [ ] Component can be imported and used

### Must NOT Do (Guardrails)
- Do not modify `web/src/index.css` global button styles
- Do not add TypeScript, PropTypes, or JSDoc type annotations
- Do not use CSS modules, styled-components, or CSS-in-JS
- Do not add extra variants (secondary, danger, etc.) beyond primary
- Do not add extra props (disabled, loading, icon, size) beyond onClick and children
- Do not create test files (no test framework configured)
- Do not use `.button` as the CSS class name (conflicts with index.css global selector)
- Do not use forwardRef, compound component patterns, or custom hooks

---

## Task Flow

```
TODO-1 (Create Button Component) → TODO-Final (Verification)
```

---

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `button_jsx`, `button_css`, `button_index` | work |
| Final | all outputs | - | verification |

---

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Single work TODO, no parallelization |

---

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(web): add Button component with primary variant` | `web/src/components/Button/*` | always |

> **Note**: No commit after Final (Verification is read-only).

---

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `env_error` | Permission denied, network timeout | `/EACCES\|ECONNREFUSED\|timeout/i` |
| `code_error` | Lint failure, syntax error | `/SyntaxError\|lint\|error/i` |
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

---

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Not required |
| Package Install | Denied (use existing deps only) |
| File Access | Repository only |
| Max Execution Time | 5 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## TODOs

### [] TODO 1: Create Button Component

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `button_jsx` (file): `web/src/components/Button/Button.jsx` - Button component
- `button_css` (file): `web/src/components/Button/Button.css` - Button styles
- `button_index` (file): `web/src/components/Button/index.js` - Component export

**Steps**:
- [ ] Create `web/src/components/Button/` directory
- [ ] Create `Button.jsx` with function component that accepts `children` and `onClick` props
- [ ] Create `Button.css` with `.button-primary` class (not `.button` to avoid index.css conflict)
- [ ] Create `index.js` that re-exports Button as default
- [ ] Verify component follows `App.jsx` patterns (CSS import, function component)

**Must NOT do**:
- Do not modify any existing files
- Do not add TypeScript or PropTypes
- Do not add extra variants or props beyond children and onClick
- Do not use `.button` CSS class (conflicts with global styles)
- Do not install new packages
- Do not run git commands

**References**:
- `web/src/App.jsx:1` - CSS import pattern
- `web/src/App.jsx:3-9` - Function component pattern
- `web/src/index.css:38-55` - Global button styles (avoid conflict)

**Acceptance Criteria**:

*Functional:*
- [] File exists: `test -f web/src/components/Button/Button.jsx`
- [] File exists: `test -f web/src/components/Button/Button.css`
- [] File exists: `test -f web/src/components/Button/index.js`
- [] Button.jsx exports function: `grep -q 'export.*function Button\|export default function Button' web/src/components/Button/Button.jsx`
- [] Button accepts onClick prop: `grep -q 'onClick' web/src/components/Button/Button.jsx`
- [] Button renders children: `grep -q 'children' web/src/components/Button/Button.jsx`
- [] CSS contains primary styling: `grep -q 'button-primary' web/src/components/Button/Button.css`
- [] CSS has brand color: `grep -q '#646cff' web/src/components/Button/Button.css`

*Static:*
- [] `cd web && npm run lint` → exit 0

*Runtime:*
- [] (SKIP - no test framework configured)

---

### [] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `npm`

**Inputs**:
- `button_jsx` (file): `${todo-1.outputs.button_jsx}`
- `button_css` (file): `${todo-1.outputs.button_css}`
- `button_index` (file): `${todo-1.outputs.button_index}`

**Outputs**: (none)

**Steps**:
- [ ] Verify all three files exist
- [ ] Run lint on the entire project
- [ ] Verify Button component can be imported

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [] All deliverables exist: `test -f web/src/components/Button/Button.jsx && test -f web/src/components/Button/Button.css && test -f web/src/components/Button/index.js`
- [] Button.jsx exports component: `grep -q 'export.*function Button\|export default function Button' web/src/components/Button/Button.jsx`
- [] Button.css contains primary class: `grep -q '\.button-primary' web/src/components/Button/Button.css`
- [] index.js re-exports Button: `grep -q "export.*from.*Button\|export.*Button" web/src/components/Button/index.js`

*Static:*
- [] `cd web && npm run lint` → exit 0

*Runtime:*
- [] (SKIP - no test framework configured)
