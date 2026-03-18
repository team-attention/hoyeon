import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { useCanvasNavigation, ZOOM_MIN, ZOOM_MAX } from '../components/Canvas/useCanvasNavigation'
import { Canvas } from '../components/Canvas'
import { useEditorStore } from '../store'

// Reset store between tests
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
// Helper: create a WheelEvent-like plain object.
// happy-dom's WheelEvent constructor does not propagate deltaY from EventInit,
// so we use a plain object that satisfies the shape the hook reads.
// ─────────────────────────────────────────────────────────────────────────────
function makeWheelEvent(
  deltaY: number,
  opts: { metaKey?: boolean; ctrlKey?: boolean; clientX?: number; clientY?: number } = {}
): WheelEvent {
  return {
    deltaY,
    deltaX: 0,
    deltaZ: 0,
    deltaMode: 0,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as WheelEvent
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a mock container ref
// ─────────────────────────────────────────────────────────────────────────────
function makeContainerRef(rect = { left: 0, top: 0, width: 800, height: 600 }) {
  const container = document.createElement('div')
  container.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  })
  return { current: container } as React.RefObject<HTMLDivElement>
}

// ─────────────────────────────────────────────────────────────────────────────
// R9-S1: Pan — Space+drag pans the canvas
// ─────────────────────────────────────────────────────────────────────────────
describe('R9-S1: Pan canvas with Space+drag', () => {
  it('pans the canvas when space is held and mouse is dragged', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Initial transform
    expect(result.current.transform.x).toBe(0)
    expect(result.current.transform.y).toBe(0)

    // Press space
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    })
    expect(result.current.isPanning).toBe(true)

    // Mouse down (left button)
    act(() => {
      result.current.handleMouseDown(
        new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 })
      )
    })

    // Mouse move — drag 50px right and 30px down
    act(() => {
      result.current.handleMouseMove(
        new MouseEvent('mousemove', { clientX: 150, clientY: 130 })
      )
    })

    expect(result.current.transform.x).toBe(50)
    expect(result.current.transform.y).toBe(30)
  })

  it('does not pan when space is not held', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // No space key pressed
    act(() => {
      result.current.handleMouseDown(
        new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 })
      )
      result.current.handleMouseMove(
        new MouseEvent('mousemove', { clientX: 200, clientY: 200 })
      )
    })

    expect(result.current.transform.x).toBe(0)
    expect(result.current.transform.y).toBe(0)
  })

  it('pans across multiple drag steps in the drag direction', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Hold space and start dragging
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { code: 'Space' }))
      result.current.handleMouseDown(
        new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 })
      )
    })

    // Step 1: move right
    act(() => {
      result.current.handleMouseMove(new MouseEvent('mousemove', { clientX: 110, clientY: 100 }))
    })
    expect(result.current.transform.x).toBe(10)

    // Step 2: move further right
    act(() => {
      result.current.handleMouseMove(new MouseEvent('mousemove', { clientX: 120, clientY: 100 }))
    })
    expect(result.current.transform.x).toBe(20)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R9-S2: Zoom — Cmd+scroll zooms centered on cursor
// ─────────────────────────────────────────────────────────────────────────────
describe('R9-S2: Zoom with Cmd+scroll', () => {
  it('zooms in when scrolling up with Cmd held', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    const initialZoom = result.current.transform.zoom

    act(() => {
      // Negative deltaY = scroll up = zoom in
      result.current.handleWheel(makeWheelEvent(-100, { metaKey: true, clientX: 400, clientY: 300 }))
    })

    expect(result.current.transform.zoom).toBeGreaterThan(initialZoom)
  })

  it('zooms out when scrolling down with Cmd held', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    const initialZoom = result.current.transform.zoom

    act(() => {
      // Positive deltaY = scroll down = zoom out
      result.current.handleWheel(makeWheelEvent(100, { metaKey: true, clientX: 400, clientY: 300 }))
    })

    expect(result.current.transform.zoom).toBeLessThan(initialZoom)
  })

  it('does not zoom without Cmd/Ctrl held', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    const initialZoom = result.current.transform.zoom

    act(() => {
      result.current.handleWheel(makeWheelEvent(-100, { metaKey: false, ctrlKey: false }))
    })

    expect(result.current.transform.zoom).toBe(initialZoom)
  })

  it('adjusts pan position to keep cursor fixed during zoom', () => {
    const ref = makeContainerRef({ left: 0, top: 0, width: 800, height: 600 })
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Cursor at (400, 300) — center of canvas
    // With zero initial pan, zooming at center should keep center fixed
    const cursorX = 400
    const cursorY = 300

    act(() => {
      result.current.handleWheel(makeWheelEvent(-500, { metaKey: true, clientX: cursorX, clientY: cursorY }))
    })

    // After zoom-in, pan should adjust so cursor stays at same canvas point
    // With initial pan=0 and cursor at center, pan after zoom should be non-zero
    // Specifically: newX = cursorX - scaleRatio * (cursorX - 0) = cursorX * (1 - scaleRatio)
    const zoom = result.current.transform.zoom
    const scaleRatio = zoom / 1.0
    const expectedX = cursorX - scaleRatio * cursorX
    const expectedY = cursorY - scaleRatio * cursorY

    expect(result.current.transform.x).toBeCloseTo(expectedX, 1)
    expect(result.current.transform.y).toBeCloseTo(expectedY, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R9-S3: Zoom max boundary — cannot exceed 500%
// ─────────────────────────────────────────────────────────────────────────────
describe('R9-S3: Zoom maximum limit (500%)', () => {
  it('zoom level stays at maximum (500%) when trying to zoom in further', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Zoom to max directly
    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: ZOOM_MAX })
    })

    expect(result.current.transform.zoom).toBe(ZOOM_MAX)

    // Try to zoom in more
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.zoomIn(0.5)
      }
    })

    expect(result.current.transform.zoom).toBe(ZOOM_MAX)
    expect(result.current.zoomLevelPercent).toBe(500)
  })

  it('zoomLevelPercent never exceeds 500', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: ZOOM_MAX })
      result.current.zoomIn(10)
    })

    expect(result.current.zoomLevelPercent).toBeLessThanOrEqual(500)
  })

  it('Cmd+scroll zoom in stops at 500%', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Start near max
    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: 4.99 })
    })

    // Scroll up strongly
    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.handleWheel(makeWheelEvent(-200, { metaKey: true, clientX: 0, clientY: 0 }))
      }
    })

    expect(result.current.transform.zoom).toBeLessThanOrEqual(ZOOM_MAX)
    expect(result.current.zoomLevelPercent).toBeLessThanOrEqual(500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R9-S4: Zoom min boundary — cannot go below 10%
// ─────────────────────────────────────────────────────────────────────────────
describe('R9-S4: Zoom minimum limit (10%)', () => {
  it('zoom level stays at minimum (10%) when trying to zoom out further', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Zoom to min directly
    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: ZOOM_MIN })
    })

    expect(result.current.transform.zoom).toBe(ZOOM_MIN)

    // Try to zoom out more
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.zoomOut(0.5)
      }
    })

    expect(result.current.transform.zoom).toBe(ZOOM_MIN)
    expect(result.current.zoomLevelPercent).toBe(10)
  })

  it('zoomLevelPercent never goes below 10', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: ZOOM_MIN })
      result.current.zoomOut(10)
    })

    expect(result.current.zoomLevelPercent).toBeGreaterThanOrEqual(10)
  })

  it('Cmd+scroll zoom out stops at 10%', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Start near min
    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: 0.11 })
    })

    // Scroll down strongly
    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.handleWheel(makeWheelEvent(200, { metaKey: true, clientX: 0, clientY: 0 }))
      }
    })

    expect(result.current.transform.zoom).toBeGreaterThanOrEqual(ZOOM_MIN)
    expect(result.current.zoomLevelPercent).toBeGreaterThanOrEqual(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R9-S5: Pan stops when Space is released even while mouse is held
// ─────────────────────────────────────────────────────────────────────────────
describe('R9-S5: Pan stops on Space release while mouse is held', () => {
  it('stops panning when space is released while mouse is still held', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    // Start panning: hold space and press mouse
    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { code: 'Space' }))
      result.current.handleMouseDown(
        new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 })
      )
    })

    expect(result.current.isPanning).toBe(true)

    // Move mouse — should pan
    act(() => {
      result.current.handleMouseMove(new MouseEvent('mousemove', { clientX: 110, clientY: 110 }))
    })
    expect(result.current.transform.x).toBe(10)

    // Release Space (mouse still held)
    act(() => {
      result.current.handleKeyUp(new KeyboardEvent('keyup', { code: 'Space' }))
    })

    // isPanning should stop
    expect(result.current.isPanning).toBe(false)

    // Capture current position
    const positionAfterSpaceRelease = {
      x: result.current.transform.x,
      y: result.current.transform.y,
    }

    // Move mouse more — should NOT pan anymore
    act(() => {
      result.current.handleMouseMove(new MouseEvent('mousemove', { clientX: 150, clientY: 150 }))
    })

    // Position should NOT have changed after space was released
    expect(result.current.transform.x).toBe(positionAfterSpaceRelease.x)
    expect(result.current.transform.y).toBe(positionAfterSpaceRelease.y)
  })

  it('cursor returns to default after space release', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    act(() => {
      result.current.handleKeyDown(new KeyboardEvent('keydown', { code: 'Space' }))
    })
    expect(result.current.isPanning).toBe(true)

    act(() => {
      result.current.handleKeyUp(new KeyboardEvent('keyup', { code: 'Space' }))
    })
    expect(result.current.isPanning).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Canvas component rendering tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Canvas component renders element tree from store', () => {
  it('renders canvas container with transform container', () => {
    render(<Canvas />)
    expect(screen.getByTestId('canvas-container')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-transform-container')).toBeInTheDocument()
  })

  it('renders elements from Zustand store', () => {
    const store = useEditorStore.getState()
    act(() => {
      store.addElement({
        id: 'el-1',
        type: 'frame',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        name: 'Frame 1',
        parentId: null,
        children: [],
        zIndex: 0,
        backgroundColor: '#ffffff',
        borderRadius: 0,
        borderWidth: 0,
        borderColor: '#000',
        overflow: 'visible',
        layoutMode: 'none',
        gap: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      })
    })

    render(<Canvas />)
    expect(screen.getByTestId('canvas-element-el-1')).toBeInTheDocument()
  })

  it('does not render invisible elements', () => {
    const store = useEditorStore.getState()
    act(() => {
      store.addElement({
        id: 'el-hidden',
        type: 'frame',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        visible: false,
        locked: false,
        name: 'Hidden',
        parentId: null,
        children: [],
        zIndex: 0,
        backgroundColor: '#ff0000',
        borderRadius: 0,
        borderWidth: 0,
        borderColor: '#000',
        overflow: 'visible',
        layoutMode: 'none',
        gap: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      })
    })

    render(<Canvas />)
    expect(screen.queryByTestId('canvas-element-el-hidden')).not.toBeInTheDocument()
  })

  it('shows zoom badge with current zoom level', () => {
    render(<Canvas />)
    expect(screen.getByTestId('canvas-zoom-badge')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-zoom-badge').textContent).toBe('100%')
  })

  it('calls onZoomChange when zoom changes', () => {
    const onZoomChange = vi.fn()
    render(<Canvas onZoomChange={onZoomChange} />)
    // Initially called with 100%
    expect(onZoomChange).toHaveBeenCalledWith(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Zoom limits with direct zoomIn/zoomOut functions
// ─────────────────────────────────────────────────────────────────────────────
describe('Zoom limits enforcement', () => {
  it('ZOOM_MIN constant equals 0.1 (10%)', () => {
    expect(ZOOM_MIN).toBe(0.1)
  })

  it('ZOOM_MAX constant equals 5.0 (500%)', () => {
    expect(ZOOM_MAX).toBe(5.0)
  })

  it('zoomIn does not exceed ZOOM_MAX', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: ZOOM_MAX })
      result.current.zoomIn()
    })

    expect(result.current.transform.zoom).toBe(ZOOM_MAX)
  })

  it('zoomOut does not go below ZOOM_MIN', () => {
    const ref = makeContainerRef()
    const { result } = renderHook(() => useCanvasNavigation(ref))

    act(() => {
      result.current.setTransform({ x: 0, y: 0, zoom: ZOOM_MIN })
      result.current.zoomOut()
    })

    expect(result.current.transform.zoom).toBe(ZOOM_MIN)
  })
})
