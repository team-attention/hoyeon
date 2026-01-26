# Plan: test-feature2 - Hello World React App

> Create a minimal React web application displaying "Hello World" using Vite

## Context

### Original Request
Create a simple React web application ("test-feature2") - simple react web only.

### Interview Summary
**Key Discussions**:
- App purpose: Hello World (simple display page)
- Location: New `/web` folder at project root
- Stack: Vite + React (minimal setup)

**Research Findings**:
- No existing React code in this project
- Project is a Claude Code plugin (`.claude/` based)
- `/web` will be completely self-contained

## Work Objectives

### Core Objective
Create a minimal, working React application that displays "Hello World" in the browser.

### Concrete Deliverables
- `/web/package.json` - Dependencies and scripts
- `/web/vite.config.js` - Vite configuration
- `/web/index.html` - HTML entry point
- `/web/src/main.jsx` - React entry point
- `/web/src/App.jsx` - Main React component
- `/web/src/App.css` - Basic styling

### Definition of Done
- [ ] `cd web && npm install` succeeds
- [ ] `cd web && npm run dev` starts development server
- [ ] Browser displays "Hello World" page
- [ ] No console errors in browser

### Must NOT Do (Guardrails)
- Do not modify any files outside `/web` directory
- Do not add TypeScript, ESLint, or testing libraries
- Do not add routing (React Router) or state management (Redux)
- Do not create backend/API code
- Do not create multiple components - keep it to single App.jsx
- Do not over-configure vite.config.js

---

## Task Flow

```
TODO-1 (Initialize) → TODO-2 (Component) → TODO-Final (Verify)
```

## Dependency Graph

| TODO | Requires (Inputs) | Produces (Outputs) | Type |
|------|-------------------|-------------------|------|
| 1 | - | `project_dir` (file) | work |
| 2 | `todo-1.project_dir` | `app_component` (file) | work |
| Final | all outputs | - | verification |

## Parallelization

| Group | TODOs | Reason |
|-------|-------|--------|
| - | - | Sequential execution required (each depends on previous) |

## Commit Strategy

| After TODO | Message | Files | Condition |
|------------|---------|-------|-----------|
| 1 | `feat(web): initialize Vite React project` | `web/*` | always |
| 2 | `feat(web): add Hello World component` | `web/src/*` | always |

> **Note**: No commit after Final (Verification is read-only).

## Error Handling

### Failure Categories

| Category | Examples | Detection Pattern |
|----------|----------|-------------------|
| `env_error` | npm not installed, network timeout | `/ENOENT\|ECONNREFUSED\|timeout/i` |
| `code_error` | Syntax error, import failure | `/SyntaxError\|Cannot find module/i` |
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
| Network Access | Allowed (for npm install) |
| Package Install | Allowed (in /web only) |
| File Access | `/web` directory only |
| Max Execution Time | 5 minutes per TODO |
| Git Operations | Denied (Orchestrator handles) |

---

## TODOs

### [x] TODO 1: Initialize Vite React Project

**Type**: work

**Required Tools**: `npm`

**Inputs**: (none - first task)

**Outputs**:
- `project_dir` (file): `./web` - Vite React project directory

**Steps**:
- [ ] Create `/web` directory
- [ ] Initialize Vite React project with `npm create vite@latest`
- [ ] Configure for React (JavaScript)
- [ ] Run `npm install` to install dependencies
- [ ] Verify project structure exists

**Must NOT do**:
- Do not use TypeScript template
- Do not add any extra dependencies
- Do not modify files outside `/web`
- Do not run git commands

**References**:
- Vite official: `npm create vite@latest web -- --template react`

**Acceptance Criteria**:

*Functional:*
- [ ] Directory exists: `./web`
- [ ] File exists: `./web/package.json`
- [ ] File exists: `./web/vite.config.js`
- [ ] File exists: `./web/index.html`
- [ ] Directory exists: `./web/node_modules`

*Static:*
- [ ] `cat ./web/package.json` → Valid JSON with "react" dependency

*Runtime:*
- [ ] (deferred to TODO Final)

---

### [x] TODO 2: Update Hello World Component

**Type**: work

**Required Tools**: (none)

**Inputs**:
- `project_dir` (file): `${todo-1.outputs.project_dir}` - Vite project directory

**Outputs**:
- `app_component` (file): `./web/src/App.jsx` - Hello World component

**Steps**:
- [ ] Update `./web/src/App.jsx` to display "Hello World"
- [ ] Simplify the component (remove Vite boilerplate)
- [ ] Update `./web/src/App.css` with minimal styling
- [ ] Ensure clean, minimal code

**Must NOT do**:
- Do not create additional components
- Do not add state management or hooks
- Do not add routing
- Do not modify files outside `/web/src`
- Do not run git commands

**References**:
- Simple React functional component pattern

**Acceptance Criteria**:

*Functional:*
- [ ] File exists: `./web/src/App.jsx`
- [ ] File contains "Hello World" text
- [ ] Component is a valid React functional component

*Static:*
- [ ] `grep -q "Hello World" ./web/src/App.jsx` → exit 0

*Runtime:*
- [ ] (deferred to TODO Final)

---

### [x] TODO Final: Verification

**Type**: verification (read-only)

**Required Tools**: `npm`

**Inputs**:
- `project_dir` (file): `${todo-1.outputs.project_dir}`
- `app_component` (file): `${todo-2.outputs.app_component}`

**Outputs**: (none)

**Steps**:
- [ ] Verify all deliverables exist
- [ ] Run `npm run build` to verify build works
- [ ] Check for any errors

**Must NOT do**:
- Do not modify any files
- Do not add new features
- Do not fix errors (report only)
- Do not run git commands

**Acceptance Criteria**:

*Functional:*
- [ ] All deliverables from Work Objectives exist
- [ ] `./web/package.json` exists
- [ ] `./web/src/App.jsx` exists and contains "Hello World"
- [ ] `./web/vite.config.js` exists

*Static:*
- [ ] `cd web && npm run build` → exit 0 (builds successfully)

*Runtime:*
- [ ] Build output exists: `./web/dist/index.html`
