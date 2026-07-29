import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useHotkeys from '../../hooks/useHotkeys'

export interface Command {
  id: string
  label: string
  /** Right-aligned hint, e.g. a shortcut or route. */
  hint?: string
  /** Section header the command is grouped under. */
  group?: string
  icon?: React.ReactNode
  run: () => void
}

interface Props {
  commands: Command[]
  placeholder?: string
}

const PALETTE_EVENT = 'ui:command-palette'
type PaletteAction = 'open' | 'close' | 'toggle'

const emit = (action: PaletteAction): void => {
  window.dispatchEvent(new CustomEvent<PaletteAction>(PALETTE_EVENT, { detail: action }))
}

/** Programmatic control of the palette from anywhere in the tree. */
export function useCommandPalette(): {
  open: () => void
  close: () => void
  toggle: () => void
} {
  return useMemo(
    () => ({
      open: () => emit('open'),
      close: () => emit('close'),
      toggle: () => emit('toggle')
    }),
    []
  )
}

/** Subsequence fuzzy match; higher score = better. Returns null on no match. */
function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  let score = 0
  let ti = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti)
    if (idx === -1) return null
    streak = idx === ti ? streak + 1 : 1
    score += streak * 2 + (idx === 0 ? 4 : 0)
    ti = idx + 1
  }
  return score - t.length * 0.01
}

/**
 * Global ⌘K / Ctrl+K command palette. Mount once (e.g. in the layout) with
 * the command list; it manages its own open state.
 */
export default function CommandPalette({ commands, placeholder = 'Type a command…' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useHotkeys('mod+k', () => setOpen((v) => !v))

  useEffect(() => {
    const handler = (e: Event): void => {
      const action = (e as CustomEvent<PaletteAction>).detail
      setOpen((v) => (action === 'open' ? true : action === 'close' ? false : !v))
    }
    window.addEventListener(PALETTE_EVENT, handler)
    return () => window.removeEventListener(PALETTE_EVENT, handler)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Focus after the panel mounts.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = useMemo(() => {
    const scored = commands
      .map((cmd) => ({ cmd, score: fuzzyScore(query, `${cmd.label} ${cmd.group ?? ''}`) }))
      .filter((s): s is { cmd: Command; score: number } => s.score !== null)
    scored.sort((a, b) => b.score - a.score)
    return scored.map((s) => s.cmd)
  }, [commands, query])

  /** Flat filtered list rendered with group headers; groups keep first-seen order. */
  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const cmd of filtered) {
      const g = cmd.group ?? 'Commands'
      const list = map.get(g)
      if (list) list.push(cmd)
      else map.set(g, [cmd])
    }
    return Array.from(map.entries())
  }, [filtered])

  const flat = useMemo(() => grouped.flatMap(([, cmds]) => cmds), [grouped])

  const close = useCallback(() => setOpen(false), [])

  const runCommand = useCallback(
    (cmd: Command) => {
      close()
      cmd.run()
    },
    [close]
  )

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = flat[activeIndex]
      if (cmd) runCommand(cmd)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  // Keep the active row visible while arrowing through the list.
  useEffect(() => {
    const cmd = flat[activeIndex]
    if (!cmd || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-id="${CSS.escape(cmd.id)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, flat])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  let flatIndex = -1

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 modal-backdrop" onClick={close} />
      <div className="absolute left-1/2 top-[16%] -translate-x-1/2 w-full max-w-xl px-4">
        <div className="glass-strong top-edge-glow rounded-2xl overflow-hidden animate-scale-in">
          <div className="flex items-center gap-3 px-4 border-b border-white/10">
            <svg viewBox="0 0 20 20" className="w-4 h-4 text-slate-400 shrink-0" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-white text-sm py-3.5 focus:outline-none placeholder-slate-500"
              aria-label="Command search"
            />
            <kbd className="text-[10px] font-mono text-slate-500 border border-white/10 rounded px-1.5 py-0.5 shrink-0">
              esc
            </kbd>
          </div>
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {flat.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">No matching commands</p>
            )}
            {grouped.map(([group, cmds]) => (
              <div key={group}>
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {group}
                </p>
                {cmds.map((cmd) => {
                  flatIndex++
                  const isActive = flatIndex === activeIndex
                  const myIndex = flatIndex
                  return (
                    <button
                      key={cmd.id}
                      data-cmd-id={cmd.id}
                      onClick={() => runCommand(cmd)}
                      onMouseMove={() => setActiveIndex(myIndex)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                        isActive
                          ? 'bg-brand-primary/15 text-white border-l-2 border-brand-accent'
                          : 'text-slate-300 border-l-2 border-transparent'
                      }`}
                    >
                      {cmd.icon && (
                        <span
                          className={`inline-flex shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${
                            isActive ? 'text-brand-light' : 'text-slate-500'
                          }`}
                        >
                          {cmd.icon}
                        </span>
                      )}
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="text-xs font-mono text-slate-500 shrink-0">{cmd.hint}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
