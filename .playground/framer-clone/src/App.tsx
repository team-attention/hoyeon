import { EditorLayout } from './components/editor/EditorLayout'
import { LeftPanel } from './components/editor/LeftPanel'
import './index.css'

function App() {
  return (
    <EditorLayout
      leftPanelContent={<LeftPanel />}
      toolbarContent={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#e0e0e0', fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>Framer Clone</span>
        </div>
      }
    />
  )
}

export default App
