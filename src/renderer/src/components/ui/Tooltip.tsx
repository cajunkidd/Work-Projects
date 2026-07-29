import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Delay before showing, in ms (default 300). */
  delay?: number
  className?: string
}

/**
 * Lightweight hover/focus tooltip rendered in a portal with fade+scale.
 * Wraps its child in an inline-flex span that carries the handlers.
 */
export default function Tooltip({
  content,
  children,
  side = 'top',
  delay = 300,
  className = ''
}: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const GAP = 8
      switch (side) {
        case 'bottom':
          setPos({ top: r.bottom + GAP, left: r.left + r.width / 2 })
          break
        case 'left':
          setPos({ top: r.top + r.height / 2, left: r.left - GAP })
          break
        case 'right':
          setPos({ top: r.top + r.height / 2, left: r.right + GAP })
          break
        default:
          setPos({ top: r.top - GAP, left: r.left + r.width / 2 })
      }
    }, delay)
  }, [side, delay])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPos(null)
  }, [])

  useEffect(() => hide, [hide])

  const transforms: Record<NonNullable<Props['side']>, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)'
  }

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-flex ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[110] pointer-events-none"
            style={{ top: pos.top, left: pos.left, transform: transforms[side] }}
          >
            <div className="glass-strong rounded-lg px-2.5 py-1.5 text-xs text-slate-100 max-w-xs shadow-elevated whitespace-nowrap animate-scale-in">
              {content}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
