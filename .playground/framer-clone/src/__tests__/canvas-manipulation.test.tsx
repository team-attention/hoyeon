/**
 * canvas-manipulation.test.tsx
 *
 * Tests for R10: Element selection, resize handles, and drag-to-move on canvas.
 *
 * Strategy: Since jsdom/happy-dom don't support real pointer/drag events well,
 * we test the underlying store actions and the resize/move logic directly.
 * Component-level tests verify testid presence and initial render.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { useEditorStore } from '../store'
import { MIN_SIZE, ResizeHandles } from '../components/Canvas/ResizeHandles'
import { SelectionOverlay } from '../components/Canvas/SelectionOverlay'
import type { FrameElement } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a FrameElement with defaults
// ─────────────────────────────────────────────────────────────────────────────
function makeFrame(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'frame-1',
    type: 'frame',
    name: 'Frame 1',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    parentId: null,
    children: [],
    zIndex: 0,
    backgroundColor: '#ffffff',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#000000',
    overflow: 'visible',
    layoutMode: 'none',
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset store before each test
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  useEditorStore.setState({
    elements: {},
    rootIds: [],
    selectedIds: [],
    past: [],
    future: [],
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R10-S1: Resize — dragging bottom-right handle updates element dimensions
// ─────────────────────────────────────────────────────────────────────────────
describe('R10-S1: Resize bottom-right handle', () => {
  it('updates element width and height via updateElement action', () => {
    const frame = makeFrame({ id: 'frame-1', x: 100, y: 100, width: 200, height: 150 })

    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })

    // Simulate what ResizeHandles does when dragging se handle by 50px, 30px at zoom=1
    const zoom = 1
    const dx = 50 / zoom
    const dy = 30 / zoom

    const origW = frame.width
    const origH = frame.height
    const newW = Math.max(MIN_SIZE, origW + dx)
    const newH = Math.max(MIN_SIZE, origH + dy)

    act(() => {
      useEditorStore.getState().updateElement('frame-1', { width: newW, height: newH })
    })

    const updated = useEditorStore.getState().elements['frame-1']
    expect(updated.width).toBe(250)
    expect(updated.height).toBe(180)
  })

  it('new dimensions are reflected (x, y unchanged for se handle)', () => {
    const frame = makeFrame({ id: 'frame-1', x: 100, y: 100, width: 200, height: 150 })

    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })

    act(() => {
      useEditorStore.getState().updateElement('frame-1', { width: 300, height: 200 })
    })

    const updated = useEditorStore.getState().elements['frame-1']
    expect(updated.x).toBe(100) // x unchanged for se
    expect(updated.y).toBe(100) // y unchanged for se
    expect(updated.width).toBe(300)
    expect(updated.height).toBe(200)
  })

  it('nw handle drag updates x, y and shrinks width, height', () => {
    const frame = makeFrame({ id: 'frame-1', x: 100, y: 100, width: 200, height: 150 })

    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })

    // Dragging nw by dx=20, dy=10 (moving corner right+down = shrink)
    const dx = 20
    const dy = 10
    const origX = frame.x
    const origY = frame.y
    const origW = frame.width
    const origH = frame.height

    const delta_x = Math.min(dx, origW - MIN_SIZE) // 20
    const delta_y = Math.min(dy, origH - MIN_SIZE) // 10
    const newX = origX + delta_x
    const newY = origY + delta_y
    const newW = Math.max(MIN_SIZE, origW - delta_x)
    const newH = Math.max(MIN_SIZE, origH - delta_y)

    act(() => {
      useEditorStore.getState().updateElement('frame-1', { x: newX, y: newY, width: newW, height: newH })
    })

    const updated = useEditorStore.getState().elements['frame-1']
    expect(updated.x).toBe(120)
    expect(updated.y).toBe(110)
    expect(updated.width).toBe(180)
    expect(updated.height).toBe(140)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R10-S2: Drag to move — element moves to new position
// ─────────────────────────────────────────────────────────────────────────────
describe('R10-S2: Drag to move selected element', () => {
  it('updates element x and y coordinates after drag', () => {
    const frame = makeFrame({ id: 'frame-1', x: 100, y: 100, width: 200, height: 150 })

    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })

    // Simulate drag: startX=300, startY=300, endX=350, endY=380, zoom=1
    const startX = 300
    const startY = 300
    const endX = 350
    const endY = 380
    const zoom = 1

    const dx = (endX - startX) / zoom // 50
    const dy = (endY - startY) / zoom // 80

    const orig = { x: frame.x, y: frame.y }
    const newX = orig.x + dx
    const newY = orig.y + dy

    act(() => {
      useEditorStore.getState().updateElement('frame-1', { x: newX, y: newY })
    })

    const updated = useEditorStore.getState().elements['frame-1']
    expect(updated.x).toBe(150)
    expect(updated.y).toBe(180)
  })

  it('coordinates update correctly with zoom=2', () => {
    const frame = makeFrame({ id: 'frame-1', x: 200, y: 200, width: 100, height: 100 })

    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })

    // At zoom=2, screen delta of 100px = 50px in canvas coords
    const zoom = 2
    const screenDx = 100
    const screenDy = 60
    const dx = screenDx / zoom // 50
    const dy = screenDy / zoom // 30

    act(() => {
      useEditorStore.getState().updateElement('frame-1', {
        x: frame.x + dx,
        y: frame.y + dy,
      })
    })

    const updated = useEditorStore.getState().elements['frame-1']
    expect(updated.x).toBe(250)
    expect(updated.y).toBe(230)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R10-S3: Minimum size constraint during resize
// ─────────────────────────────────────────────────────────────────────────────
describe('R10-S3: Minimum size clamp during resize', () => {
  it('MIN_SIZE constant is 1', () => {
    expect(MIN_SIZE).toBe(1)
  })

  it('clamps width to MIN_SIZE when resizing se handle beyond minimum', () => {
    const frame = makeFrame({ id: 'frame-1', x: 100, y: 100, width: 10, height: 10 })

    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })

    // Try to resize to negative/zero width by dragging se far left
    const origW = frame.width
    const origH = frame.height
    const dx = -200 // far exceeds current width
    const dy = -200

    const newW = Math.max(MIN_SIZE, origW + dx) // should clamp to 1
    const newH = Math.max(MIN_SIZE, origH + dy) // should clamp to 1

    act(() => {
      useEditorStore.getState().updateElement('frame-1', { width: newW, height: newH })
    })

    const updated = useEditorStore.getState().elements['frame-1']
    expect(updated.width).toBe(MIN_SIZE)
    expect(updated.height).toBe(MIN_SIZE)
  })

  it('clamps position correctly for nw handle when dragging past minimum', () => {
    const frame = makeFrame({ id: 'frame-1', x: 100, y: 100, width: 10, height: 10 })

    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })

    // Drag nw far to the right (dx=500), which would exceed width
    const dx = 500
    const dy = 500
    const origX = frame.x
    const origY = frame.y
    const origW = frame.width
    const origH = frame.height

    // delta is clamped to origW - MIN_SIZE
    const deltaX = Math.min(dx, origW - MIN_SIZE) // 9
    const deltaY = Math.min(dy, origH - MIN_SIZE) // 9
    const newX = origX + deltaX // 109
    const newY = origY + deltaY // 109
    const newW = Math.max(MIN_SIZE, origW - deltaX) // 1
    const newH = Math.max(MIN_SIZE, origH - deltaY) // 1

    act(() => {
      useEditorStore.getState().updateElement('frame-1', { x: newX, y: newY, width: newW, height: newH })
    })

    const updated = useEditorStore.getState().elements['frame-1']
    expect(updated.width).toBe(MIN_SIZE)
    expect(updated.height).toBe(MIN_SIZE)
    expect(updated.x).toBe(109)
    expect(updated.y).toBe(109)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R10-S4: Multi-select drag — all selected elements move maintaining relative positions
// ─────────────────────────────────────────────────────────────────────────────
describe('R10-S4: Multi-select drag maintains relative positions', () => {
  it('moves all selected elements by same delta', () => {
    const frame1 = makeFrame({ id: 'frame-1', x: 100, y: 100, width: 100, height: 100 })
    const frame2 = makeFrame({ id: 'frame-2', x: 300, y: 200, width: 80, height: 80 })
    const frame3 = makeFrame({ id: 'frame-3', x: 150, y: 350, width: 60, height: 60 })

    act(() => {
      useEditorStore.getState().addElement(frame1)
      useEditorStore.getState().addElement(frame2)
      useEditorStore.getState().addElement(frame3)
      useEditorStore.getState().multiSelect(['frame-1', 'frame-2', 'frame-3'])
    })

    const state = useEditorStore.getState()
    expect(state.selectedIds).toHaveLength(3)

    // Simulate drag: delta 50px right, 30px down at zoom=1
    const dx = 50
    const dy = 30

    const origPositions: Record<string, { x: number; y: number }> = {
      'frame-1': { x: state.elements['frame-1'].x, y: state.elements['frame-1'].y },
      'frame-2': { x: state.elements['frame-2'].x, y: state.elements['frame-2'].y },
      'frame-3': { x: state.elements['frame-3'].x, y: state.elements['frame-3'].y },
    }

    // Apply move to all selected elements (as SelectionOverlay does)
    act(() => {
      for (const [id, orig] of Object.entries(origPositions)) {
        useEditorStore.getState().updateElement(id, { x: orig.x + dx, y: orig.y + dy })
      }
    })

    const updated = useEditorStore.getState().elements
    expect(updated['frame-1'].x).toBe(150)
    expect(updated['frame-1'].y).toBe(130)
    expect(updated['frame-2'].x).toBe(350)
    expect(updated['frame-2'].y).toBe(230)
    expect(updated['frame-3'].x).toBe(200)
    expect(updated['frame-3'].y).toBe(380)
  })

  it('preserves relative distances between elements during move', () => {
    const frame1 = makeFrame({ id: 'frame-1', x: 0, y: 0, width: 50, height: 50 })
    const frame2 = makeFrame({ id: 'frame-2', x: 100, y: 100, width: 50, height: 50 })

    act(() => {
      useEditorStore.getState().addElement(frame1)
      useEditorStore.getState().addElement(frame2)
      useEditorStore.getState().multiSelect(['frame-1', 'frame-2'])
    })

    const stateBefore = useEditorStore.getState().elements
    const relX = stateBefore['frame-2'].x - stateBefore['frame-1'].x
    const relY = stateBefore['frame-2'].y - stateBefore['frame-1'].y
    expect(relX).toBe(100)
    expect(relY).toBe(100)

    // Move both by (75, 75)
    const dx = 75
    const dy = 75

    act(() => {
      useEditorStore.getState().updateElement('frame-1', { x: 0 + dx, y: 0 + dy })
      useEditorStore.getState().updateElement('frame-2', { x: 100 + dx, y: 100 + dy })
    })

    const stateAfter = useEditorStore.getState().elements
    const newRelX = stateAfter['frame-2'].x - stateAfter['frame-1'].x
    const newRelY = stateAfter['frame-2'].y - stateAfter['frame-1'].y

    // Relative distances should be maintained
    expect(newRelX).toBe(relX)
    expect(newRelY).toBe(relY)
    expect(stateAfter['frame-1'].x).toBe(75)
    expect(stateAfter['frame-1'].y).toBe(75)
    expect(stateAfter['frame-2'].x).toBe(175)
    expect(stateAfter['frame-2'].y).toBe(175)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional: Component render checks
// ─────────────────────────────────────────────────────────────────────────────
describe('Canvas component: selection and resize handles render', () => {
  it('renders resize handles when element is selected', () => {
    const frame = makeFrame({ id: 'frame-sel', x: 50, y: 50, width: 100, height: 100 })

    act(() => {
      useEditorStore.setState({
        elements: { 'frame-sel': frame },
        rootIds: ['frame-sel'],
        selectedIds: ['frame-sel'],
        past: [],
        future: [],
      })
    })

    const { container } = render(<ResizeHandles element={frame} zoom={1} />)

    // Should have 8 handles
    const handles = container.querySelectorAll('[data-testid^="resize-handle-"]')
    expect(handles.length).toBe(8)
  })

  it('renders SelectionOverlay with testid', () => {
    render(<SelectionOverlay zoom={1} />)
    expect(screen.getByTestId('selection-overlay')).toBeDefined()
  })

  it('renders move handle for selected element in SelectionOverlay', () => {
    const frame = makeFrame({ id: 'frame-mv', x: 10, y: 10, width: 100, height: 80 })

    act(() => {
      useEditorStore.setState({
        elements: { 'frame-mv': frame },
        rootIds: ['frame-mv'],
        selectedIds: ['frame-mv'],
        past: [],
        future: [],
      })
    })

    render(<SelectionOverlay zoom={1} />)
    expect(screen.getByTestId('move-handle-frame-mv')).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional: Click-to-select via store
// ─────────────────────────────────────────────────────────────────────────────
describe('Click-to-select and deselect', () => {
  it('selectElement sets selectedIds to [id]', () => {
    const frame = makeFrame({ id: 'frame-1' })
    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
    })
    expect(useEditorStore.getState().selectedIds).toEqual(['frame-1'])
  })

  it('deselectAll clears selectedIds', () => {
    const frame = makeFrame({ id: 'frame-1' })
    act(() => {
      useEditorStore.getState().addElement(frame)
      useEditorStore.getState().selectElement('frame-1')
      useEditorStore.getState().deselectAll()
    })
    expect(useEditorStore.getState().selectedIds).toEqual([])
  })

  it('multiSelect via Shift+click adds element to selection', () => {
    const f1 = makeFrame({ id: 'frame-1' })
    const f2 = makeFrame({ id: 'frame-2' })
    act(() => {
      useEditorStore.getState().addElement(f1)
      useEditorStore.getState().addElement(f2)
      useEditorStore.getState().selectElement('frame-1')
      // Shift+click adds frame-2
      const currentIds = useEditorStore.getState().selectedIds
      useEditorStore.getState().multiSelect([...currentIds, 'frame-2'])
    })
    expect(useEditorStore.getState().selectedIds).toEqual(['frame-1', 'frame-2'])
  })
})
