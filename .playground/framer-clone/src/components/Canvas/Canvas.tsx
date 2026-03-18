import { useEffect, useRef, useCallback } from 'react'
import { useEditorStore, BREAKPOINT_WIDTHS } from '../../store'
import { useCanvasNavigation } from './useCanvasNavigation'
import { CanvasElement } from './CanvasElement'
import { SelectionOverlay } from './SelectionOverlay'
import { DRAG_DATA_KEY } from '../library/ComponentLibrary'
import { createDefaultElement } from '../library/createDefaultElement'

interface CanvasProps {
  /** Optional callback when zoom changes (for toolbar display) */
  onZoomChange?: (zoomPercent: number) => void
}

export function Canvas({ onZoomChange }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    transform,
    isPanning,
    handleWheel,
    handleKeyDown,
    handleKeyUp,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    zoomLevelPercent,
  } = useCanvasNavigation(containerRef)

  const { elements, rootIds, selectedIds, selectElement, multiSelect, deselectAll, addElement, breakpoint } = useEditorStore()
  const viewportWidth = BREAKPOINT_WIDTHS[breakpoint]

  // Notify parent of zoom changes
  useEffect(() => {
    onZoomChange?.(zoomLevelPercent)
  }, [zoomLevelPercent, onZoomChange])

  // Attach wheel and keyboard event listeners
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Wheel needs passive: false so we can call preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseDown, handleMouseMove, handleMouseUp])

  const handleElementClick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Add to / remove from selection
      if (selectedIds.includes(id)) {
        const newIds = selectedIds.filter((sid) => sid !== id)
        multiSelect(newIds)
      } else {
        multiSelect([...selectedIds, id])
      }
    } else {
      selectElement(id)
    }
  }

  const handleCanvasClick = () => {
    deselectAll()
  }

  // ── Drag-drop from component library ──────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only accept drops that carry a library component id
    if (e.dataTransfer.types.includes(DRAG_DATA_KEY) ||
        e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const componentId = e.dataTransfer.getData(DRAG_DATA_KEY) ||
                        e.dataTransfer.getData('text/plain')
    if (!componentId) return

    // Convert client coordinates to canvas-surface coordinates
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    // Adjust for transform (pan + zoom)
    const canvasX = (e.clientX - rect.left - transform.x) / transform.zoom
    const canvasY = (e.clientY - rect.top - transform.y) / transform.zoom

    const element = createDefaultElement(componentId, Math.round(canvasX), Math.round(canvasY))
    if (!element) return

    addElement(element)
    selectElement(element.id)
  }, [transform, addElement, selectElement])

  return (
    <div
      ref={containerRef}
      data-testid="canvas-container"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        background: '#141414',
        cursor: isPanning ? 'grabbing' : 'default',
        userSelect: isPanning ? 'none' : 'auto',
      }}
      onClick={handleCanvasClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Transform container: pan + zoom applied here */}
      <div
        data-testid="canvas-transform-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
          willChange: 'transform',
        }}
      >
        {/* Infinite canvas surface */}
        <div
          data-testid="canvas-surface"
          style={{
            position: 'relative',
            width: 5000,
            height: 5000,
          }}
        >
          {/* Responsive viewport frame: clips to current breakpoint width */}
          <div
            data-testid="canvas-viewport"
            data-breakpoint={breakpoint}
            data-viewport-width={viewportWidth}
            style={{
              position: 'absolute',
              top: 100,
              left: 200,
              width: viewportWidth,
              height: 900,
              background: '#ffffff08',
              border: '1px solid #444',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {rootIds.map((id) => {
              const el = elements[id]
              if (!el || !el.visible) return null
              return (
                <CanvasElement
                  key={id}
                  element={el}
                  isSelected={selectedIds.includes(id)}
                  zoom={transform.zoom}
                  onClick={handleElementClick}
                />
              )
            })}
          </div>
          <SelectionOverlay zoom={transform.zoom} />
        </div>
      </div>

      {/* Zoom level badge */}
      <div
        data-testid="canvas-zoom-badge"
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: '#242424',
          border: '1px solid #333',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 12,
          color: '#888',
          pointerEvents: 'none',
        }}
      >
        {zoomLevelPercent}%
      </div>
    </div>
  )
}

export default Canvas
