import { useEffect, useRef } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { useComponentStore } from '../../store/components'

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  targetId: string | null
}

interface ContextMenuProps {
  menu: ContextMenuState
  onClose: () => void
}

interface MenuItem {
  label: string
  action: () => void
  disabled?: boolean
  divider?: boolean
}

export function ContextMenu({ menu, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedIds = useEditorStore((s) => s.selection.selectedIds)
  const clipboard = useEditorStore((s) => s.clipboard)

  const hasSelection = selectedIds.length > 0
  const hasClipboard = clipboard.length > 0
  const targetId = menu.targetId

  // Close on click-outside
  useEffect(() => {
    if (!menu.visible) return
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
  }, [menu.visible, onClose])

  if (!menu.visible) return null

  const act = (fn: () => void) => {
    fn()
    onClose()
  }

  const items: MenuItem[] = hasSelection
    ? [
        {
          label: 'Copy',
          action: () => act(() => useEditorStore.getState().copyElements([...selectedIds])),
        },
        {
          label: 'Cut',
          action: () => act(() => useEditorStore.getState().cutElements([...selectedIds])),
        },
        {
          label: 'Paste',
          disabled: !hasClipboard,
          action: () => act(() => useEditorStore.getState().pasteElements()),
        },
        {
          label: 'Duplicate',
          action: () => act(() => useEditorStore.getState().duplicateElements([...selectedIds])),
          divider: true,
        },
        {
          label: 'Delete',
          action: () => act(() => useEditorStore.getState().deleteElements([...selectedIds])),
          divider: true,
        },
        {
          label: 'Group',
          disabled: selectedIds.length < 2,
          action: () => act(() => useEditorStore.getState().groupElements([...selectedIds])),
        },
        {
          label: 'Ungroup',
          disabled: (() => {
            const s = useEditorStore.getState()
            return !targetId || !s.elements[targetId] || s.elements[targetId].kind !== 'frame'
          })(),
          action: () => {
            if (targetId) act(() => useEditorStore.getState().ungroupElement(targetId))
          },
          divider: true,
        },
        {
          label: 'Bring Forward',
          disabled: !targetId,
          action: () => {
            if (targetId) act(() => useEditorStore.getState().bringForward(targetId))
          },
        },
        {
          label: 'Send Backward',
          disabled: !targetId,
          action: () => {
            if (targetId) act(() => useEditorStore.getState().sendBackward(targetId))
          },
          divider: true,
        },
        {
          label: 'Create Component',
          disabled: selectedIds.length !== 1 || !targetId,
          action: () => {
            if (!targetId) return
            const el = useEditorStore.getState().elements[targetId]
            if (!el) return
            act(() => useComponentStore.getState().createMaster(el))
          },
        },
      ]
    : [
        {
          label: 'Paste',
          disabled: !hasClipboard,
          action: () => act(() => useEditorStore.getState().pasteElements()),
        },
      ]

  return (
    <div
      ref={menuRef}
      data-testid="context-menu"
      className="fixed z-50 min-w-[180px] rounded-md border border-[#3a3a3a] bg-[#1a1a1a] shadow-xl py-1 text-sm text-white"
      style={{ left: menu.x, top: menu.y }}
    >
      {items.map((item, idx) => (
        <div key={idx}>
          <button
            data-testid={`context-menu-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={[
              'w-full text-left px-4 py-1.5 transition-colors',
              item.disabled
                ? 'text-[#555] cursor-default'
                : 'hover:bg-[#2a2a2a] cursor-pointer',
            ].join(' ')}
            disabled={item.disabled}
            onClick={item.disabled ? undefined : item.action}
          >
            {item.label}
          </button>
          {item.divider && <div className="my-1 border-t border-[#3a3a3a]" />}
        </div>
      ))}
    </div>
  )
}
