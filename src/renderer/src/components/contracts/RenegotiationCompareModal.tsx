import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Modal from '../ui/Modal'
import type { RenewalHistory } from '../../../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  contractId: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function pctChange(from: number, to: number): string {
  if (from === 0) return to === 0 ? '—' : '+∞'
  const pct = ((to - from) / from) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

export default function RenegotiationCompareModal({ open, onClose, contractId }: Props) {
  const [renewals, setRenewals] = useState<RenewalHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    window.api.renewals.list(contractId).then((res) => {
      if (res.success && res.data) setRenewals(res.data)
      setLoading(false)
    })
  }, [open, contractId])

  const latest = renewals[0] // renewals are ordered DESC
  const previous = renewals[1]

  return (
    <Modal open={open} onClose={onClose} title="Renegotiation Comparison" width="max-w-lg">
      {loading ? (
        <p className="text-slate-400 text-sm text-center py-6">Loading…</p>
      ) : renewals.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-6">
          No renewal history recorded for this contract. Log a renewal from the Renewals tab first.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Latest renewal diff */}
          <Card>
            <p className="text-white font-semibold mb-2">Latest Renewal</p>
            <p className="text-slate-400 text-xs mb-3">{latest.renewal_date}</p>
            <div className="space-y-2">
              <Row
                label="Cost"
                prev={fmt(latest.prev_cost)}
                curr={fmt(latest.new_cost)}
                delta={latest.new_cost - latest.prev_cost}
                pct={pctChange(latest.prev_cost, latest.new_cost)}
                isAmount
              />
              <Row
                label="Licenses"
                prev="—"
                curr={latest.license_count_change !== 0 ? String(latest.license_count_change) : '—'}
                delta={latest.license_count_change}
                isAmount={false}
              />
              {latest.reason && (
                <div className="mt-2">
                  <p className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Reason</p>
                  <p className="text-slate-300 text-sm">{latest.reason}</p>
                </div>
              )}
            </div>
            {/* Warnings */}
            {(() => {
              const warnings: string[] = []
              const costPct = latest.prev_cost > 0
                ? ((latest.new_cost - latest.prev_cost) / latest.prev_cost) * 100
                : 0
              if (costPct > 20)
                warnings.push(`Cost increase of ${costPct.toFixed(1)}% exceeds 20% threshold`)
              if (latest.license_count_change < -5)
                warnings.push(`License count decreased by ${-latest.license_count_change} (> 5 seats)`)
              if (warnings.length === 0) return null
              return (
                <div className="mt-3 space-y-1">
                  {warnings.map((w, i) => (
                    <div
                      key={i}
                      className="text-amber-300 text-xs bg-amber-900/20 border border-amber-800/40 rounded px-2 py-1.5 flex items-center gap-2"
                    >
                      <span className="text-amber-400">!</span> {w}
                    </div>
                  ))}
                </div>
              )
            })()}
          </Card>

          {/* All renewals history timeline */}
          {renewals.length > 1 && (
            <Card>
              <p className="text-white font-semibold mb-2">Renewal History</p>
              <div className="space-y-1.5">
                {renewals.map((r, i) => {
                  const delta = r.new_cost - r.prev_cost
                  const variant = delta > 0 ? 'danger' : delta < 0 ? 'success' : 'neutral'
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-sm py-1.5 border-b border-slate-800 last:border-0"
                    >
                      <span className="text-slate-300">{r.renewal_date}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">{fmt(r.prev_cost)} → {fmt(r.new_cost)}</span>
                        <Badge variant={variant}>
                          {delta >= 0 ? '+' : ''}{fmt(delta)}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Compare last two renewals */}
          {previous && (
            <Card>
              <p className="text-white font-semibold mb-2">Trend: Last Two Renewals</p>
              <div className="grid grid-cols-3 text-center text-sm py-2">
                <div>
                  <p className="text-slate-500 text-xs">Previous delta</p>
                  <p className={`font-medium ${(previous.new_cost - previous.prev_cost) >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {fmt(previous.new_cost - previous.prev_cost)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Latest delta</p>
                  <p className={`font-medium ${(latest.new_cost - latest.prev_cost) >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {fmt(latest.new_cost - latest.prev_cost)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Acceleration</p>
                  <p className="text-white font-medium">
                    {pctChange(
                      Math.abs(previous.new_cost - previous.prev_cost) || 1,
                      Math.abs(latest.new_cost - latest.prev_cost)
                    )}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </Modal>
  )
}

function Row({
  label,
  prev,
  curr,
  delta,
  pct,
  isAmount
}: {
  label: string
  prev: string
  curr: string
  delta: number
  pct?: string
  isAmount: boolean
}) {
  const color = delta > 0 ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-slate-400'
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-slate-500">{prev}</span>
        <span className="text-slate-500">→</span>
        <span className="text-white font-medium">{curr}</span>
        {isAmount && (
          <span className={`text-xs font-medium ${color}`}>
            ({delta >= 0 ? '+' : ''}{fmt(delta)}{pct ? ` · ${pct}` : ''})
          </span>
        )}
      </div>
    </div>
  )
}
