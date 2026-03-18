/**
 * persistence.ts
 *
 * Handles auto-save to LocalStorage (debounced 500ms), restore on load,
 * JSON export (file download), and JSON import (file picker).
 *
 * Toast notifications are pushed via the global __toastQueue array.
 */

import { useEditorStore } from './editorStore'

// ─── Constants ───────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'framer-clone-project'
const SCHEMA_VERSION = 1
const DEBOUNCE_MS = 500

// ─── Toast bridge ────────────────────────────────────────────────────────────

/**
 * Simple global toast queue. Components consume this via a polling subscription
 * or the exposed `useToastQueue` hook. Keeps persistence.ts free from React deps.
 */
declare global {
  interface Window {
    __toastQueue: ToastMessage[]
    __pushToast: (msg: ToastMessage) => void
    __editorPersistence: ReturnType<typeof createPersistence>
  }
}

export interface ToastMessage {
  id: string
  type: 'error' | 'warning' | 'info'
  message: string
}

function pushToast(type: ToastMessage['type'], message: string) {
  const msg: ToastMessage = { id: Date.now().toString(), type, message }
  if (typeof window !== 'undefined') {
    window.__toastQueue = window.__toastQueue ?? []
    window.__toastQueue.push(msg)
    window.__pushToast?.(msg)
  }
}

// ─── Serialized state shape ───────────────────────────────────────────────────

export interface PersistedState {
  schemaVersion: number
  elements: unknown
  rootIds: unknown
  camera: unknown
}

function serializeState(): PersistedState {
  const state = useEditorStore.getState()
  return {
    schemaVersion: SCHEMA_VERSION,
    elements: state.elements,
    rootIds: state.rootIds,
    camera: state.camera,
  }
}

function isValidPersistedState(obj: unknown): obj is PersistedState {
  if (typeof obj !== 'object' || obj === null) return false
  const s = obj as Record<string, unknown>
  return (
    typeof s['schemaVersion'] === 'number' &&
    typeof s['elements'] === 'object' &&
    s['elements'] !== null &&
    Array.isArray(s['rootIds'])
  )
}

function applyPersistedState(parsed: PersistedState) {
  const store = useEditorStore.getState()
  // Use a direct setState (immer won't have an action for this; use set via subscribe)
  // We bypass immer by calling the store's setter directly
  useEditorStore.setState({
    elements: parsed.elements as ReturnType<typeof useEditorStore.getState>['elements'],
    rootIds: parsed.rootIds as string[],
    camera: (parsed.camera ?? { x: 0, y: 0, zoom: 1 }) as ReturnType<
      typeof useEditorStore.getState
    >['camera'],
    // Reset selection/tool on restore
    selection: store.selection,
    activeTool: store.activeTool,
    isPreviewMode: store.isPreviewMode,
  })
}

// ─── Auto-save ────────────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function saveToLocalStorage() {
  try {
    const serialized = JSON.stringify(serializeState())
    localStorage.setItem(STORAGE_KEY, serialized)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      pushToast('warning', 'Storage quota exceeded — project could not be saved.')
    }
    // Re-throw only for non-quota errors so the app stays functional
  }
}

function scheduleSave() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    saveToLocalStorage()
  }, DEBOUNCE_MS)
}

// ─── Restore on load ─────────────────────────────────────────────────────────

export function restoreFromLocalStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as unknown
    if (!isValidPersistedState(parsed)) return false
    applyPersistedState(parsed)
    return true
  } catch {
    return false
  }
}

// ─── JSON Export ─────────────────────────────────────────────────────────────

export function exportProjectJSON() {
  const data = serializeState()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'project.json'
  a.dataset['testid'] = 'export-anchor'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── JSON Import ─────────────────────────────────────────────────────────────

export function importProjectJSON(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        pushToast('error', 'Could not read file contents.')
        reject(new Error('FileReader returned non-string result'))
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        pushToast('error', 'Invalid JSON — file could not be parsed.')
        reject(new Error('invalid JSON'))
        return
      }

      if (!isValidPersistedState(parsed)) {
        pushToast('error', 'Corrupt or incompatible project file.')
        reject(new Error('corrupt JSON'))
        return
      }

      applyPersistedState(parsed)
      saveToLocalStorage()
      resolve()
    }

    reader.onerror = () => {
      pushToast('error', 'Failed to read file.')
      reject(new Error('FileReader error'))
    }

    reader.readAsText(file)
  })
}

// ─── Persistence initializer ─────────────────────────────────────────────────

export function createPersistence() {
  // Restore saved project state
  restoreFromLocalStorage()

  // Subscribe to store changes and schedule debounced saves
  const unsubscribe = useEditorStore.subscribe((_state, _prevState) => {
    scheduleSave()
  })

  return { unsubscribe }
}
