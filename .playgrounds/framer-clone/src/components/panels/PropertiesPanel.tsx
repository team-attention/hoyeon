import { useState, useEffect } from 'react'
import { useEditorStore } from '../../store/editorStore'
import type {
  EditorElement,
  FrameElement,
  TextElement,
  RectangleElement,
  EllipseElement,
  Shadow,
} from '../../types/editor'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampPositive(val: number): number {
  return Math.max(1, val)
}

function hasFill(el: EditorElement): el is FrameElement | RectangleElement | EllipseElement {
  return el.kind === 'frame' || el.kind === 'rectangle' || el.kind === 'ellipse'
}

function hasBorder(el: EditorElement): el is RectangleElement | EllipseElement {
  return el.kind === 'rectangle' || el.kind === 'ellipse'
}

function hasBorderRadius(el: EditorElement): el is FrameElement | RectangleElement {
  return el.kind === 'frame' || el.kind === 'rectangle'
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#3a3a3a] pb-3 mb-3">
      <div className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[10px] text-[#9ca3af] w-8 shrink-0">{label}</span>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  testId,
  min,
}: {
  value: number
  onChange: (v: number) => void
  testId?: string
  min?: number
}) {
  return (
    <input
      type="number"
      data-testid={testId}
      value={value}
      min={min}
      onChange={(e) => {
        const raw = parseFloat(e.target.value)
        if (!isNaN(raw)) onChange(raw)
      }}
      className="flex-1 bg-[#2a2a2a] text-xs text-white outline-none rounded px-2 py-1 w-full"
    />
  )
}

function ColorInput({
  value,
  onChange,
  testId,
}: {
  value: string
  onChange: (v: string) => void
  testId?: string
}) {
  // Local draft state for the hex text input so partial values don't update the store
  const [draft, setDraft] = useState(value)

  // Sync draft when external value changes (e.g. undo/redo or selection change)
  useEffect(() => {
    setDraft(value)
  }, [value])

  const commitIfValid = (v: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onChange(v)
    } else {
      // Revert draft to last committed value on invalid blur
      setDraft(value)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-1">
      <div
        data-testid={testId ? `${testId}-swatch` : undefined}
        className="w-5 h-5 rounded border border-[#3a3a3a] shrink-0"
        style={{ background: value }}
      />
      <input
        type="color"
        data-testid={testId}
        value={value}
        onChange={(e) => {
          // color picker always gives a valid 6-digit hex
          onChange(e.target.value)
        }}
        className="opacity-0 absolute w-5 h-5 cursor-pointer"
        style={{ position: 'relative' }}
      />
      <input
        type="text"
        data-testid={testId ? `${testId}-hex` : undefined}
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          // Allow typing partial hex; only update draft, not store
          if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
            setDraft(v)
            // Commit immediately when complete 6-digit hex is typed
            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
              onChange(v)
            }
          }
        }}
        onBlur={(e) => commitIfValid(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitIfValid((e.target as HTMLInputElement).value)
        }}
        className="flex-1 bg-[#2a2a2a] text-xs text-white outline-none rounded px-2 py-1"
      />
    </div>
  )
}

// ─── Position / Size section ─────────────────────────────────────────────────

function PositionSizeSection({ el }: { el: EditorElement }) {
  const updateElement = useEditorStore((s) => s.updateElement)

  return (
    <Section title="Position & Size">
      <div className="grid grid-cols-2 gap-x-2">
        <PropRow label="X">
          <NumberInput
            testId="prop-x"
            value={el.x}
            onChange={(v) => updateElement(el.id, { x: v })}
          />
        </PropRow>
        <PropRow label="Y">
          <NumberInput
            testId="prop-y"
            value={el.y}
            onChange={(v) => updateElement(el.id, { y: v })}
          />
        </PropRow>
        <PropRow label="W">
          <NumberInput
            testId="prop-w"
            value={el.width}
            min={1}
            onChange={(v) => updateElement(el.id, { width: clampPositive(v) })}
          />
        </PropRow>
        <PropRow label="H">
          <NumberInput
            testId="prop-h"
            value={el.height}
            min={1}
            onChange={(v) => updateElement(el.id, { height: clampPositive(v) })}
          />
        </PropRow>
      </div>
      <PropRow label="R">
        <NumberInput
          testId="prop-rotation"
          value={el.rotation}
          onChange={(v) => updateElement(el.id, { rotation: v })}
        />
      </PropRow>
    </Section>
  )
}

