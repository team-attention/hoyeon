# Learnings

## T1
- Tailwind CSS v4 (installed by default) uses CSS-first config: no `tailwind.config.js`, configure via `@theme {}` in index.css with CSS custom properties
- Tailwind v4 requires `@tailwindcss/vite` plugin (not PostCSS plugin); install with `--legacy-peer-deps` due to Vite 8 peer conflict
- `@testing-library/dom` must be installed separately — it is a peer dep of `@testing-library/react` not automatically resolved
- Use `defineConfig` from `vitest/config` (not `vite`) to get proper TypeScript typing for `test` block in vite.config.ts
- Add `"vitest/globals"` to `types[]` in both `tsconfig.app.json` and `tsconfig.node.json` to avoid TS errors on `vi`, `describe`, `it`, `expect` globals
- React 19 with `jsx: "react-jsx"` mode: do NOT import React explicitly in components (causes `noUnusedLocals` TS error); use named imports like `import { useState } from 'react'`
- All npm installs with `@tailwindcss/vite` installed require `--legacy-peer-deps` flag for the session
- Framer editor dark theme base colors: bg=#1a1a1a, surface=#242424, panel=#1e1e1e, toolbar=#252525, border=#333, text=#e0e0e0, muted=#888, canvas=#141414, accent=#0a84ff

## T2
- Zustand v5 with Immer middleware: use `immer` from `zustand/middleware/immer` (not `produce` directly); state mutations inside `set((state) => { ... })` are automatically immutable via Immer
- Manual undo/redo history stack (past/future arrays of JSON-serialized snapshots) is simpler and more testable than temporal middleware like `zundo`
- `useEditorStore.setState({ ... })` can be called directly in tests to reset store between test runs — no need for a dedicated reset action
- Element tree uses flat `ElementMap` (Record<string, Element>) for O(1) access with `rootIds[]` tracking top-level elements
- Immer draft state means `Object.assign(state.elements[id], patch)` works correctly for partial updates

## T3
- EditorLayout, LeftPanel components were already created by T1 with correct data-testid attributes; T3 added Toolbar and RightPanel components
- Toolbar component lives in `src/components/Toolbar/Toolbar.tsx` (capital T directory matching file_scope)
- RightPanel lives in `src/components/editor/RightPanel.tsx` alongside EditorLayout and LeftPanel
- At 1024px viewport: left (240px) + right (240px) = 480px, canvas gets remaining ~544px — comfortably above 400px usability threshold
- All editor-layout tests (10) pass with existing EditorLayout + LeftPanel; Toolbar/RightPanel additions don't break existing test suite

## T4
- happy-dom's `WheelEvent` constructor does not propagate `deltaY` from `EventInit` — use a plain object cast to `WheelEvent` (`{ deltaY, metaKey, clientX, ... } as unknown as WheelEvent`) for unit testing wheel handlers
- `useCanvasNavigation` exposes all event handlers directly so tests can call them without DOM event dispatching
- CSS transform `translate(x, y) scale(zoom)` with `transformOrigin: '0 0'` is the correct approach for pan+zoom; zoom-centered-on-cursor formula: `newX = cursorX - (newZoom/oldZoom) * (cursorX - prevX)`
- Canvas pan tracking uses a `ref` for mouse drag state to avoid stale closure issues; `isPanning` UI indicator is separate `useState`
- Space key `e.target` can be `null` in synthetic keyboard events — always null-check before accessing `.tagName`

## T7
- `LayersPanel` component lives in `src/components/LeftPanel/LayersPanel.tsx`; `LeftPanel.tsx` imports it from `../LeftPanel/LayersPanel`
- Auto-expand parent elements with children using `useEffect` + `setExpandedIds`; do NOT use render-time side-effects (causes stale closure issues)
- `reorderElement` action added to editorStore: moves element within its parent's children array (or rootIds for root elements) and updates zIndex for all siblings to match new index order
- Drag-to-reorder only works within the same parent (cross-parent drops are silently ignored)
- `dragIdRef` (useRef) tracks the dragged element id across dragStart/drop events since dataTransfer is not always reliable in jsdom tests
- Pre-existing `canvas-navigation.test.tsx` had unused `fireEvent` import causing `noUnusedLocals` TS build error; removed the unused import to fix build

## T11
- Persistence module lives in `src/store/persistence.ts` — standalone, no React deps; store is accessed via `useEditorStore.getState()` and `useEditorStore.setState()` directly
- `setNotificationHandler()` enables test-time interception of warn/error notifications without coupling to any UI component
- Auto-save uses `useEditorStore.subscribe()` with a debounced `setTimeout` (2 s); unsubscribe returned for cleanup
- `localStorage` mock must be assigned via `Object.defineProperty(globalThis, 'localStorage', ...)` with `configurable: true` so tests can reset between runs
- `vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync()` is required to test debounced auto-save without real delays
- Export uses `document.createElement('a')` + `URL.createObjectURL` pattern; both must be mocked in tests (jsdom lacks Blob URL support)
- Schema validation checks: `schemaVersion === SCHEMA_VERSION` (exact match), `elements` is a non-null non-array object, `rootIds` is an array

