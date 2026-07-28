import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  title: string
  description?: string
  type?: ToastType
  /** Auto-dismiss delay in ms (default 4500). Pass 0 to keep until closed. */
  duration?: number
}

interface ToastItem extends Required<Omit<ToastOptions, 'description'>> {
  id: number
  description?: string
  leaving: boolean
}

interface ToastContextValue {
  toast: (opts: ToastOptions | string) => number
  success: (title: string, description?: string) => number
  error: (title: string, description?: string) => number
  info: (title: string, description?: string) => number
  warning: (title: string, description?: string) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Access the toast API. Must be used under a <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>')
  return ctx
}

const EXIT_MS = 250

const typeStyles: Record<ToastType, { bar: string; iconColor: string; icon: React.ReactNode }> = {
  success: {
    bar: 'bg-emerald-400',
    iconColor: 'text-emerald-400',
    icon: (
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    )
  },
  error: {
    bar: 'bg-red-400',
    iconColor: 'text-red-400',
    icon: (
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    )
  },
  warning: {
    bar: 'bg-amber-400',
    iconColor: 'text-amber-400',
    icon: (
      <path
        d="M10 3l8 14H2L10 3zm0 5v4m0 2.5v.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    )
  },
  info: {
    bar: 'bg-blue-400',
    iconColor: 'text-blue-400',
    icon: (
      <path
        d="M10 9v5m0-8v.5M2.5 10a7.5 7.5 0 1 1 15 0 7.5 7.5 0 0 1-15 0z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    )
  }
}

let nextId = 1

/** Mount once at the app root; renders the stacked toasts in a portal. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((t) => clearTimeout(t))
  }, [])

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      const timer = timersRef.current.get(id)
      if (timer) clearTimeout(timer)
      timersRef.current.set(
        id,
        setTimeout(() => remove(id), EXIT_MS)
      )
    },
    [remove]
  )

  const toast = useCallback(
    (opts: ToastOptions | string): number => {
      const o: ToastOptions = typeof opts === 'string' ? { title: opts } : opts
      const id = nextId++
      const item: ToastItem = {
        id,
        title: o.title,
        description: o.description,
        type: o.type ?? 'info',
        duration: o.duration ?? 4500,
        leaving: false
      }
      setItems((prev) => [...prev, item])
      if (item.duration > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), item.duration)
        )
      }
      return id
    },
    [dismiss]
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, type: 'success' }),
      error: (title, description) => toast({ title, description, type: 'error' }),
      info: (title, description) => toast({ title, description, type: 'info' }),
      warning: (title, description) => toast({ title, description, type: 'warning' }),
      dismiss
    }),
    [toast, dismiss]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-3 w-80 pointer-events-none">
          {items.map((t) => {
            const s = typeStyles[t.type]
            return (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto relative overflow-hidden glass-strong rounded-xl p-3.5 pr-9 ${
                  t.leaving ? 'toast-out' : 'animate-slide-in-right'
                }`}
              >
                <div className="flex items-start gap-3">
                  <svg
                    viewBox="0 0 20 20"
                    className={`w-5 h-5 shrink-0 mt-0.5 ${s.iconColor}`}
                    aria-hidden="true"
                  >
                    {s.icon}
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white leading-snug">{t.title}</p>
                    {t.description && (
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{t.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="absolute top-2 right-2 w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-white/10 transition-colors text-sm leading-none"
                >
                  ×
                </button>
                {t.duration > 0 && !t.leaving && (
                  <div
                    className={`absolute bottom-0 left-0 right-0 h-0.5 ${s.bar} toast-progress opacity-70`}
                    style={{ animationDuration: `${t.duration}ms` }}
                  />
                )}
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export default ToastProvider
