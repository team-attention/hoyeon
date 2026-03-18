import type { Element } from '../../types'

export interface SnapPoint {
  /** Value along one axis (x for vertical lines, y for horizontal lines) */
  value: number
  /** Whether this is a vertical line (x-axis snap) or horizontal line (y-axis snap) */
  orientation: 'vertical' | 'horizontal'
}

export interface SnapResult {
  /** Snapped x coordinate */
  x: number
  /** Snapped y coordinate */
  y: number
  /** Active guide lines to display */
  guides: SnapPoint[]
}

const SNAP_THRESHOLD = 5

/**
 * Calculate snap points from all non-selected elements.
 * Returns left, center, right edges (vertical) and top, middle, bottom edges (horizontal).
 */
export function getSnapPoints(
  elements: Record<string, Element>,
  excludeIds: string[]
): SnapPoint[] {
  const points: SnapPoint[] = []

  for (const el of Object.values(elements)) {
    if (excludeIds.includes(el.id)) continue
    if (!el.visible) continue

    const right = el.x + el.width
    const bottom = el.y + el.height
    const centerX = el.x + el.width / 2
    const centerY = el.y + el.height / 2

    // Vertical guides (snap x)
    points.push({ value: el.x, orientation: 'vertical' })
    points.push({ value: centerX, orientation: 'vertical' })
    points.push({ value: right, orientation: 'vertical' })

    // Horizontal guides (snap y)
    points.push({ value: el.y, orientation: 'horizontal' })
    points.push({ value: centerY, orientation: 'horizontal' })
    points.push({ value: bottom, orientation: 'horizontal' })
  }

  return points
}

/**
 * Compute snapped position and active guides for a dragged element.
 * Checks left, center, and right edges of the dragged element against snap points.
 */
export function computeSnap(
  x: number,
  y: number,
  width: number,
  height: number,
  snapPoints: SnapPoint[]
): SnapResult {
  let snappedX = x
  let snappedY = y
  const guides: SnapPoint[] = []

  const verticalPoints = snapPoints.filter((p) => p.orientation === 'vertical')
  const horizontalPoints = snapPoints.filter((p) => p.orientation === 'horizontal')

  // Check left edge, center, right edge of moving element
  const xEdges = [
    { offset: 0, name: 'left' },
    { offset: width / 2, name: 'center' },
    { offset: width, name: 'right' },
  ]

  let bestXDelta = SNAP_THRESHOLD + 1
  let snapXValue: number | null = null
  let snapXOffset = 0

  for (const edge of xEdges) {
    const edgeX = x + edge.offset
    for (const sp of verticalPoints) {
      const delta = Math.abs(edgeX - sp.value)
      if (delta < SNAP_THRESHOLD && delta < bestXDelta) {
        bestXDelta = delta
        snapXValue = sp.value
        snapXOffset = edge.offset
      }
    }
  }

  if (snapXValue !== null) {
    snappedX = snapXValue - snapXOffset
    guides.push({ value: snapXValue, orientation: 'vertical' })
  }

  // Check top edge, middle, bottom edge of moving element
  const yEdges = [
    { offset: 0, name: 'top' },
    { offset: height / 2, name: 'middle' },
    { offset: height, name: 'bottom' },
  ]

  let bestYDelta = SNAP_THRESHOLD + 1
  let snapYValue: number | null = null
  let snapYOffset = 0

  for (const edge of yEdges) {
    const edgeY = y + edge.offset
    for (const sp of horizontalPoints) {
      const delta = Math.abs(edgeY - sp.value)
      if (delta < SNAP_THRESHOLD && delta < bestYDelta) {
        bestYDelta = delta
        snapYValue = sp.value
        snapYOffset = edge.offset
      }
    }
  }

  if (snapYValue !== null) {
    snappedY = snapYValue - snapYOffset
    guides.push({ value: snapYValue, orientation: 'horizontal' })
  }

  return { x: snappedX, y: snappedY, guides }
}

interface SnapGuidesProps {
  guides: SnapPoint[]
}

/**
 * Renders visual guide lines (thin colored lines) at snap positions.
 * Rendered as full-width/height lines over the canvas surface.
 */
export function SnapGuides({ guides }: SnapGuidesProps) {
  if (guides.length === 0) return null

  return (
    <div
      data-testid="snap-guides"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 900,
      }}
    >
      {guides.map((guide, i) => {
        if (guide.orientation === 'vertical') {
          return (
            <div
              key={`v-${i}-${guide.value}`}
              data-testid={`snap-guide-vertical`}
              style={{
                position: 'absolute',
                left: guide.value,
                top: 0,
                width: 1,
                height: '100%',
                background: '#ff3b30',
                opacity: 0.8,
                pointerEvents: 'none',
              }}
            />
          )
        } else {
          return (
            <div
              key={`h-${i}-${guide.value}`}
              data-testid={`snap-guide-horizontal`}
              style={{
                position: 'absolute',
                left: 0,
                top: guide.value,
                width: '100%',
                height: 1,
                background: '#ff3b30',
                opacity: 0.8,
                pointerEvents: 'none',
              }}
            />
          )
        }
      })}
    </div>
  )
}
