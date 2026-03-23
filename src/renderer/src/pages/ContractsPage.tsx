import { useEffect, useState } from 'react'
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
  scope: 'department' as 'department' | 'branch',
  department_id: '',
  branch_id: '',
  file_path: ''
}

export default function ContractsPage() {
  const navigate = useNavigate()
  const { selectedDeptId } = useThemeStore()
  const { user, can } = useAuthStore()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [needsAllocation, setNeedsAllocation] = useState(false)
  const [allocations, setAllocations] = useState<AllocationRow[]>([])

  const load = () => {
    if (!user) return
    const opts: any = { search: search || undefined }

    if (user.role === 'super_admin') {
      // Optional dept filter from sidebar
      if (selectedDeptId) opts.department_id = selectedDeptId
    } else {
      // Pass role-based access info to the backend
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
      if (res.success && res.data) {
        setBranches(res.data)
      }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Contracts</h1>
          <p className="text-slate-400 text-sm">{contracts.length} contracts</p>
        </div>
        <RoleGuard minRole="super_admin">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setShowImportModal(true)}>↑ Import Contracts</Button>
            <Button onClick={() => setShowModal(true)}>+ New Contract</Button>
          </div>
        </RoleGuard>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by vendor or contact..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Contracts list */}
      <div className="space-y-3">
        {contracts.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-slate-400">No contracts found.</p>
          </Card>
        ) : (
          contracts.map((c) => (
            <Card key={c.id} onClick={() => navigate(`/contracts/${c.id}`)} className="hover:border-slate-600">
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
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white font-bold text-lg">{fmt(c.annual_cost)}<span className="text-slate-400 text-sm font-normal">/yr</span></p>
                  <p className="text-slate-400 text-sm">{fmt(c.monthly_cost)}/mo</p>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

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
          <div className="grid grid-cols-2 gap-4">
            <Input label="Vendor Name" value={form.vendor_name} onChange={(e) => f('vendor_name', e.target.value)} required />
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

          {/* Cost allocation prompt — shown for all department contracts */}
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
