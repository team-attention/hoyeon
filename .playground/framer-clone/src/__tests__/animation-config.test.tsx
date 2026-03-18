/**
 * animation-config.test.tsx
 *
 * Tests for R7: Animation configuration panel (hover effects + CSS transitions).
 * Covers:
 *   R7-S1 (HP): Selecting element → configure hover effect → saved and visible
 *   R7-S2 (EP): No element selected → animation section shows disabled/empty state
 *   R7-S3 (BC): Transition duration set to 0ms → accepted without error
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useEditorStore } from '../store'
import { DEFAULT_ANIMATION_CONFIG } from '../store'
import { AnimationPanel } from '../components/RightPanel/AnimationPanel'
import type { FrameElement } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Test factories
// ─────────────────────────────────────────────────────────────────────────────
function makeFrame(id: string, overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id,
    type: 'frame',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: `Frame ${id}`,
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
    breakpoint: 'desktop',
    customComponents: [],
    animationConfigs: {},
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R7-S2 (EP): No element selected → empty/disabled state
// ─────────────────────────────────────────────────────────────────────────────
describe('R7-S2: No element selected — animation section disabled', () => {
  it('renders the animation section header', () => {
    render(<AnimationPanel />)
    expect(screen.getByTestId('section-animation')).toBeTruthy()
    expect(screen.getByTestId('section-animation-header')).toBeTruthy()
  })

  it('shows empty state message when no element is selected', () => {
    render(<AnimationPanel />)
    expect(screen.getByTestId('animation-empty')).toBeTruthy()
    expect(screen.queryByTestId('animation-section-content')).toBeNull()
  })

  it('does not render hover effect inputs when no element is selected', () => {
    render(<AnimationPanel />)
    expect(screen.queryByTestId('input-hover-scale')).toBeNull()
    expect(screen.queryByTestId('input-hover-opacity')).toBeNull()
    expect(screen.queryByTestId('input-transition-duration')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R7-S1 (HP): Element selected → configure hover effect → saved in store
// ─────────────────────────────────────────────────────────────────────────────
describe('R7-S1: Configure hover effect for selected element', () => {
  it('shows animation controls when an element is selected', () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)
    expect(screen.getByTestId('animation-section-content')).toBeTruthy()
    expect(screen.queryByTestId('animation-empty')).toBeNull()
  })

  it('renders hover effect inputs with default values', () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)
    const scaleInput = screen.getByTestId('input-hover-scale') as HTMLInputElement
    const opacityInput = screen.getByTestId('input-hover-opacity') as HTMLInputElement
    expect(scaleInput.value).toBe(String(DEFAULT_ANIMATION_CONFIG.hover.scale))
    expect(opacityInput.value).toBe(String(DEFAULT_ANIMATION_CONFIG.hover.opacity))
  })

  it('saves scale=1.1 and opacity=0.8 when user configures hover effect', async () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)

    // Set scale to 1.1
    const scaleInput = screen.getByTestId('input-hover-scale') as HTMLInputElement
    await act(async () => {
      fireEvent.focus(scaleInput)
      fireEvent.change(scaleInput, { target: { value: '1.1' } })
      fireEvent.blur(scaleInput)
    })

    // Set opacity to 0.8
    const opacityInput = screen.getByTestId('input-hover-opacity') as HTMLInputElement
    await act(async () => {
      fireEvent.focus(opacityInput)
      fireEvent.change(opacityInput, { target: { value: '0.8' } })
      fireEvent.blur(opacityInput)
    })

    // Verify config saved in store
    const savedConfig = useEditorStore.getState().animationConfigs['btn-1']
    expect(savedConfig).toBeTruthy()
    expect(savedConfig.hover.scale).toBe(1.1)
    expect(savedConfig.hover.opacity).toBe(0.8)
  })

  it('saves all hover target properties (scale, opacity, x, y, rotation)', async () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)

    async function setField(testId: string, value: string) {
      const input = screen.getByTestId(testId) as HTMLInputElement
      await act(async () => {
        fireEvent.focus(input)
        fireEvent.change(input, { target: { value } })
        fireEvent.blur(input)
      })
    }

    await setField('input-hover-scale', '1.05')
    await setField('input-hover-opacity', '0.9')
    await setField('input-hover-x', '10')
    await setField('input-hover-y', '-5')
    await setField('input-hover-rotation', '15')

    const savedConfig = useEditorStore.getState().animationConfigs['btn-1']
    expect(savedConfig.hover.scale).toBe(1.05)
    expect(savedConfig.hover.opacity).toBe(0.9)
    expect(savedConfig.hover.x).toBe(10)
    expect(savedConfig.hover.y).toBe(-5)
    expect(savedConfig.hover.rotation).toBe(15)
  })

  it('shows easing select with all options', () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)
    const easingSelect = screen.getByTestId('select-transition-easing') as HTMLSelectElement
    expect(easingSelect).toBeTruthy()

    const options = Array.from(easingSelect.options).map((o) => o.value)
    expect(options).toContain('ease')
    expect(options).toContain('ease-in')
    expect(options).toContain('ease-out')
    expect(options).toContain('ease-in-out')
    expect(options).toContain('spring')
  })

  it('saves easing selection to store', async () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)

    const easingSelect = screen.getByTestId('select-transition-easing')
    await act(async () => {
      fireEvent.change(easingSelect, { target: { value: 'ease-in-out' } })
    })

    const savedConfig = useEditorStore.getState().animationConfigs['btn-1']
    expect(savedConfig.transition.easing).toBe('ease-in-out')
  })

  it('config is visible in animation section after save (controls reflect saved values)', async () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
      animationConfigs: {
        'btn-1': {
          hover: { scale: 1.2, opacity: 0.7, x: 5, y: -3, rotation: 10 },
          transition: { duration: 400, easing: 'ease-out' },
        },
      },
    })

    render(<AnimationPanel />)

    const scaleInput = screen.getByTestId('input-hover-scale') as HTMLInputElement
    const durationInput = screen.getByTestId('input-transition-duration') as HTMLInputElement
    const easingSelect = screen.getByTestId('select-transition-easing') as HTMLSelectElement

    expect(scaleInput.value).toBe('1.2')
    expect(durationInput.value).toBe('400')
    expect(easingSelect.value).toBe('ease-out')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// R7-S3 (BC): Transition duration set to 0ms — accepted without error
// ─────────────────────────────────────────────────────────────────────────────
describe('R7-S3: Transition duration 0ms — instant, no error', () => {
  it('accepts 0ms duration and saves it to store without error', async () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)

    const durationInput = screen.getByTestId('input-transition-duration') as HTMLInputElement
    await act(async () => {
      fireEvent.focus(durationInput)
      fireEvent.change(durationInput, { target: { value: '0' } })
      fireEvent.blur(durationInput)
    })

    const savedConfig = useEditorStore.getState().animationConfigs['btn-1']
    expect(savedConfig.transition.duration).toBe(0)
    expect(durationInput.value).toBe('0')
  })

  it('does not allow negative duration (clamps to 0)', async () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)

    const durationInput = screen.getByTestId('input-transition-duration') as HTMLInputElement
    await act(async () => {
      fireEvent.focus(durationInput)
      fireEvent.change(durationInput, { target: { value: '-100' } })
      fireEvent.blur(durationInput)
    })

    const savedConfig = useEditorStore.getState().animationConfigs['btn-1']
    expect(savedConfig.transition.duration).toBeGreaterThanOrEqual(0)
  })

  it('section collapses and expands on header click', async () => {
    const frame = makeFrame('btn-1')
    useEditorStore.setState({
      elements: { 'btn-1': frame },
      rootIds: ['btn-1'],
      selectedIds: ['btn-1'],
    })

    render(<AnimationPanel />)

    // Initially open
    expect(screen.getByTestId('section-animation-content')).toBeTruthy()

    // Click header to collapse
    const header = screen.getByTestId('section-animation-header')
    await act(async () => {
      fireEvent.click(header)
    })

    expect(screen.queryByTestId('section-animation-content')).toBeNull()

    // Click header to expand again
    await act(async () => {
      fireEvent.click(header)
    })

    expect(screen.getByTestId('section-animation-content')).toBeTruthy()
  })
})
