import { useCallback, useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import RoleGuard from '../layout/RoleGuard'
import { useActor } from '../../lib/actor'
import type {
  Obligation,
  ObligationRecurrence,
  ObligationType,
  ResponsibleParty,
  User
} from '../../../../shared/types'

interface Props {
  contractId: number
}

const EMPTY_FORM = {
  title: '',
  description: '',
  obligation_type: 'deliverable' as ObligationType,
  responsible_party: 'vendor' as ResponsibleParty,
  owner_user_id: '' as number | '',
  due_date: '',
  recurrence: 'none' as ObligationRecurrence,
  reminder_days: '7',
  critical: false
}

export default function ObligationsTab({ contractId }: Props) {
  const actor = useActor()
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [listRes, userRes] = await Promise.all([
      window.api.obligations.list({ contract_id: contractId }),
      window.api.users.list()
    ])
    if (listRes.success && listRes.data) setObligations(listRes.data)
    if (userRes.success && userRes.data) setUsers(userRes.data)
    setLoading(false)
  }, [contractId])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 4000)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const owner = users.find((u) => u.id === Number(form.owner_user_id))
    const res = await window.api.obligations.create({
      contract_id: contractId,
      title: form.title,
      description: form.description,
      obligation_type: form.obligation_type,
      responsible_party: form.responsible_party,
      owner_user_id: form.owner_user_id === '' ? null : Number(form.owner_user_id),
      owner_name: owner?.name ?? '',
      due_date: form.due_date || null,
      recurrence: form.recurrence,
      reminder_days: parseInt(form.reminder_days) || 7,
      critical: form.critical ? 1 : 0,
      actor
    })
    setSaving(false)
    if (res.success) {
      setShowForm(false)
      setForm(EMPTY_FORM)
      await load()
      flash('Obligation added.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const complete = async (obligation: Obligation) => {
    const res = await window.api.obligations.complete({ id: obligation.id, actor })
    if (!res.success) {
      flash(`Error: ${res.error}`)
      return
    }
    await load()
    flash(
      res.data?.next_due
        ? `Completed. Next occurrence created for ${res.data.next_due}.`
        : 'Marked complete.'
    )
  }

  const remove = async (obligation: Obligation) => {
    const res = await window.api.obligations.delete({ id: obligation.id, actor })
    if (res.success) {
      await load()
      flash('Obligation deleted.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading obligations…</p>

  const open = obligations.filter((o) => o.status === 'open' || o.status === 'in_progress')
  const done = obligations.filter((o) => o.status === 'completed' || o.status === 'waived')

  const renderRow = (obligation: Obligation) => (
    <Card key={obligation.id}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-medium ${obligation.status === 'completed' ? 'text-slate-400 line-through' : 'text-white'}`}
            >
              {obligation.title}
            </span>
            <Badge variant="neutral">{obligation.obligation_type.replace('_', ' ')}</Badge>
            {obligation.critical === 1 && <Badge variant="danger">Critical</Badge>}
            {obligation.source === 'ai_extracted' && <Badge variant="info">AI</Badge>}
            {obligation.is_overdue === 1 && (
              <Badge variant="danger">Overdue by {Math.abs(obligation.days_until_due ?? 0)}d</Badge>
            )}
            {obligation.status === 'completed' && <Badge variant="success">Completed</Badge>}
          </div>
          {obligation.description && (
            <p className="text-slate-300 text-sm mt-1">{obligation.description}</p>
          )}
          <p className="text-slate-400 text-xs mt-1">
            {obligation.due_date ? `Due ${obligation.due_date}` : 'No due date'} ·{' '}
            {obligation.responsible_party === 'us'
              ? 'our responsibility'
              : obligation.responsible_party === 'vendor'
                ? 'vendor responsibility'
                : 'shared'}
            {obligation.owner_name && ` · owner ${obligation.owner_name}`}
            {obligation.recurrence !== 'none' && ` · repeats ${obligation.recurrence}`}
            {obligation.completed_at && ` · completed ${obligation.completed_at} by ${obligation.completed_by_name}`}
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {obligation.status !== 'completed' && obligation.status !== 'waived' && (
            <RoleGuard minRole="director">
              <Button size="sm" onClick={() => complete(obligation)}>
                Complete
              </Button>
            </RoleGuard>
          )}
          <RoleGuard minRole="director">
            <button
              onClick={() => remove(obligation)}
              className="text-slate-500 hover:text-red-400 text-lg leading-none px-1"
            >
              ×
            </button>
          </RoleGuard>
        </div>
      </div>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <RoleGuard minRole="director">
          <Button onClick={() => setShowForm(true)}>+ Add Obligation</Button>
        </RoleGuard>
        {message && (
          <span
            className={`text-xs ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {message}
          </span>
        )}
      </div>

      {obligations.length === 0 ? (
        <Card>
          <p className="text-slate-400 text-sm">
            No obligations tracked for this contract. Add deliverables, milestones, SLAs, and
            compliance duties here — or upload the agreement and let AI extraction find them.
          </p>
        </Card>
      ) : (
        <>
          {open.length > 0 && <div className="space-y-2">{open.map(renderRow)}</div>}
          {done.length > 0 && (
            <>
              <p className="text-slate-400 text-xs uppercase tracking-wide pt-2">Completed</p>
              <div className="space-y-2">{done.map(renderRow)}</div>
            </>
          )}
        </>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add Obligation"
        width="max-w-2xl"
      >
        <form onSubmit={create} className="space-y-4">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Quarterly security report"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Description</label>
            <textarea
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-20 resize-none"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Type"
              value={form.obligation_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, obligation_type: e.target.value as ObligationType }))
              }
              options={[
                { value: 'deliverable', label: 'Deliverable' },
                { value: 'milestone', label: 'Milestone' },
                { value: 'sla', label: 'SLA' },
                { value: 'payment', label: 'Payment' },
                { value: 'compliance', label: 'Compliance' },
                { value: 'renewal_task', label: 'Renewal Task' },
                { value: 'other', label: 'Other' }
              ]}
            />
            <Select
              label="Responsibility"
              value={form.responsible_party}
              onChange={(e) =>
                setForm((f) => ({ ...f, responsible_party: e.target.value as ResponsibleParty }))
              }
              options={[
                { value: 'vendor', label: 'Vendor' },
                { value: 'us', label: 'Us' },
                { value: 'both', label: 'Both' }
              ]}
            />
            <Select
              label="Owner"
              value={form.owner_user_id}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  owner_user_id: e.target.value === '' ? '' : Number(e.target.value)
                }))
              }
              options={[
                { value: '', label: 'Unassigned' },
                ...users.map((u) => ({ value: u.id, label: u.name }))
              ]}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Due Date"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            />
            <Select
              label="Repeats"
              value={form.recurrence}
              onChange={(e) =>
                setForm((f) => ({ ...f, recurrence: e.target.value as ObligationRecurrence }))
              }
              options={[
                { value: 'none', label: 'Does not repeat' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'semiannual', label: 'Every 6 months' },
                { value: 'annual', label: 'Annually' }
              ]}
            />
            <Input
              label="Remind (days before)"
              type="number"
              value={form.reminder_days}
              onChange={(e) => setForm((f) => ({ ...f, reminder_days: e.target.value }))}
            />
          </div>

          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.critical}
              onChange={(e) => setForm((f) => ({ ...f, critical: e.target.checked }))}
              className="rounded"
            />
            Critical — missing this has material consequences
          </label>

          <p className="text-slate-400 text-xs">
            A repeating obligation automatically creates its next occurrence when you mark this one
            complete.
          </p>

          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? 'Saving…' : 'Add Obligation'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
