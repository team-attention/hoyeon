import { useEffect, useRef } from 'react'
import { useEditorStore } from '../../store'
import { useCanvasNavigation } from './useCanvasNavigation'
import { CanvasElement } from './CanvasElement'

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

  const { elements, rootIds, selectedIds, selectElement, deselectAll } = useEditorStore()

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
      // Multi-select handled elsewhere; for now just select
      selectElement(id)
    } else {
      selectElement(id)
    }
  }

  const handleCanvasClick = () => {
    deselectAll()
  }

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
