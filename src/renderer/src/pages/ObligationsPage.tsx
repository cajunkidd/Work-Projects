import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import { useActor } from '../lib/actor'
import type { Obligation, ObligationStatus, ObligationType } from '../../../shared/types'

const TYPE_LABELS: Record<ObligationType, string> = {
  deliverable: 'Deliverable',
  milestone: 'Milestone',
  sla: 'SLA',
  payment: 'Payment',
  compliance: 'Compliance',
  renewal_task: 'Renewal Task',
  other: 'Other'
}

export function dueBadge(obligation: Obligation) {
  if (obligation.status === 'completed') return <Badge variant="success">Completed</Badge>
  if (obligation.status === 'waived') return <Badge variant="neutral">Waived</Badge>
  if (obligation.is_overdue) {
    return <Badge variant="danger">Overdue by {Math.abs(obligation.days_until_due ?? 0)}d</Badge>
  }
  if (obligation.days_until_due === null || obligation.days_until_due === undefined) {
    return <Badge variant="neutral">No due date</Badge>
  }
  if (obligation.days_until_due <= 7) return <Badge variant="warning">Due in {obligation.days_until_due}d</Badge>
  return <Badge variant="info">Due in {obligation.days_until_due}d</Badge>
}

export default function ObligationsPage() {
  const actor = useActor()
  const navigate = useNavigate()

  const [obligations, setObligations] = useState<Obligation[]>([])
  const [stats, setStats] = useState({ open: 0, overdue: 0, due_soon: 0, critical_open: 0 })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | ObligationStatus>('open')
  const [type, setType] = useState<'' | ObligationType>('')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const load = useCallback(async () => {
    const [listRes, statsRes] = await Promise.all([
      window.api.obligations.list({
        search: search.trim() || undefined,
        status: status || undefined,
        obligation_type: type || undefined,
        overdue_only: overdueOnly || undefined,
        actor
      }),
      window.api.obligations.stats({ actor })
    ])
    if (listRes.success && listRes.data) setObligations(listRes.data)
    if (statsRes.success && statsRes.data) setStats(statsRes.data)
    setLoading(false)
  }, [search, status, type, overdueOnly, actor?.id])

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 4000)
  }

  const complete = async (obligation: Obligation) => {
    const res = await window.api.obligations.complete({ id: obligation.id, actor })
    if (!res.success) {
      flash(`Error: ${res.error}`)
      return
    }
    flash(
      res.data?.next_due
        ? `Completed. Next occurrence created for ${res.data.next_due}.`
        : 'Marked complete.'
    )
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Obligations</h1>
          <p className="text-slate-400 text-sm mt-1">
            Deliverables, milestones, SLAs, and compliance duties across every contract.
          </p>
        </div>
        {message && (
          <span
            className={`text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {message}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Open', value: stats.open, tone: 'text-white' },
          { label: 'Overdue', value: stats.overdue, tone: 'text-red-400' },
          { label: 'Due in 30 Days', value: stats.due_soon, tone: 'text-amber-400' },
          { label: 'Critical Open', value: stats.critical_open, tone: 'text-amber-400' }
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-slate-400 text-xs">{stat.label}</p>
            <p className={`font-semibold text-xl mt-0.5 ${stat.tone}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="grid grid-cols-4 gap-4 items-end">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, description, or vendor…"
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | ObligationStatus)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'waived', label: 'Waived' }
            ]}
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as '' | ObligationType)}
            options={[
              { value: '', label: 'All types' },
              ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))
            ]}
          />
          <label className="flex items-center gap-2 text-slate-300 text-sm pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded"
            />
            Overdue only
          </label>
        </div>
      </Card>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : obligations.length === 0 ? (
        <Card>
          <p className="text-slate-400 text-sm text-center py-8">
            No obligations match these filters. Add them from a contract's Obligations tab, or let
            AI extraction pull them out of an uploaded agreement.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {obligations.map((obligation) => (
            <Card key={obligation.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{obligation.title}</span>
                    {dueBadge(obligation)}
                    <Badge variant="neutral">{TYPE_LABELS[obligation.obligation_type]}</Badge>
                    {obligation.critical === 1 && <Badge variant="danger">Critical</Badge>}
                    {obligation.source === 'ai_extracted' && <Badge variant="info">AI</Badge>}
                  </div>
                  {obligation.description && (
                    <p className="text-slate-300 text-sm mt-1">{obligation.description}</p>
                  )}
                  <p className="text-slate-400 text-xs mt-1">
                    <button
                      onClick={() => navigate(`/contracts/${obligation.contract_id}`)}
                      className="hover:underline hover:text-white"
                    >
                      {obligation.vendor_name}
                    </button>
                    {obligation.due_date && ` · due ${obligation.due_date}`}
                    {` · ${obligation.responsible_party === 'us' ? 'our responsibility' : obligation.responsible_party === 'vendor' ? 'vendor responsibility' : 'shared responsibility'}`}
                    {obligation.owner_name && ` · owner ${obligation.owner_name}`}
                    {obligation.recurrence !== 'none' && ` · repeats ${obligation.recurrence}`}
                  </p>
                </div>

                {obligation.status !== 'completed' && obligation.status !== 'waived' && (
                  <Button size="sm" onClick={() => complete(obligation)}>
                    Mark Complete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
