import { useEffect, useRef, useState } from 'react'

export interface TabItem {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
}

interface Props {
  tabs: TabItem[]
  /** Id of the active tab (controlled). */
  active: string
  onChange: (id: string) => void
  /** 'underline' (default) or 'pills'. */
  variant?: 'underline' | 'pills'
  className?: string
}

/**
 * Animated tabs — the indicator (underline or pill) slides between tabs.
 */
export default function Tabs({ tabs, active, onChange, variant = 'underline', className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  useEffect(() => {
    const measure = (): void => {
      const btn = buttonRefs.current.get(active)
      const container = containerRef.current
      if (!btn || !container) return
      const cRect = container.getBoundingClientRect()
      const bRect = btn.getBoundingClientRect()
      setIndicator({ left: bRect.left - cRect.left, width: bRect.width, ready: true })
    }
    measure()
    const container = containerRef.current
    if (!container) return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [active, tabs, variant])

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={`relative inline-flex items-center gap-1 ${
        variant === 'underline' ? 'border-b border-white/10' : 'glass rounded-xl p-1'
      } ${className}`}
    >
      {indicator.ready && (
        <div
          aria-hidden="true"
          className={`absolute transition-all duration-300 ease-out-expo pointer-events-none ${
            variant === 'underline'
              ? 'bottom-0 h-0.5 rounded-full bg-brand-gradient shadow-glow'
              : 'top-1 bottom-1 rounded-lg bg-white/10 border border-white/10 shadow-inset-hairline'
          }`}
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttonRefs.current.set(tab.id, el)
              else buttonRefs.current.delete(tab.id)
            }}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative z-10 inline-flex items-center gap-1.5 px-3.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
              variant === 'underline' ? 'py-2.5' : 'py-1.5'
            } ${isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {tab.icon && <span className="inline-flex [&>svg]:w-4 [&>svg]:h-4">{tab.icon}</span>}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
