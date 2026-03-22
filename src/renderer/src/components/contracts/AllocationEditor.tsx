import type { Branch, Department } from '../../../../shared/types'

export type AllocationRow = {
  target: 'branch' | 'department'
  targetId: string
  allocationType: 'percentage' | 'fixed'
  value: string
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

interface Props {
  allocations: AllocationRow[]
  onChange: (rows: AllocationRow[]) => void
  branches: Branch[]
  departments: Department[]
  annualCost?: number // for showing computed dollar amounts in fixed-% mode
}

export default function AllocationEditor({ allocations, onChange, branches, departments, annualCost }: Props) {
  const hasPercentage = allocations.some((r) => r.allocationType === 'percentage')
  const totalPct = allocations
    .filter((r) => r.allocationType === 'percentage')
    .reduce((sum, r) => sum + (parseFloat(r.value) || 0), 0)
  const totalFixed = allocations
    .filter((r) => r.allocationType === 'fixed')
    .reduce((sum, r) => sum + (parseFloat(r.value) || 0), 0)

  const pctOver = hasPercentage && totalPct > 100

  const update = (idx: number, patch: Partial<AllocationRow>) => {
    const next = allocations.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange(next)
  }

  const remove = (idx: number) => onChange(allocations.filter((_, i) => i !== idx))

  const addRow = () =>
    onChange([
      ...allocations,
      { target: 'branch', targetId: String(branches[0]?.id ?? ''), allocationType: 'percentage', value: '' }
    ])

  return (
    <div className="space-y-3">
      {allocations.length > 0 && (
        <div className="space-y-2">
          {allocations.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              {/* Target type */}
              <select
                className="col-span-2 bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600"
                value={row.target}
                onChange={(e) =>
                  update(idx, {
                    target: e.target.value as 'branch' | 'department',
                    targetId: e.target.value === 'branch'
                      ? String(branches[0]?.id ?? '')
                      : String(departments[0]?.id ?? '')
                  })
                }
              >
                <option value="branch">Branch</option>
                <option value="department">Department</option>
              </select>

              {/* Target selector */}
              <select
                className="col-span-4 bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600"
                value={row.targetId}
                onChange={(e) => update(idx, { targetId: e.target.value })}
              >
                {row.target === 'branch'
                  ? branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.number} – {b.name}
                      </option>
                    ))
                  : departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
              </select>

              {/* Allocation type */}
              <select
                className="col-span-2 bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600"
                value={row.allocationType}
                onChange={(e) => update(idx, { allocationType: e.target.value as 'percentage' | 'fixed' })}
              >
                <option value="percentage">%</option>
                <option value="fixed">$ Fixed</option>
              </select>

              {/* Value */}
              <input
                type="number"
                min="0"
                step={row.allocationType === 'percentage' ? '0.1' : '1'}
                max={row.allocationType === 'percentage' ? '100' : undefined}
                placeholder={row.allocationType === 'percentage' ? '0–100' : 'Amount'}
                className="col-span-3 bg-slate-700 text-white text-xs rounded px-2 py-1.5 border border-slate-600 placeholder-slate-500"
                value={row.value}
                onChange={(e) => update(idx, { value: e.target.value })}
              />

              {/* Remove */}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="col-span-1 text-slate-400 hover:text-red-400 text-sm font-bold flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add row + totals */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded px-3 py-1"
        >
          + Add Row
        </button>

        {allocations.length > 0 && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              pctOver
                ? 'bg-red-900/50 text-red-300'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {hasPercentage
              ? `${totalPct.toFixed(1)}% allocated${annualCost ? ` (${fmt(annualCost * totalPct / 100)})` : ''}`
              : `${fmt(totalFixed)} fixed`}
            {pctOver && ' — exceeds 100%'}
          </span>
        )}
      </div>

      {allocations.length === 0 && (
        <p className="text-slate-500 text-xs">
          No allocations added yet. Click "+ Add Row" to split this contract's cost.
        </p>
      )}
    </div>
  )
}
