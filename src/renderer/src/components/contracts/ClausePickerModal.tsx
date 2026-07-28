import { useCallback, useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import type { Clause, ClauseRisk } from '../../../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Receives the chosen clause so the caller can insert it into its editor. */
  onInsert: (clause: Clause) => void
}

const RISK_VARIANTS: Record<ClauseRisk, 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger'
}

/** Picks approved language from the clause library while drafting. */
export default function ClausePickerModal({ open, onClose, onInsert }: Props) {
  const [clauses, setClauses] = useState<Clause[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [preview, setPreview] = useState<number | null>(null)

  const load = useCallback(async () => {
    const res = await window.api.clauses.list({
      search: search.trim() || undefined,
      category: category || undefined
    })
    if (res.success && res.data) setClauses(res.data)
  }, [search, category])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [open, load])

  useEffect(() => {
    if (!open) return
    window.api.clauses.categories().then((res) => {
      if (res.success && res.data) setCategories(res.data)
    })
  }, [open])

  const insert = (clause: Clause) => {
    window.api.clauses.recordUsage(clause.id)
    onInsert(clause)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Insert from Clause Library" width="max-w-3xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, text, or tag…"
            autoFocus
          />
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((c) => ({ value: c, label: c }))
            ]}
          />
        </div>

        {clauses.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">No clauses match that search.</p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {clauses.map((clause) => (
              <div key={clause.id} className="rounded-lg border border-slate-800 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium">{clause.title}</span>
                      <Badge variant={clause.clause_type === 'standard' ? 'info' : 'neutral'}>
                        {clause.clause_type}
                      </Badge>
                      <Badge variant={RISK_VARIANTS[clause.risk_level]}>{clause.risk_level}</Badge>
                      <span className="text-slate-500 text-xs">{clause.category}</span>
                    </div>
                    {clause.guidance && (
                      <p className="text-slate-400 text-xs mt-1 italic">{clause.guidance}</p>
                    )}
                    <button
                      onClick={() => setPreview(preview === clause.id ? null : clause.id)}
                      className="text-slate-400 hover:text-white text-xs mt-1"
                    >
                      {preview === clause.id ? '▾ Hide text' : '▸ Preview'}
                    </button>
                    {preview === clause.id && (
                      <p className="text-slate-300 text-xs mt-2 whitespace-pre-wrap bg-slate-900 border border-slate-800 rounded p-2">
                        {clause.body}
                      </p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => insert(clause)}>
                    Insert
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
