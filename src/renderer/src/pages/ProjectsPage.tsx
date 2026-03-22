import { useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import RoleGuard from '../components/layout/RoleGuard'
import type { VendorProject, Contract } from '../../../shared/types'

type ProjectStatus = 'active' | 'on_hold' | 'completed'

export default function ProjectsPage() {
  const { selectedDeptId } = useThemeStore()
  const [projects, setProjects] = useState<VendorProject[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ contract_id: '', name: '', status: 'active', start_date: '', end_date: '', description: '' })

  const load = () => {
    const opts: any = {}
    if (selectedDeptId) opts.department_id = selectedDeptId
    window.api.projects.list(opts).then((res) => {
      if (res.success && res.data) setProjects(res.data)
    })
  }

  useEffect(() => {
    window.api.contracts.list(selectedDeptId ? { department_id: selectedDeptId } : undefined).then((res) => {
      if (res.success && res.data) {
        setContracts(res.data)
        if (res.data.length > 0) setForm((f) => ({ ...f, contract_id: String(res.data![0].id) }))
      }
    })
    load()
  }, [selectedDeptId])

  const filtered = projects.filter((p) => filterStatus === 'all' || p.status === filterStatus)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.api.projects.create({ ...form, contract_id: parseInt(form.contract_id) } as any)
    setShowModal(false)
    setForm((f) => ({ ...f, name: '', start_date: '', end_date: '', description: '' }))
    load()
  }

  const handleStatusChange = async (id: number, status: ProjectStatus) => {
    await window.api.projects.update({ id, status })
    load()
  }

  const handleDelete = async (id: number) => {
    await window.api.projects.delete(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  const counts = {
    active: projects.filter((p) => p.status === 'active').length,
    on_hold: projects.filter((p) => p.status === 'on_hold').length,
    completed: projects.filter((p) => p.status === 'completed').length
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Vendor Projects</h1>
          <p className="text-slate-400 text-sm">{projects.length} total · {counts.active} active</p>
        </div>
        <RoleGuard minRole="editor">
          <Button onClick={() => setShowModal(true)}>+ New Project</Button>
        </RoleGuard>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active', count: counts.active, color: '#10b981', status: 'active' },
          { label: 'On Hold', count: counts.on_hold, color: '#f59e0b', status: 'on_hold' },
          { label: 'Completed', count: counts.completed, color: '#6b7280', status: 'completed' }
        ].map((s) => (
          <Card
            key={s.label}
            onClick={() => setFilterStatus(filterStatus === s.status ? 'all' : s.status)}
            className={`cursor-pointer ${filterStatus === s.status ? 'border-slate-600' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
              <div>
                <p className="text-white text-2xl font-bold">{s.count}</p>
                <p className="text-slate-400 text-sm">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Projects list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-slate-400">No projects found.</p>
          </Card>
        ) : (
          filtered.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold">{p.name}</h3>
                    <Badge variant={p.status === 'active' ? 'success' : p.status === 'on_hold' ? 'warning' : 'neutral'}>
                      {p.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  {p.description && <p className="text-slate-400 text-sm">{p.description}</p>}
                  {(p.start_date || p.end_date) && (
                    <p className="text-slate-500 text-xs mt-1">{p.start_date} → {p.end_date}</p>
                  )}
                  {(p as any).vendor_name && (
                    <p className="text-slate-500 text-xs">{(p as any).vendor_name}</p>
                  )}
                </div>
                <RoleGuard minRole="editor">
                  <div className="flex items-center gap-2">
                    <select
                      value={p.status}
                      onChange={(e) => handleStatusChange(p.id, e.target.value as ProjectStatus)}
                      className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-slate-500 hover:text-red-400 text-lg transition-colors"
                    >
                      ×
                    </button>
                  </div>
                </RoleGuard>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Vendor Project">
        <form onSubmit={handleSave} className="space-y-4">
          <Select
            label="Contract / Vendor"
            value={form.contract_id}
            onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))}
            options={contracts.map((c) => ({ value: c.id, label: c.vendor_name }))}
            required
          />
          <Input label="Project Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={[{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On Hold' }, { value: 'completed', label: 'Completed' }]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            <Input label="End Date" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Description</label>
            <textarea className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-20 resize-none" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <Button type="submit" className="w-full justify-center">Save Project</Button>
        </form>
      </Modal>
    </div>
  )
}
