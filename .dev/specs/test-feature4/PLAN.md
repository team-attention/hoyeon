# Enhance Button Component with Variants and Sizes

> Add variant (primary/secondary/danger) and size (sm/md/lg) props to the existing Button component in the web app.

## Context

### Original Request
Add a Button component to the web app. Clarified as: enhance the existing Button component with variant and size support.

### Interview Summary
**Key Discussions**:
- **Scope**: Enhance existing Button (not replace)
- **Features**: Add variant (primary/secondary/danger) and size (sm/md/lg) props
- **Backward compatibility**: Existing `<Button onClick={fn}>text</Button>` must continue working

**Research Findings**:
- Existing Button at `web/src/components/Button/` uses functional component pattern with co-located CSS
- React 19.2.0 + Vite 7.2.4 project, plain CSS, ESLint with react-hooks/react-refresh
- Component pattern: directory per component, barrel export via `index.js`
- Button files exist on disk but show as deleted in git status (unstaged state)

## Work Objectives

### Core Objective
Extend the existing Button component to support multiple visual variants and sizes via props, while maintaining backward compatibility.

### Concrete Deliverables
- Updated `web/src/components/Button/Button.jsx` with `variant` and `size` props
- Updated `web/src/components/Button/Button.css` with variant and size styles

### Definition of Done
- [ ] `<Button>` without props renders identically to current behavior
- [ ] `<Button variant="secondary">` renders with secondary styling
- [ ] `<Button variant="danger">` renders with danger styling
- [ ] `<Button size="sm">` renders smaller than default
- [ ] `<Button size="lg">` renders larger than default
- [ ] `cd web && npx eslint src/components/Button/` → no errors

### Must NOT Do (Guardrails)
- Do not use SCSS nesting syntax (`&`) — plain CSS only
- Do not add external dependencies
- Do not use CSS-in-JS or Tailwind
- Do not break existing Button API (`children`, `onClick` props)
- Do not add TypeScript (project uses `.jsx`)
- Do not over-engineer — simple className concatenation, no complex abstractions

---

## Pre-flight

> **Orchestrator must execute before dispatching any TODO.**

The Button component files are marked as deleted in git status. They exist on disk but are unstaged. Before starting work, Orchestrator must restore them:

```bash
cd web && git checkout -- src/components/Button/Button.jsx src/components/Button/Button.css src/components/Button/index.js
```

**Starting state of files after restore:**

`web/src/components/Button/Button.jsx`:
```jsx
import './Button.css'

export default function Button({ children, onClick }) {
  return (
    <button className="button-primary" onClick={onClick}>
      {children}
    </button>
  )
}
```

`web/src/components/Button/Button.css`:
```css
.button-primary {
  background-color: #646cff;
  color: #ffffff;
}

.button-primary:hover {
  background-color: #535bf2;
}
```

`web/src/components/Button/index.js`:
```js
export { default } from './Button.jsx'
```

## Task Flow

```
Pre-flight (restore files) → TODO-1 (Update JSX + CSS) → TODO-Final (Verification)
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| Pre-flight | - | restored files on disk | orchestrator step |
| 1 | restored files | `button_jsx` (file), `button_css` (file) | work |
| Final | `todo-1.button_jsx`, `todo-1.button_css` | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Sequential — only 2 TODOs |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(button): add variant and size props` | `web/src/components/Button/Button.jsx`, `web/src/components/Button/Button.css` | always |

> **Note**: No commit after Final (Verification is read-only).

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `code_error` | Lint failure, syntax error | `/SyntaxError\|lint\|Parsing error/i` |
| `unknown` | Unclassifiable errors | Default fallback |

### Failure Handling Flow

| Scenario | Action |
|----------|--------|
| work fails | Retry up to 2 times → Analyze → (see below) |
| verification fails | Analyze immediately (no retry) → (see below) |

### After Analyze

| Category | Action |
|----------|--------|
| `code_error` | Create Fix Task (depth=1 limit) |
| `unknown` | Halt + log to `issues.md` |

## Runtime Contract

| Aspect | Specification |
|--------|---------------|
| Working Directory | Repository root |
| Network Access | Not required |
| Package Install | Denied |
| File Access | Repository only |
| Max Execution Time | 5 minutes per TODO |
| Git Operations | Denied for Workers (Orchestrator handles pre-flight restore and commits) |

---

## TODOs

### [x] TODO 1: Add variant and size props to Button

**Type**: work

**Required Tools**: (none)

**Inputs**: (none — first task)

**Outputs**:
- `button_jsx` (file): `web/src/components/Button/Button.jsx` - Updated Button component
- `button_css` (file): `web/src/components/Button/Button.css` - Updated Button styles

**Steps**:
- [ ] Read existing `web/src/components/Button/Button.jsx`
- [ ] Add `variant` prop (default: `'primary'`) and `size` prop (default: `'md'`) to destructured props
- [ ] Update className to compose: `button button--${variant} button--${size}`
- [ ] Read existing `web/src/components/Button/Button.css`
- [ ] Add base `.button` class with shared styles (cursor, border, border-radius, font-family)
- [ ] Add variant classes: `.button--primary` (existing blue #646cff), `.button--secondary` (gray #6c757d), `.button--danger` (red #dc3545), each with hover states
- [ ] Add size classes: `.button--sm` (smaller padding/font), `.button--md` (default padding/font), `.button--lg` (larger padding/font)
- [ ] Verify `web/src/components/Button/index.js` barrel export still works (no changes needed)

**Must NOT do**:
- Do not use SCSS `&` nesting — write full selectors (`.button--primary`, not `&--primary`)
- Do not add new files
- Do not add external dependencies
- Do not run git commands

**References**:
- `web/src/components/Button/Button.jsx:3-8` - Existing component structure
- `web/src/components/Button/Button.css:1-8` - Existing CSS pattern
- `web/src/components/Button/index.js:1` - Barrel export

**Acceptance Criteria**:

*Functional:*
- [x] Button.jsx exports a component accepting `variant`, `size`, `children`, `onClick` props
- [x] Default rendering (no variant/size) produces className containing `button--primary` and `button--md`
- [x] `variant="danger"` produces className containing `button--danger`
- [x] `size="lg"` produces className containing `button--lg`

*Static:*
- [x] `cd web && npx eslint src/components/Button/Button.jsx` → exit 0
- [x] `cd web && npx eslint src/components/Button/index.js` → exit 0

*Runtime:*
- [x] (no tests — SKIP)

---

### [ ] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `npx`, `eslint`

**Inputs**:
- `button_jsx` (file): `${todo-1.outputs.button_jsx}` - Updated Button component
- `button_css` (file): `${todo-1.outputs.button_css}` - Updated Button styles

**Outputs**: (none)

**Steps**:
- [ ] Verify Button.jsx file exists and contains variant/size props
- [ ] Verify Button.css file contains all variant and size classes
- [ ] Verify index.js barrel export is intact
- [ ] Run lint on Button directory
- [ ] Verify backward compatibility: default props produce primary+md classes

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `web/src/components/Button/Button.jsx`
- [ ] File exists: `web/src/components/Button/Button.css`
- [ ] File exists: `web/src/components/Button/index.js`
- [ ] Button.jsx contains `variant` and `size` in props destructuring
- [ ] Button.css contains classes: `.button--primary`, `.button--secondary`, `.button--danger`, `.button--sm`, `.button--md`, `.button--lg`

*Static:*
- [ ] `cd web && npx eslint src/components/Button/` → exit 0

*Runtime:*
- [ ] (no tests — SKIP)
