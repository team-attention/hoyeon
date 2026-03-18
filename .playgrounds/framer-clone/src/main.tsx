import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useEditorStore } from './store'
import { createPersistence } from './store/persistence'

// Expose store to window for E2E testing
declare global {
  interface Window {
    __editorStore: typeof useEditorStore
  }
}
window.__editorStore = useEditorStore

// Initialize persistence (restores from LocalStorage + starts auto-save)
createPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
