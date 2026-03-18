import { Toolbar } from './Toolbar'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { ToastNotifications } from './ToastNotifications'
import { Canvas } from '../canvas/Canvas'
import { useEditorStore } from '../../store/editorStore'

export function EditorLayout() {
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode)

  return (
    <div
      data-testid="editor-layout"
      className="flex flex-col w-full h-full bg-[#000000] text-white"
      style={{ fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* Top Toolbar - always rendered but hidden in preview mode */}
      <Toolbar />

      {/* Main content: left panel + canvas + right panel */}
      <div className="flex flex-1 overflow-hidden">
        {!isPreviewMode && <LeftPanel />}
        <Canvas />
        {!isPreviewMode && <RightPanel />}
      </div>

      {/* Toast notifications */}
      <ToastNotifications />
    </div>
  )
}
