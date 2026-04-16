import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import type { ContractObligation, ObligationRecurrence, User } from '../../../../shared/types'

interface Props {
  contractId: number
}

function dueVariant(status: string, daysUntil: number): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'completed') return 'success'
  if (status === 'cancelled') return 'neutral'
  if (daysUntil < 0) return 'danger'
  if (daysUntil <= 7) return 'danger'
  if (daysUntil <= 30) return 'warning'
  return 'neutral'
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  if (isNaN(target.getTime())) return 0
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function ObligationsTab({ contractId }: Props) {
  const [obligations, setObligations] = useState<ContractObligation[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    responsible_user_id: '',
    recurrence: 'none' as ObligationRecurrence
  })

  const load = () => {
    window.api.obligations.list(contractId).then((res: any) => {
      if (res.success && res.data) setObligations(res.data)
    })
  }

  useEffect(() => {
    load()
    window.api.users.list().then((res: any) => {
      if (res.success && res.data) setUsers(res.data)
    })
  }, [contractId])

  const resetForm = () => {
    setForm({ title: '', description: '', due_date: '', responsible_user_id: '', recurrence: 'none' })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload = {
      contract_id: contractId,
      title: form.title,
      description: form.description,
      due_date: form.due_date,
      responsible_user_id: form.responsible_user_id ? parseInt(form.responsible_user_id) : null,
      status: 'pending',
      recurrence: form.recurrence
    }
    const res = await window.api.obligations.create(payload)
    setSaving(false)
    if (res.success) {
      setShowModal(false)
      resetForm()
      load()
    }
  }

  const handleComplete = async (id: number) => {
    const res = await window.api.obligations.complete(id)
    if (res.success) load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this obligation?')) return
    const res = await window.api.obligations.delete(id)
    if (res.success) load()
  }

  const pending = obligations.filter((o) => o.status === 'pending' || o.status === 'overdue')
  const done = obligations.filter((o) => o.status === 'completed' || o.status === 'cancelled')

  const row = (o: ContractObligation) => {
    const d = daysUntil(o.due_date)
    const label =
      o.status === 'completed'
        ? 'completed'
        : o.status === 'cancelled'
          ? 'cancelled'
          : d < 0
            ? `${-d}d overdue`
            : d === 0
              ? 'due today'
              : `${d}d to go`
    return (
      <div
        key={o.id}
        className="flex items-start justify-between gap-4 py-3 border-b border-slate-800 last:border-0"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={`font-medium ${
                o.status === 'completed' ? 'text-slate-500 line-through' : 'text-white'
              }`}
            >
              {o.title}
            </p>
            <Badge variant={dueVariant(o.status, d)}>{label}</Badge>
            {o.recurrence !== 'none' && (
              <span className="text-xs text-slate-500">recurs {o.recurrence}</span>
            )}
          </div>
          {o.description && <p className="text-slate-400 text-sm mt-1">{o.description}</p>}
          <div className="flex gap-4 mt-1 text-xs text-slate-500">
            <span>Due {o.due_date}</span>
            {o.responsible_user_name && <span>· {o.responsible_user_name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(o.status === 'pending' || o.status === 'overdue') && (
            <Button variant="secondary" onClick={() => handleComplete(o.id)}>
              Complete
            </Button>
          )}
          <button
            onClick={() => handleDelete(o.id)}
            className="text-xs text-slate-500 hover:text-red-400 px-2"
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-semibold">Obligations</p>
          <p className="text-slate-400 text-xs">
            Track SLAs, payment schedules, reporting deadlines, and other recurring or one-off duties.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ New Obligation</Button>
      </div>

      <Card>
        {pending.length === 0 ? (
          <p className="text-slate-400 text-sm py-4 text-center">No open obligations.</p>
        ) : (
          <div>{pending.map(row)}</div>
        )}
      </Card>

      {done.length > 0 && (
        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Completed / Cancelled</p>
          <div>{done.map(row)}</div>
        </Card>
      )}

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); resetForm() }}
        title="New Obligation"
        width="max-w-lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Quarterly uptime report, Annual SOC 2 attestation"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Due Date"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              required
            />
            <Select
              label="Recurrence"
              value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as ObligationRecurrence }))}
              options={[
                { value: 'none', label: 'One-off' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'annual', label: 'Annual' }
              ]}
            />
          </div>
          <Select
            label="Responsible User (optional)"
            value={form.responsible_user_id}
            onChange={(e) => setForm((f) => ({ ...f, responsible_user_id: e.target.value }))}
            options={[
              { value: '', label: 'Unassigned' },
              ...users.map((u) => ({ value: String(u.id), label: `${u.name} · ${u.email}` }))
            ]}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 justify-center">
              {saving ? 'Saving...' : 'Save Obligation'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowModal(false); resetForm() }}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
