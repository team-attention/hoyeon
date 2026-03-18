import { useRef } from 'react'
import { useEditorStore, type Tool } from '../../store/editorStore'
import { exportProjectJSON, importProjectJSON } from '../../store/persistence'

interface ToolItem {
  id: Tool
  label: string
  shortcut: string
  icon: string
}

const TOOLS: ToolItem[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: 'S' },
  { id: 'frame', label: 'Frame', shortcut: 'F', icon: 'F' },
  { id: 'text', label: 'Text', shortcut: 'T', icon: 'T' },
  { id: 'image', label: 'Image', shortcut: 'I', icon: 'Im' },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: 'R' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: 'El' },
]

interface ToolbarProps {
  onPreviewClick?: () => void
}

export function Toolbar({ onPreviewClick }: ToolbarProps) {
  const { activeTool, isPreviewMode, setActiveTool, setPreviewMode } = useEditorStore()
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, toolId: Tool) => {
    if (e.key === 'Enter' || e.key === ' ') {
      setActiveTool(toolId)
    }
  }

  const handlePreview = () => {
    setPreviewMode(!isPreviewMode)
    onPreviewClick?.()
  }

  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    importProjectJSON(file).catch(() => {
      // Error toast already pushed inside importProjectJSON
    })
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  return (
    <header
      data-testid="toolbar"
      className="flex items-center justify-between h-12 px-4 border-b border-[#3a3a3a] bg-[#000000]"
      style={{ display: isPreviewMode ? 'none' : 'flex' }}
    >
      {/* Left: Tool icons */}
      <div className="flex items-center gap-1" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            data-testid={`tool-${tool.id}`}
            data-tool={tool.id}
            aria-label={`${tool.label} (${tool.shortcut})`}
            aria-pressed={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
            onKeyDown={(e) => handleKeyDown(e, tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className={[
              'relative flex items-center justify-center w-8 h-8 rounded text-xs font-medium transition-colors',
              activeTool === tool.id
                ? 'bg-[rgb(0,153,255)] text-white'
                : 'text-[#9ca3af] hover:text-white hover:bg-[#2a2a2a]',
            ].join(' ')}
          >
            {tool.icon}
            {activeTool === tool.id && (
              <span
                data-testid="active-indicator"
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white"
              />
            )}
          </button>
        ))}
      </div>

      {/* Right: Import / Export / Preview buttons */}
      <div className="flex items-center gap-2">
        {/* Hidden file input for import */}
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          data-testid="import-file-input"
          style={{ display: 'none' }}
          onChange={handleImportChange}
        />

        <button
          data-testid="import-button"
          onClick={() => importInputRef.current?.click()}
          className="px-3 h-7 rounded text-xs font-medium text-[#9ca3af] hover:text-white hover:bg-[#2a2a2a] transition-colors"
          title="Import project JSON"
        >
          Import
        </button>

        <button
          data-testid="export-button"
          onClick={exportProjectJSON}
          className="px-3 h-7 rounded text-xs font-medium text-[#9ca3af] hover:text-white hover:bg-[#2a2a2a] transition-colors"
          title="Export project JSON"
        >
          Export
        </button>

        <button
          data-testid="preview-button"
          onClick={handlePreview}
          className="px-3 h-7 rounded text-xs font-medium bg-[rgb(0,153,255)] text-white hover:bg-[rgba(0,153,255,0.8)] transition-colors"
        >
          Preview
        </button>
      </div>
    </header>
  )
}
