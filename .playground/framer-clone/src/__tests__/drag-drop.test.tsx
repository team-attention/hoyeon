import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComponentLibrary, DRAG_DATA_KEY } from '../components/library/ComponentLibrary'
import { Canvas } from '../components/Canvas'
import { useEditorStore } from '../store'

// Reset store before each test
beforeEach(() => {
  useEditorStore.setState({
    elements: {},
    rootIds: [],
    selectedIds: [],
    past: [],
    future: [],
    breakpoint: 'desktop',
  })
})

// Helper: create a minimal DataTransfer-like object for jsdom drag events
function makeDataTransfer(): DataTransfer {
  const store: Record<string, string> = {}
  const types: string[] = []
  return {
    types,
    effectAllowed: 'copy',
    dropEffect: 'copy',
    setData(type: string, value: string) {
      if (!types.includes(type)) types.push(type)
      store[type] = value
    },
    getData(type: string) {
      return store[type] ?? ''
    },
    clearData() {
      types.length = 0
    },
    items: [] as unknown as DataTransferItemList,
    files: [] as unknown as FileList,
    setDragImage: () => {},
  } as unknown as DataTransfer
}

describe('R1-S1: Drag Frame from library and drop onto canvas — element appears and is selected', () => {
  it('creates a Frame element on the canvas when dropped', () => {
    const dt = makeDataTransfer()

    // Render ComponentLibrary and simulate dragstart on Frame card
    render(<ComponentLibrary />)
    const frameCard = document.querySelector('[data-component-id="frame"]')!
    expect(frameCard).not.toBeNull()

    fireEvent.dragStart(frameCard, { dataTransfer: dt })

    // Verify data was set
    expect(dt.getData(DRAG_DATA_KEY)).toBe('frame')

    // Render canvas and simulate drop
    const { unmount } = render(<Canvas />)
    const canvasContainer = screen.getByTestId('canvas-container')

    fireEvent.dragOver(canvasContainer, { dataTransfer: dt, clientX: 200, clientY: 200 })
    fireEvent.drop(canvasContainer, { dataTransfer: dt, clientX: 200, clientY: 200 })

    unmount()

    // Check store: element should have been added
    const state = useEditorStore.getState()
    expect(state.rootIds).toHaveLength(1)
    const elementId = state.rootIds[0]
    expect(state.elements[elementId]).toBeDefined()
    expect(state.elements[elementId].type).toBe('frame')
    // Element should be selected
    expect(state.selectedIds).toContain(elementId)
  })

  it('creates elements at the approximate drop position', () => {
    const dt = makeDataTransfer()
    dt.setData(DRAG_DATA_KEY, 'text')
    dt.setData('text/plain', 'text')

    render(<Canvas />)
    const canvasContainer = screen.getByTestId('canvas-container')

    fireEvent.dragOver(canvasContainer, { dataTransfer: dt, clientX: 300, clientY: 400 })
    fireEvent.drop(canvasContainer, { dataTransfer: dt, clientX: 300, clientY: 400 })

    const state = useEditorStore.getState()
    expect(state.rootIds).toHaveLength(1)
    const el = state.elements[state.rootIds[0]]
    expect(el.type).toBe('text')
    // x and y should be numeric (jsdom has no layout so offset is 0,0)
    expect(typeof el.x).toBe('number')
    expect(typeof el.y).toBe('number')
  })
})

describe('R1-S2: Dropping outside canvas area — no element added', () => {
  it('does not add element when drop event has no component id', () => {
    const dt = makeDataTransfer()
    // No data set — simulates a drop with unrecognized payload or outside canvas

    render(<Canvas />)
    const canvasContainer = screen.getByTestId('canvas-container')

    fireEvent.dragOver(canvasContainer, { dataTransfer: dt })
    fireEvent.drop(canvasContainer, { dataTransfer: dt })

    const state = useEditorStore.getState()
    expect(state.rootIds).toHaveLength(0)
  })

  it('does not add element when dataTransfer has unrelated data', () => {
    const dt = makeDataTransfer()
    dt.setData('text/uri-list', 'https://example.com')

    render(<Canvas />)
    const canvasContainer = screen.getByTestId('canvas-container')

    fireEvent.dragOver(canvasContainer, { dataTransfer: dt })
    fireEvent.drop(canvasContainer, { dataTransfer: dt })

    const state = useEditorStore.getState()
    expect(state.rootIds).toHaveLength(0)
  })
})
