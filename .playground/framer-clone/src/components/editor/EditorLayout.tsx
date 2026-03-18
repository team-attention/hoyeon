import { type ReactNode, useState } from 'react'

interface EditorLayoutProps {
  leftPanelContent?: ReactNode
  canvasContent?: ReactNode
  rightPanelContent?: ReactNode
  toolbarContent?: ReactNode
}

export function EditorLayout({
  leftPanelContent,
  canvasContent,
  rightPanelContent,
  toolbarContent,
}: EditorLayoutProps) {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)

  return (
    <div className="editor-layout" data-testid="editor-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      {/* Top Toolbar */}
      <div
        data-testid="editor-toolbar"
        style={{
          height: 40,
          background: '#252525',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          flexShrink: 0,
        }}
      >
        {toolbarContent ?? <span>Toolbar</span>}
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel */}
        <div
          data-testid="editor-left-panel"
          style={{
            width: leftPanelCollapsed ? 0 : 240,
            minWidth: leftPanelCollapsed ? 0 : 240,
            background: '#1e1e1e',
            borderRight: '1px solid #333',
            overflow: 'hidden',
            transition: 'width 0.2s, min-width 0.2s',
            position: 'relative',
          }}
        >
          {!leftPanelCollapsed && (
            <div style={{ height: '100%', overflow: 'auto' }}>
              {leftPanelContent ?? <span>Left Panel</span>}
            </div>
          )}
          <button
            data-testid="collapse-left-panel"
            onClick={() => setLeftPanelCollapsed((v) => !v)}
            style={{ position: 'absolute', right: -12, top: 12, zIndex: 10 }}
            aria-label={leftPanelCollapsed ? 'Expand left panel' : 'Collapse left panel'}
          >
            {leftPanelCollapsed ? '>' : '<'}
          </button>
        </div>

        {/* Canvas Area */}
        <div
          data-testid="editor-canvas"
          style={{
            flex: 1,
            background: '#141414',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {canvasContent ?? <span>Canvas</span>}
        </div>

        {/* Right Panel */}
        <div
          data-testid="editor-right-panel"
          style={{
            width: rightPanelCollapsed ? 0 : 240,
            minWidth: rightPanelCollapsed ? 0 : 240,
            background: '#1e1e1e',
            borderLeft: '1px solid #333',
            overflow: 'hidden',
            transition: 'width 0.2s, min-width 0.2s',
            position: 'relative',
          }}
        >
          {!rightPanelCollapsed && (
            <div style={{ height: '100%', overflow: 'auto' }}>
              {rightPanelContent ?? <span>Right Panel</span>}
            </div>
          )}
          <button
            data-testid="collapse-right-panel"
            onClick={() => setRightPanelCollapsed((v) => !v)}
            style={{ position: 'absolute', left: -12, top: 12, zIndex: 10 }}
            aria-label={rightPanelCollapsed ? 'Expand right panel' : 'Collapse right panel'}
          >
            {rightPanelCollapsed ? '<' : '>'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditorLayout
