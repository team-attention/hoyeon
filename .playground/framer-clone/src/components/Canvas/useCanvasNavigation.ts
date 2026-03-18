import { useState, useCallback, useRef } from 'react'

export const ZOOM_MIN = 0.1 // 10%
export const ZOOM_MAX = 5.0 // 500%
export const ZOOM_STEP = 0.1

export interface CanvasTransform {
  x: number
  y: number
  zoom: number
}

export interface UseCanvasNavigationReturn {
  transform: CanvasTransform
  isPanning: boolean
  setTransform: (transform: CanvasTransform) => void
  handleWheel: (e: WheelEvent) => void
  handleKeyDown: (e: KeyboardEvent) => void
  handleKeyUp: (e: KeyboardEvent) => void
  handleMouseDown: (e: MouseEvent) => void
  handleMouseMove: (e: MouseEvent) => void
  handleMouseUp: (e: MouseEvent) => void
  zoomIn: (step?: number) => void
  zoomOut: (step?: number) => void
  zoomLevelPercent: number
}

function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
}

export function useCanvasNavigation(
  containerRef: React.RefObject<HTMLElement | null>
): UseCanvasNavigationReturn {
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, zoom: 1 })
  const [isPanning, setIsPanning] = useState(false)

  // Track space key held state
  const spaceHeldRef = useRef(false)
  // Track middle-mouse pan state
  const panningRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Cmd+scroll (or Ctrl+scroll) = zoom
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()

        const container = containerRef.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top

        setTransform((prev) => {
          const delta = -e.deltaY * 0.001
          const newZoom = clampZoom(prev.zoom * (1 + delta))

          // Zoom centered on cursor: adjust pan so cursor stays fixed
          const scaleRatio = newZoom / prev.zoom
          const newX = cursorX - scaleRatio * (cursorX - prev.x)
          const newY = cursorY - scaleRatio * (cursorY - prev.y)

          return { x: newX, y: newY, zoom: newZoom }
        })
      }
    },
    [containerRef]
  )

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat) {
      // Prevent page scroll when space is held (guard against null target)
      const target = e.target as HTMLElement | null
      if (!target || target === document.body || target.tagName !== 'INPUT') {
        e.preventDefault()
      }
      spaceHeldRef.current = true
      setIsPanning(true)
    }
  }, [])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceHeldRef.current = false
      // Stop panning on space release even if mouse is still held
      if (panningRef.current) {
        panningRef.current = false
      }
      setIsPanning(false)
    }
  }, [])

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Space+left-drag or middle-mouse-drag for panning
    const isSpacePan = spaceHeldRef.current && e.button === 0
    const isMiddlePan = e.button === 1

    if (isSpacePan || isMiddlePan) {
      e.preventDefault()
      panningRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      setIsPanning(true)
    }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!panningRef.current) return

    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    lastMouseRef.current = { x: e.clientX, y: e.clientY }

    setTransform((prev) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }))
  }, [])

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (panningRef.current) {
        panningRef.current = false
        // Only stop the panning indicator if space is also released
        if (!spaceHeldRef.current) {
          setIsPanning(false)
        }
      }

      // Middle mouse release always ends pan mode
      if (e.button === 1) {
        panningRef.current = false
        if (!spaceHeldRef.current) {
          setIsPanning(false)
        }
      }
    },
    []
  )

  const zoomIn = useCallback((step = ZOOM_STEP) => {
    setTransform((prev) => ({
      ...prev,
      zoom: clampZoom(prev.zoom + step),
    }))
  }, [])

  const zoomOut = useCallback((step = ZOOM_STEP) => {
    setTransform((prev) => ({
      ...prev,
      zoom: clampZoom(prev.zoom - step),
    }))
  }, [])

  return {
    transform,
    isPanning,
    setTransform,
    handleWheel,
    handleKeyDown,
    handleKeyUp,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    zoomIn,
    zoomOut,
    zoomLevelPercent: Math.round(transform.zoom * 100),
  }
}
