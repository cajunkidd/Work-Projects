import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import RoleGuard from '../components/layout/RoleGuard'
import type {
  Contract, ContractLineItem, RenewalHistory, VendorNote, VendorProject, CompetitorOffering,
  ContractAllocation
} from '../../../shared/types'
import AllocationEditor, { type AllocationRow } from '../components/contracts/AllocationEditor'

const BASE_TABS = ['Overview', 'Line Items', 'Renewals', 'Notes', 'Projects', 'Competitors']

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { brandPrimary } = useThemeStore()
  const contractId = parseInt(id!)

  const [contract, setContract] = useState<Contract | null>(null)
  const [activeTab, setActiveTab] = useState('Overview')
  const [lineItems, setLineItems] = useState<ContractLineItem[]>([])
  const [renewals, setRenewals] = useState<RenewalHistory[]>([])
  const [notes, setNotes] = useState<VendorNote[]>([])
  const [projects, setProjects] = useState<VendorProject[]>([])
  const [competitors, setCompetitors] = useState<CompetitorOffering[]>([])

  // Modals
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [showCompetitorModal, setShowCompetitorModal] = useState(false)

  // Allocations (IT contracts only)
  const [allocations, setAllocations] = useState<ContractAllocation[]>([])
  const [editingAllocations, setEditingAllocations] = useState(false)
  const [draftAllocations, setDraftAllocations] = useState<AllocationRow[]>([])
  const [savingAllocations, setSavingAllocations] = useState(false)
  const [assetSummary, setAssetSummary] = useState<{ totalMachines: number; branchCount: number } | null>(null)
  const [editingGl, setEditingGl] = useState(false)
  const [glDraft, setGlDraft] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  const [allBranches, setAllBranches] = useState<import('../../../shared/types').Branch[]>([])
  const [allDepartments, setAllDepartments] = useState<import('../../../shared/types').Department[]>([])

  // Forms
  const [renewalForm, setRenewalForm] = useState({ renewal_date: '', prev_cost: '', new_cost: '', license_count_change: '0', reason: '' })
  const [noteText, setNoteText] = useState('')
  const [projectForm, setProjectForm] = useState({ name: '', status: 'active', start_date: '', end_date: '', description: '' })
  const [competitorForm, setCompetitorForm] = useState({ competitor_vendor: '', offering_name: '', price: '', notes: '' })

  useEffect(() => {
    window.api.contracts.get(contractId).then((res) => {
      if (res.success && res.data) setContract(res.data)
    })
    window.api.lineItems.list(contractId).then((res) => {
      if (res.success && res.data) setLineItems(res.data)
    })
    window.api.renewals.list(contractId).then((res) => {
      if (res.success && res.data) setRenewals(res.data)
    })
    window.api.notes.list(contractId).then((res) => {
      if (res.success && res.data) setNotes(res.data)
    })
    window.api.projects.list({ contract_id: contractId }).then((res) => {
      if (res.success && res.data) setProjects(res.data)
    })
    window.api.competitors.list(contractId).then((res) => {
      if (res.success && res.data) setCompetitors(res.data)
    })
    window.api.allocations.list(contractId).then((res) => {
      if (res.success && res.data) setAllocations(res.data)
    })
    window.api.branches.list().then((res) => {
      if (res.success && res.data) setAllBranches(res.data)
    })
    window.api.departments.list().then((res) => {
      if (res.success && res.data) setAllDepartments(res.data)
    })
  }, [contractId])

  const saveLineItems = async () => {
    await window.api.lineItems.upsert(lineItems)
    const res = await window.api.lineItems.list(contractId)
    if (res.success && res.data) setLineItems(res.data)
  }

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { id: 0, contract_id: contractId, description: '', quantity: 1, unit_price: 0, total_price: 0 }])
  }

  const updateLineItem = (i: number, key: keyof ContractLineItem, value: string | number) => {
    setLineItems((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], [key]: value }
      if (key === 'quantity' || key === 'unit_price') {
        next[i].total_price = next[i].quantity * next[i].unit_price
      }
      return next
    })
  }

  const deleteLineItem = async (i: number, item: ContractLineItem) => {
    if (item.id) await window.api.lineItems.delete(item.id)
    setLineItems((prev) => prev.filter((_, idx) => idx !== i))
  }

  const saveRenewal = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.api.renewals.create({
      contract_id: contractId,
      renewal_date: renewalForm.renewal_date,
      prev_cost: parseFloat(renewalForm.prev_cost) || 0,
      new_cost: parseFloat(renewalForm.new_cost) || 0,
      license_count_change: parseInt(renewalForm.license_count_change) || 0,
      reason: renewalForm.reason
    })
    const res = await window.api.renewals.list(contractId)
    if (res.success && res.data) setRenewals(res.data)
    setShowRenewalModal(false)
    setRenewalForm({ renewal_date: '', prev_cost: '', new_cost: '', license_count_change: '0', reason: '' })
  }

  const saveNote = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.api.notes.create({ contract_id: contractId, note: noteText, created_by: user?.name || 'Unknown' })
    const res = await window.api.notes.list(contractId)
    if (res.success && res.data) setNotes(res.data)
    setShowNoteModal(false)
    setNoteText('')
  }

  const saveProject = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.api.projects.create({ contract_id: contractId, ...projectForm } as any)
    const res = await window.api.projects.list({ contract_id: contractId })
    if (res.success && res.data) setProjects(res.data)
    setShowProjectModal(false)
    setProjectForm({ name: '', status: 'active', start_date: '', end_date: '', description: '' })
  }

  const saveCompetitor = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.api.competitors.create({
      contract_id: contractId,
      competitor_vendor: competitorForm.competitor_vendor,
      offering_name: competitorForm.offering_name,
      price: parseFloat(competitorForm.price) || 0,
      notes: competitorForm.notes
    })
    const res = await window.api.competitors.list(contractId)
    if (res.success && res.data) setCompetitors(res.data)
    setShowCompetitorModal(false)
    setCompetitorForm({ competitor_vendor: '', offering_name: '', price: '', notes: '' })
  }

  const isDeptContract = contract?.department_id !== null && contract?.branch_id === null
  const tabs = isDeptContract ? [...BASE_TABS, 'Allocations'] : BASE_TABS

  const saveAllocations = async () => {
    if (!contract) return
    setSavingAllocations(true)
    const toSave = draftAllocations
      .filter((r) => r.targetId && r.value)
      .map((r) => ({
        contract_id: contract.id,
        branch_id: r.target === 'branch' ? parseInt(r.targetId) : null,
        department_id: r.target === 'department' ? parseInt(r.targetId) : null,
        allocation_type: r.allocationType,
        value: parseFloat(r.value)
      }))
    await window.api.allocations.save(contract.id, toSave)
    const res = await window.api.allocations.list(contract.id)
    if (res.success && res.data) setAllocations(res.data)
    setSavingAllocations(false)
    setEditingAllocations(false)
  }

  const handleCalculateFromAssets = async () => {
    const res = await window.api.assets.list()
    if (!res.success || !res.data) return

    // Only computers, thin clients, and servers count toward per-machine contract allocations.
    // Printers and Ingenicos are excluded.
    const CONTRACT_TYPES = new Set(['computer', 'thin_client', 'server'])

    const branchTotals = new Map<string, { name: string; total: number }>()
    for (const a of res.data) {
      if (!CONTRACT_TYPES.has(a.asset_type)) continue
      const key = String(a.branch_id)
      const entry = branchTotals.get(key) ?? { name: `#${a.branch_number ?? ''} – ${a.branch_name ?? ''}`, total: 0 }
      entry.total += a.count
      branchTotals.set(key, entry)
    }

    // Filter branches with at least 1 device
    const active = [...branchTotals.entries()].filter(([, v]) => v.total > 0)
    const grandTotal = active.reduce((s, [, v]) => s + v.total, 0)
    if (grandTotal === 0) return

    const rows: AllocationRow[] = active.map(([branchId, v]) => ({
      target: 'branch',
      targetId: branchId,
      allocationType: 'percentage',
      value: ((v.total / grandTotal) * 100).toFixed(2)
    }))

    setDraftAllocations(rows)
    setAssetSummary({ totalMachines: grandTotal, branchCount: active.length })
  }

  const handleExport = async () => {
    if (!contract) return
    const res = await window.api.exports.contractDetail({
      contract,
      lineItems,
      renewals,
      notes,
      projects,
      competitors,
      allocations
    })
    if (res.success) {
      setExportMsg('Exported!')
      setTimeout(() => setExportMsg(''), 3000)
    } else if (res.error !== 'Cancelled') {
      setExportMsg(`Error: ${res.error}`)
      setTimeout(() => setExportMsg(''), 4000)
    }
  }

  if (!contract) {
    return <div className="text-slate-400 text-center py-20">Loading...</div>
  }

  const renewalTrendData = [...renewals].reverse().map((r) => ({
    date: r.renewal_date,
    cost: r.new_cost
  }))
  if (contract.annual_cost) {
    renewalTrendData.unshift({ date: contract.start_date, cost: contract.annual_cost })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/contracts')} className="text-slate-400 hover:text-white text-sm mb-2 flex items-center gap-1">
            ← Back to Contracts
          </button>
          <h1 className="text-white text-2xl font-bold">{contract.vendor_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={contract.status === 'active' ? 'success' : contract.status === 'expiring_soon' ? 'warning' : 'danger'}>
              {contract.status.replace('_', ' ')}
            </Badge>
            <span className="text-slate-400 text-sm">{contract.department_name}</span>
            {contract.gl_code && <span className="text-slate-400 text-sm">· GL: {contract.gl_code}</span>}
            {contract.days_until_renewal !== undefined && contract.days_until_renewal >= 0 && (
              <span className="text-slate-400 text-sm">· {contract.days_until_renewal} days to renewal</span>
            )}
          </div>
        </div>
        <div className="text-right space-y-2">
          <p className="text-white text-2xl font-bold">{fmt(contract.annual_cost)}<span className="text-slate-400 text-sm font-normal">/yr</span></p>
          <p className="text-slate-400">{fmt(contract.monthly_cost)}/mo</p>
          <div className="flex items-center justify-end gap-2">
            {exportMsg && <span className={`text-xs ${exportMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{exportMsg}</span>}
            <Button variant="ghost" onClick={handleExport}>Export</Button>
          </div>
        </div>
      </div>

      {/* Quick info */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Start Date', value: contract.start_date },
          { label: 'End Date', value: contract.end_date },
          { label: 'POC', value: contract.poc_name || '—' },
          { label: 'Total Value', value: fmt(contract.total_cost) }
        ].map((item) => (
          <Card key={item.label}>
            <p className="text-slate-400 text-xs">{item.label}</p>
            <p className="text-white font-semibold mt-0.5">{item.value}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'text-white border-current'
                : 'text-slate-400 hover:text-white border-transparent'
            }`}
            style={activeTab === tab ? { borderColor: brandPrimary, color: 'white' } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <Card>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-white font-semibold">Vendor Contact</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-400">Name: </span><span className="text-white">{contract.poc_name || '—'}</span></div>
                <div><span className="text-slate-400">Email: </span><span className="text-white">{contract.poc_email || '—'}</span></div>
                <div><span className="text-slate-400">Phone: </span><span className="text-white">{contract.poc_phone || '—'}</span></div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-semibold">GL Code</h3>
              <div className="flex items-center gap-2">
                {editingGl ? (
                  <>
                    <input
                      className="bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 w-40 focus:outline-none"
                      value={glDraft}
                      onChange={(e) => setGlDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          window.api.contracts.update({ id: contractId, gl_code: glDraft }).then(() => {
                            setContract((c) => c ? { ...c, gl_code: glDraft } : c)
                            setEditingGl(false)
                          })
                        }
                        if (e.key === 'Escape') setEditingGl(false)
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        window.api.contracts.update({ id: contractId, gl_code: glDraft }).then(() => {
                          setContract((c) => c ? { ...c, gl_code: glDraft } : c)
                          setEditingGl(false)
                        })
                      }}
                      className="text-emerald-400 text-xs hover:text-emerald-300"
                    >Save</button>
                    <button onClick={() => setEditingGl(false)} className="text-slate-500 text-xs hover:text-slate-300">Cancel</button>
                  </>
                ) : (
                  <button
                    onClick={() => { setGlDraft(contract.gl_code || ''); setEditingGl(true) }}
                    className="text-white text-sm hover:text-slate-300 transition-colors"
                  >
                    {contract.gl_code || <span className="text-slate-500 italic">Click to add GL code</span>}
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-white font-semibold">Contract File</h3>
              {contract.file_path ? (
                <p className="text-slate-300 text-sm truncate">{contract.file_path}</p>
              ) : (
                <p className="text-slate-400 text-sm">No file attached</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'Line Items' && (
        <div className="space-y-4">
          <RoleGuard minRole="editor">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={addLineItem}>+ Add Line Item</Button>
              <Button onClick={saveLineItems}>Save Changes</Button>
            </div>
          </RoleGuard>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-800">
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium w-24">Quantity</th>
                  <th className="pb-2 font-medium w-32">Unit Price</th>
                  <th className="pb-2 font-medium w-32">Total</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-slate-800/50 last:border-0">
                    <td className="py-2 pr-4">
                      <input
                        className="bg-transparent text-white w-full focus:outline-none border-b border-transparent focus:border-slate-600"
                        value={item.description}
                        onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                        placeholder="Description..."
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        className="bg-transparent text-white w-full focus:outline-none border-b border-transparent focus:border-slate-600"
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        className="bg-transparent text-white w-full focus:outline-none border-b border-transparent focus:border-slate-600"
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="py-2 text-white">{fmt(item.total_price)}</td>
                    <td className="py-2">
                      <RoleGuard minRole="editor">
                        <button onClick={() => deleteLineItem(i, item)} className="text-slate-500 hover:text-red-400 text-lg">×</button>
                      </RoleGuard>
                    </td>
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-slate-400 text-center">No line items. Add one above.</td></tr>
                )}
              </tbody>
              {lineItems.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-700">
                    <td colSpan={3} className="pt-2 text-right text-slate-400 pr-4 font-medium">Total</td>
                    <td className="pt-2 text-white font-bold">{fmt(lineItems.reduce((s, i) => s + i.total_price, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>
        </div>
      )}

      {activeTab === 'Renewals' && (
        <div className="space-y-4">
          <RoleGuard minRole="editor">
            <Button onClick={() => setShowRenewalModal(true)}>+ Log Renewal</Button>
          </RoleGuard>
          {renewalTrendData.length > 1 && (
            <Card>
              <p className="text-white font-semibold mb-4">Cost Trend</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={renewalTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [fmt(v), 'Annual Cost']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="cost" stroke={brandPrimary} strokeWidth={2} dot={{ fill: brandPrimary, r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
          <div className="space-y-2">
            {renewals.map((r) => (
              <Card key={r.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium">{r.renewal_date}</p>
                    <p className="text-slate-400 text-sm mt-1">{r.reason}</p>
                    {r.license_count_change !== 0 && (
                      <p className="text-slate-400 text-xs mt-1">
                        License change: <span className={r.license_count_change > 0 ? 'text-emerald-400' : 'text-red-400'}>{r.license_count_change > 0 ? '+' : ''}{r.license_count_change}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-sm">{fmt(r.prev_cost)} → <span className={r.new_cost > r.prev_cost ? 'text-red-400' : 'text-emerald-400'}>{fmt(r.new_cost)}</span></p>
                    <Badge variant={r.new_cost > r.prev_cost ? 'danger' : 'success'}>
                      {r.new_cost > r.prev_cost ? '+' : ''}{(((r.new_cost - r.prev_cost) / (r.prev_cost || 1)) * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
            {renewals.length === 0 && <p className="text-slate-400 text-sm">No renewal history logged.</p>}
          </div>
        </div>
      )}

      {activeTab === 'Notes' && (
        <div className="space-y-4">
          <RoleGuard minRole="editor">
            <Button onClick={() => setShowNoteModal(true)}>+ Add Note</Button>
          </RoleGuard>
          <div className="space-y-3">
            {notes.map((n) => (
              <Card key={n.id}>
                <p className="text-white text-sm whitespace-pre-wrap">{n.note}</p>
                <p className="text-slate-400 text-xs mt-2">{n.created_by} · {n.created_at}</p>
              </Card>
            ))}
            {notes.length === 0 && <p className="text-slate-400 text-sm">No notes yet.</p>}
          </div>
        </div>
      )}

      {activeTab === 'Projects' && (
        <div className="space-y-4">
          <RoleGuard minRole="editor">
            <Button onClick={() => setShowProjectModal(true)}>+ Add Project</Button>
          </RoleGuard>
          <div className="space-y-3">
            {projects.map((p) => (
              <Card key={p.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-semibold">{p.name}</p>
                    <p className="text-slate-400 text-sm mt-1">{p.description}</p>
                    {(p.start_date || p.end_date) && (
                      <p className="text-slate-400 text-xs mt-1">{p.start_date} → {p.end_date}</p>
                    )}
                  </div>
                  <Badge variant={p.status === 'active' ? 'success' : p.status === 'on_hold' ? 'warning' : 'neutral'}>
                    {p.status.replace('_', ' ')}
                  </Badge>
                </div>
              </Card>
            ))}
            {projects.length === 0 && <p className="text-slate-400 text-sm">No projects yet.</p>}
          </div>
        </div>
      )}

      {activeTab === 'Competitors' && (
        <div className="space-y-4">
          <RoleGuard minRole="editor">
            <Button onClick={() => setShowCompetitorModal(true)}>+ Add Competitor Offering</Button>
          </RoleGuard>
          {/* Comparison table */}
          {competitors.length > 0 && (
            <Card>
              <p className="text-white font-semibold mb-4">Side-by-Side Comparison</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800 text-left">
                      <th className="pb-2 font-medium">Vendor</th>
                      <th className="pb-2 font-medium">Offering</th>
                      <th className="pb-2 font-medium">Price/yr</th>
                      <th className="pb-2 font-medium">vs Current</th>
                      <th className="pb-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-800">
                      <td className="py-2 font-medium text-white">{contract.vendor_name} (Current)</td>
                      <td className="py-2 text-slate-300">—</td>
                      <td className="py-2 text-white font-bold">{fmt(contract.annual_cost)}</td>
                      <td className="py-2">—</td>
                      <td className="py-2">—</td>
                    </tr>
                    {competitors.map((c) => {
                      const diff = c.price - contract.annual_cost
                      return (
                        <tr key={c.id} className="border-b border-slate-800 last:border-0">
                          <td className="py-2 text-slate-300">{c.competitor_vendor}</td>
                          <td className="py-2 text-slate-300">{c.offering_name}</td>
                          <td className="py-2 text-white">{fmt(c.price)}</td>
                          <td className="py-2">
                            <Badge variant={diff < 0 ? 'success' : 'danger'}>
                              {diff < 0 ? '' : '+'}{fmt(diff)}
                            </Badge>
                          </td>
                          <td className="py-2 text-slate-400 text-xs">{c.notes}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'Allocations' && isDeptContract && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold">Cost Allocations</p>
              <p className="text-slate-400 text-xs mt-0.5">
                Split this IT contract's cost across branches/departments.
              </p>
            </div>
            <RoleGuard minRole="super_admin">
              {!editingAllocations ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraftAllocations(
                      allocations.map((a) => ({
                        target: a.branch_id !== null ? 'branch' : 'department',
                        targetId: String(a.branch_id ?? a.department_id ?? ''),
                        allocationType: a.allocation_type,
                        value: String(a.value)
                      }))
                    )
                    setEditingAllocations(true)
                  }}
                >
                  {allocations.length > 0 ? 'Edit Allocations' : 'Add Allocations'}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={saveAllocations} disabled={savingAllocations}>
                    {savingAllocations ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingAllocations(false)}>Cancel</Button>
                </div>
              )}
            </RoleGuard>
          </div>

          {editingAllocations ? (
            <>
              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                <button
                  onClick={handleCalculateFromAssets}
                  className="text-sm px-3 py-1.5 rounded-lg bg-blue-900/50 text-blue-300 border border-blue-700/50 hover:bg-blue-800/50 transition-colors font-medium"
                >
                  Calculate from Assets
                </button>
                {assetSummary ? (
                  <span className="text-slate-400 text-xs">
                    Based on {assetSummary.totalMachines.toLocaleString()} total machines across {assetSummary.branchCount} branches
                  </span>
                ) : (
                  <span className="text-slate-500 text-xs">
                    Auto-fill branch percentages based on device counts from the Assets page
                  </span>
                )}
              </div>
              <AllocationEditor
                allocations={draftAllocations}
                onChange={setDraftAllocations}
                branches={allBranches}
                departments={allDepartments}
                annualCost={contract.annual_cost}
              />
            </>
          ) : allocations.length === 0 ? (
            <p className="text-slate-400 text-sm">
              No allocations set — full cost is charged to IT department.
            </p>
          ) : (
            <div>
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-3 pb-2 border-b border-slate-700 mb-1">
                <span className="col-span-4 text-slate-500 text-xs uppercase tracking-wide">Recipient</span>
                <span className="col-span-2 text-slate-500 text-xs uppercase tracking-wide">Type</span>
                <span className="col-span-2 text-slate-500 text-xs uppercase tracking-wide text-right">Allocation</span>
                <span className="col-span-4 text-slate-500 text-xs uppercase tracking-wide text-right">Annual Amount</span>
              </div>
              {allocations.map((a) => {
                const name = a.branch_id !== null
                  ? `#${a.branch_number ?? ''} – ${a.branch_name}`
                  : a.department_name
                const amount = a.allocation_type === 'percentage'
                  ? contract.annual_cost * a.value / 100
                  : a.value
                return (
                  <div key={a.id} className="grid grid-cols-12 gap-3 items-center py-2.5 border-b border-slate-800 last:border-0">
                    <div className="col-span-4 flex items-center gap-2">
                      <span className="text-white text-sm">{name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        a.branch_id !== null ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
                      }`}>
                        {a.branch_id !== null ? 'Branch' : 'Dept'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 text-xs">{a.allocation_type === 'percentage' ? 'Percentage' : 'Fixed Amount'}</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-white text-sm font-medium">
                        {a.allocation_type === 'percentage' ? `${a.value}%` : fmt(a.value)}
                      </span>
                    </div>
                    <div className="col-span-4 text-right">
                      <span className="text-emerald-400 text-sm font-medium">{fmt(amount)}/yr</span>
                    </div>
                  </div>
                )
              })}
              {/* Total row */}
              {allocations.some((a) => a.allocation_type === 'percentage') && (
                <div className="grid grid-cols-12 gap-3 items-center pt-3 mt-1 border-t border-slate-700">
                  <span className="col-span-4 text-slate-400 text-xs">Total allocated</span>
                  <span className="col-span-2"></span>
                  <span className="col-span-2 text-right text-slate-300 text-sm font-medium">
                    {allocations.filter(a => a.allocation_type === 'percentage').reduce((s, a) => s + a.value, 0).toFixed(1)}%
                  </span>
                  <span className="col-span-4 text-right text-slate-300 text-sm font-medium">
                    {fmt(allocations.reduce((s, a) => s + (a.allocation_type === 'percentage' ? contract.annual_cost * a.value / 100 : a.value), 0))}/yr
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      <Modal open={showRenewalModal} onClose={() => setShowRenewalModal(false)} title="Log Renewal">
        <form onSubmit={saveRenewal} className="space-y-4">
          <Input label="Renewal Date" type="date" value={renewalForm.renewal_date} onChange={(e) => setRenewalForm((f) => ({ ...f, renewal_date: e.target.value }))} required />
          <Input label="Previous Annual Cost ($)" type="number" value={renewalForm.prev_cost} onChange={(e) => setRenewalForm((f) => ({ ...f, prev_cost: e.target.value }))} />
          <Input label="New Annual Cost ($)" type="number" value={renewalForm.new_cost} onChange={(e) => setRenewalForm((f) => ({ ...f, new_cost: e.target.value }))} />
          <Input label="License Count Change" type="number" value={renewalForm.license_count_change} onChange={(e) => setRenewalForm((f) => ({ ...f, license_count_change: e.target.value }))} />
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Reason / Notes</label>
            <textarea className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-20 resize-none" value={renewalForm.reason} onChange={(e) => setRenewalForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <Button type="submit" className="w-full justify-center">Save Renewal</Button>
        </form>
      </Modal>

      <Modal open={showNoteModal} onClose={() => setShowNoteModal(false)} title="Add Note">
        <form onSubmit={saveNote} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Note</label>
            <textarea className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-32 resize-none" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Enter your note..." required />
          </div>
          <Button type="submit" className="w-full justify-center">Save Note</Button>
        </form>
      </Modal>

      <Modal open={showProjectModal} onClose={() => setShowProjectModal(false)} title="Add Vendor Project">
        <form onSubmit={saveProject} className="space-y-4">
          <Input label="Project Name" value={projectForm.name} onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))} required />
          <Select label="Status" value={projectForm.status} onChange={(e) => setProjectForm((f) => ({ ...f, status: e.target.value }))}
            options={[{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On Hold' }, { value: 'completed', label: 'Completed' }]} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={projectForm.start_date} onChange={(e) => setProjectForm((f) => ({ ...f, start_date: e.target.value }))} />
            <Input label="End Date" type="date" value={projectForm.end_date} onChange={(e) => setProjectForm((f) => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Description</label>
            <textarea className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-20 resize-none" value={projectForm.description} onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <Button type="submit" className="w-full justify-center">Save Project</Button>
        </form>
      </Modal>

      <Modal open={showCompetitorModal} onClose={() => setShowCompetitorModal(false)} title="Add Competitor Offering">
        <form onSubmit={saveCompetitor} className="space-y-4">
          <Input label="Competitor Vendor" value={competitorForm.competitor_vendor} onChange={(e) => setCompetitorForm((f) => ({ ...f, competitor_vendor: e.target.value }))} required />
          <Input label="Offering Name" value={competitorForm.offering_name} onChange={(e) => setCompetitorForm((f) => ({ ...f, offering_name: e.target.value }))} required />
          <Input label="Annual Price ($)" type="number" value={competitorForm.price} onChange={(e) => setCompetitorForm((f) => ({ ...f, price: e.target.value }))} required />
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Notes</label>
            <textarea className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-20 resize-none" value={competitorForm.notes} onChange={(e) => setCompetitorForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <Button type="submit" className="w-full justify-center">Save Offering</Button>
        </form>
      </Modal>
    </div>
  )
}
