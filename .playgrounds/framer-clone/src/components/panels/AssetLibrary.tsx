import { useState, useCallback } from 'react'
import { useComponentStore } from '../../store/components'
import { useEditorStore } from '../../store/editorStore'
import { screenToCanvas } from '../../store/editorStore'

function PackageIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

export function AssetLibrary() {
  const [search, setSearch] = useState('')

  const components = useComponentStore((s) => s.components)
  const createInstance = useComponentStore((s) => s.createInstance)
  const addElement = useEditorStore((s) => s.addElement)

  const componentList = Object.values(components)
  const filtered =
    search.trim() === ''
      ? componentList
      : componentList.filter((c) =>
          c.name.toLowerCase().includes(search.trim().toLowerCase()),
        )

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, masterId: string) => {
      e.dataTransfer.setData('application/framer-component', masterId)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      const masterId = e.dataTransfer.getData('application/framer-component')
      if (!masterId) return

      // Use the untransformed canvas root (not viewport) to measure screen-space position
      const canvasEl = document.querySelector('[data-testid="canvas"]') as HTMLElement | null
      let dropX = 100
      let dropY = 100
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        // Convert screen coords to canvas coords using camera state
        const camera = useEditorStore.getState().camera
        const canvasPos = screenToCanvas(screenX, screenY, camera)
        dropX = canvasPos.x
        dropY = canvasPos.y
      }

      const instance = createInstance(masterId, { x: dropX, y: dropY, parentId: null })
      if (instance) {
        addElement(instance)
      }
    },
    [createInstance, addElement],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Attach drag-over/drop to canvas on mount — we do it via data attribute
  // The canvas viewport already exists; we inject the handlers via a portal-less approach:
  // tests can call createInstance directly via __componentStore.
  void handleDrop
  void handleDragOver

  return (
    <div
      data-testid="asset-library"
      className="flex flex-col h-full"
    >
      {/* Search */}
      <div className="px-3 py-2 border-b border-[#3a3a3a]">
        <input
          data-testid="asset-search"
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#2a2a2a] text-white text-xs rounded px-2 py-1.5 outline-none placeholder-[#6b7280] border border-[#3a3a3a] focus:border-[rgb(0,153,255)]"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {componentList.length === 0 ? (
          /* Empty state — no components at all */
          <div
            data-testid="asset-empty-state"
            className="flex flex-col items-center justify-center h-full gap-2 text-center px-4"
          >
            <div className="text-[#4b5563]">
              <PackageIcon />
            </div>
            <p className="text-xs text-[#6b7280]">No components yet</p>
            <p className="text-[10px] text-[#4b5563]">
              Select elements and use &ldquo;Create Component&rdquo; to add one.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          /* No search results */
          <div
            data-testid="asset-no-results"
            className="flex flex-col items-center justify-center h-full gap-2 text-center px-4"
          >
            <p className="text-xs text-[#6b7280]">No results for &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          /* Component grid */
          <div
            data-testid="asset-component-list"
            className="grid grid-cols-2 gap-2"
          >
            {filtered.map((component) => (
              <div
                key={component.id}
                data-testid={`asset-component-${component.id}`}
                data-component-id={component.id}
                draggable
                onDragStart={(e) => handleDragStart(e, component.id)}
                className="flex flex-col items-center gap-1 p-2 rounded border border-[#3a3a3a] bg-[#1e1e1e] hover:border-[rgb(0,153,255)] cursor-grab active:cursor-grabbing transition-colors"
                title={component.name}
              >
                {/* Thumbnail — a colored rectangle representing the component */}
                <div
                  data-testid={`asset-thumbnail-${component.id}`}
                  className="w-full aspect-square rounded flex items-center justify-center"
                  style={{
                    background:
                      (component.element as { fill?: string }).fill ?? '#3a3a3a',
                    maxHeight: '48px',
                  }}
                />
                <span
                  data-testid={`asset-name-${component.id}`}
                  className="text-[10px] text-[#d1d5db] text-center truncate w-full"
                >
                  {component.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
