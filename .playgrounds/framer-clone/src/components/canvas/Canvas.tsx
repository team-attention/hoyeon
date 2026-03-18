import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { resolveElementForBreakpoint } from '../../store/breakpoints'
import type {
  EditorElement,
  FrameElement,
  TextElement,
  ImageElement,
  RectangleElement,
  EllipseElement,
  ElementAnimation,
} from '../../types'
import { screenToCanvas } from '../../store/editorStore'

// ─── Element sub-components ──────────────────────────────────────────────────

function FrameNode({ el, elements }: { el: FrameElement; elements: Record<string, EditorElement> }) {
  const layoutMode = el.layoutMode ?? 'absolute'

  let layoutStyle: React.CSSProperties = {}
  if (layoutMode === 'stack') {
    layoutStyle = {
      display: 'flex',
      flexDirection: el.stackDirection ?? 'column',
      gap: el.stackGap ?? 0,
      flexWrap: el.stackWrap ? 'wrap' : 'nowrap',
      alignItems: el.stackAlign ?? 'flex-start',
      justifyContent: el.stackJustify ?? 'flex-start',
    }
  } else if (layoutMode === 'grid') {
    layoutStyle = {
      display: 'grid',
      gridTemplateColumns: `repeat(${el.gridColumns ?? 2}, 1fr)`,
      gap: el.gridGap ?? 0,
    }
  }

  const children = (el.childIds ?? [])
    .map((cid) => elements[cid])
    .filter((c): c is EditorElement => c != null)

  return (
    <div
      data-layout-mode={layoutMode}
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        background: el.fill,
        borderRadius: el.borderRadius,
        opacity: el.opacity,
        overflow: el.clipContent ? 'hidden' : 'visible',
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        visibility: el.visible ? 'visible' : 'hidden',
        ...layoutStyle,
      }}
    >
      {children.map((child) => (
        <ElementNode key={child.id} el={child} elements={elements} />
      ))}
    </div>
  )
}

function TextNode({ el }: { el: TextElement }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        color: el.color,
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        fontWeight: el.fontWeight,
        textAlign: el.textAlign,
        lineHeight: el.lineHeight,
        opacity: el.opacity,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        visibility: el.visible ? 'visible' : 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      {el.content}
    </div>
  )
}

function ImageNode({ el }: { el: ImageElement }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        opacity: el.opacity,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        visibility: el.visible ? 'visible' : 'hidden',
        overflow: 'hidden',
      }}
    >
      {el.src && /^(data:image\/|https?:\/\/)/.test(el.src) && (
        <img
          src={el.src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: el.objectFit }}
          draggable={false}
        />
      )}
    </div>
  )
}

function RectangleNode({ el }: { el: RectangleElement }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        background: el.fill,
        borderRadius: el.borderRadius,
        border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.stroke}` : undefined,
        opacity: el.opacity,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        visibility: el.visible ? 'visible' : 'hidden',
      }}
    />
  )
}

function EllipseNode({ el }: { el: EllipseElement }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        background: el.fill,
        borderRadius: '50%',
        border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.stroke}` : undefined,
        opacity: el.opacity,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        visibility: el.visible ? 'visible' : 'hidden',
      }}
    />
  )
}

function ElementNode({ el, elements }: { el: EditorElement; elements: Record<string, EditorElement> }) {
  switch (el.kind) {
    case 'frame':
      return <FrameNode el={el as FrameElement} elements={elements} />
    case 'text':
      return <TextNode el={el as TextElement} />
    case 'image':
      return <ImageNode el={el as ImageElement} />
    case 'rectangle':
      return <RectangleNode el={el as RectangleElement} />
    case 'ellipse':
      return <EllipseNode el={el as EllipseElement} />
    default:
      return null
  }
}


// ─── Animation helpers ────────────────────────────────────────────────────────

