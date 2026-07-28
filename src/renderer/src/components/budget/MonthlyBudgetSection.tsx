import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import type { Department, Branch, MonthlyBudget, MonthlyBudgetSummary } from '../../../../shared/types'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

interface Props {
  departments: Department[]
  branches: Branch[]
}

export default function MonthlyBudgetSection({ departments, branches }: Props) {
  const [scope, setScope] = useState<'company' | 'department' | 'branch'>('company')
  const [deptId, setDeptId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [amounts, setAmounts] = useState<string[]>(Array(12).fill(''))
  const [summary, setSummary] = useState<MonthlyBudgetSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const department_id = scope === 'department' && deptId ? parseInt(deptId) : null
  const branch_id = scope === 'branch' && branchId ? parseInt(branchId) : null
  const fiscal_year = parseInt(year) || new Date().getFullYear()
  const scopeReady = scope === 'company' || (scope === 'department' ? !!deptId : !!branchId)

  const load = () => {
    if (!scopeReady) return
    const opts = { fiscal_year, department_id, branch_id }
    window.api.budget.monthlyList(opts).then((res) => {
      const next = Array(12).fill('')
      if (res.success && res.data) {
        for (const row of res.data) {
          if (row.month >= 1 && row.month <= 12) next[row.month - 1] = String(row.amount)
        }
      }
      setAmounts(next)
    })
    window.api.budget.monthlySummary(opts).then((res) => {
      if (res.success && res.data) setSummary(res.data)
    })
  }

  useEffect(() => { load() }, [scope, deptId, branchId, year])

  const handleSave = async () => {
    if (!scopeReady) return
    setSaving(true)
    const entries: MonthlyBudget[] = amounts.map((a, i) => ({
      department_id,
      branch_id,
      fiscal_year,
      month: i + 1,
      amount: parseFloat(a) || 0
    }))
    const res = await window.api.budget.monthlyBulkUpsert(entries)
    setSaving(false)
    if (res.success) {
      setMsg('Monthly budgets saved!')
      load()
    } else {
      setMsg(`Error: ${res.error}`)
    }
    setTimeout(() => setMsg(''), 3000)
  }

  const setAmount = (i: number, v: string) =>
    setAmounts((prev) => prev.map((a, idx) => (idx === i ? v : a)))

  const totalBudgeted = amounts.reduce((s, a) => s + (parseFloat(a) || 0), 0)
  const totalActual = summary.reduce((s, r) => s + r.actual, 0)

  return (
    <Card>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
            options={[
              { value: 'company', label: 'Company Overall' },
              { value: 'department', label: 'Department' },
              { value: 'branch', label: 'Store Branch' }
            ]}
          />
          {scope === 'department' && (
            <Select
              label="Department"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              options={[{ value: '', label: 'Select department...' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
            />
          )}
          {scope === 'branch' && (
            <Select
              label="Store Branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              options={[{ value: '', label: 'Select branch...' }, ...branches.map((b) => ({ value: b.id, label: `Branch ${b.number} – ${b.name}` }))]}
            />
          )}
          <Input label="Fiscal Year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>

        {!scopeReady ? (
          <p className="text-slate-400 text-sm">Select a {scope} to manage its monthly budget.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-left border-b border-slate-800">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium w-40">Budgeted ($)</th>
                    <th className="pb-2 font-medium text-right">Actual</th>
                    <th className="pb-2 font-medium text-right">Variance</th>
                    <th className="pb-2 font-medium text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTH_LABELS.map((label, i) => {
                    const row = summary.find((r) => r.month === i + 1)
                    const budgeted = parseFloat(amounts[i]) || 0
                    const actual = row?.actual ?? 0
                    const variance = actual - budgeted
                    const remaining = budgeted - actual
                    return (
                      <tr key={label} className="border-b border-slate-800/50 last:border-0">
                        <td className="py-2 text-white font-medium">{label}</td>
                        <td className="py-2 pr-4">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none w-full placeholder-slate-500"
                            placeholder="0"
                            value={amounts[i]}
                            onChange={(e) => setAmount(i, e.target.value)}
                          />
                        </td>
                        <td className="py-2 text-right text-slate-300">{fmt(actual)}</td>
                        <td className={`py-2 text-right ${variance > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                          {variance > 0 ? '+' : ''}{fmt(variance)}
                        </td>
                        <td className={`py-2 text-right ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {fmt(remaining)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-700">
                    <td className="pt-2 text-slate-400 font-medium">Total</td>
                    <td className="pt-2 text-white font-bold pr-4">{fmt(totalBudgeted)}</td>
                    <td className="pt-2 text-right text-white font-bold">{fmt(totalActual)}</td>
                    <td className={`pt-2 text-right font-bold ${totalActual - totalBudgeted > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                      {totalActual - totalBudgeted > 0 ? '+' : ''}{fmt(totalActual - totalBudgeted)}
                    </td>
                    <td className={`pt-2 text-right font-bold ${totalBudgeted - totalActual < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {fmt(totalBudgeted - totalActual)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-slate-500 text-xs">
              Actual is the committed monthly spend from contracts active in each month. Variance = actual − budgeted; Remaining = budgeted − actual.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Monthly Budgets'}
              </Button>
              {msg && <span className={`text-sm ${msg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
