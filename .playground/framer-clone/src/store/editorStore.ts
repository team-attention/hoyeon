import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Element, ElementMap } from '../types'

// ───────────────────────────────────────────────────────────────────────────
// Breakpoint types
// ───────────────────────────────────────────────────────────────────────────
export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export const BREAKPOINT_WIDTHS: Record<Breakpoint, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
}

// ───────────────────────────────────────────────────────────────────────────
// Animation configuration per element (hover effects + CSS transitions)
// ───────────────────────────────────────────────────────────────────────────
export type EasingType = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring'

export interface HoverEffect {
  scale: number
  opacity: number
  x: number
  y: number
  rotation: number
}

export interface TransitionConfig {
  duration: number // ms
  easing: EasingType
}

export interface AnimationConfig {
  hover: HoverEffect
  transition: TransitionConfig
}

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  hover: { scale: 1, opacity: 1, x: 0, y: 0, rotation: 0 },
  transition: { duration: 300, easing: 'ease' },
}

// ───────────────────────────────────────────────────────────────────────────
// Custom component (saved group)
// ───────────────────────────────────────────────────────────────────────────
export interface CustomComponent {
  id: string
  name: string
  /** Serialized element tree (group frame + descendants) */
  elements: ElementMap
  /** The root element id of the group */
  rootId: string
}

// ───────────────────────────────────────────────────────────────────────────
// History entry: a snapshot of the element tree
// ───────────────────────────────────────────────────────────────────────────
interface HistoryEntry {
  elements: ElementMap
  rootIds: string[]
}

// ───────────────────────────────────────────────────────────────────────────
// Store state shape
// ───────────────────────────────────────────────────────────────────────────
export interface EditorState {
  // Element tree
  elements: ElementMap
  rootIds: string[] // top-level element ids (no parent)

  // Selection
  selectedIds: string[]

  // Undo/redo history
  past: HistoryEntry[]
  future: HistoryEntry[]

  // Responsive breakpoint
  breakpoint: Breakpoint

  // Custom components (saved groups)
  customComponents: CustomComponent[]

  // Animation configs per element id
  animationConfigs: Record<string, AnimationConfig>

  // ── Computed helpers ──────────────────────────────────────────────────
  canUndo: () => boolean
  canRedo: () => boolean

  // ── Element CRUD ──────────────────────────────────────────────────────
  addElement: (element: Element) => void
  removeElement: (id: string) => void
  updateElement: (id: string, patch: Partial<Element>) => void
  moveElement: (id: string, x: number, y: number) => void

  // ── Selection ─────────────────────────────────────────────────────────
  selectElement: (id: string) => void
  multiSelect: (ids: string[]) => void
  deselectAll: () => void

  // ── Undo / Redo ───────────────────────────────────────────────────────
  undo: () => void
  redo: () => void

  // ── Layer ordering ────────────────────────────────────────────────────
  // Move element at `fromIndex` to `toIndex` within its parent's children array
  // (or rootIds if element has no parent). Updates zIndex to reflect new order.
  reorderElement: (id: string, fromIndex: number, toIndex: number) => void

  // ── Breakpoint ────────────────────────────────────────────────────────
  setBreakpoint: (breakpoint: Breakpoint) => void

  // ── Grouping ──────────────────────────────────────────────────────────
  /** Whether grouping is allowed (2+ elements selected). */
  canGroup: () => boolean
  /** Group selected elements (requires 2+). Returns new group id or null. */
  groupElements: () => string | null
  /** Ungroup the selected group element (must be a single frame selected). */
  ungroupElements: () => void
  /** Save selected group element as a reusable custom component. */
  saveAsCustomComponent: (name: string) => void

  // ── Animation ─────────────────────────────────────────────────────────
  /** Get animation config for an element (falls back to default). */
  getAnimationConfig: (id: string) => AnimationConfig
  /** Set animation config for an element. */
  setAnimationConfig: (id: string, config: AnimationConfig) => void
}