function buildActiveStyle(
  animations: ElementAnimation[],
  trigger: 'hover' | 'click',
  isActive: boolean,
): React.CSSProperties {
  if (!isActive) return {}
  const relevantAnims = animations.filter((a) => a.trigger === trigger)
  const style: React.CSSProperties = {}
  for (const anim of relevantAnims) {
    if (anim.targetProps.opacity !== undefined) style.opacity = anim.targetProps.opacity
    if (anim.targetProps.scale !== undefined) style.transform = 'scale(' + anim.targetProps.scale + ')'
  }
  return style
}

function buildTransition(animations: ElementAnimation[], trigger: 'hover' | 'click'): string {
  const relevantAnims = animations.filter((a) => a.trigger === trigger)
  const parts: string[] = []
  for (const anim of relevantAnims) {
    const dur = anim.duration + 'ms'
    const ease = anim.easing
    const delay = anim.delay > 0 ? ' ' + anim.delay + 'ms' : ''
    if (anim.targetProps.opacity !== undefined) parts.push('opacity ' + dur + ' ' + ease + delay)
    if (anim.targetProps.scale !== undefined) parts.push('transform ' + dur + ' ' + ease + delay)
  }
  return parts.join(', ')
}

function AnimatedWrapper({
  el,
  isPreviewMode,
  children,
}: {
  el: EditorElement
  isPreviewMode: boolean
  children: React.ReactNode
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isClicked, setIsClicked] = useState(false)

  const animations = el.animations ?? []
  const hasHover = animations.some((a) => a.trigger === 'hover')
  const hasClick = animations.some((a) => a.trigger === 'click')

  if (!isPreviewMode || animations.length === 0) {
    return <>{children}</>
  }

  const hoverStyle = buildActiveStyle(animations, 'hover', isHovered)
  const clickStyle = buildActiveStyle(animations, 'click', isClicked)
  const hoverTransition = buildTransition(animations, 'hover')
  const clickTransition = buildTransition(animations, 'click')

  const mergedStyle: React.CSSProperties = {
    ...hoverStyle,
    ...clickStyle,
    transition: [hoverTransition, clickTransition].filter(Boolean).join(', ') || undefined,
  }

  return (
    <div
      data-testid={'animated-wrapper-' + el.id}
      data-preview-animated="true"
      style={mergedStyle}
      onMouseEnter={hasHover ? () => setIsHovered(true) : undefined}
      onMouseLeave={hasHover ? () => setIsHovered(false) : undefined}
      onClick={hasClick ? () => setIsClicked((prev) => !prev) : undefined}
    >
      {children}
    </div>
  )
}

// ─── ID generator ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Handle types ─────────────────────────────────────────────────────────────

type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  w: 'w-resize', e: 'e-resize',
  sw: 'sw-resize', s: 's-resize', se: 'se-resize',
}

// ─── Transform mode ───────────────────────────────────────────────────────────

type TransformMode =
  | { kind: 'none' }
  | { kind: 'move'; elementId: string; startCX: number; startCY: number; origX: number; origY: number; multiIds?: string[]; multiOrigPositions?: { id: string; x: number; y: number }[] }
  | { kind: 'resize'; elementId: string; handle: ResizeHandle; startCX: number; startCY: number; origX: number; origY: number; origW: number; origH: number }
  | { kind: 'rotate'; elementId: string; ctrSX: number; ctrSY: number }
  | { kind: 'marquee'; sx0: number; sy0: number }

// ─── Selection Overlay ───────────────────────────────────────────────────────

interface OverlayProps {
  el: EditorElement
  camX: number
  camY: number
  camZoom: number
  onDragStart: (e: React.PointerEvent, id: string) => void
  onResizeStart: (e: React.PointerEvent, id: string, handle: ResizeHandle) => void
  onRotateStart: (e: React.PointerEvent, id: string) => void
}

