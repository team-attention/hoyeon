import { useRef } from 'react'
import type { Element } from '../../types'
import { useEditorStore } from '../../store'

// 8 resize handle positions: corners + midpoints
export type HandlePosition =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'

// Minimum element size in pixels
export const MIN_SIZE = 1

interface ResizeHandlesProps {
  element: Element
  zoom: number
}

// Map handle position to cursor style
const CURSOR_MAP: Record<HandlePosition, string> = {
  nw: 'nw-resize',
  n: 'n-resize',
  ne: 'ne-resize',
  e: 'e-resize',
  se: 'se-resize',
  s: 's-resize',
  sw: 'sw-resize',
  w: 'w-resize',
}

// Map handle position to percentage-based placement (top, left)
const POSITION_MAP: Record<HandlePosition, { top: string; left: string }> = {
  nw: { top: '0%', left: '0%' },
  n: { top: '0%', left: '50%' },
  ne: { top: '0%', left: '100%' },
  e: { top: '50%', left: '100%' },
  se: { top: '100%', left: '100%' },
  s: { top: '100%', left: '50%' },
  sw: { top: '100%', left: '0%' },
  w: { top: '50%', left: '0%' },
}

const ALL_HANDLES: HandlePosition[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function ResizeHandles({ element, zoom }: ResizeHandlesProps) {
  const updateElement = useEditorStore((s) => s.updateElement)
  const updateElementPreview = useEditorStore((s) => s.updateElementPreview)

  // Track drag state in refs to avoid stale closure issues
  const dragState = useRef<{
    handle: HandlePosition
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
    lastPatch: { x: number; y: number; width: number; height: number } | null
  } | null>(null)

  const handlePointerDown = (handle: HandlePosition, e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    dragState.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: element.x,
      origY: element.y,
      origW: element.width,
      origH: element.height,
      lastPatch: null,
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return

    const { handle, startX, startY, origX, origY, origW, origH } = dragState.current

    // Convert screen delta to canvas coordinates (account for zoom)
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom

    let newX = origX
    let newY = origY
    let newW = origW
    let newH = origH

    // Adjust dimensions based on which handle is being dragged
    if (handle.includes('e')) {
      newW = Math.max(MIN_SIZE, origW + dx)
    }
    if (handle.includes('w')) {
      const delta = Math.min(dx, origW - MIN_SIZE)
      newX = origX + delta
      newW = Math.max(MIN_SIZE, origW - delta)
    }
    if (handle.includes('s')) {
      newH = Math.max(MIN_SIZE, origH + dy)
    }
    if (handle.includes('n')) {
      const delta = Math.min(dy, origH - MIN_SIZE)
      newY = origY + delta
      newH = Math.max(MIN_SIZE, origH - delta)
    }

    const patch = { x: newX, y: newY, width: newW, height: newH }
    dragState.current.lastPatch = patch
    updateElementPreview(element.id, patch)
  }

  const handlePointerUp = () => {
    if (dragState.current?.lastPatch) {
      // Commit the final resize to history with a single updateElement call
      updateElement(element.id, dragState.current.lastPatch)
    }
    dragState.current = null
  }

  const handleSize = 8 / zoom // Scale handle size inversely with zoom

  return (
    <div
      data-testid={`resize-handles-${element.id}`}
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        pointerEvents: 'none',
        zIndex: 1000,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {ALL_HANDLES.map((handle) => (
        <div
          key={handle}
          data-testid={`resize-handle-${element.id}-${handle}`}
          style={{
            position: 'absolute',
            top: POSITION_MAP[handle].top,
            left: POSITION_MAP[handle].left,
            width: handleSize,
            height: handleSize,
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            border: '2px solid #0a84ff',
            borderRadius: 2,
            cursor: CURSOR_MAP[handle],
            pointerEvents: 'all',
            zIndex: 1001,
          }}
          onPointerDown={(e) => handlePointerDown(handle, e)}
        />
      ))}
    </div>
  )
}
