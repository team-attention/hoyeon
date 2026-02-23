# Plan: memo-app

> Generated plan for session: memo-app

## Verification Summary

### Agent-Verifiable (A-items)

- A-1: File exists (test -f .playground/memo-app.html)
- A-2: Core functions defined (grep for createMemo, deleteMemo, etc.)
- A-3: No external dependencies (grep -c '<script src\|<link href' returns 0)
- A-4: Namespaced localStorage key (grep 'memo-app-memos')
- A-5: Dark theme colors present (grep '#1a1a2e')
- A-6: Responsive breakpoint (grep '600px')
- A-7: XSS prevention (grep 'escapeHtml\|textContent')

### Human-Required (H-items)

- H-1: Visual appearance matches dark theme (open in browser)
- H-2: Two-column layout renders correctly (visual check)
- H-3: CRUD flow feels intuitive (manual walkthrough)
- H-4: Mobile responsive layout works (resize browser to 600px)

### Sandbox Agent Testing (S-items)

_None_

### Verification Gaps

- No automated E2E tests (playground app, manual browser testing sufficient)
- No sandbox infrastructure in project for HTML apps

## External Dependencies Strategy

### Pre-work

_Review dependency graph and commit strategy before starting._

### During

_Follow commit strategy after each TODO completion._

### Post-work

_Run verification summary checks (A-items, H-items, S-items)._

## Context

### Original Request

.playground에 간단한 메모장 애플리케이션 만들어줘 — Build a simple memo/notepad app in the .playground/ directory

### Interview Summary