// ───────────────────────────────────────────────────────────────────────────
// Helper: deep-clone the history-relevant portion of state
// ───────────────────────────────────────────────────────────────────────────
function snapshot(elements: ElementMap, rootIds: string[]): HistoryEntry {
  return {
    elements: JSON.parse(JSON.stringify(elements)) as ElementMap,
    rootIds: [...rootIds],
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Max history depth (prevent unbounded memory growth)
// ───────────────────────────────────────────────────────────────────────────
const MAX_HISTORY = 100

// ───────────────────────────────────────────────────────────────────────────
// Store
// ───────────────────────────────────────────────────────────────────────────
export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    elements: {},
    rootIds: [],
    selectedIds: [],
    past: [],
    future: [],
    breakpoint: 'desktop' as Breakpoint,
    customComponents: [],
    animationConfigs: {},

    // ── Computed ────────────────────────────────────────────────────────
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    // ── Element CRUD ────────────────────────────────────────────────────
    addElement: (element) => {
      set((state) => {
        // Save current state to history before mutation
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()
        state.future = []

        state.elements[element.id] = element

        if (element.parentId === null) {
          state.rootIds.push(element.id)
        } else {
          const parent = state.elements[element.parentId]
          if (parent && !parent.children.includes(element.id)) {
            parent.children.push(element.id)
          }
        }
      })
    },

    removeElement: (id) => {
      set((state) => {
        const element = state.elements[id]
        if (!element) return

        // Save history
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()
        state.future = []

        // Remove from parent's children list
        if (element.parentId !== null) {
          const parent = state.elements[element.parentId]
          if (parent) {
            parent.children = parent.children.filter((cid) => cid !== id)
          }
        } else {
          state.rootIds = state.rootIds.filter((rid) => rid !== id)
        }

        // Recursively collect all descendant ids
        const collectDescendants = (eid: string): string[] => {
          const el = state.elements[eid]
          if (!el) return []
          return [eid, ...el.children.flatMap(collectDescendants)]
        }

        for (const eid of collectDescendants(id)) {
          delete state.elements[eid]
        }

        // Remove from selection
        state.selectedIds = state.selectedIds.filter((sid) => sid !== id)
      })
    },

    updateElement: (id, patch) => {
      set((state) => {
        const element = state.elements[id]
        if (!element) return

        // Save history
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()
        state.future = []

        Object.assign(state.elements[id], patch)
      })
    },

    moveElement: (id, x, y) => {
      set((state) => {
        const element = state.elements[id]
        if (!element) return

        // Save history
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()
        state.future = []

        state.elements[id].x = x
        state.elements[id].y = y
      })
    },

    // ── Selection ───────────────────────────────────────────────────────
    selectElement: (id) => {
      set((state) => {
        state.selectedIds = [id]
      })
    },

    multiSelect: (ids) => {
      set((state) => {
        state.selectedIds = ids
      })
    },

    deselectAll: () => {
      set((state) => {
        state.selectedIds = []
      })
    },

    // ── Undo ────────────────────────────────────────────────────────────
    undo: () => {
      set((state) => {
        if (state.past.length === 0) return

        const prev = state.past[state.past.length - 1]
        state.past = state.past.slice(0, -1)

        // Push current onto future
        state.future.unshift(snapshot(state.elements, state.rootIds))

        state.elements = prev.elements
        state.rootIds = prev.rootIds
      })
    },

    // ── Redo ────────────────────────────────────────────────────────────
    redo: () => {
      set((state) => {
        if (state.future.length === 0) return

        const next = state.future[0]
        state.future = state.future.slice(1)

        // Push current onto past
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()

        state.elements = next.elements
        state.rootIds = next.rootIds
      })
    },

    // ── Breakpoint ───────────────────────────────────────────────────────
    setBreakpoint: (breakpoint) => {
      set((state) => {
        state.breakpoint = breakpoint
      })
    },

    // ── Grouping ─────────────────────────────────────────────────────────
    canGroup: () => {
      return get().selectedIds.length >= 2
    },

    groupElements: () => {
      const { selectedIds, elements } = get()
      if (selectedIds.length < 2) return null

      // All selected elements must be present and share the same parent
      const firstEl = elements[selectedIds[0]]
      if (!firstEl) return null
      const sharedParentId = firstEl.parentId

      for (const id of selectedIds) {
        const el = elements[id]
        if (!el || el.parentId !== sharedParentId) return null
      }

      const groupId = `frame-${Date.now()}-group`

      // Compute bounding box of selected elements
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const id of selectedIds) {
        const el = elements[id]
        if (!el) continue
        const w = (el as { width?: number }).width ?? 0
        const h = (el as { height?: number }).height ?? 0
        minX = Math.min(minX, el.x)
        minY = Math.min(minY, el.y)
        maxX = Math.max(maxX, el.x + w)
        maxY = Math.max(maxY, el.y + h)
      }

      const maxZIndex = Math.max(...selectedIds.map((id) => elements[id]?.zIndex ?? 0))

      // Build the group element as a plain object matching the frame shape
      const groupEl = {
        id: groupId,
        type: 'frame' as const,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: 'Group',
        parentId: sharedParentId,
        children: [...selectedIds],
        zIndex: maxZIndex,
        backgroundColor: 'transparent',
        borderRadius: 0,
        borderWidth: 0,
        borderColor: '#333',
        overflow: 'visible' as const,
        layoutMode: 'none' as const,
        gap: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      }

      set((state) => {
        // Save history
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()
        state.future = []

        // Re-parent selected elements to the new group, adjust positions
        for (const id of selectedIds) {
          const el = state.elements[id]
          if (!el) continue
          el.x = el.x - minX
          el.y = el.y - minY
          el.parentId = groupId
        }

        // Remove selected ids from old parent's children / rootIds
        if (sharedParentId === null) {
          state.rootIds = state.rootIds.filter((rid) => !selectedIds.includes(rid))
          state.rootIds.push(groupId)
        } else {
          const parent = state.elements[sharedParentId]
          if (parent) {
            parent.children = parent.children.filter((cid) => !selectedIds.includes(cid))
            parent.children.push(groupId)
          }
        }

        state.elements[groupId] = groupEl
        state.selectedIds = [groupId]
      })

      return groupId
    },

    ungroupElements: () => {
      const { selectedIds, elements } = get()
      if (selectedIds.length !== 1) return

      const groupId = selectedIds[0]
      const groupEl = elements[groupId]
      if (!groupEl || groupEl.type !== 'frame') return

      const childIds = [...groupEl.children]
      const parentId = groupEl.parentId

      set((state) => {
        // Save history
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()
        state.future = []

        const grp = state.elements[groupId]
        if (!grp) return

        // Re-parent children back to group's parent, adjusting position
        for (const childId of childIds) {
          const child = state.elements[childId]
          if (!child) continue
          child.x = child.x + grp.x
          child.y = child.y + grp.y
          child.parentId = parentId
        }

        // Add children to parent's children list (or rootIds)
        if (parentId === null) {
          state.rootIds = state.rootIds.filter((rid) => rid !== groupId)
          state.rootIds.push(...childIds)
        } else {
          const parent = state.elements[parentId]
          if (parent) {
            parent.children = parent.children.filter((cid) => cid !== groupId)
            parent.children.push(...childIds)
          }
        }

        delete state.elements[groupId]
        state.selectedIds = childIds
      })
    },

    saveAsCustomComponent: (name: string) => {
      const { selectedIds, elements } = get()
      if (selectedIds.length !== 1) return

      const groupId = selectedIds[0]
      const groupEl = elements[groupId]
      if (!groupEl) return

      // Collect the group and all its descendants
      const collectSubtree = (id: string): string[] => {
        const el = elements[id]
        if (!el) return []
        return [id, ...el.children.flatMap(collectSubtree)]
      }

      const subtreeIds = collectSubtree(groupId)
      const subtreeElements: ElementMap = {}
      for (const id of subtreeIds) {
        subtreeElements[id] = JSON.parse(JSON.stringify(elements[id])) as Element
      }

      const customComponent: CustomComponent = {
        id: `custom-${Date.now()}`,
        name,
        elements: subtreeElements,
        rootId: groupId,
      }

      set((state) => {
        state.customComponents.push(customComponent)
      })
    },

    // ── Animation ────────────────────────────────────────────────────────
    getAnimationConfig: (id) => {
      return get().animationConfigs[id] ?? DEFAULT_ANIMATION_CONFIG
    },

    setAnimationConfig: (id, config) => {
      set((state) => {
        state.animationConfigs[id] = config
      })
    },

    // ── Layer ordering ───────────────────────────────────────────────────
    reorderElement: (id, fromIndex, toIndex) => {
      set((state) => {
        const element = state.elements[id]
        if (!element) return
        if (fromIndex === toIndex) return

        // Save history
        state.past.push(snapshot(state.elements, state.rootIds))
        if (state.past.length > MAX_HISTORY) state.past.shift()
        state.future = []

        // Determine the array to reorder: either rootIds or parent's children
        if (element.parentId === null) {
          const arr = state.rootIds
          arr.splice(fromIndex, 1)
          arr.splice(toIndex, 0, id)
          // Update zIndex to match position
          arr.forEach((eid, idx) => {
            state.elements[eid].zIndex = idx
          })
        } else {
          const parent = state.elements[element.parentId]
          if (!parent) return
          const arr = parent.children
          arr.splice(fromIndex, 1)
          arr.splice(toIndex, 0, id)
          // Update zIndex for all siblings
          arr.forEach((eid, idx) => {
            state.elements[eid].zIndex = idx
          })
        }
      })
    },
  }))
)
