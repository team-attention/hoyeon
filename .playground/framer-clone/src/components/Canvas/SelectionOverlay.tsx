import { useRef, useState } from 'react'
import { useEditorStore } from '../../store'
import { ResizeHandles } from './ResizeHandles'

interface SelectionOverlayProps {
  zoom: number
}

/**
 * SelectionOverlay renders on top of all canvas elements.
 * Responsibilities:
 * - Show resize handles on selected elements
 * - Allow drag-to-move selected elements (maintaining relative positions for multi-select)
 * - Support marquee selection (drag on empty canvas area)
 */
export function SelectionOverlay({ zoom }: SelectionOverlayProps) {
  const { elements, selectedIds, multiSelect, deselectAll, updateElement } = useEditorStore()

  // Drag-to-move state
  const moveState = useRef<{
    startX: number
    startY: number
    origPositions: Record<string, { x: number; y: number }>
    isDragging: boolean
  } | null>(null)

  // Marquee selection state
  const [marquee, setMarquee] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const isMarqueeRef = useRef(false)

  const selectedElements = selectedIds
    .map((id) => elements[id])
    .filter(Boolean)

  // Start moving selected elements
  const handleMovePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()

    const origPositions: Record<string, { x: number; y: number }> = {}
    for (const id of selectedIds) {
      const el = elements[id]
      if (el) {
        origPositions[id] = { x: el.x, y: el.y }
      }
    }

    moveState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origPositions,
      isDragging: false,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleMovePointerMove = (e: React.PointerEvent) => {
    if (!moveState.current) return

    const dx = (e.clientX - moveState.current.startX) / zoom
    const dy = (e.clientY - moveState.current.startY) / zoom

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      moveState.current.isDragging = true
    }

    if (!moveState.current.isDragging) return

    // Move all selected elements maintaining relative positions
    for (const [id, orig] of Object.entries(moveState.current.origPositions)) {
      updateElement(id, { x: orig.x + dx, y: orig.y + dy })
    }
  }

  const handleMovePointerUp = () => {
    moveState.current = null
  }

  // Marquee selection on canvas surface (empty area)
  const handleSurfacePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // Only start marquee if clicking on the overlay surface itself (not a child)
    if (e.target !== e.currentTarget) return

    deselectAll()
    isMarqueeRef.current = true

    // Get position relative to overlay (which is the canvas-surface sized div)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    setMarquee({ startX: x, startY: y, currentX: x, currentY: y })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handleSurfacePointerMove = (e: React.PointerEvent) => {
    if (!isMarqueeRef.current || !marquee) return

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    setMarquee((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null))
  }

  const handleSurfacePointerUp = (e: React.PointerEvent) => {
    if (!isMarqueeRef.current || !marquee) return
    isMarqueeRef.current = false

    // Determine marquee bounds
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    const left = Math.min(marquee.startX, x)
    const top = Math.min(marquee.startY, y)
    const right = Math.max(marquee.startX, x)
    const bottom = Math.max(marquee.startY, y)

    // Select all elements within the marquee bounds
    const intersecting = Object.values(elements).filter((el) => {
      if (!el.visible) return false
      // Check overlap
      return el.x < right && el.x + el.width > left && el.y < bottom && el.y + el.height > top
    })

    if (intersecting.length > 0) {
      multiSelect(intersecting.map((el) => el.id))
    }

    setMarquee(null)
  }

  // Compute marquee rectangle for rendering
  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.startX, marquee.currentX),
        top: Math.min(marquee.startY, marquee.currentY),
        width: Math.abs(marquee.currentX - marquee.startX),
        height: Math.abs(marquee.currentY - marquee.startY),
      }
    : null

  return (
    <div
      data-testid="selection-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 500,
      }}
    >
      {/* Canvas surface listener for marquee */}
      <div
        data-testid="selection-overlay-surface"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'all',
          cursor: 'crosshair',
        }}
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleSurfacePointerUp}
      />

      {/* Move handles for selected elements */}
      {selectedElements.map((el) => (
        <div
          key={el.id}
          data-testid={`move-handle-${el.id}`}
          style={{
            position: 'absolute',
            left: el.x,
            top: el.y,
            width: el.width,
            height: el.height,
            pointerEvents: 'all',
            cursor: 'move',
            zIndex: 600,
          }}
          onPointerDown={handleMovePointerDown}
          onPointerMove={handleMovePointerMove}
          onPointerUp={handleMovePointerUp}
        />
      ))}

      {/* Resize handles for selected elements (only single selection) */}
      {selectedElements.length === 1 && (
        <ResizeHandles element={selectedElements[0]} zoom={zoom} />
      )}

      {/* Marquee selection box */}
      {marqueeRect && marqueeRect.width > 2 && marqueeRect.height > 2 && (
        <div
          data-testid="marquee-selection"
          style={{
            position: 'absolute',
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
            border: '1px solid #0a84ff',
            background: 'rgba(10, 132, 255, 0.1)',
            pointerEvents: 'none',
            zIndex: 700,
          }}
        />
      )}
    </div>
  )
}
