import { useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import RoleGuard from '../components/layout/RoleGuard'
import type { Invoice } from '../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export default function InvoicesPage() {
  const { selectedDeptId } = useThemeStore()
  const { can } = useAuthStore()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [search, setSearch] = useState('')
  const [polling, setPolling] = useState(false)
  const [pollMsg, setPollMsg] = useState('')

  const load = () => {
    const opts: any = {}
    if (selectedDeptId) opts.department_id = selectedDeptId
    if (search) opts.search = search
    window.api.invoices.list(opts).then((res) => {
      if (res.success && res.data) setInvoices(res.data)
    })
  }

  useEffect(() => { load() }, [selectedDeptId, search])

  const handlePoll = async () => {
    setPolling(true)
    setPollMsg('')
    const res = await window.api.gmail.poll()
    setPolling(false)
    if (res.success) {
      setPollMsg(`Imported ${res.data} new invoice(s)`)
      load()
    } else {
      setPollMsg(res.error || 'Poll failed — is Gmail connected?')
    }
    setTimeout(() => setPollMsg(''), 4000)
  }

  const handleDelete = async (id: number) => {
    await window.api.invoices.delete(id)
    setInvoices((prev) => prev.filter((i) => i.id !== id))
  }

  const discrepancies = invoices.filter((i) => i.amount > (i.budgeted_amount || 0) * 1.05)

  // Inline GL code editing
  const [editingGl, setEditingGl] = useState<number | null>(null)
  const [glDraft, setGlDraft] = useState('')

  const saveGlCode = async (id: number) => {
    await window.api.invoices.update({ id, gl_code: glDraft })
    setEditingGl(null)
    load()
  }

  const [exportMsg, setExportMsg] = useState('')

  const handleGpExport = async () => {
    const res = await window.api.exports.gpImport(invoices)
    if (res.success) {
      setExportMsg('GP file exported!')
      setTimeout(() => setExportMsg(''), 3000)
    } else if (res.error !== 'Cancelled') {
      setExportMsg(`Error: ${res.error}`)
      setTimeout(() => setExportMsg(''), 4000)
    }
  }

  const handleExport = async () => {
    const res = await window.api.exports.invoices(invoices)
    if (res.success) {
      setExportMsg('Exported!')
      setTimeout(() => setExportMsg(''), 3000)
    } else if (res.error !== 'Cancelled') {
      setExportMsg(`Error: ${res.error}`)
      setTimeout(() => setExportMsg(''), 4000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Invoices</h1>
          <p className="text-slate-400 text-sm">{invoices.length} invoices · {discrepancies.length} over budget</p>
        </div>
        <div className="flex items-center gap-3">
          {exportMsg && <span className={`text-sm ${exportMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{exportMsg}</span>}
          <Button variant="ghost" onClick={handleGpExport} disabled={invoices.length === 0}>Export GP</Button>
          <Button variant="ghost" onClick={handleExport} disabled={invoices.length === 0}>Export XLSX</Button>
          <RoleGuard minRole="admin">
            <div className="flex items-center gap-3">
              {pollMsg && <span className="text-sm text-slate-300">{pollMsg}</span>}
              <Button onClick={handlePoll} disabled={polling} variant="secondary">
                {polling ? 'Polling...' : '🔄 Sync Gmail'}
              </Button>
            </div>
          </RoleGuard>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by GL code, subject, sender, or vendor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {/* Discrepancy alert */}
      {discrepancies.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-amber-400 font-semibold">⚠ {discrepancies.length} invoice(s) exceed budgeted amount by more than 5%</p>
          <p className="text-amber-400/70 text-sm mt-1">Review flagged invoices below</p>
        </div>
      )}

      {/* Invoices list */}
      <div className="space-y-3">
        {invoices.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-slate-400">No invoices. Connect Gmail in Settings and sync to import vendor billing emails.</p>
          </Card>
        ) : (
          invoices.map((inv) => {
            const overBudget = inv.budgeted_amount > 0 && inv.amount > inv.budgeted_amount * 1.05
            const diff = inv.amount - inv.budgeted_amount
            return (
              <Card key={inv.id} className={overBudget ? 'border-amber-500/30' : ''}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-medium truncate">{inv.subject}</p>
                      {overBudget && <Badge variant="warning">Over Budget</Badge>}
                    </div>
                    <p className="text-slate-400 text-sm">From: {inv.sender}</p>
                    <p className="text-slate-400 text-sm">Received: {inv.received_date}</p>
                    {inv.vendor_name && (
                      <p className="text-slate-400 text-sm">Vendor: <span className="text-slate-300">{inv.vendor_name}</span></p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-slate-400 text-sm">GL:</span>
                      {editingGl === inv.id ? (
                        <span className="flex items-center gap-1">
                          <input
                            className="bg-slate-900 border border-slate-600 text-white text-xs rounded px-2 py-0.5 w-32 focus:outline-none"
                            value={glDraft}
                            onChange={(e) => setGlDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveGlCode(inv.id); if (e.key === 'Escape') setEditingGl(null) }}
                            autoFocus
                          />
                          <button onClick={() => saveGlCode(inv.id)} className="text-emerald-400 text-xs hover:text-emerald-300">Save</button>
                          <button onClick={() => setEditingGl(null)} className="text-slate-500 text-xs hover:text-slate-300">Cancel</button>
                        </span>
                      ) : (
                        <button
                          onClick={() => { setEditingGl(inv.id); setGlDraft(inv.gl_code || '') }}
                          className="text-slate-300 text-sm hover:text-white transition-colors"
                        >
                          {inv.gl_code || <span className="text-slate-500 italic">add code</span>}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-white font-bold text-lg">{fmt(inv.amount)}</p>
                    {inv.budgeted_amount > 0 && (
                      <p className="text-slate-400 text-sm">Budget: {fmt(inv.budgeted_amount)}</p>
                    )}
                    {inv.budgeted_amount > 0 && (
                      <Badge variant={overBudget ? 'danger' : 'success'}>
                        {diff >= 0 ? '+' : ''}{fmt(diff)}
                      </Badge>
                    )}
                    <RoleGuard minRole="editor">
                      <div>
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="text-slate-500 hover:text-red-400 text-xs transition-colors mt-1"
                        >
                          Remove
                        </button>
                      </div>
                    </RoleGuard>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
