import { useCallback, useEffect, useState } from 'react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import type { AuditAction, AuditEntityType, AuditEntry } from '../../../shared/types'

const ACTION_STYLES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  submit: 'warning',
  approve: 'success',
  reject: 'danger',
  cancel: 'neutral',
  restore: 'warning',
  archive: 'neutral'
}

const ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All records' },
  { value: 'contract', label: 'Contracts' },
  { value: 'approval', label: 'Approval rules' },
  { value: 'clause', label: 'Clauses' },
  { value: 'version', label: 'Versions' },
  { value: 'user', label: 'Users' },
  { value: 'budget', label: 'Budgets' }
]

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Deleted' },
  { value: 'submit', label: 'Submitted' },
  { value: 'approve', label: 'Approved' },
  { value: 'reject', label: 'Rejected' },
  { value: 'cancel', label: 'Withdrawn' },
  { value: 'restore', label: 'Restored' },
  { value: 'archive', label: 'Archived' }
]

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [stats, setStats] = useState({ total: 0, today: 0, this_week: 0, actors: 0 })
  const [actors, setActors] = useState<{ user_id: number | null; user_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [exportMsg, setExportMsg] = useState('')

  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [userId, setUserId] = useState<number | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [limit, setLimit] = useState(200)

  const load = useCallback(async () => {
    const res = await window.api.audit.list({
      search: search.trim() || undefined,
      entity_type: (entityType || undefined) as AuditEntityType | undefined,
      action: (action || undefined) as AuditAction | undefined,
      user_id: userId === '' ? undefined : Number(userId),
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      limit
    })
    if (res.success && res.data) setEntries(res.data)
    setLoading(false)
  }, [search, entityType, action, userId, fromDate, toDate, limit])

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    window.api.audit.stats().then((res) => {
      if (res.success && res.data) setStats(res.data)
    })
    window.api.audit.actors().then((res) => {
      if (res.success && res.data) setActors(res.data)
    })
  }, [])

  const exportLog = async () => {
    const rows = entries.map((e) => ({
      Timestamp: e.created_at,
      User: e.user_name,
      Action: e.action,
      'Record Type': e.entity_type,
      Record: e.entity_label,
      Field: e.field_name ?? '',
      'Old Value': e.old_value ?? '',
      'New Value': e.new_value ?? '',
      Detail: e.summary
    }))
    const res = await window.api.exports.contractsList(rows)
    if (res.success) {
      setExportMsg('Exported!')
    } else if (res.error !== 'Cancelled') {
      setExportMsg(`Error: ${res.error}`)
    }
    setTimeout(() => setExportMsg(''), 4000)
  }

  const clearFilters = () => {
    setSearch('')
    setEntityType('')
    setAction('')
    setUserId('')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Audit Log</h1>
          <p className="text-slate-400 text-sm mt-1">
            An append-only record of every change: who did it, what changed, and when.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exportMsg && (
            <span
              className={`text-xs ${exportMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {exportMsg}
            </span>
          )}
          <Button variant="secondary" onClick={exportLog} disabled={entries.length === 0}>
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: stats.total.toLocaleString() },
          { label: 'Today', value: stats.today.toLocaleString() },
          { label: 'Past 7 Days', value: stats.this_week.toLocaleString() },
          { label: 'Distinct Users', value: stats.actors.toLocaleString() }
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-slate-400 text-xs">{stat.label}</p>
            <p className="text-white font-semibold text-xl mt-0.5">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Record name, detail, or user…"
          />
          <Select
            label="Record Type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            options={ENTITY_OPTIONS}
          />
          <Select
            label="Action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            options={ACTION_OPTIONS}
          />
          <Select
            label="User"
            value={userId}
            onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}
            options={[
              { value: '', label: 'All users' },
              ...actors
                .filter((a) => a.user_id !== null)
                .map((a) => ({ value: a.user_id as number, label: a.user_name }))
            ]}
          />
          <Input
            label="From"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={clearFilters}
            className="text-slate-400 hover:text-white text-xs underline"
          >
            Clear filters
          </button>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">Show</span>
            <select
              className="bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 cursor-pointer"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[100, 200, 500, 1000, 5000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Log table */}
      <Card>
        {loading ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">
            No audit events match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-800">
                  <th className="pb-2 font-medium whitespace-nowrap">When</th>
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium">Record</th>
                  <th className="pb-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-800/50 last:border-0">
                    <td className="py-2 pr-3 text-slate-400 text-xs whitespace-nowrap align-top">
                      {entry.created_at}
                    </td>
                    <td className="py-2 pr-3 text-slate-300 align-top whitespace-nowrap">
                      {entry.user_name}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <Badge variant={ACTION_STYLES[entry.action] ?? 'neutral'}>
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <span className="text-white">{entry.entity_label || '—'}</span>
                      <span className="text-slate-500 text-xs block">{entry.entity_type}</span>
                    </td>
                    <td className="py-2 text-slate-300 align-top">
                      {entry.summary}
                      {entry.field_name && entry.action === 'update' && (
                        <span className="block text-xs mt-0.5">
                          <span className="text-red-400 line-through">
                            {entry.old_value || '(empty)'}
                          </span>
                          <span className="text-slate-600"> → </span>
                          <span className="text-emerald-400">{entry.new_value || '(empty)'}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length >= limit && (
              <p className="text-slate-500 text-xs text-center mt-3">
                Showing the most recent {limit} events — narrow the filters or raise the limit to
                see more.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