- Tech: Vanilla HTML/CSS/JS, single file (.playground/memo-app.html)
- Layout: Two-column (memo list left 250px, editor right fills remaining)
- Features: CRUD (create, edit, delete), search/filter, auto-save
- Persistence: localStorage with namespaced key `memo-app-memos`
- Theme: Dark (#1a1a2e, #16213e, #0f3460) with teal accent (#10d5c2)
- Title: Auto-derived from first line of content (no separate title field)
- Formatting: Plain text only (no markdown)
- Delete: Immediate (no undo toast), reveal-on-hover pattern
- Mobile: Single breakpoint 600px, list-first then editor on tap
- Sort: Newest first (by last modified timestamp)
- New memo trigger: '+' button at top of list panel
- Title fallback: 'Untitled' when first line is empty
- After delete: Select next memo in list, or show empty state

### Research Findings

- .playground/ is git-ignored — safe for experiments, no commits needed
- Existing pattern: todo-app.html (490 lines) — single file, inline CSS/JS, localStorage, dark theme
- CSS conventions: Flexbox layout, * reset, gradient buttons, 0.2s transitions, 600px breakpoint
- JS pattern: module-scope vars, Array.map() → innerHTML, escapeHtml() for XSS prevention
- localStorage: JSON.stringify/parse with try-catch, save on mutation
- Accessibility: ARIA labels, keyboard nav, semantic HTML
- No build step, no testing framework needed for playground apps

### Assumptions

- Plain text only (user said 간단한/simple — no markdown needed)
- Two-column layout (UX reviewer recommended, simplicity checker confirmed appropriate)
- Search kept for MVP (user's success criteria includes it) but no match highlighting
- Immediate delete without undo (matches todo-app pattern, simpler)
- 500ms debounce auto-save (5 lines of JS, prevents data loss vs save-on-blur)
- Namespaced localStorage key `memo-app-memos` to avoid collision with todo-app

## Work Objectives

### Core Objective

Build a simple memo/notepad application as a single HTML file in .playground/ with CRUD, search, localStorage persistence, and responsive dark theme

### Concrete Deliverables

- .playground/memo-app.html

### Definition of Done

- Can create new memos via '+' button
- Can edit memo content in textarea (auto-saves)
- Can delete memos via hover-reveal delete button
- Can search/filter memos by content
- Data persists via localStorage across browser sessions
- Two-column layout (list + editor) on desktop
- Responsive: list-first view on mobile (≤600px)
- Dark theme with teal accent matches existing playground apps

### Must NOT Do

- No external dependencies or CDN links
- No frameworks (React, Vue, Angular, etc.)
- No backend or API calls
- No separate files — everything in single HTML
- Do not modify existing playground apps
- No contenteditable — use textarea only
- No shared localStorage keys with todo-app ('todos', 'nextId')
- No ES6 modules — follow todo-app var/function convention
- No unrequested features (tags, markdown, timestamps display, export, word count)
- No match highlighting in search (over-engineering for MVP)
- No custom undo stack or undo toast for delete

## Task Flow

todo-1 (build memo app) → todo-final (verification). Sequential — verification depends on completed app file.

## Dependency Graph

- **todo-1**: requires [] → produces [app_path]
- **todo-final**: requires [app_path] → produces []

## Commit Strategy

- After `todo-1`: `feat(playground): build memo app with CRUD, search, localStorage`
  - Files: .playground/memo-app.html
  - Condition: File is in git-ignored .playground/ — commit optional, skip unless user requests

## TODOs

### [x] TODO 1: Build memo app HTML file

**Type**: Work
**Risk**: LOW

**Inputs**:
  _None_

**Outputs**:
  - **app_path** (file): Complete memo app single HTML file — `.playground/memo-app.html`

**Steps**:
  1. Create .playground/memo-app.html with HTML5 boilerplate (charset, viewport, title)
  2. Add inline CSS: * reset, body centering, dark theme colors (#1a1a2e bg, #16213e surface, #0f3460 input, #10d5c2 accent)
  3. Add CSS for two-column layout: .app-container with display:flex, .sidebar (width:250px, flex-shrink:0), .editor-panel (flex:1)
  4. Add CSS for memo list items: hover translateX(5px), teal border on hover, delete button opacity 0→1 on hover
  5. Add CSS for editor: textarea fills panel, border:none, bg matches theme, focus ring #10d5c2
  6. Add CSS for '+' new memo button: gradient background, hover lift effect
  7. Add CSS for search input at top of sidebar
  8. Add CSS for responsive @media (max-width:600px): sidebar full-width, editor hidden until memo selected, back button visible
  9. Add CSS for empty state (no memos / no memo selected)
  10. Add inline JS: state variables — var memos = [], var nextId = 1, var currentMemoId = null, var searchQuery = '', var saveTimeout = null
  11. Add JS: escapeHtml() function using textContent for XSS prevention
  12. Add JS: saveMemos() — localStorage.setItem('memo-app-memos', JSON.stringify({memos, nextId}))
  13. Add JS: loadMemos() — localStorage.getItem with try-catch, validate parsed data
  14. Add JS: createMemo() — push new {id, content:'', createdAt, updatedAt} to memos, select it, saveMemos(), renderList(), focus textarea
  15. Add JS: deleteMemo(id) — filter out memo, if deleted was current select next or null, saveMemos(), renderList(), renderEditor()
  16. Add JS: updateMemoContent() — find current memo, update content + updatedAt, debounced saveMemos(), update list item title
  17. Add JS: selectMemo(id) — set currentMemoId, renderEditor(), on mobile show editor panel
  18. Add JS: getFilteredMemos() — filter by searchQuery matching content (case-insensitive), sort by updatedAt descending
  19. Add JS: renderList() — map filtered memos to HTML strings, first line as title (or 'Untitled'), innerHTML assignment
  20. Add JS: renderEditor() — if currentMemoId, show textarea with memo content; else show empty state message
  21. Add JS: Event listeners — search input oninput, textarea oninput with debounce, '+' button onclick, memo item clicks via event delegation
  22. Add JS: Keyboard — Enter in search does nothing (real-time filter), no other special keys needed
  23. Add JS: Mobile back button — click returns to list view (toggle CSS class)
  24. Add JS: Init sequence — loadMemos(), renderList(), renderEditor()

**Must NOT Do**:
- Do not use contenteditable
- Do not use innerHTML for user content — use escapeHtml()
- Do not import external resources
- Do not add markdown rendering
- Do not add timestamps display in UI
- Do not run git commands

**References**:
- .playground/todo-app.html — primary pattern reference (490 lines, same architecture)
- .playground/todo-app.html:450-475 — localStorage save/load pattern
- .playground/todo-app.html:380-430 — render() with escapeHtml and innerHTML
- .playground/todo-app.html:1-50 — HTML boilerplate and CSS reset

**Acceptance Criteria**:

- *Functional*:
  - File .playground/memo-app.html exists and is valid HTML
  - Contains inline <style> with dark theme colors
  - Contains inline <script> with CRUD functions
  - createMemo function creates new memo and saves to localStorage
  - deleteMemo function removes memo and updates UI
  - updateMemoContent function modifies memo content with debounced save
  - selectMemo function switches active memo in editor
  - getFilteredMemos filters by search query
  - renderList builds memo list HTML from state
  - renderEditor shows textarea or empty state
  - loadMemos reads from localStorage with error handling
  - escapeHtml prevents XSS injection

- *Static*:
  - No external script/link/img tags
  - No console.error on page load
  - Uses namespaced localStorage key 'memo-app-memos'

- *Runtime*:
  - Manual browser test: create, edit, delete, search memos
  - Manual browser test: refresh page, data persists
  - Manual browser test: responsive layout at 600px

- *Cleanup*:
  _None_

---

### [x] TODO 2: Verification

**Type**: Verification
**Risk**: LOW

**Inputs**:
  - **app_path** (file): `${todo-1.outputs.app_path}`

**Outputs**:
  _None_

**Steps**:
  1. Verify .playground/memo-app.html exists (test -f)
  2. Verify file contains key functions: createMemo, deleteMemo, updateMemoContent, selectMemo, renderList, renderEditor, loadMemos, saveMemos, escapeHtml
  3. Verify no external dependencies: grep for <script src, <link href, <img src — should find none
  4. Verify localStorage key: grep for 'memo-app-memos'
  5. Verify dark theme colors: grep for #1a1a2e, #16213e, #10d5c2
  6. Verify responsive breakpoint: grep for 'max-width: 600px' or 'max-width:600px'
  7. Verify XSS prevention: grep for escapeHtml or textContent

**Must NOT Do**:
- Do not use Edit or Write tools
- Do not modify the app file
- Do not run git commands

**References**:
_None_

**Acceptance Criteria**:

- *Functional*:
  - File exists at .playground/memo-app.html
  - All 9 core functions defined (createMemo, deleteMemo, updateMemoContent, selectMemo, getFilteredMemos, renderList, renderEditor, loadMemos, saveMemos)
  - escapeHtml function present for XSS prevention
  - No external resource references found

- *Static*:
  - grep confirms localStorage key 'memo-app-memos'
  - grep confirms dark theme color #1a1a2e
  - grep confirms responsive breakpoint 600px

- *Runtime*:
  _None_

- *Cleanup*:
  _None_
