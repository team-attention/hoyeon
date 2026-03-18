import { useState } from 'react'
import { useEditorStore } from '../../store'
import type { Element, FrameElement, TextElement } from '../../types'
import { StylePresets } from './StylePresets'
import { AnimationPanel } from './AnimationPanel'

// ─────────────────────────────────────────────────────────────────────────────
// Styles (inline, dark theme consistent with rest of editor)
// ─────────────────────────────────────────────────────────────────────────────
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  borderBottom: '1px solid #333',
  color: '#888',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  userSelect: 'none',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 12px',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: 11,
  width: 64,
  flexShrink: 0,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: '#2a2a2a',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  color: '#e0e0e0',
  fontSize: 12,
  padding: '2px 6px',
  outline: 'none',
  height: 24,
  minWidth: 0,
}

const colorInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '1px 4px',
  height: 24,
  cursor: 'pointer',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric input helpers
// ─────────────────────────────────────────────────────────────────────────────
const MIN_DIMENSION = 1

function clampDimension(value: number): number {
  return Math.max(MIN_DIMENSION, value)
}

function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-') return null
  const n = Number(trimmed)
  if (!isFinite(n) || isNaN(n)) return null
  return n
}

// ─────────────────────────────────────────────────────────────────────────────
// CollapsibleSection
// ─────────────────────────────────────────────────────────────────────────────
interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  testId?: string
}

