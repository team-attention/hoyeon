import { useEditorStore } from '../../store'
import type { Element } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// Alignment & Distribution helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Align selected elements by their left edges */
export function alignLeft(elements: Element[]): Record<string, Partial<Element>> {
  const minX = Math.min(...elements.map((el) => el.x))
  return Object.fromEntries(elements.map((el) => [el.id, { x: minX }]))
}

/** Align selected elements by their right edges */
export function alignRight(elements: Element[]): Record<string, Partial<Element>> {
  const maxRight = Math.max(...elements.map((el) => el.x + el.width))
  return Object.fromEntries(elements.map((el) => [el.id, { x: maxRight - el.width }]))
}

/** Align selected elements by their horizontal centers */
export function alignCenterH(elements: Element[]): Record<string, Partial<Element>> {
  const avgCenterX =
    elements.reduce((sum, el) => sum + el.x + el.width / 2, 0) / elements.length
  return Object.fromEntries(elements.map((el) => [el.id, { x: avgCenterX - el.width / 2 }]))
}

/** Align selected elements by their top edges */
export function alignTop(elements: Element[]): Record<string, Partial<Element>> {
  const minY = Math.min(...elements.map((el) => el.y))
  return Object.fromEntries(elements.map((el) => [el.id, { y: minY }]))
}

/** Align selected elements by their bottom edges */
export function alignBottom(elements: Element[]): Record<string, Partial<Element>> {
  const maxBottom = Math.max(...elements.map((el) => el.y + el.height))
  return Object.fromEntries(elements.map((el) => [el.id, { y: maxBottom - el.height }]))
}

/** Align selected elements by their vertical centers */
export function alignMiddle(elements: Element[]): Record<string, Partial<Element>> {
  const avgCenterY =
    elements.reduce((sum, el) => sum + el.y + el.height / 2, 0) / elements.length
  return Object.fromEntries(elements.map((el) => [el.id, { y: avgCenterY - el.height / 2 }]))
}

/** Distribute elements evenly horizontally (requires 3+ elements) */
export function distributeHorizontal(elements: Element[]): Record<string, Partial<Element>> {
  if (elements.length < 3) return {}
  const sorted = [...elements].sort((a, b) => a.x - b.x)

  const leftmost = sorted[0].x
  const rightmost = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width
  const totalWidth = sorted.reduce((sum, el) => sum + el.width, 0)
  const gap = (rightmost - leftmost - totalWidth) / (sorted.length - 1)

  const patches: Record<string, Partial<Element>> = {}
  let cursor = leftmost
  for (const el of sorted) {
    patches[el.id] = { x: cursor }
    cursor += el.width + gap
  }
  return patches
}

/** Distribute elements evenly vertically (requires 3+ elements) */
export function distributeVertical(elements: Element[]): Record<string, Partial<Element>> {
  if (elements.length < 3) return {}
  const sorted = [...elements].sort((a, b) => a.y - b.y)

  const topmost = sorted[0].y
  const bottommost = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height
  const totalHeight = sorted.reduce((sum, el) => sum + el.height, 0)
  const gap = (bottommost - topmost - totalHeight) / (sorted.length - 1)

  const patches: Record<string, Partial<Element>> = {}
  let cursor = topmost
  for (const el of sorted) {
    patches[el.id] = { y: cursor }
    cursor += el.height + gap
  }
  return patches
}

// ─────────────────────────────────────────────────────────────────────────────
// AlignActions component
// ─────────────────────────────────────────────────────────────────────────────

interface AlignButtonProps {
  label: string
  icon: string
  testId: string
  disabled: boolean
  onClick: () => void
}

function AlignButton({ label, icon, testId, disabled, onClick }: AlignButtonProps) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 4,
        color: disabled ? '#444' : '#888',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11,
        padding: 0,
        transition: 'color 0.1s',
      }}
    >
      {icon}
    </button>
  )
}

/**
 * AlignActions toolbar section — shows align and distribute buttons.
 * Align buttons are enabled when 2+ elements are selected.
 * Distribute buttons are enabled when 3+ elements are selected.
 */
export function AlignActions() {
  const { elements, selectedIds, updateElement } = useEditorStore()
  const selectedElements = selectedIds.map((id) => elements[id]).filter(Boolean) as Element[]

  const canAlign = selectedElements.length >= 2
  const canDistribute = selectedElements.length >= 3

  const applyPatches = (patches: Record<string, Partial<Element>>) => {
    for (const [id, patch] of Object.entries(patches)) {
      updateElement(id, patch)
    }
  }

  return (
    <div
      data-testid="align-actions"
      style={{ display: 'flex', alignItems: 'center', gap: 1 }}
    >
      {/* Align left */}
      <AlignButton
        label="Align Left"
        icon="⬛◼"
        testId="align-left"
        disabled={!canAlign}
        onClick={() => applyPatches(alignLeft(selectedElements))}
      />
      {/* Align center horizontal */}
      <AlignButton
        label="Align Center Horizontal"
        icon="◼⬛◼"
        testId="align-center-h"
        disabled={!canAlign}
        onClick={() => applyPatches(alignCenterH(selectedElements))}
      />
      {/* Align right */}
      <AlignButton
        label="Align Right"
        icon="◼⬛"
        testId="align-right"
        disabled={!canAlign}
        onClick={() => applyPatches(alignRight(selectedElements))}
      />

      <div style={{ width: 1, height: 16, background: '#333', margin: '0 2px' }} />

      {/* Align top */}
      <AlignButton
        label="Align Top"
        icon="⬆"
        testId="align-top"
        disabled={!canAlign}
        onClick={() => applyPatches(alignTop(selectedElements))}
      />
      {/* Align middle vertical */}
      <AlignButton
        label="Align Middle Vertical"
        icon="↕"
        testId="align-middle"
        disabled={!canAlign}
        onClick={() => applyPatches(alignMiddle(selectedElements))}
      />
      {/* Align bottom */}
      <AlignButton
        label="Align Bottom"
        icon="⬇"
        testId="align-bottom"
        disabled={!canAlign}
        onClick={() => applyPatches(alignBottom(selectedElements))}
      />

      <div style={{ width: 1, height: 16, background: '#333', margin: '0 2px' }} />

      {/* Distribute horizontal */}
      <AlignButton
        label="Distribute Horizontally"
        icon="↔"
        testId="distribute-horizontal"
        disabled={!canDistribute}
        onClick={() => applyPatches(distributeHorizontal(selectedElements))}
      />
      {/* Distribute vertical */}
      <AlignButton
        label="Distribute Vertically"
        icon="↕↕"
        testId="distribute-vertical"
        disabled={!canDistribute}
        onClick={() => applyPatches(distributeVertical(selectedElements))}
      />
    </div>
  )
}