// ─── Fill section ─────────────────────────────────────────────────────────────

function FillSection({ el, mixed }: { el: EditorElement; mixed: boolean }) {
  const updateElement = useEditorStore((s) => s.updateElement)

  if (!hasFill(el)) return null

  const currentFill = (el as FrameElement | RectangleElement | EllipseElement).fill

  return (
    <Section title="Fill">
      <div data-testid="fill-section">
        {mixed ? (
          <div className="text-xs text-[#9ca3af]" data-testid="fill-mixed">
            Mixed
          </div>
        ) : (
          <ColorInput
            testId="prop-fill"
            value={currentFill}
            onChange={(v) => updateElement(el.id, { fill: v } as Partial<EditorElement>)}
          />
        )}
      </div>
    </Section>
  )
}

// ─── Border section ───────────────────────────────────────────────────────────

function BorderSection({ el }: { el: EditorElement }) {
  const updateElement = useEditorStore((s) => s.updateElement)

  if (!hasBorder(el)) {
    // Frame only has borderRadius
    if (hasBorderRadius(el)) {
      const frame = el as FrameElement
      return (
        <Section title="Border">
          <div data-testid="border-section">
            <PropRow label="R">
              <NumberInput
                testId="prop-border-radius"
                value={frame.borderRadius}
                min={0}
                onChange={(v) =>
                  updateElement(el.id, { borderRadius: Math.max(0, v) } as Partial<EditorElement>)
                }
              />
            </PropRow>
          </div>
        </Section>
      )
    }
    return null
  }

  const bordered = el as RectangleElement | EllipseElement

  return (
    <Section title="Border">
      <div data-testid="border-section">
        <PropRow label="W">
          <NumberInput
            testId="prop-stroke-width"
            value={bordered.strokeWidth}
            min={0}
            onChange={(v) =>
              updateElement(el.id, { strokeWidth: Math.max(0, v) } as Partial<EditorElement>)
            }
          />
        </PropRow>
        <PropRow label="C">
          <ColorInput
            testId="prop-stroke"
            value={bordered.stroke}
            onChange={(v) => updateElement(el.id, { stroke: v } as Partial<EditorElement>)}
          />
        </PropRow>
        {hasBorderRadius(el) && (
          <PropRow label="R">
            <NumberInput
              testId="prop-border-radius"
              value={(el as RectangleElement).borderRadius}
              min={0}
              onChange={(v) =>
                updateElement(el.id, { borderRadius: Math.max(0, v) } as Partial<EditorElement>)
              }
            />
          </PropRow>
        )}
      </div>
    </Section>
  )
}

// ─── Typography section ───────────────────────────────────────────────────────

