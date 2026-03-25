import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useThemeStore } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import RoleGuard from '../components/layout/RoleGuard'
import type { Contract, Department, Branch } from '../../../shared/types'
import AllocationEditor, { type AllocationRow } from '../components/contracts/AllocationEditor'
import ImportContractsModal from '../components/contracts/ImportContractsModal'
import ContractCreationTab from '../components/contracts/ContractCreationTab'

function statusVariant(s: string) {
  return s === 'active' ? 'success' : s === 'expiring_soon' ? 'warning' : s === 'expired' ? 'danger' : 'neutral'
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const emptyForm = {
  vendor_name: '', status: 'active', start_date: '', end_date: '',
  monthly_cost: '', annual_cost: '', total_cost: '',
  poc_name: '', poc_email: '', poc_phone: '',
  gl_code: '',
  scope: 'department' as 'department' | 'branch',
  department_id: '',
  branch_id: '',
  file_path: ''
}

const emptyFilters = {
  vendor: '',
  pocName: '',
  glCode: '',
  status: [] as string[],
  costField: 'annual_cost' as 'annual_cost' | 'monthly_cost' | 'total_cost',
  costOp: 'any' as 'any' | 'over' | 'under' | 'between',
  costA: '',
  costB: '',
  startFrom: '', startTo: '',
  endFrom: '', endTo: '',
  department_id: '',
  branch_id: '',
  renewalWithin: '',
}

// Reusable contract card list
function ContractList({ contracts, onNavigate }: { contracts: Contract[]; onNavigate: (id: number) => void }) {
  if (contracts.length === 0) {
    return (
      <Card className="text-center py-12">
        <p className="text-slate-400">No contracts found.</p>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      {contracts.map((c) => (
        <Card key={c.id} onClick={() => onNavigate(c.id)} className="hover:border-slate-600">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white font-semibold">{c.vendor_name}</h3>
                <Badge variant={statusVariant(c.status)}>
                  {c.status.replace('_', ' ')}
                </Badge>
                {c.days_until_renewal !== undefined && c.days_until_renewal >= 0 && c.days_until_renewal <= 120 && (
                  <Badge variant={c.days_until_renewal <= 30 ? 'danger' : 'warning'}>
                    {c.days_until_renewal}d to renewal
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                {c.branch_name ? (
                  <span>Branch: <span className="text-slate-300">{c.branch_name}</span></span>
                ) : (
                  <span>Dept: <span className="text-slate-300">{c.department_name}</span></span>
                )}
                <span>Start: <span className="text-slate-300">{c.start_date}</span></span>
                <span>End: <span className="text-slate-300">{c.end_date}</span></span>
                <span>POC: <span className="text-slate-300">{c.poc_name}</span></span>
                {c.gl_code && <span>GL: <span className="text-slate-300">{c.gl_code}</span></span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-white font-bold text-lg">{fmt(c.annual_cost)}<span className="text-slate-400 text-sm font-normal">/yr</span></p>
              <p className="text-slate-400 text-sm">{fmt(c.monthly_cost)}/mo</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function ContractsPage() {
  const navigate = useNavigate()
  const { selectedDeptId } = useThemeStore()
  const { user, can } = useAuthStore()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'search' | 'create'>('list')
  const [filters, setFilters] = useState(emptyFilters)
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [needsAllocation, setNeedsAllocation] = useState(false)
  const [allocations, setAllocations] = useState<AllocationRow[]>([])

  const load = () => {
    if (!user) return
    const opts: any = { search: search || undefined }

    if (user.role === 'super_admin') {
      if (selectedDeptId) opts.department_id = selectedDeptId
    } else {
      opts.role = user.role
      opts.allowed_department_ids = user.department_ids
      opts.allowed_branch_ids = user.branch_ids
    }

    window.api.contracts.list(opts).then((res) => {
      if (res.success && res.data) setContracts(res.data)
    })
  }

  useEffect(() => {
    window.api.departments.list().then((res) => {
      if (res.success && res.data) {
        setDepartments(res.data)
        if (res.data.length > 0 && !form.department_id) {
          setForm((f) => ({ ...f, department_id: String(res.data![0].id) }))
        }
      }
    })
    window.api.branches.list().then((res) => {
      if (res.success && res.data) setBranches(res.data)
    })
  }, [])

  useEffect(() => { load() }, [selectedDeptId, search, user])

  const handleUpload = async () => {
    const res = await window.api.contracts.uploadFile()
    if (res.success && res.data) {
      setUploadedFile(res.data.path)
      setForm((f) => ({ ...f, file_path: res.data!.path }))
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload: any = {
      vendor_name: form.vendor_name,
      status: form.status,
      start_date: form.start_date,
      end_date: form.end_date,
      monthly_cost: parseFloat(form.monthly_cost) || 0,
      annual_cost: parseFloat(form.annual_cost) || (parseFloat(form.monthly_cost) || 0) * 12,
      total_cost: parseFloat(form.total_cost) || 0,
      poc_name: form.poc_name,
      poc_email: form.poc_email,
      poc_phone: form.poc_phone,
      gl_code: form.gl_code,
      department_id: form.scope === 'department' && form.department_id ? parseInt(form.department_id) : null,
      branch_id: form.scope === 'branch' && form.branch_id ? parseInt(form.branch_id) : null,
      file_path: form.file_path || null
    }
    const res = await window.api.contracts.create(payload)
    if (res.success && res.data && needsAllocation && allocations.length > 0) {
      const toSave = allocations
        .filter((r) => r.targetId && r.value)
        .map((r) => ({
          contract_id: res.data!.id,
          branch_id: r.target === 'branch' ? parseInt(r.targetId) : null,
          department_id: r.target === 'department' ? parseInt(r.targetId) : null,
          allocation_type: r.allocationType,
          value: parseFloat(r.value)
        }))
      if (toSave.length > 0) await window.api.allocations.save(res.data.id, toSave)
    }
    setSaving(false)
    if (res.success) {
      setShowModal(false)
      setForm(emptyForm)
      setUploadedFile(null)
      setNeedsAllocation(false)
      setAllocations([])
      load()
    }
  }

  const f = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }))
  const setFilter = (k: keyof typeof emptyFilters, v: any) => setFilters((prev) => ({ ...prev, [k]: v }))

  const toggleStatus = (s: string) =>
    setFilters((prev) => ({
      ...prev,
      status: prev.status.includes(s) ? prev.status.filter((x) => x !== s) : [...prev.status, s]
    }))

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      if (filters.vendor && !c.vendor_name.toLowerCase().includes(filters.vendor.toLowerCase())) return false
      if (filters.pocName && !c.poc_name.toLowerCase().includes(filters.pocName.toLowerCase())) return false
      if (filters.glCode && !(c.gl_code || '').toLowerCase().includes(filters.glCode.toLowerCase())) return false
      if (filters.status.length > 0 && !filters.status.includes(c.status)) return false

      const cost = (c as any)[filters.costField] as number
      if (filters.costOp === 'over' && cost <= (parseFloat(filters.costA) || 0)) return false
      if (filters.costOp === 'under' && cost >= (parseFloat(filters.costA) || 0)) return false
      if (filters.costOp === 'between') {
        const lo = parseFloat(filters.costA) || 0
        const hi = parseFloat(filters.costB) || Infinity
        if (cost < lo || cost > hi) return false
      }

      if (filters.startFrom && c.start_date < filters.startFrom) return false
      if (filters.startTo && c.start_date > filters.startTo) return false
      if (filters.endFrom && c.end_date < filters.endFrom) return false
      if (filters.endTo && c.end_date > filters.endTo) return false

      if (filters.department_id && c.department_id !== parseInt(filters.department_id)) return false
      if (filters.branch_id && c.branch_id !== parseInt(filters.branch_id)) return false

      if (filters.renewalWithin) {
        const days = parseInt(filters.renewalWithin)
        if (c.days_until_renewal == null || c.days_until_renewal < 0 || c.days_until_renewal > days) return false
      }

      return true
    })
  }, [contracts, filters])

  const handleExport = async () => {
    const data = activeTab === 'search' ? filteredContracts : contracts
    const res = await window.api.exports.contractsList(data)
    if (res.success) {
      setExportMsg('Exported!')
      setTimeout(() => setExportMsg(''), 3000)
    } else if (res.error !== 'Cancelled') {
      setExportMsg(`Error: ${res.error}`)
      setTimeout(() => setExportMsg(''), 4000)
    }
  }

  const hasActiveFilters = filters.vendor || filters.pocName || filters.glCode || filters.status.length > 0 ||
    filters.costOp !== 'any' || filters.startFrom || filters.startTo ||
    filters.endFrom || filters.endTo || filters.department_id || filters.branch_id || filters.renewalWithin

  const inputCls = 'bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none w-full placeholder-slate-500'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Contracts</h1>
          <p className="text-slate-400 text-sm">{contracts.length} contracts</p>
        </div>
        <div className="flex items-center gap-2">
          {exportMsg && <span className={`text-sm ${exportMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{exportMsg}</span>}
          <Button variant="ghost" onClick={handleExport} disabled={contracts.length === 0}>Export</Button>
          <Button variant="secondary" onClick={() => setShowImportModal(true)}>↑ Import Contracts</Button>
          <RoleGuard minRole="super_admin">
            <Button onClick={() => setShowModal(true)}>+ New Contract</Button>
          </RoleGuard>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-700">
        {(['list', 'search', 'create'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'text-white border-[var(--brand-primary)]'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            {tab === 'list' ? 'Contracts' : tab === 'search' ? 'Search' : 'Contract Creation'}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Contracts (existing list)                                      */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'list' && (
        <>
          <Input
            placeholder="Search by vendor or contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <ContractList contracts={contracts} onNavigate={(id) => navigate(`/contracts/${id}`)} />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Search (advanced filters)                                      */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'search' && (
        <div className="grid grid-cols-[300px_1fr] gap-6 items-start">
          {/* Filter panel */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-5 sticky top-4">
            <div className="flex items-center justify-between">
              <p className="text-white text-sm font-semibold">Filters</p>
              {hasActiveFilters && (
                <button
                  onClick={() => setFilters(emptyFilters)}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Vendor */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Vendor Name</label>
              <input
                className={inputCls}
                placeholder="Search vendor..."
                value={filters.vendor}
                onChange={(e) => setFilter('vendor', e.target.value)}
              />
            </div>

            {/* POC */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Point of Contact</label>
              <input
                className={inputCls}
                placeholder="Search contact name..."
                value={filters.pocName}
                onChange={(e) => setFilter('pocName', e.target.value)}
              />
            </div>

            {/* GL Code */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">GL Code</label>
              <input
                className={inputCls}
                placeholder="Search GL code..."
                value={filters.glCode}
                onChange={(e) => setFilter('glCode', e.target.value)}
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Status</label>
              <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                {[
                  { value: 'active', label: 'Active' },
                  { value: 'expiring_soon', label: 'Expiring Soon' },
                  { value: 'expired', label: 'Expired' },
                  { value: 'pending', label: 'Pending' },
                ].map((s) => (
                  <label key={s.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(s.value)}
                      onChange={() => toggleStatus(s.value)}
                      className="rounded accent-[var(--brand-primary)] cursor-pointer"
                    />
                    <span className="text-slate-300 text-xs">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Cost filter */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Cost</label>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className={inputCls + ' cursor-pointer'}
                    value={filters.costField}
                    onChange={(e) => setFilter('costField', e.target.value)}
                  >
                    <option value="annual_cost">Annual</option>
                    <option value="monthly_cost">Monthly</option>
                    <option value="total_cost">Total Value</option>
                  </select>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    value={filters.costOp}
                    onChange={(e) => setFilter('costOp', e.target.value)}
                  >
                    <option value="any">Any amount</option>
                    <option value="over">Over</option>
                    <option value="under">Under</option>
                    <option value="between">Between</option>
                  </select>
                </div>
                {filters.costOp !== 'any' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={inputCls}
                      placeholder={filters.costOp === 'between' ? 'Min ($)' : 'Amount ($)'}
                      value={filters.costA}
                      onChange={(e) => setFilter('costA', e.target.value)}
                    />
                    {filters.costOp === 'between' && (
                      <>
                        <span className="text-slate-500 text-xs flex-shrink-0">to</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className={inputCls}
                          placeholder="Max ($)"
                          value={filters.costB}
                          onChange={(e) => setFilter('costB', e.target.value)}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Start date range */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Start Date</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-slate-500 text-xs mb-1">From</p>
                  <input type="date" className={inputCls} value={filters.startFrom} onChange={(e) => setFilter('startFrom', e.target.value)} />
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">To</p>
                  <input type="date" className={inputCls} value={filters.startTo} onChange={(e) => setFilter('startTo', e.target.value)} />
                </div>
              </div>
            </div>

            {/* End date range */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">End Date</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-slate-500 text-xs mb-1">From</p>
                  <input type="date" className={inputCls} value={filters.endFrom} onChange={(e) => setFilter('endFrom', e.target.value)} />
                </div>
                <div>
                  <p className="text-slate-500 text-xs mb-1">To</p>
                  <input type="date" className={inputCls} value={filters.endTo} onChange={(e) => setFilter('endTo', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Department */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Department</label>
              <select
                className={inputCls + ' cursor-pointer'}
                value={filters.department_id}
                onChange={(e) => setFilter('department_id', e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Branch</label>
              <select
                className={inputCls + ' cursor-pointer'}
                value={filters.branch_id}
                onChange={(e) => setFilter('branch_id', e.target.value)}
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>Branch {b.number} – {b.name}</option>
                ))}
              </select>
            </div>

            {/* Renews within */}
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1.5">Renews Within</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={inputCls}
                  placeholder="e.g. 30"
                  value={filters.renewalWithin}
                  onChange={(e) => setFilter('renewalWithin', e.target.value)}
                />
                <span className="text-slate-400 text-sm flex-shrink-0">days</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-sm">
                <span className="text-white font-medium">{filteredContracts.length}</span> result{filteredContracts.length !== 1 ? 's' : ''}
                {hasActiveFilters && <span className="text-slate-500"> (filtered from {contracts.length})</span>}
              </p>
            </div>
            {filteredContracts.length === 0 ? (
              <Card className="text-center py-12">
                <p className="text-slate-400">No contracts match your filters.</p>
                <button
                  onClick={() => setFilters(emptyFilters)}
                  className="text-sm mt-2 text-slate-500 hover:text-white transition-colors"
                >
                  Clear filters
                </button>
              </Card>
            ) : (
              <ContractList contracts={filteredContracts} onNavigate={(id) => navigate(`/contracts/${id}`)} />
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tab: Contract Creation                                             */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === 'create' && <ContractCreationTab />}

      {/* Import Contracts Modal */}
      <ImportContractsModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onComplete={load}
        departments={departments}
        branches={branches}
      />

      {/* New Contract Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setNeedsAllocation(false); setAllocations([]) }} title="New Contract" width="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Input label="Vendor Name" value={form.vendor_name} onChange={(e) => f('vendor_name', e.target.value)} required />
            <Input label="GL Code" placeholder="e.g. 6000-100" value={form.gl_code} onChange={(e) => f('gl_code', e.target.value)} />
            <Select
              label="Contract Scope"
              value={form.scope}
              onChange={(e) => f('scope', e.target.value)}
              options={[
                { value: 'department', label: 'Department Contract' },
                { value: 'branch', label: 'Store Branch Contract' }
              ]}
            />
          </div>
          {form.scope === 'department' ? (
            <Select
              label="Department"
              value={form.department_id}
              onChange={(e) => { f('department_id', e.target.value); setNeedsAllocation(false); setAllocations([]) }}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              required
            />
          ) : (
            <Select
              label="Store Branch"
              value={form.branch_id}
              onChange={(e) => f('branch_id', e.target.value)}
              options={branches.map((b) => ({ value: b.id, label: `Branch ${b.number} – ${b.name}` }))}
              required
            />
          )}

          {/* Cost allocation prompt */}
          {(() => {
            const selectedDept = departments.find((d) => d.id === parseInt(form.department_id))
            if (form.scope !== 'department' || !selectedDept) return null
            const annualCost = parseFloat(form.annual_cost) || parseFloat(form.monthly_cost) * 12 || 0
            return (
              <div className="rounded-lg border border-blue-800/60 p-4 space-y-3 bg-blue-950/20">
                <p className="text-blue-300 text-sm font-medium">
                  {selectedDept.name} Contract — Cost Allocation
                </p>
                <p className="text-slate-400 text-xs">
                  Does this contract need to be split across branches or departments (e.g. company-wide anti-virus, network protection)?
                </p>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="needsAllocation"
                      checked={!needsAllocation}
                      onChange={() => { setNeedsAllocation(false); setAllocations([]) }}
                      className="accent-blue-500"
                    />
                    <span className="text-slate-300 text-sm">No — charge entirely to IT</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="needsAllocation"
                      checked={needsAllocation}
                      onChange={() => setNeedsAllocation(true)}
                      className="accent-blue-500"
                    />
                    <span className="text-slate-300 text-sm">Yes — split across branches/departments</span>
                  </label>
                </div>
                {needsAllocation && (
                  <AllocationEditor
                    allocations={allocations}
                    onChange={setAllocations}
                    branches={branches}
                    departments={departments}
                    annualCost={annualCost}
                  />
                )}
              </div>
            )
          })()}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => f('start_date', e.target.value)} required />
            <Input label="End Date" type="date" value={form.end_date} onChange={(e) => f('end_date', e.target.value)} required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Monthly Cost ($)" type="number" min="0" step="0.01" value={form.monthly_cost}
              onChange={(e) => {
                f('monthly_cost', e.target.value)
                f('annual_cost', String(parseFloat(e.target.value) * 12 || 0))
              }} />
            <Input label="Annual Cost ($)" type="number" min="0" step="0.01" value={form.annual_cost} onChange={(e) => f('annual_cost', e.target.value)} />
            <Input label="Total Contract Value ($)" type="number" min="0" step="0.01" value={form.total_cost} onChange={(e) => f('total_cost', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="POC Name" value={form.poc_name} onChange={(e) => f('poc_name', e.target.value)} />
            <Input label="POC Email" type="email" value={form.poc_email} onChange={(e) => f('poc_email', e.target.value)} />
            <Input label="POC Phone" value={form.poc_phone} onChange={(e) => f('poc_phone', e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={handleUpload}>
              📁 Upload Contract File
            </Button>
            {uploadedFile && <span className="text-emerald-400 text-sm">✓ File attached</span>}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 justify-center">
              {saving ? 'Saving...' : 'Save Contract'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowModal(false); setNeedsAllocation(false); setAllocations([]) }}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
