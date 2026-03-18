// ─── Element Types ───────────────────────────────────────────────────────────

export type ElementKind = 'frame' | 'text' | 'image' | 'rectangle' | 'ellipse'

export interface BaseElement {
  id: string
  kind: ElementKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  name: string
  parentId: string | null
  childIds: string[]
}

export interface FrameElement extends BaseElement {
  kind: 'frame'
  fill: string
  borderRadius: number
  clipContent: boolean
}

export interface TextElement extends BaseElement {
  kind: 'text'
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  color: string
  textAlign: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
}

export interface ImageElement extends BaseElement {
  kind: 'image'
  src: string
  objectFit: 'fill' | 'contain' | 'cover' | 'none'
}

export interface RectangleElement extends BaseElement {
  kind: 'rectangle'
  fill: string
  stroke: string
  strokeWidth: number
  borderRadius: number
}

export interface EllipseElement extends BaseElement {
  kind: 'ellipse'
  fill: string
  stroke: string
  strokeWidth: number
}

export type EditorElement =
  | FrameElement
  | TextElement
  | ImageElement
  | RectangleElement
  | EllipseElement

// ─── Element Tree ─────────────────────────────────────────────────────────────

/** Flat map of elementId → EditorElement */
export type ElementTree = Record<string, EditorElement>

// ─── Camera ──────────────────────────────────────────────────────────────────

export interface Camera {
  /** Translation x in screen pixels */
  x: number
  /** Translation y in screen pixels */
  y: number
  /** Zoom factor: 1 = 100%, 0.1 = 10%, 32 = 3200% */
  zoom: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 32

// ─── Selection ───────────────────────────────────────────────────────────────

export interface Selection {
  selectedIds: string[]
  hoveredId: string | null
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Convert screen-space point to canvas-space point */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
  }
}

/** Convert canvas-space point to screen-space point */
export function canvasToScreen(
  canvasX: number,
  canvasY: number,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: canvasX * camera.zoom + camera.x,
    y: canvasY * camera.zoom + camera.y,
  }
}
