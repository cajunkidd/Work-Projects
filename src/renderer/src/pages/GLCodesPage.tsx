import { useEffect, useState } from 'react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import type { GLCode } from '../../../shared/types'

interface ImportRow {
  code: string
  description: string
  _duplicate: boolean
}

export default function GLCodesPage() {
  const [codes, setCodes] = useState<GLCode[]>([])
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')

  // Add / edit modal
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<GLCode | null>(null)
  const [form, setForm] = useState({ code: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  // Import preview
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = () => {
    window.api.glCodes.list().then((res) => {
      if (res.success && res.data) setCodes(res.data)
    })
  }

  useEffect(() => { load() }, [])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 3500)
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ code: '', description: '' })
    setFormErr('')
    setShowModal(true)
  }

  const openEdit = (g: GLCode) => {
    setEditing(g)
    setForm({ code: g.code, description: g.description })
    setFormErr('')
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormErr('')
    const res = editing
      ? await window.api.glCodes.update({ id: editing.id, code: form.code, description: form.description })
      : await window.api.glCodes.create({ code: form.code, description: form.description })
    setSaving(false)
    if (res.success) {
      setShowModal(false)
      load()
      flash(editing ? 'GL code updated' : 'GL code added')
    } else {
      setFormErr(res.error || 'Save failed')
    }
  }

  const toggleActive = async (g: GLCode) => {
    await window.api.glCodes.update({ id: g.id, is_active: g.is_active ? 0 : 1 })
    load()
  }

  const handleDelete = async (g: GLCode) => {
    const inUse = (g.contract_count || 0) + (g.invoice_count || 0)
    const warn = inUse > 0
      ? `\n\nIt is currently assigned to ${g.contract_count || 0} contract(s) and ${g.invoice_count || 0} invoice(s); those will be left without a GL code.`
      : ''
    if (!confirm(`Delete GL code "${g.code}"?${warn}`)) return
    await window.api.glCodes.delete(g.id)
    load()
    flash(`Deleted ${g.code}`)
  }

  const handleImport = async () => {
    setImporting(true)
    const res = await window.api.glCodes.parseImport()
    setImporting(false)
    if (res.success && res.data) {
      setImportRows(res.data)
    } else if (res.error && res.error !== 'No file selected') {
      flash(`Import error: ${res.error}`)
    }
  }

  const applyImport = async () => {
    if (!importRows) return
    setApplying(true)
    const res = await window.api.glCodes.bulkCreate(
      importRows.map((r) => ({ code: r.code, description: r.description }))
    )
    setApplying(false)
    if (res.success && res.data) {
      setImportRows(null)
      load()
      flash(`Imported ${res.data.created} new code(s), skipped ${res.data.skipped} existing`)
    } else {
      flash(`Import failed: ${res.error}`)
    }
  }

  const newInImport = importRows?.filter((r) => !r._duplicate).length ?? 0
  const dupInImport = importRows?.filter((r) => r._duplicate).length ?? 0

  const filtered = codes.filter((g) => {
    if (!search) return true
    const q = search.toLowerCase()
    return g.code.toLowerCase().includes(q) || g.description.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">GL Codes</h1>
          <p className="text-slate-400 text-sm">
            {codes.length} general ledger code{codes.length !== 1 ? 's' : ''} · assign these to contracts and invoices
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-emerald-400">{msg}</span>}
          <Button variant="ghost" onClick={handleImport} disabled={importing}>
            {importing ? 'Opening...' : '↑ Import from Spreadsheet'}
          </Button>
          <Button onClick={openAdd}>+ Add GL Code</Button>
        </div>
      </div>

      {/* Import preview */}
      {importRows && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold">Import Preview</p>
              <p className="text-slate-400 text-xs mt-0.5">
                {newInImport} new · {dupInImport} already exist (will be skipped)
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setImportRows(null)}>Cancel</Button>
              <Button onClick={applyImport} disabled={applying || newInImport === 0}>
                {applying ? 'Importing...' : `Import ${newInImport} Code(s)`}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 text-xs uppercase pb-2 pr-4">Code</th>
                  <th className="text-left text-slate-400 text-xs uppercase pb-2 pr-4">Description</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800 last:border-0">
                    <td className="py-2 pr-4 text-white font-mono">{row.code}</td>
                    <td className="py-2 pr-4 text-slate-300">{row.description || '—'}</td>
                    <td className="py-2 text-right">
                      {row._duplicate ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400">Exists</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300">New</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Search */}
      <Input
        placeholder="Search by code or description..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Codes table */}
      <Card>
        {filtered.length === 0 ? (
          <p className="text-slate-400 text-center py-12">
            {codes.length === 0
              ? 'No GL codes yet. Add one, or import your company GL codes from a spreadsheet.'
              : 'No GL codes match your search.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="text-slate-400 text-xs uppercase tracking-wide pb-2 pr-4">Code</th>
                  <th className="text-slate-400 text-xs uppercase tracking-wide pb-2 pr-4">Description</th>
                  <th className="text-slate-400 text-xs uppercase tracking-wide pb-2 px-3 text-center">Contracts</th>
                  <th className="text-slate-400 text-xs uppercase tracking-wide pb-2 px-3 text-center">Invoices</th>
                  <th className="text-slate-400 text-xs uppercase tracking-wide pb-2 px-3 text-center">Status</th>
                  <th className="text-slate-400 text-xs uppercase tracking-wide pb-2 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                    <td className="py-2.5 pr-4">
                      <span className="text-white font-mono font-medium">{g.code}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{g.description || '—'}</td>
                    <td className="py-2.5 px-3 text-center text-slate-300">{g.contract_count || 0}</td>
                    <td className="py-2.5 px-3 text-center text-slate-300">{g.invoice_count || 0}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button onClick={() => toggleActive(g)} title="Toggle active">
                        <Badge variant={g.is_active ? 'success' : 'neutral'}>
                          {g.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </button>
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(g)}
                        className="text-slate-400 hover:text-white text-xs transition-colors mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(g)}
                        className="text-slate-500 hover:text-red-400 text-xs transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit GL Code' : 'Add GL Code'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="GL Code"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="e.g. 6100-200"
            required
            autoFocus
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="e.g. IT Software & Subscriptions"
          />
          {formErr && <p className="text-red-400 text-sm">{formErr}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={saving} className="flex-1 justify-center">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add GL Code'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