function SelectionOverlay({ el, camX, camY, camZoom, onDragStart, onResizeStart, onRotateStart }: OverlayProps) {
  const HS = 8
  const sx = el.x * camZoom + camX
  const sy = el.y * camZoom + camY
  const sw = el.width * camZoom
  const sh = el.height * camZoom

  const handles: { id: ResizeHandle; hx: number; hy: number }[] = [
    { id: 'nw', hx: sx, hy: sy }, { id: 'n', hx: sx + sw / 2, hy: sy }, { id: 'ne', hx: sx + sw, hy: sy },
    { id: 'w', hx: sx, hy: sy + sh / 2 }, { id: 'e', hx: sx + sw, hy: sy + sh / 2 },
    { id: 'sw', hx: sx, hy: sy + sh }, { id: 's', hx: sx + sw / 2, hy: sy + sh }, { id: 'se', hx: sx + sw, hy: sy + sh },
  ]

  const rhx = sx + sw / 2
  const rhy = sy - 24

  return (
    <div data-testid={`selection-overlay-${el.id}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: sx, top: sy, width: sw, height: sh, border: '2px solid #0099ff', boxSizing: 'border-box', pointerEvents: 'none' }} />
      <div
        data-testid={`element-body-${el.id}`}
        onPointerDown={(e) => { e.stopPropagation(); onDragStart(e, el.id) }}
        style={{ position: 'absolute', left: sx, top: sy, width: sw, height: sh, cursor: 'move', pointerEvents: 'auto' }}
      />
      {handles.map((h) => (
        <div
          key={h.id}
          data-testid={`resize-handle-${h.id}-${el.id}`}
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, el.id, h.id) }}
          style={{ position: 'absolute', left: h.hx - HS / 2, top: h.hy - HS / 2, width: HS, height: HS, background: '#fff', border: '2px solid #0099ff', borderRadius: 1, cursor: HANDLE_CURSORS[h.id], pointerEvents: 'auto', zIndex: 10 }}
        />
      ))}
      <div style={{ position: 'absolute', left: sx + sw / 2 - 1, top: rhy + 8, width: 2, height: 16, background: '#0099ff', pointerEvents: 'none' }} />
      <div
        data-testid={`rotate-handle-${el.id}`}
        onPointerDown={(e) => { e.stopPropagation(); onRotateStart(e, el.id) }}
        style={{ position: 'absolute', left: rhx - HS / 2, top: rhy - HS / 2, width: HS, height: HS, background: '#fff', border: '2px solid #0099ff', borderRadius: '50%', cursor: 'crosshair', pointerEvents: 'auto', zIndex: 10 }}
      />
    </div>
  )
}

// ─── Canvas component ─────────────────────────────────────────────────────────

export function Canvas() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const revertToSelect = useEditorStore((s) => s.revertToSelect)
  const camera = useEditorStore((s) => s.camera)
  const elements = useEditorStore((s) => s.elements)
  const rootIds = useEditorStore((s) => s.rootIds)
  const isModalOpen = useEditorStore((s) => s.isModalOpen)
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode)
  const zoomAt = useEditorStore((s) => s.zoomAt)
  const pan = useEditorStore((s) => s.pan)
  const addElement = useEditorStore((s) => s.addElement)
  const updateElement = useEditorStore((s) => s.updateElement)
  const selection = useEditorStore((s) => s.selection)
  const selectElement = useEditorStore((s) => s.selectElement)
  const selectElements = useEditorStore((s) => s.selectElements)
  const toggleSelectElement = useEditorStore((s) => s.toggleSelectElement)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint)
  const breakpointWidths = useEditorStore((s) => s.breakpointWidths)
  const breakpointOverrides = useEditorStore((s) => s.breakpointOverrides)

  const activeBreakpointWidth = breakpointWidths[activeBreakpoint]

  const isPanning = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  // Flag to suppress click after a marquee drag completes
  const justMarqueed = useRef(false)

  // Drag state for shape creation
  const isDragging = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  // Hidden file input for image tool
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ref to canvas element for bounding box calculations
  const canvasRef = useRef<HTMLElement>(null)

  // Transform state (move / resize / rotate / marquee)
  const transformMode = useRef<TransformMode>({ kind: 'none' })

  // Marquee visual rect in screen space
  const [marquee, setMarquee] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Track spacebar for pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) isPanning.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') isPanning.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const getCanvasRect = useCallback((): DOMRect | null => {
    return canvasRef.current?.getBoundingClientRect() ?? null
  }, [])

  const clientToScreen = useCallback(
    (cx: number, cy: number): { x: number; y: number } => {
      const rect = getCanvasRect()
      if (!rect) return { x: cx, y: cy }
      return { x: cx - rect.left, y: cy - rect.top }
    },
    [getCanvasRect],
  )

  // ─── Transform start handlers (called from SelectionOverlay) ────────────

  const handleDragMoveStart = useCallback(
    (e: React.PointerEvent, elementId: string) => {
      if (activeTool !== 'select') return
      e.preventDefault()
      const s = clientToScreen(e.clientX, e.clientY)
      const c = screenToCanvas(s.x, s.y, camera)
      const state = useEditorStore.getState()
      const el = state.elements[elementId]
      if (!el) return
      // If multiple elements are selected and the dragged element is among them,
      // record original positions of all selected elements for multi-drag
      const selectedIds = state.selection.selectedIds
      if (selectedIds.length > 1 && selectedIds.includes(elementId)) {
        const multiOrigPositions = selectedIds
          .map((id) => {
            const sel = state.elements[id]
            return sel ? { id, x: sel.x, y: sel.y } : null
          })
          .filter((p): p is { id: string; x: number; y: number } => p !== null)
        transformMode.current = { kind: 'move', elementId, startCX: c.x, startCY: c.y, origX: el.x, origY: el.y, multiIds: selectedIds, multiOrigPositions }
      } else {
        transformMode.current = { kind: 'move', elementId, startCX: c.x, startCY: c.y, origX: el.x, origY: el.y }
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [activeTool, camera, clientToScreen],
  )

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => {
      if (activeTool !== 'select') return
      e.preventDefault()
      const s = clientToScreen(e.clientX, e.clientY)
      const c = screenToCanvas(s.x, s.y, camera)
      const el = useEditorStore.getState().elements[elementId]
      if (!el) return
      transformMode.current = { kind: 'resize', elementId, handle, startCX: c.x, startCY: c.y, origX: el.x, origY: el.y, origW: el.width, origH: el.height }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [activeTool, camera, clientToScreen],
  )

  const handleRotateStart = useCallback(
    (e: React.PointerEvent, elementId: string) => {
      if (activeTool !== 'select') return
      e.preventDefault()
      const el = useEditorStore.getState().elements[elementId]
      if (!el) return
      const ctrSX = el.x * camera.zoom + camera.x + (el.width * camera.zoom) / 2
      const ctrSY = el.y * camera.zoom + camera.y + (el.height * camera.zoom) / 2
      transformMode.current = { kind: 'rotate', elementId, ctrSX, ctrSY }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [activeTool, camera],
  )

  // ─── Pointer move/up on canvas ───────────────────────────────────────────

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const mode = transformMode.current

      if (mode.kind === 'move') {
        const s = clientToScreen(e.clientX, e.clientY)
        const c = screenToCanvas(s.x, s.y, camera)
        const dx = c.x - mode.startCX
        const dy = c.y - mode.startCY
        if (mode.multiOrigPositions && mode.multiIds) {
          // Multi-drag: move all selected elements maintaining relative positions
          for (const orig of mode.multiOrigPositions) {
            updateElement(orig.id, { x: orig.x + dx, y: orig.y + dy })
          }
        } else {
          updateElement(mode.elementId, { x: mode.origX + dx, y: mode.origY + dy })
        }
        return
      }

      if (mode.kind === 'resize') {
        const s = clientToScreen(e.clientX, e.clientY)
        const c = screenToCanvas(s.x, s.y, camera)
        const dx = c.x - mode.startCX
        const dy = c.y - mode.startCY
        let nx = mode.origX, ny = mode.origY, nw = mode.origW, nh = mode.origH
        const h = mode.handle
        if (h.includes('e')) nw = mode.origW + dx
        if (h.includes('s')) nh = mode.origH + dy
        if (h.includes('w')) { nw = mode.origW - dx; nx = mode.origX + dx }
        if (h.includes('n')) { nh = mode.origH - dy; ny = mode.origY + dy }
        if (nw < 0) { nx += nw; nw = -nw }
        if (nh < 0) { ny += nh; nh = -nh }
        updateElement(mode.elementId, { x: nx, y: ny, width: Math.max(1, nw), height: Math.max(1, nh) })
        return
      }

      if (mode.kind === 'rotate') {
        const s = clientToScreen(e.clientX, e.clientY)
        const dx = s.x - mode.ctrSX
        const dy = s.y - mode.ctrSY
        const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
        updateElement(mode.elementId, { rotation: angleDeg })
        return
      }

      if (mode.kind === 'marquee') {
        const s = clientToScreen(e.clientX, e.clientY)
        setMarquee({ x: Math.min(mode.sx0, s.x), y: Math.min(mode.sy0, s.y), w: Math.abs(s.x - mode.sx0), h: Math.abs(s.y - mode.sy0) })
        return
      }
    },
    [camera, clientToScreen, updateElement],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const mode = transformMode.current
      if (mode.kind === 'marquee') {
        const s = clientToScreen(e.clientX, e.clientY)
        const x1 = Math.min(mode.sx0, s.x), y1 = Math.min(mode.sy0, s.y)
        const x2 = Math.max(mode.sx0, s.x), y2 = Math.max(mode.sy0, s.y)
        const p1 = screenToCanvas(x1, y1, camera)
        const p2 = screenToCanvas(x2, y2, camera)
        const hits = Object.values(useEditorStore.getState().elements).filter(
          (el) => el.x < p2.x && el.x + el.width > p1.x && el.y < p2.y && el.y + el.height > p1.y,
        )
        if (hits.length > 0) selectElements(hits.map((el) => el.id))
        else clearSelection()
        setMarquee(null)
        // Prevent the subsequent click event from clearing selection
        justMarqueed.current = true
      }
      transformMode.current = { kind: 'none' }
    },
    [camera, clientToScreen, clearSelection, selectElements],
  )

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    // Block zoom when a modal is active
    if (isModalOpen) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const originX = e.clientX - rect.left
    const originY = e.clientY - rect.top
    // Negative deltaY = scroll up = zoom in
    zoomAt(-e.deltaY, originX, originY)
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    lastPos.current = { x: e.clientX, y: e.clientY }

    if (isPanning.current) return

    const dragTools = ['frame', 'rectangle', 'ellipse']
    if (dragTools.includes(activeTool)) {
      const rect = getCanvasRect()
      if (!rect) return
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const canvasPos = screenToCanvas(screenX, screenY, camera)
      isDragging.current = true
      dragStart.current = canvasPos
      e.stopPropagation()
      return
    }

    // Select tool on canvas background: start marquee
    if (activeTool === 'select') {
      const s = clientToScreen(e.clientX, e.clientY)
      transformMode.current = { kind: 'marquee', sx0: s.x, sy0: s.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (isPanning.current && e.buttons === 1) {
      pan(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y)
      lastPos.current = { x: e.clientX, y: e.clientY }
    }
    // Marquee update from canvas-level mouse events (when not captured by overlay)
    const mode = transformMode.current
    if (mode.kind === 'marquee') {
      const s = clientToScreen(e.clientX, e.clientY)
      setMarquee({ x: Math.min(mode.sx0, s.x), y: Math.min(mode.sy0, s.y), w: Math.abs(s.x - mode.sx0), h: Math.abs(s.y - mode.sy0) })
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLElement>) => {
    // Handle marquee release
    if (transformMode.current.kind === 'marquee') {
      const mode = transformMode.current
      const s = clientToScreen(e.clientX, e.clientY)
      const x1 = Math.min(mode.sx0, s.x), y1 = Math.min(mode.sy0, s.y)
      const x2 = Math.max(mode.sx0, s.x), y2 = Math.max(mode.sy0, s.y)
      const p1 = screenToCanvas(x1, y1, camera)
      const p2 = screenToCanvas(x2, y2, camera)
      const hits = Object.values(useEditorStore.getState().elements).filter(
        (el) => el.x < p2.x && el.x + el.width > p1.x && el.y < p2.y && el.y + el.height > p1.y,
      )
      if (hits.length > 0) selectElements(hits.map((el) => el.id))
      else clearSelection()
      setMarquee(null)
      transformMode.current = { kind: 'none' }
      justMarqueed.current = true
      return
    }

    if (!isDragging.current || dragStart.current === null) return

    isDragging.current = false
    const start = dragStart.current
    dragStart.current = null

    const rect = getCanvasRect()
    if (!rect) return

    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const endPos = screenToCanvas(screenX, screenY, camera)

    const rawWidth = endPos.x - start.x
    const rawHeight = endPos.y - start.y

    // Normalize: top-left corner + absolute dimensions
    const x = rawWidth >= 0 ? start.x : endPos.x
    const y = rawHeight >= 0 ? start.y : endPos.y
    const width = Math.max(1, Math.abs(rawWidth))
    const height = Math.max(1, Math.abs(rawHeight))

    const id = generateId()
    const base = {
      id,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      parentId: null,
      childIds: [],
    }

    if (activeTool === 'frame') {
      const el: FrameElement = {
        ...base,
        kind: 'frame',
        name: 'Frame',
        fill: '#ffffff',
        borderRadius: 0,
        clipContent: false,
        layoutMode: 'absolute',
        stackDirection: 'column',
        stackGap: 0,
        stackWrap: false,
        stackAlign: 'flex-start',
        stackJustify: 'flex-start',
        gridColumns: 2,
        gridGap: 0,
      }
      addElement(el)
    } else if (activeTool === 'rectangle') {
      const el: RectangleElement = {
        ...base,
        kind: 'rectangle',
        name: 'Rectangle',
        fill: '#d1d5db',
        stroke: '#000000',
        strokeWidth: 0,
        borderRadius: 0,
      }
      addElement(el)
    } else if (activeTool === 'ellipse') {
      const el: EllipseElement = {
        ...base,
        kind: 'ellipse',
        name: 'Ellipse',
        fill: '#d1d5db',
        stroke: '#000000',
        strokeWidth: 0,
      }
      addElement(el)
    }

    revertToSelect()
  }

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    // Drag tools are handled on mouseup; skip here to avoid double-handling
    const dragTools = ['frame', 'rectangle', 'ellipse']
    if (dragTools.includes(activeTool)) return

    // Suppress click after marquee drag
    if (justMarqueed.current) {
      justMarqueed.current = false
      return
    }

    if (activeTool === 'text') {
      const rect = getCanvasRect()
      if (!rect) return
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const canvasPos = screenToCanvas(screenX, screenY, camera)

      const el: TextElement = {
        id: generateId(),
        kind: 'text',
        name: 'Text',
        x: canvasPos.x,
        y: canvasPos.y,
        width: 200,
        height: 40,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        parentId: null,
        childIds: [],
        content: 'Type something...',
        fontSize: 16,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 400,
        color: '#000000',
        textAlign: 'left',
        lineHeight: 1.5,
      }
      addElement(el)
      revertToSelect()
    } else if (activeTool === 'image') {
      // Open file picker
      fileInputRef.current?.click()
    } else {
      // select tool — clicking canvas background deselects
      clearSelection()
      revertToSelect()
    }
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      // User cancelled — no-op, just revert tool
      revertToSelect()
      // Reset input value so the same file can be picked again
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      if (!src) {
        revertToSelect()
        return
      }

      // Place image in center of visible canvas area
      const rect = getCanvasRect()
      const centerScreenX = rect ? rect.width / 2 : 400
      const centerScreenY = rect ? rect.height / 2 : 300
      const canvasPos = screenToCanvas(centerScreenX, centerScreenY, camera)

      const el: ImageElement = {
        id: generateId(),
        kind: 'image',
        name: 'Image',
        x: canvasPos.x - 100,
        y: canvasPos.y - 75,
        width: 200,
        height: 150,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        parentId: null,
        childIds: [],
        src,
        objectFit: 'cover',
      }
      addElement(el)
      revertToSelect()
    }
    reader.readAsDataURL(file)

    // Reset input value
    e.target.value = ''
  }

  const transformStyle = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`

  return (
    <main
      ref={canvasRef as React.RefObject<HTMLElement>}
      data-testid="canvas"
      data-modal-open={isModalOpen ? 'true' : 'false'}
      onClick={handleClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="flex-1 h-full relative overflow-hidden bg-[#111111]"
      style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
    >
      {/* Hidden file input for image tool */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        data-testid="image-file-input"
        style={{ display: 'none' }}
        onChange={handleImageFileChange}
      />

      {/* Canvas viewport with CSS transform for zoom/pan */}
      <div
        data-testid="canvas-viewport"
        data-zoom={camera.zoom}
        data-translate-x={camera.x}
        data-translate-y={camera.y}
        style={{ transform: transformStyle, transformOrigin: '0 0' }}
        className="absolute top-0 left-0 w-full h-full"
      >
        {/* Breakpoint frame container — clips/constrains content to active breakpoint width */}
        <div
          data-testid="breakpoint-container"
          data-breakpoint={activeBreakpoint}
          data-breakpoint-width={activeBreakpointWidth}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: activeBreakpointWidth,
            minHeight: '100%',
            outline: activeBreakpoint !== 'desktop' ? '1px dashed #0099ff' : undefined,
            boxSizing: 'border-box',
          }}
        >
          {rootIds.map((id) => elements[id]).filter((el): el is EditorElement => el != null).map((el) => {
            const resolvedEl = resolveElementForBreakpoint(
              el as EditorElement & Record<string, unknown>,
              activeBreakpoint,
              breakpointOverrides as unknown as Record<string, Record<string, Record<string, unknown>>>,
            ) as EditorElement
            return (
              <div
                key={el.id}
                data-testid={`element-${el.id}`}
                data-element-id={el.id}
                data-element-kind={el.kind}
                data-x={el.x}
                data-y={el.y}
                onClick={(ev) => {
                  if (activeTool === 'select') {
                    ev.stopPropagation()
                    if (ev.shiftKey) {
                      toggleSelectElement(el.id)
                    } else {
                      selectElement(el.id)
                    }
                  }
                }}
              >
                <AnimatedWrapper el={resolvedEl} isPreviewMode={isPreviewMode}>
                  <ElementNode el={resolvedEl} elements={elements} />
                </AnimatedWrapper>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selection overlays — rendered in screen space (outside viewport transform) */}
      {!isPreviewMode &&
        selection.selectedIds
          .map((id) => elements[id])
          .filter(Boolean)
          .map((el) => (
            <SelectionOverlay
              key={el.id}
              el={el}
              camX={camera.x}
              camY={camera.y}
              camZoom={camera.zoom}
              onDragStart={handleDragMoveStart}
              onResizeStart={handleResizeStart}
              onRotateStart={handleRotateStart}
            />
          ))}

      {/* Selection marquee */}
      {marquee && (
        <div
          data-testid="selection-marquee"
          style={{ position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, border: '1px dashed #0099ff', background: 'rgba(0,153,255,0.1)', pointerEvents: 'none' }}
        />
      )}

      {/* Zoom level display */}
      <div
        data-testid="zoom-display"
        className="absolute bottom-4 right-4 text-white text-xs opacity-60 pointer-events-none select-none"
      >
        {Math.round(camera.zoom * 100)}%
      </div>
    </main>
  )
}
