import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Input from '../ui/Input'

interface Clause {
  id: number
  title: string
  category: string
  body_html: string
  description: string
  approved: number
  created_at: string
}

const emptyForm = {
  title: '',
  category: 'general',
  description: '',
  body_html: '',
  approved: 1
}

export default function ClauseLibrarySection() {
  const [clauses, setClauses] = useState<Clause[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = () => {
    window.api.clauses.list().then((res: any) => {
      if (res.success && res.data) setClauses(res.data)
    })
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const startEdit = (c: Clause) => {
    setEditingId(c.id)
    setForm({
      title: c.title,
      category: c.category,
      description: c.description,
      body_html: c.body_html,
      approved: c.approved
    })
  }

  const save = async () => {
    if (!form.title.trim() || !form.body_html.trim()) return
    setSaving(true)
    if (editingId) {
      await window.api.clauses.update({ id: editingId, ...form })
    } else {
      await window.api.clauses.create(form)
    }
    setSaving(false)
    resetForm()
    load()
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this clause? It will be removed from the library.')) return
    await window.api.clauses.delete(id)
    load()
  }

  // Group by category for display
  const grouped = clauses.reduce<Record<string, Clause[]>>((acc, c) => {
    ;(acc[c.category] ??= []).push(c)
    return acc
  }, {})

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
        Clause Library
      </h2>

      <Card>
        <p className="text-slate-400 text-sm mb-4">
          Reusable clauses (payment terms, termination, confidentiality, indemnity, governing law).
          Insert them into any contract you're drafting on the Contract Creation tab.
        </p>

        {clauses.length === 0 ? (
          <p className="text-slate-400 text-sm mb-4">No clauses yet. Add one below.</p>
        ) : (
          <div className="space-y-4 mb-4">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, items]) => (
                <div key={category}>
                  <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">{category}</p>
                  <div className="space-y-2">
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start justify-between gap-3 py-2 border-b border-slate-800 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">{c.title}</p>
                          {c.description && (
                            <p className="text-slate-400 text-xs">{c.description}</p>
                          )}
                          <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">
                            {c.body_html.replace(/<[^>]+>/g, '').slice(0, 120)}
                            {c.body_html.length > 120 && '…'}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => startEdit(c)}
                            className="text-xs text-slate-400 hover:text-white px-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => remove(c.id)}
                            className="text-xs text-slate-500 hover:text-red-400 px-2"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        <div className="pt-3 border-t border-slate-800 space-y-3">
          <p className="text-white text-sm font-semibold">
            {editingId ? 'Edit Clause' : 'New Clause'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Title"
              placeholder="e.g. Standard Termination for Convenience"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Input
              label="Category"
              placeholder="e.g. termination, payment, confidentiality"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
          <Input
            label="Description (optional)"
            placeholder="When should this clause be used?"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">
              Body (HTML — use &lt;p&gt;…&lt;/p&gt; for paragraphs)
            </label>
            <textarea
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none w-full placeholder-slate-500 font-mono text-xs"
              rows={6}
              placeholder="<p>Either party may terminate this agreement upon thirty (30) days' written notice…</p>"
              value={form.body_html}
              onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.body_html.trim()}>
              {saving ? 'Saving…' : editingId ? 'Update Clause' : 'Add Clause'}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={resetForm}>Cancel</Button>
            )}
          </div>
        </div>
      </Card>
    </section>
  )
}
