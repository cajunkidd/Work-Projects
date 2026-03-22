import { useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import RoleGuard from '../components/layout/RoleGuard'
import type { Invoice } from '../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export default function InvoicesPage() {
  const { selectedDeptId } = useThemeStore()
  const { can } = useAuthStore()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [polling, setPolling] = useState(false)
  const [pollMsg, setPollMsg] = useState('')

  const load = () => {
    const opts: any = {}
    if (selectedDeptId) opts.department_id = selectedDeptId
    window.api.invoices.list(opts).then((res) => {
      if (res.success && res.data) setInvoices(res.data)
    })
  }

  useEffect(() => { load() }, [selectedDeptId])

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Invoices</h1>
          <p className="text-slate-400 text-sm">{invoices.length} invoices · {discrepancies.length} over budget</p>
        </div>
        <RoleGuard minRole="admin">
          <div className="flex items-center gap-3">
            {pollMsg && <span className="text-sm text-slate-300">{pollMsg}</span>}
            <Button onClick={handlePoll} disabled={polling} variant="secondary">
              {polling ? 'Polling...' : '🔄 Sync Gmail'}
            </Button>
          </div>
        </RoleGuard>
      </div>

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
