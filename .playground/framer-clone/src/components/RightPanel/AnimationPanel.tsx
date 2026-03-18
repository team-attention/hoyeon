import { useState } from 'react'
import { useEditorStore, DEFAULT_ANIMATION_CONFIG } from '../../store'
import type { AnimationConfig, EasingType } from '../../store'
import type { Element } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// Styles (consistent with PropertiesPanel dark theme)
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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const disabledOverlayStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#555',
  fontSize: 12,
  textAlign: 'center',
  padding: 16,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-') return null
  const n = Number(trimmed)
  if (!isFinite(n) || isNaN(n)) return null
  return n
}

// ─────────────────────────────────────────────────────────────────────────────
// AnimationNumericField
// ─────────────────────────────────────────────────────────────────────────────
interface AnimationNumericFieldProps {
  label: string
  value: number
  testId?: string
  min?: number
  onChange: (value: number) => void
}

function AnimationNumericField({ label, value, testId, min, onChange }: AnimationNumericFieldProps) {
  const [localValue, setLocalValue] = useState(String(value))
  const [focused, setFocused] = useState(false)

  const displayValue = focused ? localValue : String(value)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalValue(e.target.value)
  }

  function handleBlur() {
    setFocused(false)
    const parsed = parseNumeric(localValue)
    if (parsed === null) {
      setLocalValue(String(value))
      return
    }
    const final = min !== undefined ? Math.max(min, parsed) : parsed
    setLocalValue(String(final))
    onChange(final)
  }

  function handleFocus() {
    setFocused(true)
    setLocalValue(String(value))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
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
// AnimationSectionContent
// ─────────────────────────────────────────────────────────────────────────────
interface AnimationSectionContentProps {
  element: Element
  config: AnimationConfig
  onConfigChange: (config: AnimationConfig) => void
}

function AnimationSectionContent({ element: _element, config, onConfigChange }: AnimationSectionContentProps) {
  function updateHover(key: keyof AnimationConfig['hover'], value: number) {
    onConfigChange({
      ...config,
      hover: { ...config.hover, [key]: value },
    })
  }

  function updateTransitionDuration(value: number) {
    onConfigChange({
      ...config,
      transition: { ...config.transition, duration: value },
    })
  }

  function updateTransitionEasing(easing: EasingType) {
    onConfigChange({
      ...config,
      transition: { ...config.transition, easing },
    })
  }

  return (
    <div data-testid="animation-section-content">
      {/* Hover effects sub-header */}
      <div style={{ ...rowStyle, color: '#666', fontSize: 11, paddingBottom: 4 }}>
        Hover Effect
      </div>
      <AnimationNumericField
        label="Scale"
        value={config.hover.scale}
        testId="input-hover-scale"
        onChange={(v) => updateHover('scale', v)}
      />
      <AnimationNumericField
        label="Opacity"
        value={config.hover.opacity}
        testId="input-hover-opacity"
        onChange={(v) => updateHover('opacity', Math.min(1, Math.max(0, v)))}
      />
      <AnimationNumericField
        label="X"
        value={config.hover.x}
        testId="input-hover-x"
        onChange={(v) => updateHover('x', v)}
      />
      <AnimationNumericField
        label="Y"
        value={config.hover.y}
        testId="input-hover-y"
        onChange={(v) => updateHover('y', v)}
      />
      <AnimationNumericField
        label="Rotation"
        value={config.hover.rotation}
        testId="input-hover-rotation"
        onChange={(v) => updateHover('rotation', v)}
      />

      {/* Transition sub-header */}
      <div style={{ ...rowStyle, color: '#666', fontSize: 11, paddingTop: 4, paddingBottom: 4 }}>
        Transition
      </div>
      <AnimationNumericField
        label="Duration"
        value={config.transition.duration}
        testId="input-transition-duration"
        min={0}
        onChange={updateTransitionDuration}
      />
      <div style={rowStyle}>
        <span style={labelStyle}>Easing</span>
        <select
          data-testid="select-transition-easing"
          style={selectStyle}
          value={config.transition.easing}
          onChange={(e) => updateTransitionEasing(e.target.value as EasingType)}
        >
          <option value="ease">Ease</option>
          <option value="ease-in">Ease In</option>
          <option value="ease-out">Ease Out</option>
          <option value="ease-in-out">Ease In Out</option>
          <option value="spring">Spring</option>
        </select>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AnimationPanel (main export)
// ─────────────────────────────────────────────────────────────────────────────
export function AnimationPanel() {
  const [open, setOpen] = useState(true)

  const selectedIds = useEditorStore((s) => s.selectedIds)
  const elements = useEditorStore((s) => s.elements)
  const animationConfigs = useEditorStore((s) => s.animationConfigs)
  const setAnimationConfig = useEditorStore((s) => s.setAnimationConfig)

  const selectedId = selectedIds[0] ?? null
  const element = selectedId ? (elements[selectedId] ?? null) : null
  const config = selectedId ? (animationConfigs[selectedId] ?? DEFAULT_ANIMATION_CONFIG) : null

  function handleConfigChange(newConfig: AnimationConfig) {
    if (!selectedId) return
    setAnimationConfig(selectedId, newConfig)
  }

  return (
    <div data-testid="section-animation">
      <div
        style={sectionHeaderStyle}
        onClick={() => setOpen((v) => !v)}
        data-testid="section-animation-header"
      >
        <span>Animation</span>
        <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div
          style={{ paddingTop: 4, paddingBottom: 8 }}
          data-testid="section-animation-content"
        >
          {!element || !config ? (
            <div data-testid="animation-empty" style={disabledOverlayStyle}>
              Select an element to configure animations
            </div>
          ) : (
            <AnimationSectionContent
              element={element}
              config={config}
              onConfigChange={handleConfigChange}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default AnimationPanel
