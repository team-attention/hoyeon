import { create } from 'zustand'
import { temporal } from 'zundo'
import { immer } from 'zustand/middleware/immer'
import type { WritableDraft } from 'immer'
import {
  type EditorElement,
  type ElementAnimation,
  type ElementTree,
  type Camera,
  type Selection,
  MIN_ZOOM,
  MAX_ZOOM,
  screenToCanvas,
  canvasToScreen,
} from '../types/editor'
import {
  type BreakpointId,
  type BreakpointOverrides,
  DEFAULT_BREAKPOINTS,
  validateBreakpointWidth,
} from './breakpoints'

// Re-export helpers so consumers can import from store
export { screenToCanvas, canvasToScreen }

// ─── Tool ─────────────────────────────────────────────────────────────────────

export type Tool = 'select' | 'frame' | 'text' | 'image' | 'rectangle' | 'ellipse'

// ─── State shape ─────────────────────────────────────────────────────────────

export interface EditorState {
  // Element tree
  elements: ElementTree
  rootIds: string[]

  // Camera
  camera: Camera

  // Selection
  selection: Selection

  // Active tool / preview mode
  activeTool: Tool
  isPreviewMode: boolean

  // Modal state (blocks canvas interactions when a dialog is active)
  isModalOpen: boolean

  // Clipboard (internal, not system clipboard)
  clipboard: EditorElement[]

  // Breakpoints
  activeBreakpoint: BreakpointId
  breakpointWidths: Record<BreakpointId, number>
  /** Per-breakpoint style overrides (delta from desktop base). Only tablet/mobile. */
  breakpointOverrides: Record<BreakpointId, BreakpointOverrides>
  /** Validation error for breakpoint width input */
  breakpointWidthError: string | null
}

// ─── Actions shape ───────────────────────────────────────────────────────────

export interface EditorActions {
  // Element CRUD
  addElement: (element: EditorElement) => void
  updateElement: (id: string, patch: Partial<EditorElement>) => void
  deleteElement: (id: string) => void
  deleteElements: (ids: string[]) => void

  // Multi-element move (preserves relative positions)
  moveElements: (ids: string[], dx: number, dy: number) => void

  // Camera
  setCamera: (camera: Partial<Camera>) => void
  zoomAt: (delta: number, originX: number, originY: number) => void
  pan: (dx: number, dy: number) => void

  // Selection
  selectElement: (id: string) => void
  selectElements: (ids: string[]) => void
  toggleSelectElement: (id: string) => void
  clearSelection: () => void
  setHovered: (id: string | null) => void

  // Tool / mode
  setActiveTool: (tool: Tool) => void
  setPreviewMode: (active: boolean) => void
  revertToSelect: () => void

  // Layer ordering
  reorderElement: (id: string, newIndex: number) => void

  // Rename element
  renameElement: (id: string, name: string) => void

  // Modal
  setModalOpen: (open: boolean) => void

  // Animations
  setElementAnimations: (id: string, animations: ElementAnimation[]) => void

  // Clipboard operations
  copyElements: (ids: string[]) => void
  pasteElements: () => void
  duplicateElements: (ids: string[]) => void
  cutElements: (ids: string[]) => void

  // Layer ordering
  bringForward: (id: string) => void
  sendBackward: (id: string) => void

  // Group / ungroup
  groupElements: (ids: string[]) => void
  ungroupElement: (id: string) => void

  // Breakpoints
  setActiveBreakpoint: (id: BreakpointId) => void
  setBreakpointWidth: (id: BreakpointId, width: string | number) => void
  /** Save an override for the current (non-desktop) breakpoint. Ignores if desktop is active. */
  setBreakpointOverride: (elementId: string, patch: Record<string, unknown>) => void
  /** Clear a specific breakpoint's overrides for one element */
  clearBreakpointOverride: (breakpointId: BreakpointId, elementId: string) => void
}

