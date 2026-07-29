import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
  /** Muted line under the title. */
  subtitle?: string
  /** Sticky footer area (actions row). */
  footer?: React.ReactNode
}

const EXIT_MS = 200

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  subtitle,
  footer
}: Props) {
  const [mounted, setMounted] = useState(open)
  const panelRef = useRef<HTMLDivElement>(null)
  const closing = mounted && !open

  // Keep the DOM around briefly after `open` flips false so the exit
  // animation can play, then unmount.
  useEffect(() => {
    if (open) {
      setMounted(true)
      return undefined
    }
    if (!mounted) return undefined
    const t = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(t)
  }, [open, mounted])

  // Esc to close + focus trap + restore focus + scroll lock.
  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus({ preventScroll: true })

    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className={`absolute inset-0 modal-backdrop ${closing ? 'modal-backdrop-out' : ''}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 glass-strong top-edge-glow rounded-2xl w-full ${width} mx-4 max-h-[90vh] flex flex-col outline-none ${
          closing ? 'modal-panel-out' : 'modal-panel-in'
        }`}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <h2 className="text-white font-display font-semibold text-lg tracking-tight">{title}</h2>
            {subtitle && <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-4 shrink-0 w-8 h-8 -mr-2 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-white/10 shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
