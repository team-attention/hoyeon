import { useState } from 'react'
import { BreakpointSwitcher } from './BreakpointSwitcher'
import { AlignActions } from './AlignActions'

type ToolType = 'select' | 'frame' | 'text' | 'image' | 'hand'

interface ToolbarProps {
  onToolChange?: (tool: ToolType) => void
  onUndo?: () => void
  onRedo?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  zoomLevel?: number
}

const TOOLS: { id: ToolType; label: string; icon: string }[] = [
  { id: 'select', label: 'Select (V)', icon: '↖' },
  { id: 'frame', label: 'Frame (F)', icon: '⬜' },
  { id: 'text', label: 'Text (T)', icon: 'T' },
  { id: 'image', label: 'Image (I)', icon: '🖼' },
  { id: 'hand', label: 'Hand (H)', icon: '✋' },
]

export function Toolbar({
  onToolChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  zoomLevel = 100,
}: ToolbarProps) {
  const [activeTool, setActiveTool] = useState<ToolType>('select')

  const handleToolClick = (tool: ToolType) => {
    setActiveTool(tool)
    onToolChange?.(tool)
  }

  return (
    <div
      data-testid="toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        gap: 4,
        padding: '0 8px',
      }}
    >
      {/* Brand */}
      <span
        data-testid="toolbar-brand"
        style={{ fontWeight: 600, fontSize: 13, color: '#e0e0e0', marginRight: 8 }}
      >
        Framer
      </span>

      <div style={{ width: 1, height: 20, background: '#333', marginRight: 8 }} />

      {/* Tool Selection */}
      <div
        data-testid="toolbar-tools"
        style={{ display: 'flex', alignItems: 'center', gap: 2 }}
      >
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            data-testid={`tool-${tool.id}`}
            onClick={() => handleToolClick(tool.id)}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={activeTool === tool.id}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: activeTool === tool.id ? '#0a84ff22' : 'transparent',
              border: activeTool === tool.id ? '1px solid #0a84ff66' : '1px solid transparent',
              borderRadius: 4,
              color: activeTool === tool.id ? '#0a84ff' : '#888',
              cursor: 'pointer',
              fontSize: 13,
              transition: 'background 0.1s, color 0.1s',
            }}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {/* Align / Distribute Actions */}
      <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />
      <AlignActions />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Breakpoint Switcher (centered) */}
      <BreakpointSwitcher />

      <div style={{ flex: 1 }} />

      {/* Undo / Redo */}
      <div
        data-testid="toolbar-history"
        style={{ display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <button
          data-testid="toolbar-undo"
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: '#888',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ↩
        </button>
        <button
          data-testid="toolbar-redo"
          onClick={onRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: '#888',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ↪
        </button>
      </div>

      <div style={{ width: 1, height: 20, background: '#333', margin: '0 8px' }} />

      {/* Zoom Controls */}
      <div
        data-testid="toolbar-zoom"
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <button
          data-testid="toolbar-zoom-out"
          onClick={onZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
          style={{
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: '#888',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          −
        </button>
        <span
          data-testid="toolbar-zoom-level"
          style={{ fontSize: 12, color: '#888', minWidth: 40, textAlign: 'center' }}
        >
          {zoomLevel}%
        </span>
        <button
          data-testid="toolbar-zoom-in"
          onClick={onZoomIn}
          title="Zoom In"
          aria-label="Zoom In"
          style={{
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: '#888',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}

export default Toolbar