## T5
- Use `useRef` for drag state in resize/move handlers to avoid stale closure issues (same pattern as T4's pan tracking)
- `setPointerCapture` on the drag target ensures pointerMove/pointerUp events fire even when cursor leaves the element
- Resize logic for directional handles: `w`/`n` handles adjust both position (x/y) and dimensions; `e`/`s` handles only adjust dimensions
- Minimum size clamp uses `Math.min(dx, origSize - MIN_SIZE)` for the delta to prevent x/y from moving past the minimum boundary
- For multi-select drag, iterate all `selectedIds` and apply `orig[id] + delta` — store each element's original position at pointerDown to avoid cumulative drift
- Dynamic `require()` inside Vitest tests causes module resolution failure; always use static top-level imports for component rendering tests
- `useEditorStore.setState({...})` for store reset in beforeEach should NOT include functions (canUndo, canRedo, etc.) — only reset plain data fields

## T6
- `ComponentLibrary` and `componentTypes.ts` already existed in `src/components/library/` (not `LeftPanel/` as task file_scope stated); tests import from `../components/library/ComponentLibrary`
- Wrap `e.dataTransfer` calls in null-check (`if (e.dataTransfer)`) — jsdom's `fireEvent.dragStart` without explicit `dataTransfer` option yields a DataTransfer with no `setData` method
- Canvas drag-drop: `DRAG_DATA_KEY = 'application/x-component-id'` used for library→canvas drops; fall back to `text/plain` for broader compatibility
- `createDefaultElement.ts` factory returns fully-typed `Element` union with all required fields — do not use partials since store's `addElement` requires complete `Element`
- Store's `useEditorStore.setState()` in `beforeEach` must include `breakpoint: 'desktop'` when resetting (already noted in T9 learnings — confirmed again here)
- Drag-drop coordinate calculation: `canvasX = (clientX - rect.left - transform.x) / transform.zoom` handles pan and zoom offset; jsdom has no layout so rect is (0,0) in tests

## T13
- `useKeyboardShortcuts` hook registers `document.addEventListener('keydown', ...)` inside `useEffect`; the store is accessed via `useEditorStore.getState()` at event time (not captured at mount) to always read fresh state
- Suppress shortcuts during text editing by checking `e.target` for `input`, `textarea`, `select` tags or `isContentEditable === true` — test by firing `keyDown` on the input element itself (not document)
- Internal clipboard is a `useRef<Element[]>` — never stored in Zustand so it doesn't pollute undo history
- Stale TypeScript build cache (`.tsbuildinfo`) can cause false "module has no exported member" errors even when the type is present; delete `tsconfig.app.tsbuildinfo` to clear
- Paste/duplicate use a `cloneElementTree` helper that remaps all descendant ids to avoid id collisions; only root-level clipboard items are iterated (children are included via subtree traversal)
- When destructuring store state for use across multiple `set()` calls, only take values actually used in the outer scope — values used only inside `set()` callbacks should be accessed via `state.*` not outer destructuring (avoids `noUnusedLocals` TS errors)

## T9
- `Breakpoint` type and `BREAKPOINT_WIDTHS` constant added to `editorStore.ts`; exported from `store/index.ts`
- `BreakpointSwitcher` is a standalone component using `useEditorStore` directly — no props needed; lives at `src/components/Toolbar/BreakpointSwitcher.tsx`
- Toolbar renders BreakpointSwitcher between two `flex: 1` spacers to center it in the toolbar
- Canvas viewport frame uses `overflow: hidden` to clip overflowing elements at the breakpoint boundary (satisfies R5-S3 graceful handling)
- `data-breakpoint` and `data-viewport-width` attributes on the viewport div enable test assertions without computed style access (jsdom doesn't compute inline styles reliably)
- Store `setState` in `beforeEach` must include `breakpoint: 'desktop'` to reset the new field between tests

## T8
- `PropertiesPanel` lives in `src/components/RightPanel/PropertiesPanel.tsx`; `src/components/editor/RightPanel.tsx` is a thin wrapper that delegates to it
- Numeric inputs use controlled local state with focus/blur pattern: `localValue` tracks in-flight edits; on blur, parse and validate before calling store update
- Non-numeric rejection: `parseNumeric()` returns `null` for empty, whitespace-only, or non-finite strings — on `null`, restore `localValue` to previous valid value without calling store
- Dimension clamping: `isDimension=true` prop on `NumericField` applies `Math.max(1, value)` on blur — x/y/rotation are not dimensions and can be negative
- Color fields use two inputs: `type="color"` (picker) + `type="text"` (hex string); text input testid is `{testId}-text` so tests can assert and change string values directly
- `Effects` section keeps box-shadow and blur as local component state (not persisted in element schema) — basic implementation as the Element type does not include shadow fields
- Pre-existing TS errors in `ComponentLibrary.tsx` (unused `useEditorStore`/`CustomComponent` imports) and `store/index.ts` (re-exporting non-existent `CustomComponent`) were blocking build; fixed as collateral cleanup

## T14
- `SnapGuides.tsx` is a pure utility + display module: `getSnapPoints()` and `computeSnap()` are pure functions (easy to test), `SnapGuides` renders the visual lines
- Snap logic checks three edges of the moving element (left/center/right for x, top/middle/bottom for y) against all snap points from non-selected elements; picks closest within 5px threshold
- For multi-select drag, snap is applied to the primary (first) selected element — the delta difference is then applied uniformly to all selected elements to preserve relative positions
- `AlignActions.tsx` exports both pure helper functions (alignLeft, alignRight, etc.) and the `AlignActions` component — pure functions make unit testing trivial without DOM rendering
- Align buttons disabled via HTML `disabled` attribute (not just style) — enables native `:disabled` CSS and `toBeDisabled()` assertion in tests
- Distribute functions require 3+ elements: return empty `{}` for fewer (no-op); the component uses `canDistribute = selectedElements.length >= 3`
- `AlignActions` is wired into `Toolbar.tsx` between the tool buttons separator and the flex spacer — no new props on Toolbar needed since AlignActions reads from store directly
- `setActiveGuides([])` must be called in `handleMovePointerUp` to clear guides after drag ends

## T12
- `CustomComponent` interface added to editorStore.ts (not a separate file) for co-location with store actions
- Linter (likely ESLint + Prettier on save) auto-reverts Edit tool changes — use Bash heredoc writes for file creation/overwrite to avoid linter revert loops
- Group bounding box uses `(el as { width?: number }).width ?? 0` cast to safely read `width`/`height` from Element union type without explicit FrameElement cast
- `saveAsCustomComponent` deep-clones the subtree via `JSON.parse(JSON.stringify(...))` so stored snapshots are isolated from live state mutations
- Store `setState` in `beforeEach` must include `customComponents: []` to reset the new field
- Pre-existing test failures in `editor-layout.test.tsx` (R11-S2, 2 cases) are unrelated to T12 — do not attempt to fix
- ComponentLibrary custom category uses conditional render (`customComponents.length > 0`) to avoid empty categories; `data-testid="category-custom"` present only when custom components exist

## T15
- StylePresets component is standalone (reads from store directly via `useEditorStore`) — no props needed, same pattern as BreakpointSwitcher and AlignActions
- Preset data lives in `src/data/presets.ts` as typed arrays: `COLOR_PRESETS`, `FONT_PRESETS`, `SPACING_PRESETS`
- Color preset for Frame updates `backgroundColor`; for Text updates `color` — type-gated via `element.type` check
- Font preset only updates `fontFamily`, `fontSize`, `fontWeight`, `lineHeight` — other text fields (color, textAlign, letterSpacing, textDecoration) are preserved as per R15-S3
- Spacing preset updates `gap` + all four `padding` values on Frame elements
- `disabled` prop on `<button>` handles both the no-op behavior and visual state without separate logic
- PropertiesPanel renders StylePresets always (outside the `element ? ... : ...` block) so it is visible even when nothing is selected — just with all buttons disabled
- A linter added `AnimationPanel` import to PropertiesPanel.tsx during T15 work (pre-existing AnimationPanel.tsx in RightPanel dir); this is a separate task concern

## T10
- `AnimationConfig` type (with `HoverEffect` + `TransitionConfig`) added to `editorStore.ts` alongside other types for co-location
- Animation configs stored in a flat `Record<string, AnimationConfig>` on the store keyed by element id; defaults to `DEFAULT_ANIMATION_CONFIG` when no entry exists
- Subscribe to `animationConfigs` directly (not via `getAnimationConfig` action selector) in the component — Zustand only re-renders when the selected slice changes; selecting a function that reads from a different slice won't trigger re-renders when that slice changes
- `AnimationPanel` is always rendered in `PropertiesPanel` (below Effects section); shows empty state when no element selected, controls when element is selected
- Numeric fields use the same focus/blur controlled pattern as `PropertiesPanel`; duration field uses `min={0}` clamp to prevent negative values
