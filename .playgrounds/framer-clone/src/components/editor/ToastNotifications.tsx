/**
 * ToastNotifications.tsx
 *
 * Subscribes to the global __pushToast bridge and renders transient toast messages.
 */

import { useEffect, useRef, useState } from 'react'
import type { ToastMessage } from '../../store/persistence'

const AUTO_DISMISS_MS = 4000

export function ToastNotifications() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    // Wire the global push bridge
    window.__toastQueue = window.__toastQueue ?? []
    window.__pushToast = (msg: ToastMessage) => {
      setToasts((prev) => [...prev, msg])
      const t = setTimeout(() => {
        setToasts((prev) => prev.filter((m) => m.id !== msg.id))
        timers.current.delete(msg.id)
      }, AUTO_DISMISS_MS)
      timers.current.set(msg.id, t)
    }

    // Drain any toasts that were queued before this component mounted
    const queued = window.__toastQueue.slice()
    window.__toastQueue = []
    for (const msg of queued) {
      window.__pushToast(msg)
    }

    return () => {
      window.__pushToast = () => {}
      timers.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      data-testid="toast-container"
      className="fixed bottom-4 right-4 flex flex-col gap-2 z-50"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`toast-${toast.type}`}
          className={[
            'px-4 py-2 rounded text-sm font-medium text-white shadow-lg',
            toast.type === 'error'
              ? 'bg-red-600'
              : toast.type === 'warning'
                ? 'bg-yellow-600'
                : 'bg-[rgb(0,153,255)]',
          ].join(' ')}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
