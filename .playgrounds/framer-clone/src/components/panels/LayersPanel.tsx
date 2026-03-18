import { useState, useRef, useCallback } from 'react'
import { useEditorStore } from '../../store/editorStore'

// Eye icon — visible
function EyeOpenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// Eye icon — hidden
function EyeOffIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// Kind badge color per element type
function kindColor(kind: string): string {
  switch (kind) {
    case 'frame':
      return '#60a5fa'
    case 'text':
      return '#a78bfa'
    case 'image':
      return '#34d399'
    case 'rectangle':
      return '#f59e0b'
    case 'ellipse':
      return '#f472b6'
    default:
      return '#9ca3af'
  }
}

interface LayerRowProps {
  id: string
  index: number
  totalCount: number
}

function LayerRow({ id, index, totalCount }: LayerRowProps) {
  const element = useEditorStore((s) => s.elements[id])
  const selectedIds = useEditorStore((s) => s.selection.selectedIds)
  const selectElement = useEditorStore((s) => s.selectElement)
  const updateElement = useEditorStore((s) => s.updateElement)
  const renameElement = useEditorStore((s) => s.renameElement)
  const reorderElement = useEditorStore((s) => s.reorderElement)

  const [isRenaming, setIsRenaming] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isDraggingOver = useRef(false)
  const [dragOver, setDragOver] = useState<'top' | 'bottom' | null>(null)

  const isSelected = selectedIds.includes(id)

  const handleClick = useCallback(() => {
    selectElement(id)
  }, [id, selectElement])

  const handleDoubleClick = useCallback(() => {
    setEditValue(element.name)
    setIsRenaming(true)
    // Focus after state update
    setTimeout(() => inputRef.current?.select(), 0)
  }, [element.name])

  const commitRename = useCallback(() => {
    if (editValue.trim() !== '') {
      renameElement(id, editValue)
    }
    setIsRenaming(false)
  }, [id, editValue, renameElement])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitRename()
      } else if (e.key === 'Escape') {
        setIsRenaming(false)
      }
    },
    [commitRename],
  )

  const handleVisibilityToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      updateElement(id, { visible: !element.visible })
    },
    [id, element.visible, updateElement],
  )

  // Drag and drop
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }, [id])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    isDraggingOver.current = true
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    setDragOver(e.clientY < midY ? 'top' : 'bottom')
  }, [])

  const handleDragLeave = useCallback(() => {
    isDraggingOver.current = false
    setDragOver(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(null)
      const draggedId = e.dataTransfer.getData('text/plain')
      if (!draggedId || draggedId === id) return

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      const dropBefore = e.clientY < midY

      // index in the list is top-to-bottom, but rootIds z-order is bottom-to-top
      // We display in reverse order (highest z = top of list), so:
      // list index 0 = rootIds[totalCount-1]
      // list index i = rootIds[totalCount-1-i]
      const targetRootIndex = totalCount - 1 - index
      const insertAt = dropBefore ? targetRootIndex + 1 : targetRootIndex

      reorderElement(draggedId, insertAt)
    },
    [id, index, totalCount, reorderElement],
  )

  if (!element) return null

  return (
    <div
      data-testid={`layer-row-${id}`}
      data-layer-id={id}
      draggable
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        'relative flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none text-xs rounded',
        isSelected
          ? 'bg-[rgba(0,153,255,0.2)] text-white'
          : 'text-[#d1d5db] hover:bg-[rgba(255,255,255,0.05)]',
        dragOver === 'top' ? 'border-t border-[rgb(0,153,255)]' : '',
        dragOver === 'bottom' ? 'border-b border-[rgb(0,153,255)]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Kind color dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: kindColor(element.kind) }}
      />

      {/* Name / rename input */}
      {isRenaming ? (
        <input
          ref={inputRef}
          data-testid={`layer-rename-input-${id}`}
          className="flex-1 bg-[#1a1a1a] border border-[rgb(0,153,255)] rounded px-1 py-0 text-xs text-white outline-none"
          value={editValue}
          autoFocus
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={commitRename}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          data-testid={`layer-name-${id}`}
          className={[
            'flex-1 truncate',
            !element.visible ? 'opacity-50 line-through' : '',
          ].join(' ')}
        >
          {element.name}
        </span>
      )}

      {/* Visibility toggle */}
      <button
        data-testid={`layer-visibility-${id}`}
        aria-label={element.visible ? 'Hide element' : 'Show element'}
        onClick={handleVisibilityToggle}
        className={[
          'shrink-0 transition-colors',
          element.visible ? 'text-[#9ca3af] hover:text-white' : 'text-[#4b5563] hover:text-[#9ca3af]',
        ].join(' ')}
      >
        {element.visible ? <EyeOpenIcon /> : <EyeOffIcon />}
      </button>
    </div>
  )
}

export function LayersPanel() {
  const rootIds = useEditorStore((s) => s.rootIds)

  // Display in reverse order: highest z-index (last in rootIds) at top
  const displayIds = [...rootIds].reverse()

  if (displayIds.length === 0) {
    return (
      <div
        data-testid="layers-panel"
        className="flex-1 overflow-y-auto p-3 flex items-center justify-center"
      >
        <p
          data-testid="layers-empty-state"
          className="text-xs text-[#9ca3af] text-center"
        >
          No layers yet
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="layers-panel"
      className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5"
    >
      {displayIds.map((id, index) => (
        <LayerRow
          key={id}
          id={id}
          index={index}
          totalCount={rootIds.length}
        />
      ))}
    </div>
  )
}
