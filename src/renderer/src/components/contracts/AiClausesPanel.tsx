import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'

interface ExtractedClauses {
  counter_party: string | null
  effective_date: string | null
  termination_date: string | null
  auto_renewal: boolean | null
  notice_period_days: number | null
  payment_terms: string | null
  liability_cap: string | null
  governing_law: string | null
  termination_for_convenience: string | null
  confidentiality: string | null
  data_security: string | null
  warnings: string[]
}

interface Props {
  contractId: number
}

const LABELS: { key: keyof ExtractedClauses; label: string }[] = [
  { key: 'counter_party', label: 'Counter-party' },
  { key: 'effective_date', label: 'Effective date' },
  { key: 'termination_date', label: 'Termination date' },
  { key: 'auto_renewal', label: 'Auto-renews' },
  { key: 'notice_period_days', label: 'Notice period' },
  { key: 'payment_terms', label: 'Payment terms' },
  { key: 'liability_cap', label: 'Liability cap' },
  { key: 'governing_law', label: 'Governing law' },
  { key: 'termination_for_convenience', label: 'Termination for convenience' },
  { key: 'confidentiality', label: 'Confidentiality' },
  { key: 'data_security', label: 'Data security' }
]

function displayValue(key: keyof ExtractedClauses, v: any): string {
  if (v == null) return '—'
  if (key === 'auto_renewal') return v ? 'Yes' : 'No'
  if (key === 'notice_period_days') return `${v} day${v === 1 ? '' : 's'}`
  return String(v)
}

export default function AiClausesPanel({ contractId }: Props) {
  const [clauses, setClauses] = useState<ExtractedClauses | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    window.api.ai.getClauses(contractId).then((res: any) => {
      if (res.success) setClauses(res.data ?? null)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [contractId])

  const run = async () => {
    setRunning(true)
    setError('')
    const res = await window.api.ai.extractClauses(contractId)
    setRunning(false)
    if (res.success && res.data) setClauses(res.data)
    else setError(res.error ?? 'Extraction failed')
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-white font-semibold">AI Clause Extraction</h3>
          <p className="text-slate-400 text-xs">
            Extract counter-party, dates, renewal terms, liability, governing law from the PDF text
            using Claude.
          </p>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? 'Analysing…' : clauses ? 'Re-run' : 'Run extraction'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-2 mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : !clauses ? (
        <p className="text-slate-400 text-sm">
          No extraction yet. Upload a PDF and click "Run extraction" once an Anthropic API key is
          configured in Settings.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {LABELS.map(({ key, label }) => (
              <div key={key} className="flex justify-between gap-4 border-b border-slate-800 pb-1.5">
                <span className="text-slate-400">{label}</span>
                <span className="text-white text-right truncate">
                  {displayValue(key, clauses[key])}
                </span>
              </div>
            ))}
          </div>
          {clauses.warnings && clauses.warnings.length > 0 && (
            <div>
              <p className="text-amber-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Warnings
              </p>
              <ul className="space-y-1">
                {clauses.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="text-amber-300 text-xs bg-amber-900/20 border border-amber-800/40 rounded px-2 py-1.5"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
