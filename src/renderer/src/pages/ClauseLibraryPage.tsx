import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import RoleGuard from '../components/layout/RoleGuard'
import { useAuthStore } from '../store/authStore'
import { useActor } from '../lib/actor'
import type { Clause, ClauseRisk, ClauseType } from '../../../shared/types'

const RISK_VARIANTS: Record<ClauseRisk, 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger'
}

const TYPE_LABELS: Record<ClauseType, string> = {
  standard: 'Standard',
  fallback: 'Fallback',
  alternative: 'Alternative'
}

const EMPTY_FORM = {
  id: 0,
  title: '',
  category: '',
  body: '',
  clause_type: 'standard' as ClauseType,
  parent_id: '' as number | '',
  risk_level: 'medium' as ClauseRisk,
  tags: '',
  guidance: ''
}

export default function ClauseLibraryPage() {
  const actor = useActor()
  const can = useAuthStore((s) => s.can)
  const canEdit = can('director')

  const [clauses, setClauses] = useState<Clause[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [clauseType, setClauseType] = useState<'' | ClauseType>('')
  const [showArchived, setShowArchived] = useState(false)

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [clauseRes, catRes] = await Promise.all([
      window.api.clauses.list({
        search: search.trim() || undefined,
        category: category || undefined,
        clause_type: clauseType || undefined,
        include_archived: showArchived
      }),
      window.api.clauses.categories()
    ])
    if (clauseRes.success && clauseRes.data) setClauses(clauseRes.data)
    if (catRes.success && catRes.data) setCategories(catRes.data)
    setLoading(false)
  }, [search, category, clauseType, showArchived])

  useEffect(() => {
    const timer = setTimeout(load, 200) // debounce the search box
    return () => clearTimeout(timer)
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 4000)
  }

  /**
   * Standards carry their variants; a variant only appears at the top level when
   * its parent was filtered out, so search results never hide a match.
   */
  const grouped = useMemo(() => {
    const byId = new Map(clauses.map((c) => [c.id, c]))
    const children = new Map<number, Clause[]>()
    const roots: Clause[] = []

    for (const clause of clauses) {
      if (clause.parent_id && byId.has(clause.parent_id)) {
        const list = children.get(clause.parent_id) ?? []
        list.push(clause)
        children.set(clause.parent_id, list)
      } else {
        roots.push(clause)
      }
    }

    const byCategory = new Map<string, { root: Clause; variants: Clause[] }[]>()
    for (const root of roots) {
      const list = byCategory.get(root.category) ?? []
      list.push({ root, variants: children.get(root.id) ?? [] })
      byCategory.set(root.category, list)
    }
    return [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [clauses])

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCreate = (parent?: Clause) => {
    setForm({
      ...EMPTY_FORM,
      category: parent?.category ?? '',
      clause_type: parent ? 'fallback' : 'standard',
      parent_id: parent?.id ?? ''
    })
    setShowForm(true)
  }

  const openEdit = (clause: Clause) => {
    setForm({
      id: clause.id,
      title: clause.title,
      category: clause.category,
      body: clause.body,
      clause_type: clause.clause_type,
      parent_id: clause.parent_id ?? '',
      risk_level: clause.risk_level,
      tags: clause.tags,
      guidance: clause.guidance
    })
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const payload = {
      title: form.title,
      category: form.category.trim() || 'General',
      body: form.body,
      clause_type: form.clause_type,
      parent_id: form.parent_id === '' ? null : Number(form.parent_id),
      risk_level: form.risk_level,
      tags: form.tags,
      guidance: form.guidance,
      actor
    }

    const res = form.id
      ? await window.api.clauses.update({ id: form.id, ...payload })
      : await window.api.clauses.create(payload)

    setSaving(false)
    if (res.success) {
      setShowForm(false)
      await load()
      flash(form.id ? 'Clause updated.' : 'Clause added.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const archive = async (clause: Clause) => {
    const res = await window.api.clauses.archive({
      id: clause.id,
      archived: !clause.is_archived,
      actor
    })
    if (res.success) {
      await load()
      flash(clause.is_archived ? 'Clause restored.' : 'Clause archived.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const remove = async (clause: Clause) => {
    const res = await window.api.clauses.delete({ id: clause.id, actor })
    if (res.success) {
      await load()
      flash('Clause deleted.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const copy = async (clause: Clause) => {
    await navigator.clipboard.writeText(clause.body)
    window.api.clauses.recordUsage(clause.id)
    flash(`"${clause.title}" copied to the clipboard.`)
  }

  const renderClause = (clause: Clause, isVariant: boolean) => (
    <div
      key={clause.id}
      className={`rounded-lg border p-3 ${
        isVariant ? 'border-slate-800 bg-slate-800/30 ml-6' : 'border-slate-800'
      } ${clause.is_archived ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium text-sm">{clause.title}</span>
            <Badge variant={clause.clause_type === 'standard' ? 'info' : 'neutral'}>
              {TYPE_LABELS[clause.clause_type]}
            </Badge>
            <Badge variant={RISK_VARIANTS[clause.risk_level]}>{clause.risk_level} risk</Badge>
            {clause.is_archived === 1 && <Badge variant="neutral">Archived</Badge>}
            {clause.usage_count > 0 && (
              <span className="text-slate-500 text-xs">used {clause.usage_count}×</span>
            )}
          </div>

          {clause.guidance && (
            <p className="text-slate-400 text-xs mt-1 italic">{clause.guidance}</p>
          )}

          <button
            onClick={() => toggle(clause.id)}
            className="text-slate-400 hover:text-white text-xs mt-2 flex items-center gap-1"
          >
            {expanded.has(clause.id) ? '▾ Hide text' : '▸ Show text'}
          </button>

          {expanded.has(clause.id) && (
            <p className="text-slate-300 text-sm mt-2 whitespace-pre-wrap bg-slate-900 border border-slate-800 rounded-lg p-3">
              {clause.body}
            </p>
          )}

          {clause.tags && (
            <div className="flex gap-1 flex-wrap mt-2">
              {clause.tags.split(',').map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400"
                >
                  {tag.trim()}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => copy(clause)}>
            Copy
          </Button>
          {canEdit && (
            <>
              <Button variant="ghost" size="sm" onClick={() => openEdit(clause)}>
                Edit
              </Button>
              {!isVariant && (
                <Button variant="ghost" size="sm" onClick={() => openCreate(clause)}>
                  + Fallback
                </Button>
              )}
              <button
                onClick={() => archive(clause)}
                className="text-slate-500 hover:text-amber-400 text-xs px-2"
                title={clause.is_archived ? 'Restore' : 'Archive'}
              >
                {clause.is_archived ? '↺' : '⌦'}
              </button>
              <RoleGuard minRole="super_admin">
                <button
                  onClick={() => remove(clause)}
                  className="text-slate-500 hover:text-red-400 text-lg leading-none px-1"
                  title="Delete"
                >
                  ×
                </button>
              </RoleGuard>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Clause Library</h1>
          <p className="text-slate-400 text-sm mt-1">
            Approved contract language, organised as standard positions with the fallbacks you can
            negotiate down to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span
              className={`text-xs ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {message}
            </span>
          )}
          <RoleGuard minRole="director">
            <Button onClick={() => openCreate()}>+ New Clause</Button>
          </RoleGuard>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-4 gap-4 items-end">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, body text, or tag…"
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
          <Select
            label="Type"
            value={clauseType}
            onChange={(e) => setClauseType(e.target.value as '' | ClauseType)}
            options={[
              { value: '', label: 'All types' },
              { value: 'standard', label: 'Standard' },
              { value: 'fallback', label: 'Fallback' },
              { value: 'alternative', label: 'Alternative' }
            ]}
          />
          <label className="flex items-center gap-2 text-slate-300 text-sm pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
        </div>
      </Card>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading clauses…</p>
      ) : grouped.length === 0 ? (
        <Card>
          <p className="text-slate-400 text-sm text-center py-6">
            No clauses match these filters.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([categoryName, items]) => (
            <div key={categoryName}>
              <h2 className="text-white font-semibold text-sm uppercase tracking-wide mb-2">
                {categoryName}
                <span className="text-slate-500 font-normal ml-2">({items.length})</span>
              </h2>
              <div className="space-y-2">
                {items.map(({ root, variants }) => (
                  <div key={root.id} className="space-y-2">
                    {renderClause(root, false)}
                    {variants.map((variant) => renderClause(variant, true))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={form.id ? 'Edit Clause' : 'New Clause'}
        width="max-w-2xl"
      >
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Limitation of Liability"
            required
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Risk & Liability"
              list="clause-categories"
            />
            <datalist id="clause-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Select
              label="Type"
              value={form.clause_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, clause_type: e.target.value as ClauseType }))
              }
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'fallback', label: 'Fallback' },
                { value: 'alternative', label: 'Alternative' }
              ]}
            />
            <Select
              label="Risk Level"
              value={form.risk_level}
              onChange={(e) => setForm((f) => ({ ...f, risk_level: e.target.value as ClauseRisk }))}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' }
              ]}
            />
          </div>

          {form.clause_type !== 'standard' && (
            <Select
              label="Variant of"
              value={form.parent_id}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  parent_id: e.target.value === '' ? '' : Number(e.target.value)
                }))
              }
              options={[
                { value: '', label: '(standalone)' },
                ...clauses
                  .filter((c) => c.clause_type === 'standard' && c.id !== form.id)
                  .map((c) => ({ value: c.id, label: `${c.category} — ${c.title}` }))
              ]}
            />
          )}

          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Clause Text</label>
            <textarea
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-40 resize-none"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="The exact language to insert into agreements…"
              required
            />
          </div>

          <Input
            label="Guidance"
            value={form.guidance}
            onChange={(e) => setForm((f) => ({ ...f, guidance: e.target.value }))}
            placeholder="When should a drafter reach for this? e.g. 'Fallback — needs Director sign-off'"
          />
          <Input
            label="Tags"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="Comma separated, e.g. liability, cap, damages"
          />

          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Add Clause'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