function TypographySection({ el }: { el: EditorElement }) {
  const updateElement = useEditorStore((s) => s.updateElement)

  if (el.kind !== 'text') return null
  const text = el as TextElement

  return (
    <Section title="Typography">
      <div data-testid="typography-section">
        <PropRow label="Font">
          <input
            type="text"
            data-testid="prop-font-family"
            value={text.fontFamily}
            onChange={(e) => updateElement(el.id, { fontFamily: e.target.value })}
            className="flex-1 bg-[#2a2a2a] text-xs text-white outline-none rounded px-2 py-1"
          />
        </PropRow>
        <div className="grid grid-cols-2 gap-x-2">
          <PropRow label="Sz">
            <NumberInput
              testId="prop-font-size"
              value={text.fontSize}
              min={1}
              onChange={(v) => updateElement(el.id, { fontSize: Math.max(1, v) })}
            />
          </PropRow>
          <PropRow label="Wt">
            <NumberInput
              testId="prop-font-weight"
              value={text.fontWeight}
              min={100}
              onChange={(v) => updateElement(el.id, { fontWeight: v })}
            />
          </PropRow>
          <PropRow label="LH">
            <NumberInput
              testId="prop-line-height"
              value={text.lineHeight}
              onChange={(v) => updateElement(el.id, { lineHeight: v })}
            />
          </PropRow>
          <PropRow label="LS">
            <NumberInput
              testId="prop-letter-spacing"
              value={text.letterSpacing ?? 0}
              onChange={(v) => updateElement(el.id, { letterSpacing: v })}
            />
          </PropRow>
        </div>
        <PropRow label="Align">
          <div className="flex gap-1" data-testid="prop-text-align">
            {(['left', 'center', 'right', 'justify'] as const).map((align) => (
              <button
                key={align}
                data-testid={`prop-align-${align}`}
                onClick={() => updateElement(el.id, { textAlign: align })}
                className={`flex-1 text-xs py-1 rounded ${
                  text.textAlign === align
                    ? 'bg-[#0099ff] text-white'
                    : 'bg-[#2a2a2a] text-[#9ca3af]'
                }`}
              >
                {align[0].toUpperCase()}
              </button>
            ))}
          </div>
        </PropRow>
        <PropRow label="Col">
          <ColorInput
            testId="prop-text-color"
            value={text.color}
            onChange={(v) => updateElement(el.id, { color: v })}
          />
        </PropRow>
      </div>
    </Section>
  )
}

// ─── Shadow section ───────────────────────────────────────────────────────────

function ShadowSection({ el }: { el: EditorElement }) {
  const updateElement = useEditorStore((s) => s.updateElement)

  const shadow: Shadow = el.shadow ?? { offsetX: 0, offsetY: 4, blur: 8, color: '#00000040' }

  const updateShadow = (patch: Partial<Shadow>) => {
    updateElement(el.id, { shadow: { ...shadow, ...patch } } as Partial<EditorElement>)
  }

  return (
    <Section title="Shadow">
      <div data-testid="shadow-section">
        <div className="grid grid-cols-2 gap-x-2">
          <PropRow label="X">
            <NumberInput
              testId="prop-shadow-x"
              value={shadow.offsetX}
              onChange={(v) => updateShadow({ offsetX: v })}
            />
          </PropRow>
          <PropRow label="Y">
            <NumberInput
              testId="prop-shadow-y"
              value={shadow.offsetY}
              onChange={(v) => updateShadow({ offsetY: v })}
            />
          </PropRow>
          <PropRow label="B">
            <NumberInput
              testId="prop-shadow-blur"
              value={shadow.blur}
              min={0}
              onChange={(v) => updateShadow({ blur: Math.max(0, v) })}
            />
          </PropRow>
        </div>
        <PropRow label="C">
          <ColorInput
            testId="prop-shadow-color"
            value={shadow.color.length >= 7 ? shadow.color.slice(0, 7) : shadow.color}
            onChange={(v) => updateShadow({ color: v })}
          />
        </PropRow>
      </div>
    </Section>
  )
}

// ─── Multi-select mixed values banner ────────────────────────────────────────

function MultiSelectBanner({ count }: { count: number }) {
  return (
    <div
      data-testid="multi-select-banner"
      className="text-xs text-[#9ca3af] bg-[#2a2a2a] rounded px-3 py-2 mb-3"
    >
      {count} elements selected
    </div>
  )
}

// ─── Single-element panel ─────────────────────────────────────────────────────

function SingleElementPanel({ el }: { el: EditorElement }) {
  return (
    <div>
      <div className="text-xs font-medium text-white mb-3 flex items-center gap-2">
        <span
          data-testid="selected-element-kind"
          className="text-[10px] text-[#9ca3af] uppercase"
        >
          {el.kind}
        </span>
        <span className="truncate">{el.name}</span>
      </div>
      <PositionSizeSection el={el} />
      <FillSection el={el} mixed={false} />
      <BorderSection el={el} />
      <TypographySection el={el} />
      <ShadowSection el={el} />
    </div>
  )
}

// ─── Multi-element panel (mixed values) ──────────────────────────────────────

