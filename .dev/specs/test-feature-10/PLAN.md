# Plan: Card Component

> Create a reusable Card component with title and content support for the React 19 web application.

**Schema Version**: 1.1

---

## Context

### Original Request
Add a Card component to the web app as a test/dummy feature for workflow testing.

### Interview Summary
**Key Discussions**:
- Feature type: Test/dummy feature for specify workflow testing
- Component: Card with title and children props
- Styling: Plain CSS with border/shadow
- Follow existing Button component pattern

**Research Findings**:
- `web/src/components/Button/Button.jsx` - Function component pattern (no hooks, no PropTypes)
- `web/src/components/Button/Button.css` - Plain CSS with semantic class names
- `web/src/components/Button/index.js` - Barrel export pattern
- `web/src/App.jsx:1` - CSS import pattern (`import './App.css'`)
- Project uses React 19, Vite, ESLint, plain JavaScript (no TypeScript)

---

## Work Objectives

### Core Objective
Create a Card component in `web/src/components/Card/` that renders a container with a title heading and children content.

### Concrete Deliverables
- `web/src/components/Card/Card.jsx` - Card component
- `web/src/components/Card/Card.css` - Card styles
- `web/src/components/Card/index.js` - Component export

### Definition of Done
- [ ] Card renders with title prop as heading and children as content
- [ ] Card has visible border and shadow styling
- [ ] `cd web && npm run lint` passes
- [ ] Component can be imported via `import Card from './components/Card'`

### Must NOT Do (Guardrails)
- Do not modify existing components (Button, App, etc.)
- Do not modify `web/src/index.css` global styles
- Do not add TypeScript, PropTypes, or JSDoc type annotations
- Do not use CSS modules, styled-components, or CSS-in-JS
- Do not add extra props beyond `title` and `children`
- Do not add `variant`, `className`, `onClick`, or other flexibility props
- Do not create test files (no test framework configured)
- Do not install new packages
- Do not create a root components barrel file

---

## Task Flow

```
TODO-1 (Create Card Component) → TODO-Final (Verification)
```

---

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `card_jsx`, `card_css`, `card_index` | work |
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
| 1 | `feat(web): add Card component` | `web/src/components/Card/*` | always |

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

### [ ] TODO 1: Create Card Component

**Type**: work

**Required Tools**: (none)

**Inputs**: (none - first task)

**Outputs**:
- `card_jsx` (file): `web/src/components/Card/Card.jsx` - Card component
- `card_css` (file): `web/src/components/Card/Card.css` - Card styles
- `card_index` (file): `web/src/components/Card/index.js` - Component export

**Steps**:
- [ ] Create `web/src/components/Card/` directory
- [ ] Create `Card.jsx` with function component that accepts `title` and `children` props
- [ ] Render title as `<h3>` and children inside a wrapper div with class `card`
- [ ] Create `Card.css` with `.card` class (border, shadow, padding, border-radius)
- [ ] Create `index.js` that re-exports Card as default
- [ ] Verify component follows Button/App.jsx patterns (CSS import, function component)

**Must NOT do**:
- Do not modify any existing files
- Do not add TypeScript or PropTypes
- Do not add extra props beyond title and children
- Do not add variant, className, onClick, or other flexibility props
- Do not install new packages
- Do not run git commands

**References**:
- `web/src/components/Button/Button.jsx` - Function component pattern
- `web/src/components/Button/Button.css` - Plain CSS pattern
- `web/src/components/Button/index.js` - Barrel export pattern
- `web/src/App.jsx:1` - CSS import pattern

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `test -f web/src/components/Card/Card.jsx`
- [ ] File exists: `test -f web/src/components/Card/Card.css`
- [ ] File exists: `test -f web/src/components/Card/index.js`
- [ ] Card.jsx exports function: `grep -q 'export.*function Card\|export default function Card' web/src/components/Card/Card.jsx`
- [ ] Card accepts title prop: `grep -q 'title' web/src/components/Card/Card.jsx`
- [ ] Card renders children: `grep -q 'children' web/src/components/Card/Card.jsx`
- [ ] CSS contains card class: `grep -q '\.card' web/src/components/Card/Card.css`
- [ ] CSS has box-shadow: `grep -q 'box-shadow' web/src/components/Card/Card.css`

*Static:*
- [ ] `cd web && npm run lint` → exit 0

*Runtime:*
- [ ] (SKIP - no test framework configured)

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `npm`

**Inputs**:
- `card_jsx` (file): `${todo-1.outputs.card_jsx}`
- `card_css` (file): `${todo-1.outputs.card_css}`
- `card_index` (file): `${todo-1.outputs.card_index}`

**Outputs**: (none)

**Steps**:
- [ ] Verify all three files exist
- [ ] Run lint on the entire web project
- [ ] Verify Card component exports correctly

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] All deliverables exist: `test -f web/src/components/Card/Card.jsx && test -f web/src/components/Card/Card.css && test -f web/src/components/Card/index.js`
- [ ] Card.jsx exports component: `grep -q 'export.*function Card\|export default function Card' web/src/components/Card/Card.jsx`
- [ ] Card.css contains card class: `grep -q '\.card' web/src/components/Card/Card.css`
- [ ] index.js re-exports Card: `grep -q "export.*from.*Card\|export.*Card" web/src/components/Card/index.js`

*Static:*
- [ ] `cd web && npm run lint` → exit 0

*Runtime:*
- [ ] (SKIP - no test framework configured)
