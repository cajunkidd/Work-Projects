import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { AuditEntry } from '../../../../shared/types'

interface Props {
  contractId: number
}

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

export default function HistoryTab({ contractId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.audit
      .entityHistory({ entity_type: 'contract', entity_id: contractId })
      .then((res) => {
        if (res.success && res.data) setEntries(res.data)
        setLoading(false)
      })
  }, [contractId])

  if (loading) return <p className="text-slate-400 text-sm">Loading history…</p>

  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-slate-400 text-sm">
          No recorded activity yet. Every change to this contract from now on is logged here with
          who made it and when.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <p className="text-white font-semibold">Change History</p>
        <span className="text-slate-400 text-xs">
          {entries.length} recorded event{entries.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="relative">
        {/* Timeline rail */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-800" />

        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="relative pl-7">
              <span className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-slate-900 bg-slate-600" />
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={ACTION_STYLES[entry.action] ?? 'neutral'}>{entry.action}</Badge>
                    <span className="text-white text-sm">{entry.summary}</span>
                  </div>
                  {entry.field_name && entry.action === 'update' && (
                    <div className="flex items-baseline gap-2 text-xs mt-1">
                      <span className="text-red-400 line-through">
                        {entry.old_value || '(empty)'}
                      </span>
                      <span className="text-slate-600">→</span>
                      <span className="text-emerald-400">{entry.new_value || '(empty)'}</span>
                    </div>
                  )}
                </div>
                <span className="text-slate-400 text-xs whitespace-nowrap">
                  {entry.user_name} · {entry.created_at}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