function MultiElementPanel({ els }: { els: EditorElement[] }) {
  const updateElement = useEditorStore((s) => s.updateElement)
  const first = els[0]

  // Determine mixed fill: if all have fill, check if all the same
  const fillEls = els.filter(hasFill)
  const allHaveFill = fillEls.length === els.length
  const fills = fillEls.map((e) => (e as RectangleElement).fill)
  const fillIsMixed = allHaveFill && fills.some((f) => f !== fills[0])

  // Check if shared width/height/x/y
  const sharedX = els.every((e) => e.x === first.x) ? first.x : null
  const sharedY = els.every((e) => e.y === first.y) ? first.y : null
  const sharedW = els.every((e) => e.width === first.width) ? first.width : null
  const sharedH = els.every((e) => e.height === first.height) ? first.height : null

  return (
    <div>
      <MultiSelectBanner count={els.length} />

      {/* Position & Size - show shared values */}
      <Section title="Position & Size">
        <div className="grid grid-cols-2 gap-x-2">
          <PropRow label="X">
            <input
              type="number"
              data-testid="prop-x"
              value={sharedX ?? ''}
              placeholder="Mixed"
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) els.forEach((el) => updateElement(el.id, { x: v }))
              }}
              className="flex-1 bg-[#2a2a2a] text-xs text-white outline-none rounded px-2 py-1 w-full placeholder-[#6b7280]"
            />
          </PropRow>
          <PropRow label="Y">
            <input
              type="number"
              data-testid="prop-y"
              value={sharedY ?? ''}
              placeholder="Mixed"
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) els.forEach((el) => updateElement(el.id, { y: v }))
              }}
              className="flex-1 bg-[#2a2a2a] text-xs text-white outline-none rounded px-2 py-1 w-full placeholder-[#6b7280]"
            />
          </PropRow>
          <PropRow label="W">
            <input
              type="number"
              data-testid="prop-w"
              value={sharedW ?? ''}
              placeholder="Mixed"
              min={1}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) els.forEach((el) => updateElement(el.id, { width: clampPositive(v) }))
              }}
              className="flex-1 bg-[#2a2a2a] text-xs text-white outline-none rounded px-2 py-1 w-full placeholder-[#6b7280]"
            />
          </PropRow>
          <PropRow label="H">
            <input
              type="number"
              data-testid="prop-h"
              value={sharedH ?? ''}
              placeholder="Mixed"
              min={1}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) els.forEach((el) => updateElement(el.id, { height: clampPositive(v) }))
              }}
              className="flex-1 bg-[#2a2a2a] text-xs text-white outline-none rounded px-2 py-1 w-full placeholder-[#6b7280]"
            />
          </PropRow>
        </div>
      </Section>

      {/* Fill - show Mixed if different colors */}
      {allHaveFill && (
        <Section title="Fill">
          <div data-testid="fill-section">
            {fillIsMixed ? (
              <div className="text-xs text-[#9ca3af]" data-testid="fill-mixed">
                Mixed
              </div>
            ) : (
              <ColorInput
                testId="prop-fill"
                value={fills[0]}
                onChange={(v) => els.forEach((el) => updateElement(el.id, { fill: v } as Partial<EditorElement>))}
              />
            )}
          </div>
        </Section>
      )}
    </div>
  )
}

// ─── PropertiesPanel ──────────────────────────────────────────────────────────

export function PropertiesPanel() {
  const selectedIds = useEditorStore((s) => s.selection.selectedIds)
  const elements = useEditorStore((s) => s.elements)

  const selectedEls = selectedIds
    .map((id) => elements[id])
    .filter((el): el is EditorElement => el != null)

  return (
    <div
      data-testid="properties-panel"
      className="flex-1 overflow-y-auto p-3"
    >
      {selectedEls.length === 0 && (
        <div data-testid="no-selection" className="text-xs text-[#9ca3af]">
          No selection
        </div>
      )}
      {selectedEls.length === 1 && <SingleElementPanel el={selectedEls[0]} />}
      {selectedEls.length > 1 && <MultiElementPanel els={selectedEls} />}
    </div>
  )
}
