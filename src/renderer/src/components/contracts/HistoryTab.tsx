import { useEffect, useState } from 'react'
import Card from '../ui/Card'

interface AuditLogEntry {
  id: number
  user_id: number | null
  user_name: string
  entity_type: string
  entity_id: number
  action: 'create' | 'update' | 'delete'
  diff_json: string
  timestamp: string
}

interface Props {
  contractId: number
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-900/50 text-emerald-300',
  update: 'bg-blue-900/50 text-blue-300',
  delete: 'bg-red-900/50 text-red-300'
}

function formatValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  const s = String(v)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
}

function describe(entry: AuditLogEntry): { title: string; details: React.ReactNode } {
  let parsed: any = {}
  try {
    parsed = JSON.parse(entry.diff_json)
  } catch {
    /* ignore */
  }

  if (entry.action === 'create') {
    const snap = parsed.snapshot
    return {
      title: 'Contract created',
      details: snap?.vendor_name ? (
        <p className="text-slate-400 text-xs">Vendor: {snap.vendor_name}</p>
      ) : null
    }
  }

  if (entry.action === 'delete') {
    const snap = parsed.snapshot
    return {
      title: 'Contract deleted',
      details: snap?.vendor_name ? (
        <p className="text-slate-400 text-xs">Vendor: {snap.vendor_name}</p>
      ) : null
    }
  }

  // update
  const structured: { summary: string; detail?: string }[] = []
  for (const [key, val] of Object.entries(parsed)) {
    if (key === 'note_added') {
      structured.push({
        summary: 'Note added',
        detail: (val as any).preview
      })
    } else if (key === 'note_deleted') {
      structured.push({
        summary: 'Note deleted',
        detail: (val as any).preview
      })
    } else if (key === 'obligation_added') {
      structured.push({
        summary: 'Obligation added',
        detail: `${(val as any).title} · due ${(val as any).due_date}`
      })
    } else if (key === 'obligation_completed') {
      structured.push({
        summary: 'Obligation completed',
        detail: (val as any).title
      })
    } else if (key === 'obligation_deleted') {
      structured.push({
        summary: 'Obligation deleted',
        detail: (val as any).title
      })
    } else if (key === 'renewal_logged') {
      const v = val as any
      const delta = v.cost_delta
      structured.push({
        summary: 'Renewal recorded',
        detail: `${v.date}${delta != null ? ` (cost change ${delta >= 0 ? '+' : ''}$${Math.round(delta).toLocaleString()})` : ''}`
      })
    } else if (val && typeof val === 'object' && 'from' in (val as any) && 'to' in (val as any)) {
      structured.push({
        summary: key,
        detail: `${formatValue((val as any).from)} → ${formatValue((val as any).to)}`
      })
    }
  }

  const title =
    structured.length === 1
      ? structured[0].summary
      : structured.length > 1
        ? `${structured.length} changes`
        : 'Updated'

  return {
    title,
    details: structured.length > 0 && (
      <ul className="text-slate-400 text-xs space-y-0.5 mt-1">
        {structured.map((s, i) => (
          <li key={i}>
            <span className="text-slate-300">{s.summary}</span>
            {s.detail && <span className="text-slate-500">: {s.detail}</span>}
          </li>
        ))}
      </ul>
    )
  }
}

export default function HistoryTab({ contractId }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.api.audit
      .entity({ entity_type: 'contract', entity_id: contractId, limit: 500 })
      .then((res: any) => {
        if (res.success && res.data) setEntries(res.data)
        setLoading(false)
      })
  }, [contractId])

  return (
    <div className="space-y-4">
      <div>
        <p className="text-white font-semibold">History</p>
        <p className="text-slate-400 text-xs">
          Everything that's happened to this contract — edits, notes, renewals, obligations.
        </p>
      </div>

      {loading ? (
        <Card className="text-center py-8">
          <p className="text-slate-400 text-sm">Loading…</p>
        </Card>
      ) : entries.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-slate-400 text-sm">
            No history yet. Activity on this contract will be recorded here.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-800">
            {entries.map((entry) => {
              const { title, details } = describe(entry)
              return (
                <div key={entry.id} className="py-3 flex items-start gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                      ACTION_COLORS[entry.action] ?? 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {entry.action}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white text-sm font-medium">{title}</p>
                      <p className="text-slate-500 text-xs flex-shrink-0">{entry.timestamp}</p>
                    </div>
                    <p className="text-slate-400 text-xs">by {entry.user_name || 'system'}</p>
                    {details}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