export type EditorStore = EditorState & EditorActions

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: EditorState = {
  elements: {},
  rootIds: [],
  camera: { x: 0, y: 0, zoom: 1 },
  selection: { selectedIds: [], hoveredId: null },
  activeTool: 'select',
  isPreviewMode: false,
  isModalOpen: false,
  clipboard: [],
  activeBreakpoint: 'desktop',
  breakpointWidths: {
    desktop: DEFAULT_BREAKPOINTS.desktop.width,
    tablet: DEFAULT_BREAKPOINTS.tablet.width,
    mobile: DEFAULT_BREAKPOINTS.mobile.width,
  },
  breakpointOverrides: {
    desktop: {},
    tablet: {},
    mobile: {},
  },
  breakpointWidthError: null,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively collect all descendant IDs of `id` by walking `childIds`.
 * Returns a flat array of all descendant IDs (does NOT include `id` itself).
 */
function collectDescendants(id: string, elements: ElementTree): string[] {
  const el = elements[id]
  if (!el || el.kind !== 'frame' || !el.childIds?.length) return []
  const result: string[] = []
  for (const childId of el.childIds) {
    result.push(childId)
    result.push(...collectDescendants(childId, elements))
  }
  return result
}

// ─── Store creation ───────────────────────────────────────────────────────────

/**
 * The temporal middleware wraps the immer store so all immer-mutated state
 * changes are tracked for undo/redo.
 *
 * Stack: temporal(immer(stateCreator))
 * Access undo/redo via:  useEditorStore.temporal.getState().undo()
 */
export const useEditorStore = create<EditorStore>()(
  temporal(
    immer((set) => ({
      ...initialState,

      // ── Element CRUD ──────────────────────────────────────────────────────

      addElement: (element) => {
        set((state: WritableDraft<EditorStore>) => {
          state.elements[element.id] = element as WritableDraft<EditorElement>
          if (element.parentId === null) {
            state.rootIds.push(element.id)
          }
        })
      },

      updateElement: (id, patch) => {
        set((state: WritableDraft<EditorStore>) => {
          if (state.elements[id]) {
            Object.assign(state.elements[id], patch)
          }
        })
      },

      deleteElement: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          const descendants = collectDescendants(id, state.elements as ElementTree)
          const allIds = [id, ...descendants]

          // Remove the element from its parent's childIds
          const el = state.elements[id]
          if (el?.parentId) {
            const parent = state.elements[el.parentId]
            if (parent?.kind === 'frame' && parent.childIds) {
              parent.childIds = (parent.childIds as string[]).filter((cid) => cid !== id)
            }
          }

          // Delete all elements (target + descendants)
          for (const did of allIds) {
            delete state.elements[did]
          }

          // Clean up rootIds
          state.rootIds = state.rootIds.filter((rid) => !allIds.includes(rid))

          // Clean up selection
          state.selection.selectedIds = state.selection.selectedIds.filter(
            (sid) => !allIds.includes(sid),
          )
          if (
            state.selection.hoveredId !== null &&
            allIds.includes(state.selection.hoveredId)
          ) {
            state.selection.hoveredId = null
          }

          // Purge breakpoint overrides for all deleted IDs (CR-007)
          for (const bp of Object.keys(state.breakpointOverrides) as BreakpointId[]) {
            for (const did of allIds) {
              delete state.breakpointOverrides[bp][did]
            }
          }
        })
      },

      deleteElements: (ids) => {
        set((state: WritableDraft<EditorStore>) => {
          // Collect all descendants for each id and deduplicate
          const allIdsSet = new Set<string>(ids)
          for (const id of ids) {
            for (const did of collectDescendants(id, state.elements as ElementTree)) {
              allIdsSet.add(did)
            }
          }
          const allIds = Array.from(allIdsSet)

          // Remove each top-level deleted element from its parent's childIds
          for (const id of ids) {
            const el = state.elements[id]
            if (el?.parentId && !allIdsSet.has(el.parentId)) {
              const parent = state.elements[el.parentId]
              if (parent?.kind === 'frame' && parent.childIds) {
                parent.childIds = (parent.childIds as string[]).filter((cid) => cid !== id)
              }
            }
          }

          // Delete all elements (targets + their descendants)
          for (const id of allIds) {
            delete state.elements[id]
          }

          // Clean up rootIds
          state.rootIds = state.rootIds.filter((rid) => !allIdsSet.has(rid))

          // Clean up selection
          state.selection.selectedIds = state.selection.selectedIds.filter(
            (sid) => !allIdsSet.has(sid),
          )
          if (
            state.selection.hoveredId !== null &&
            allIdsSet.has(state.selection.hoveredId)
          ) {
            state.selection.hoveredId = null
          }

          // Purge breakpoint overrides for all deleted IDs (CR-007)
          for (const bp of Object.keys(state.breakpointOverrides) as BreakpointId[]) {
            for (const did of allIds) {
              delete state.breakpointOverrides[bp][did]
            }
          }
        })
      },

      moveElements: (ids, dx, dy) => {
        set((state: WritableDraft<EditorStore>) => {
          for (const id of ids) {
            const el = state.elements[id]
            if (el) {
              el.x += dx
              el.y += dy
            }
          }
        })
      },

      // ── Camera ────────────────────────────────────────────────────────────

      setCamera: (camera) => {
        set((state: WritableDraft<EditorStore>) => {
          if (camera.x !== undefined) state.camera.x = camera.x
          if (camera.y !== undefined) state.camera.y = camera.y
          if (camera.zoom !== undefined) {
            state.camera.zoom = Math.min(
              MAX_ZOOM,
              Math.max(MIN_ZOOM, camera.zoom),
            )
          }
        })
      },

      /**
       * Zoom toward/away from a given screen-space origin point.
       * delta > 0 = zoom in, delta < 0 = zoom out.
       */
      zoomAt: (delta, originX, originY) => {
        set((state: WritableDraft<EditorStore>) => {
          const factor = 1 + delta * 0.001
          const prevZoom = state.camera.zoom
          const newZoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, prevZoom * factor),
          )
          if (newZoom === prevZoom) return

          // Adjust translation so the origin point stays fixed on screen
          state.camera.x = originX - ((originX - state.camera.x) * newZoom) / prevZoom
          state.camera.y = originY - ((originY - state.camera.y) * newZoom) / prevZoom
          state.camera.zoom = newZoom
        })
      },

      pan: (dx, dy) => {
        set((state: WritableDraft<EditorStore>) => {
          state.camera.x += dx
          state.camera.y += dy
        })
      },

      // ── Selection ─────────────────────────────────────────────────────────

      selectElement: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          state.selection.selectedIds = [id]
        })
      },

      selectElements: (ids) => {
        set((state: WritableDraft<EditorStore>) => {
          state.selection.selectedIds = [...ids]
        })
      },

      toggleSelectElement: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          const idx = state.selection.selectedIds.indexOf(id)
          if (idx === -1) {
            state.selection.selectedIds.push(id)
          } else {
            state.selection.selectedIds.splice(idx, 1)
          }
        })
      },

      clearSelection: () => {
        set((state: WritableDraft<EditorStore>) => {
          state.selection.selectedIds = []
        })
      },

      setHovered: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          state.selection.hoveredId = id
        })
      },

      // ── Tool / mode ───────────────────────────────────────────────────────

      setActiveTool: (tool) => {
        set((state: WritableDraft<EditorStore>) => {
          state.activeTool = tool
        })
      },

      setPreviewMode: (active) => {
        set((state: WritableDraft<EditorStore>) => {
          state.isPreviewMode = active
        })
      },

      revertToSelect: () => {
        set((state: WritableDraft<EditorStore>) => {
          state.activeTool = 'select'
        })
      },

      reorderElement: (id, newIndex) => {
        set((state: WritableDraft<EditorStore>) => {
          const currentIndex = state.rootIds.indexOf(id)
          if (currentIndex === -1) return
          state.rootIds.splice(currentIndex, 1)
          const clampedIndex = Math.max(0, Math.min(newIndex, state.rootIds.length))
          state.rootIds.splice(clampedIndex, 0, id)
        })
      },

      renameElement: (id, name) => {
        set((state: WritableDraft<EditorStore>) => {
          if (state.elements[id] && name.trim() !== '') {
            state.elements[id].name = name.trim()
          }
        })
      },

      setModalOpen: (open) => {
        set((state: WritableDraft<EditorStore>) => {
          state.isModalOpen = open
        })
      },

      // ── Animations ────────────────────────────────────────────────────────

      setElementAnimations: (id, animations) => {
        set((state: WritableDraft<EditorStore>) => {
          if (state.elements[id]) {
            state.elements[id].animations = animations as WritableDraft<ElementAnimation[]>
          }
        })
      },

      // ── Clipboard ─────────────────────────────────────────────────────────

      copyElements: (ids) => {
        set((state: WritableDraft<EditorStore>) => {
          state.clipboard = ids
            .map((id) => state.elements[id])
            .filter((el): el is WritableDraft<EditorElement> => el != null)
            .map((el) => ({ ...el })) as WritableDraft<EditorElement[]>
        })
      },

      cutElements: (ids) => {
        set((state: WritableDraft<EditorStore>) => {
          state.clipboard = ids
            .map((id) => state.elements[id])
            .filter((el): el is WritableDraft<EditorElement> => el != null)
            .map((el) => ({ ...el })) as WritableDraft<EditorElement[]>
          for (const id of ids) {
            delete state.elements[id]
          }
          state.rootIds = state.rootIds.filter((rid) => !ids.includes(rid))
          state.selection.selectedIds = []
        })
      },

      pasteElements: () => {
        set((state: WritableDraft<EditorStore>) => {
          if (state.clipboard.length === 0) return
          const newIds: string[] = []
          for (const el of state.clipboard) {
            const newId = `${el.id}-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`
            const newEl = {
              ...el,
              id: newId,
              x: (el.x as number) + 20,
              y: (el.y as number) + 20,
              name: `${el.name} Copy`,
              parentId: null,
            } as WritableDraft<EditorElement>
            state.elements[newId] = newEl
            state.rootIds.push(newId)
            newIds.push(newId)
          }
          state.selection.selectedIds = newIds
        })
      },

      duplicateElements: (ids) => {
        set((state: WritableDraft<EditorStore>) => {
          const newIds: string[] = []
          for (const id of ids) {
            const el = state.elements[id]
            if (!el) continue
            const newId = `${id}-dup-${Date.now()}-${Math.random().toString(36).slice(2)}`
            const newEl = {
              ...el,
              id: newId,
              x: (el.x as number) + 20,
              y: (el.y as number) + 20,
              name: `${el.name} Copy`,
              parentId: null,
            } as WritableDraft<EditorElement>
            state.elements[newId] = newEl
            state.rootIds.push(newId)
            newIds.push(newId)
          }
          state.selection.selectedIds = newIds
        })
      },

      // ── Layer ordering ────────────────────────────────────────────────────

      bringForward: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          const idx = state.rootIds.indexOf(id)
          if (idx === -1 || idx === state.rootIds.length - 1) return
          state.rootIds.splice(idx, 1)
          state.rootIds.splice(idx + 1, 0, id)
        })
      },

      sendBackward: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          const idx = state.rootIds.indexOf(id)
          if (idx <= 0) return
          state.rootIds.splice(idx, 1)
          state.rootIds.splice(idx - 1, 0, id)
        })
      },

      // ── Group / Ungroup ───────────────────────────────────────────────────

      groupElements: (ids) => {
        set((state: WritableDraft<EditorStore>) => {
          if (ids.length === 0) return
          const elements = ids.map((id) => state.elements[id]).filter(Boolean)
          if (elements.length === 0) return

          const xs = elements.map((el) => el.x as number)
          const ys = elements.map((el) => el.y as number)
          const rights = elements.map((el) => (el.x as number) + (el.width as number))
          const bottoms = elements.map((el) => (el.y as number) + (el.height as number))
          const gx = Math.min(...xs)
          const gy = Math.min(...ys)
          const gw = Math.max(...rights) - gx
          const gh = Math.max(...bottoms) - gy

          const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const groupEl = {
            id: groupId,
            kind: 'frame' as const,
            x: gx,
            y: gy,
            width: gw,
            height: gh,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            name: 'Group',
            parentId: null,
            childIds: [...ids],
            fill: 'transparent',
            borderRadius: 0,
            clipContent: false,
            layoutMode: 'absolute' as const,
            stackDirection: 'column' as const,
            stackGap: 0,
            stackWrap: false,
            stackAlign: 'flex-start' as const,
            stackJustify: 'flex-start' as const,
            gridColumns: 2,
            gridGap: 0,
          }
          state.elements[groupId] = groupEl as WritableDraft<EditorElement>
          // Re-parent children
          for (const id of ids) {
            if (state.elements[id]) {
              state.elements[id].parentId = groupId
              state.elements[id].x = (state.elements[id].x as number) - gx
              state.elements[id].y = (state.elements[id].y as number) - gy
            }
          }
          state.rootIds = state.rootIds.filter((rid) => !ids.includes(rid))
          state.rootIds.push(groupId)
          state.selection.selectedIds = [groupId]
        })
      },

      ungroupElement: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          const el = state.elements[id]
          if (!el || el.kind !== 'frame' || !el.childIds?.length) return
          const { x: gx, y: gy, parentId: frameParentId } = el
          const childIds = [...el.childIds]

          // Re-parent children: convert from frame-local coords to parent's coord space
          for (const cid of childIds) {
            const child = state.elements[cid]
            if (child) {
              child.x = (child.x as number) + (gx as number)
              child.y = (child.y as number) + (gy as number)
              child.parentId = frameParentId
            }
          }

          if (frameParentId === null) {
            // Frame is a root element — promote children to root
            const groupIdx = state.rootIds.indexOf(id)
            state.rootIds.splice(groupIdx, 1)
            state.rootIds.splice(groupIdx, 0, ...childIds)
          } else {
            // Frame is nested — promote children into the parent frame's childIds
            const parent = state.elements[frameParentId]
            if (parent && parent.kind === 'frame') {
              const parentChildIds = parent.childIds as string[]
              const groupIdx = parentChildIds.indexOf(id)
              // Replace the group frame with its children in parent's childIds
              if (groupIdx !== -1) {
                parentChildIds.splice(groupIdx, 1, ...childIds)
              } else {
                parentChildIds.push(...childIds)
              }
            }
          }

          delete state.elements[id]
          state.selection.selectedIds = childIds
        })
      },

      // ── Breakpoints ───────────────────────────────────────────────────────

      setActiveBreakpoint: (id) => {
        set((state: WritableDraft<EditorStore>) => {
          state.activeBreakpoint = id
        })
      },

      setBreakpointWidth: (id, width) => {
        set((state: WritableDraft<EditorStore>) => {
          const error = validateBreakpointWidth(width)
          if (error) {
            state.breakpointWidthError = error
            return
          }
          const num = typeof width === 'string' ? parseFloat(width) : width
          state.breakpointWidths[id] = num
          state.breakpointWidthError = null
        })
      },

      setBreakpointOverride: (elementId, patch) => {
        set((state: WritableDraft<EditorStore>) => {
          const bp = state.activeBreakpoint
          // Desktop is the base — never store overrides for it
          if (bp === 'desktop') return
          if (!state.breakpointOverrides[bp]) {
            state.breakpointOverrides[bp] = {}
          }
          if (!state.breakpointOverrides[bp][elementId]) {
            state.breakpointOverrides[bp][elementId] = {}
          }
          Object.assign(state.breakpointOverrides[bp][elementId], patch)
        })
      },

      clearBreakpointOverride: (breakpointId, elementId) => {
        set((state: WritableDraft<EditorStore>) => {
          if (state.breakpointOverrides[breakpointId]) {
            delete state.breakpointOverrides[breakpointId][elementId]
          }
        })
      },
    })),
    {
      // Only track element tree and camera for undo/redo (not selection/hover/tool)
      partialize: (state) => ({
        elements: state.elements,
        rootIds: state.rootIds,
        camera: state.camera,
      }),
      limit: 100,
    },
  ),
)
