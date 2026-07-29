import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useThemeStore } from '../../store/themeStore'
import { useCommandPalette } from '../ui'
import type { Department } from '../../../../shared/types'

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/dashboard/, 'Dashboard'],
  [/^\/contracts\/\d+/, 'Contract Detail'],
  [/^\/contracts/, 'Contracts'],
  [/^\/invoices/, 'Invoices'],
  [/^\/competitors/, 'Competitor Analysis'],
  [/^\/projects/, 'Projects'],
  [/^\/settings/, 'Settings'],
  [/^\/assets/, 'IT Assets'],
  [/^\/department\//, 'Department'],
  [/^\/branch\//, 'Branch']
]

function titleFor(pathname: string) {
  return PAGE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Contract Manager'
}

export default function TopBar() {
  const [departments, setDepartments] = useState<Department[]>([])
  const { selectedDeptId, setSelectedDept } = useThemeStore()
  const location = useLocation()
  const palette = useCommandPalette()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.departments.list().then((res) => {
      if (res.success && res.data) setDepartments(res.data)
    })
  }, [])

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const title = titleFor(location.pathname)
  const selectedName =
    selectedDeptId === null
      ? 'Company Overview'
      : departments.find((d) => d.id === selectedDeptId)?.name ?? 'Company Overview'

  const choose = (id: number | null) => {
    setSelectedDept(id)
    setOpen(false)
  }

  return (
    <header className="top-edge-glow relative z-30 flex h-14 flex-shrink-0 items-center gap-4 glass border-b border-white/5 px-6">
      {/* Animated page title — keyed so it replays on route change */}
      <h2 key={title} className="animate-fade-in font-display text-sm font-semibold tracking-wide text-white">
        {title}
      </h2>

      <div className="mx-2 h-5 w-px bg-white/10" aria-hidden="true" />

      {/* Department scope switcher */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={[
            'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all',
            open
              ? 'border-brand-accent/40 bg-white/10 text-white shadow-glow'
              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
          ].join(' ')}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" aria-hidden="true" />
          {selectedName}
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="glass-strong absolute left-0 top-full z-50 mt-2 w-64 origin-top-left animate-scale-in overflow-hidden rounded-xl border border-white/10 p-1.5 shadow-elevated">
            <button
              onClick={() => choose(null)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedDeptId === null ? 'bg-brand-primary/20 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              Company Overview
              {selectedDeptId === null && <span className="text-brand-accent">✓</span>}
            </button>
            {departments.length > 0 && <div className="my-1 h-px bg-white/5" aria-hidden="true" />}
            {departments.map((d) => (
              <button
                key={d.id}
                onClick={() => choose(d.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedDeptId === d.id ? 'bg-brand-primary/20 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {d.name}
                {selectedDeptId === d.id && <span className="text-brand-accent">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Command palette affordance */}
      <button
        onClick={() => palette.open()}
        className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-400 transition-all hover:border-white/20 hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        Search
        <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 transition-colors group-hover:text-slate-300">
          ⌘K
        </kbd>
      </button>

      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-400">
        FY {new Date().getFullYear()}
      </span>
    </header>
  )
}