function CollapsibleSection({ title, children, testId }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true)

  return (
    <div data-testid={testId}>
      <div
        style={sectionHeaderStyle}
        onClick={() => setOpen((v) => !v)}
        data-testid={testId ? `${testId}-header` : undefined}
      >
        <span>{title}</span>
        <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div
          style={{ paddingTop: 4, paddingBottom: 8 }}
          data-testid={testId ? `${testId}-content` : undefined}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NumericField: controlled input that rejects non-numeric and clamps dimensions
// ─────────────────────────────────────────────────────────────────────────────
interface NumericFieldProps {
  label: string
  value: number
  testId?: string
  isDimension?: boolean
  onChange: (value: number) => void
}

function NumericField({ label, value, testId, isDimension = false, onChange }: NumericFieldProps) {
  const [localValue, setLocalValue] = useState(String(value))
  const [focused, setFocused] = useState(false)

  // Keep local in sync when not focused
  const displayValue = focused ? localValue : String(value)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setLocalValue(raw)
  }

  function handleBlur() {
    setFocused(false)
    const parsed = parseNumeric(localValue)
    if (parsed === null) {
      // Reject non-numeric: restore previous valid value
      setLocalValue(String(value))
      return
    }
    const final = isDimension ? clampDimension(parsed) : parsed
    setLocalValue(String(final))
    onChange(final)
  }

  function handleFocus() {
    setFocused(true)
    setLocalValue(String(value))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
    if (e.key === 'Escape') {
      setLocalValue(String(value))
      setFocused(false)
      e.currentTarget.blur()
    }
  }

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        data-testid={testId}
        style={inputStyle}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ColorField
// ─────────────────────────────────────────────────────────────────────────────
interface ColorFieldProps {
  label: string
  value: string
  testId?: string
  onChange: (value: string) => void
}

function ColorField({ label, value, testId, onChange }: ColorFieldProps) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="color"
        data-testid={testId}
        style={colorInputStyle}
        value={value.startsWith('#') ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        data-testid={testId ? `${testId}-text` : undefined}
        style={{ ...inputStyle, flex: 1.5 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Section
// ─────────────────────────────────────────────────────────────────────────────
interface LayoutSectionProps {
  element: Element
  onUpdate: (patch: Partial<Element>) => void
}

function LayoutSection({ element, onUpdate }: LayoutSectionProps) {
  return (
    <CollapsibleSection title="Layout" testId="section-layout">
      <NumericField
        label="X"
        value={element.x}
        testId="input-x"
        onChange={(v) => onUpdate({ x: v } as Partial<Element>)}
      />
      <NumericField
        label="Y"
        value={element.y}
        testId="input-y"
        onChange={(v) => onUpdate({ y: v } as Partial<Element>)}
      />
      <NumericField
        label="Width"
        value={element.width}
        testId="input-width"
        isDimension
        onChange={(v) => onUpdate({ width: v } as Partial<Element>)}
      />
      <NumericField
        label="Height"
        value={element.height}
        testId="input-height"
        isDimension
        onChange={(v) => onUpdate({ height: v } as Partial<Element>)}
      />
      <NumericField
        label="Rotation"
        value={element.rotation}
        testId="input-rotation"
        onChange={(v) => onUpdate({ rotation: v } as Partial<Element>)}
      />
      {element.type === 'frame' && (
        <div style={rowStyle}>
          <span style={labelStyle}>Overflow</span>
          <select
            data-testid="select-overflow"
            style={selectStyle}
            value={(element as FrameElement).overflow}
            onChange={(e) =>
              onUpdate({
                overflow: e.target.value as FrameElement['overflow'],
              } as Partial<Element>)
            }
          >
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
            <option value="scroll">Scroll</option>
          </select>
        </div>
      )}
    </CollapsibleSection>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Style Section
// ─────────────────────────────────────────────────────────────────────────────
interface StyleSectionProps {
  element: Element
  onUpdate: (patch: Partial<Element>) => void
}

function StyleSection({ element, onUpdate }: StyleSectionProps) {
  return (
    <CollapsibleSection title="Style" testId="section-style">
      <NumericField
        label="Opacity"
        value={element.opacity}
        testId="input-opacity"
        onChange={(v) => onUpdate({ opacity: Math.min(1, Math.max(0, v)) } as Partial<Element>)}
      />
      {element.type === 'frame' && (
        <>
          <ColorField
            label="Fill"
            value={(element as FrameElement).backgroundColor}
            testId="input-bg-color"
            onChange={(v) =>
              onUpdate({ backgroundColor: v } as Partial<Element>)
            }
          />
          <NumericField
            label="Radius"
            value={(element as FrameElement).borderRadius}
            testId="input-border-radius"
            isDimension={false}
            onChange={(v) => onUpdate({ borderRadius: Math.max(0, v) } as Partial<Element>)}
          />
          <NumericField
            label="Border W"
            value={(element as FrameElement).borderWidth}
            testId="input-border-width"
            isDimension={false}
            onChange={(v) => onUpdate({ borderWidth: Math.max(0, v) } as Partial<Element>)}
          />
          <ColorField
            label="Border"
            value={(element as FrameElement).borderColor}
            testId="input-border-color"
            onChange={(v) =>
              onUpdate({ borderColor: v } as Partial<Element>)
            }
          />
        </>
      )}
      {element.type === 'text' && (
        <>
          <ColorField
            label="Color"
            value={(element as TextElement).color}
            testId="input-color"
            onChange={(v) => onUpdate({ color: v } as Partial<Element>)}
          />
          <NumericField
            label="Font Size"
            value={(element as TextElement).fontSize}
            testId="input-font-size"
            isDimension={false}
            onChange={(v) => onUpdate({ fontSize: Math.max(1, v) } as Partial<Element>)}
          />
          <div style={rowStyle}>
            <span style={labelStyle}>Weight</span>
            <select
              data-testid="select-font-weight"
              style={selectStyle}
              value={(element as TextElement).fontWeight}
              onChange={(e) =>
                onUpdate({ fontWeight: Number(e.target.value) } as Partial<Element>)
              }
            >
              <option value={300}>Light</option>
              <option value={400}>Regular</option>
              <option value={500}>Medium</option>
              <option value={600}>SemiBold</option>
              <option value={700}>Bold</option>
            </select>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Align</span>
            <select
              data-testid="select-text-align"
              style={selectStyle}
              value={(element as TextElement).textAlign}
              onChange={(e) =>
                onUpdate({ textAlign: e.target.value as TextElement['textAlign'] } as Partial<Element>)
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Style</span>
            <select
              data-testid="select-font-style"
              style={selectStyle}
              value={(element as TextElement).fontStyle}
              onChange={(e) =>
                onUpdate({ fontStyle: e.target.value as TextElement['fontStyle'] } as Partial<Element>)
              }
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </select>
          </div>
          <NumericField
            label="Line H"
            value={(element as TextElement).lineHeight}
            testId="input-line-height"
            onChange={(v) => onUpdate({ lineHeight: Math.max(0, v) } as Partial<Element>)}
          />
          <NumericField
            label="Letter S"
            value={(element as TextElement).letterSpacing}
            testId="input-letter-spacing"
            onChange={(v) => onUpdate({ letterSpacing: v } as Partial<Element>)}
          />
        </>
      )}
    </CollapsibleSection>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Effects Section
// ─────────────────────────────────────────────────────────────────────────────
interface EffectsSectionProps {
  element: Element
  onUpdate: (patch: Partial<Element>) => void
}

// Extended effects stored as data attributes (not in type system — keep basic)
function EffectsSection({ element, onUpdate: _onUpdate }: EffectsSectionProps) {
  const [shadowColor, setShadowColor] = useState('#000000')
  const [shadowBlur, setShadowBlur] = useState(0)
  const [shadowX, setShadowX] = useState(0)
  const [shadowY, setShadowY] = useState(4)
  const [blur, setBlur] = useState(0)

  // Effects are visual-only UI state (not persisted in element type — basic implementation)
  // In a full implementation these would extend the element schema

  return (
    <CollapsibleSection title="Effects" testId="section-effects">
      <div style={{ ...rowStyle, color: '#666', fontSize: 11, paddingBottom: 4 }}>
        Box Shadow
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Color</span>
        <input
          type="color"
          data-testid="input-shadow-color"
          style={colorInputStyle}
          value={shadowColor}
          onChange={(e) => setShadowColor(e.target.value)}
        />
      </div>
      <NumericField
        label="X"
        value={shadowX}
        testId="input-shadow-x"
        onChange={(v) => setShadowX(v)}
      />
      <NumericField
        label="Y"
        value={shadowY}
        testId="input-shadow-y"
        onChange={(v) => setShadowY(v)}
      />
      <NumericField
        label="Blur"
        value={shadowBlur}
        testId="input-shadow-blur"
        onChange={(v) => setShadowBlur(Math.max(0, v))}
      />
      <div style={{ ...rowStyle, color: '#666', fontSize: 11, paddingTop: 4, paddingBottom: 4 }}>
        Backdrop Blur
      </div>
      <NumericField
        label="Blur"
        value={blur}
        testId="input-blur"
        onChange={(v) => setBlur(Math.max(0, v))}
      />
      {/* Render element id as hidden data so we re-render when selection changes */}
      <div data-element-id={element.id} style={{ display: 'none' }} />
    </CollapsibleSection>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertiesPanel (main export)
// ─────────────────────────────────────────────────────────────────────────────
export function PropertiesPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const elements = useEditorStore((s) => s.elements)
  const updateElement = useEditorStore((s) => s.updateElement)

  const selectedId = selectedIds[0] ?? null
  const element = selectedId ? (elements[selectedId] ?? null) : null

  function handleUpdate(patch: Partial<Element>) {
    if (!selectedId) return
    updateElement(selectedId, patch)
  }

  return (
    <div
      data-testid="properties-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: '#e0e0e0',
        fontSize: 12,
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #333',
          color: '#888',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        Properties
      </div>

      {/* Content */}
      {!element ? (
        <div
          data-testid="properties-empty"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontSize: 12,
            textAlign: 'center',
            padding: 16,
          }}
        >
          Select an element to edit its properties
        </div>
      ) : (
        <div data-testid="properties-content" style={{ flex: 1 }}>
          <LayoutSection element={element} onUpdate={handleUpdate} />
          <StyleSection element={element} onUpdate={handleUpdate} />
          <EffectsSection element={element} onUpdate={handleUpdate} />
        </div>
      )}
      {/* Animation Panel — always rendered; shows disabled state when no element selected */}
      <AnimationPanel />
      {/* Style Presets — always visible; disabled when no element selected */}
      <div style={{ borderTop: '1px solid #333', marginTop: 4 }}>
        <StylePresets />
      </div>
    </div>
  )
}

export default PropertiesPanel
