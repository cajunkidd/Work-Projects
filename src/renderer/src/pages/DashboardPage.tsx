import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { useThemeStore } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import type { BudgetSummary, Contract, Invoice } from '../../../shared/types'

const STATUS_COLORS = {
  active: '#10b981',
  expiring_soon: '#f59e0b',
  expired: '#ef4444',
  pending: '#6b7280'
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

type BreakdownItem = BudgetSummary & { type: 'branch' | 'department' }

function BudgetBreakdownPanel({ items }: { items: BreakdownItem[] }) {
  const sort = (arr: BreakdownItem[]) =>
    [...arr].sort((a, b) => {
      const pA = a.total_budget > 0 ? a.total_spent / a.total_budget : 0
      const pB = b.total_budget > 0 ? b.total_spent / b.total_budget : 0
      return pB - pA
    })

  const branches = sort(items.filter((i) => i.type === 'branch'))
  const depts = sort(items.filter((i) => i.type === 'department'))
  const showHeaders = branches.length > 0 && depts.length > 0

  const renderRow = (item: BreakdownItem) => {
    const pct = item.total_budget > 0 ? Math.min((item.total_spent / item.total_budget) * 100, 100) : 0
    const over = item.total_budget > 0 && item.total_spent > item.total_budget
    const near = !over && pct >= 70
    const barColor = over ? '#ef4444' : near ? '#f59e0b' : '#10b981'
    const remaining = item.total_budget - item.total_spent
    const noBudget = item.total_budget === 0
    const name = item.type === 'branch'
      ? `#${item.branch_number ?? ''} – ${item.branch_name}`
      : item.department_name

    return (
      <div
        key={`${item.type}-${item.branch_id ?? item.department_id}`}
        className="grid grid-cols-12 items-center gap-3 py-2.5 border-b border-slate-800 last:border-0"
      >
        {/* Name + type badge */}
        <div className="col-span-3 flex items-center gap-2 min-w-0">
          <span className="text-white text-sm font-medium truncate">{name}</span>
          <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
            item.type === 'branch' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
          }`}>
            {item.type === 'branch' ? 'Branch' : 'Dept'}
          </span>
        </div>

        {/* Progress bar + % */}
        <div className="col-span-4 flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: noBudget ? '0%' : `${pct}%`, background: barColor }}
            />
          </div>
          <span className="text-slate-300 text-xs w-8 text-right shrink-0">
            {noBudget ? '—' : `${Math.round(pct)}%`}
          </span>
        </div>

        {/* Spent / Budget */}
        <div className="col-span-2 text-right">
          {noBudget ? (
            <span className="text-slate-500 text-xs">No budget</span>
          ) : (
            <>
              <span className="text-white text-xs font-medium">{fmt(item.total_spent)}</span>
              <span className="text-slate-500 text-xs"> / {fmt(item.total_budget)}</span>
            </>
          )}
        </div>

        {/* Remaining */}
        <div className="col-span-2 text-right">
          {noBudget ? (
            <span className="text-slate-500 text-xs">—</span>
          ) : (
            <span className={`text-xs font-medium ${remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {remaining >= 0 ? `${fmt(remaining)} left` : `${fmt(Math.abs(remaining))} over`}
            </span>
          )}
        </div>

        {/* Status badge */}
        <div className="col-span-1 flex justify-end">
          {noBudget ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 whitespace-nowrap">No Budget</span>
          ) : over ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 font-medium whitespace-nowrap">Over Budget</span>
          ) : near ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-300 font-medium whitespace-nowrap">Near Limit</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 font-medium whitespace-nowrap">Within Budget</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <p className="text-white font-semibold mb-4">Budget Breakdown</p>
      {items.length === 0 ? (
        <p className="text-slate-400 text-sm">No budget data available</p>
      ) : (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-12 gap-3 pb-2 border-b border-slate-700 mb-1">
            <span className="col-span-3 text-slate-500 text-xs uppercase tracking-wide">Name</span>
            <span className="col-span-4 text-slate-500 text-xs uppercase tracking-wide">Utilization</span>
            <span className="col-span-2 text-slate-500 text-xs uppercase tracking-wide text-right">Spent / Budget</span>
            <span className="col-span-2 text-slate-500 text-xs uppercase tracking-wide text-right">Remaining</span>
            <span className="col-span-1 text-slate-500 text-xs uppercase tracking-wide text-right">Status</span>
          </div>

          {showHeaders && branches.length > 0 && (
            <>
              <p className="text-slate-500 text-xs uppercase tracking-wide mt-3 mb-1">Store Branches</p>
              {branches.map(renderRow)}
            </>
          )}
          {!showHeaders && branches.map(renderRow)}

          {showHeaders && depts.length > 0 && (
            <>
              <p className="text-slate-500 text-xs uppercase tracking-wide mt-4 mb-1">Departments</p>
              {depts.map(renderRow)}
            </>
          )}
          {!showHeaders && depts.map(renderRow)}
        </>
      )}
    </Card>
  )
}

function BudgetGauge({ summary }: { summary: BudgetSummary }) {
  const pct = summary.total_budget > 0 ? Math.min((summary.total_spent / summary.total_budget) * 100, 100) : 0
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'
  const data = [{ name: 'used', value: pct, fill: color }]
  const label = summary.branch_name ?? summary.department_name ?? 'Company'

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <RadialBarChart
          width={160}
          height={160}
          cx={80}
          cy={80}
          innerRadius={55}
          outerRadius={75}
          barSize={14}
          data={[{ value: 100, fill: '#1e293b' }, ...data]}
          startAngle={225}
          endAngle={-45}
        >
          <RadialBar dataKey="value" cornerRadius={6} background={false} />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white text-xl font-bold">{Math.round(pct)}%</span>
          <span className="text-slate-400 text-xs">used</span>
        </div>
      </div>
      <p className="text-white text-sm font-medium mt-1 text-center">{label}</p>
      <p className="text-slate-400 text-xs">{fmt(summary.total_spent)} / {fmt(summary.total_budget)}</p>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { selectedDeptId, brandPrimary } = useThemeStore()
  const { user } = useAuthStore()
  const [summaries, setSummaries] = useState<BudgetSummary[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [upcomingRenewals, setUpcomingRenewals] = useState<Contract[]>([])
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [spendTrend, setSpendTrend] = useState<{ month: string; amount: number }[]>([])
  const [projectCounts, setProjectCounts] = useState({ active: 0, on_hold: 0, completed: 0 })
  const year = new Date().getFullYear()

  useEffect(() => {
    if (!user) return

    // Budget summaries — pass role filter for scoped access
    const budgetFilter = user.role !== 'super_admin'
      ? { role: user.role, department_ids: user.department_ids, branch_ids: user.branch_ids }
      : undefined
    window.api.budget.summaries(year, budgetFilter).then((res) => {
      if (res.success && res.data) setSummaries(res.data)
    })

    // Contracts — role-based filter
    const contractOpts: any = {}
    if (user.role === 'super_admin') {
      if (selectedDeptId) contractOpts.department_id = selectedDeptId
    } else {
      contractOpts.role = user.role
      contractOpts.allowed_department_ids = user.department_ids
      contractOpts.allowed_branch_ids = user.branch_ids
    }

    window.api.contracts.list(contractOpts).then((res) => {
      if (res.success && res.data) setContracts(res.data)
    })

    window.api.dashboard.upcomingRenewals().then((res) => {
      if (res.success && res.data) {
        let filtered = res.data as Contract[]
        if (user.role === 'store_manager') {
          filtered = filtered.filter((c) => c.branch_id !== null && user.branch_ids.includes(c.branch_id))
        } else if (user.role === 'director') {
          filtered = filtered.filter((c) =>
            (c.branch_id !== null && user.branch_ids.includes(c.branch_id)) ||
            (c.department_id !== null && user.department_ids.includes(c.department_id))
          )
        } else if (selectedDeptId) {
          filtered = filtered.filter((c) => c.department_id === selectedDeptId)
        }
        setUpcomingRenewals(filtered.slice(0, 8))
      }
    })

    window.api.invoices.list().then((res) => {
      if (res.success && res.data) setRecentInvoices(res.data.slice(0, 5))
    })

    window.api.dashboard.spendTrend({ fiscal_year: year, department_id: selectedDeptId ?? undefined }).then((res) => {
      if (res.success && res.data) setSpendTrend(res.data)
    })

    window.api.projects.list().then((res) => {
      if (res.success && res.data) {
        const counts = { active: 0, on_hold: 0, completed: 0 }
        res.data.forEach((p: any) => {
          if (p.status in counts) counts[p.status as keyof typeof counts]++
        })
        setProjectCounts(counts)
      }
    })
  }, [selectedDeptId, year, user])

  // Status breakdown for pie chart
  const statusCounts = ['active', 'expiring_soon', 'expired', 'pending'].map((s) => ({
    name: s.replace('_', ' '),
    value: contracts.filter((c) => c.status === s).length,
    fill: STATUS_COLORS[s as keyof typeof STATUS_COLORS]
  })).filter((s) => s.value > 0)

  // Budget bars — department budgets (super_admin and director)
  const deptBudgets = summaries.filter((s) => s.department_id !== null && s.branch_id === null)
  // Branch budget gauges (visible to all roles based on their scoped summaries)
  const branchBudgets = summaries.filter((s) => s.branch_id !== null)

  // Current summary for the gauge:
  // - store_manager: their single branch budget
  // - director: first assigned branch or first assigned department
  // - super_admin: company overall or selected dept
  const currentSummary = (() => {
    if (user?.role === 'store_manager') return branchBudgets[0] ?? null
    if (user?.role === 'director') return branchBudgets[0] ?? deptBudgets[0] ?? null
    if (selectedDeptId) return summaries.find((s) => s.department_id === selectedDeptId) ?? null
    return summaries.find((s) => s.department_id === null && s.branch_id === null) ?? null
  })()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-400 text-sm">
          {user?.role === 'store_manager'
            ? `Your branches · FY ${year}`
            : user?.role === 'director'
              ? `Your departments & branches · FY ${year}`
              : selectedDeptId
                ? `Department view · FY ${year}`
                : `Company overview · FY ${year}`}
        </p>
      </div>

      {/* Top row: Budget gauge + stats */}
      <div className="grid grid-cols-12 gap-4">
        {/* Budget gauge */}
        <Card className="col-span-3 flex items-center justify-center py-4">
          {currentSummary ? (
            <BudgetGauge summary={currentSummary} />
          ) : (
            <p className="text-slate-400 text-sm">No budget set</p>
          )}
        </Card>

        {/* Stats */}
        <div className="col-span-9 grid grid-cols-4 gap-4">
          {[
            { label: 'Total Contracts', value: contracts.length, sub: 'all time' },
            {
              label: 'Active',
              value: contracts.filter((c) => c.status === 'active').length,
              sub: 'contracts'
            },
            {
              label: 'Expiring Soon',
              value: contracts.filter((c) => c.status === 'expiring_soon').length,
              sub: '≤120 days'
            },
            {
              label: 'Annual Spend',
              value: fmt(contracts.reduce((s, c) => s + (c.annual_cost || 0), 0)),
              sub: 'active contracts'
            }
          ].map((stat) => (
            <Card key={stat.label}>
              <p className="text-slate-400 text-xs mb-1">{stat.label}</p>
              <p className="text-white text-2xl font-bold">{stat.value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{stat.sub}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-12 gap-4">
        {/* Spend trend */}
        <Card className="col-span-8">
          <p className="text-white font-semibold mb-4">Monthly Spend Trend</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={spendTrend}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={brandPrimary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={brandPrimary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [fmt(v), 'Spend']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <Area type="monotone" dataKey="amount" stroke={brandPrimary} fill="url(#spendGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Contract status pie */}
        <Card className="col-span-4">
          <p className="text-white font-semibold mb-4">Contract Status</p>
          {statusCounts.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusCounts} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" label={({ name, value }) => `${value}`} labelLine={false}>
                  {statusCounts.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm text-center mt-12">No contracts</p>
          )}
        </Card>
      </div>

      {/* Budget Breakdown — all roles see their accessible entities */}
      {(branchBudgets.length > 0 || deptBudgets.length > 0) && (
        <BudgetBreakdownPanel
          items={[
            ...branchBudgets.map((s) => ({ ...s, type: 'branch' as const })),
            ...deptBudgets.map((s) => ({ ...s, type: 'department' as const }))
          ]}
        />
      )}

      {/* Bottom row: Upcoming renewals + recent invoices + projects */}
      <div className="grid grid-cols-12 gap-4">
        {/* Upcoming renewals */}
        <Card className="col-span-6">
          <p className="text-white font-semibold mb-3">Upcoming Renewals</p>
          {upcomingRenewals.length === 0 ? (
            <p className="text-slate-400 text-sm">No contracts expiring within 120 days</p>
          ) : (
            <div className="space-y-2">
              {upcomingRenewals.map((c) => {
                const days = c.days_until_renewal ?? 0
                const variant = days <= 30 ? 'danger' : days <= 60 ? 'warning' : 'info'
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0 cursor-pointer hover:bg-slate-800/50 rounded px-2 -mx-2"
                    onClick={() => navigate(`/contracts/${c.id}`)}
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{c.vendor_name}</p>
                      <p className="text-slate-400 text-xs">{c.branch_name ?? c.department_name}</p>
                    </div>
                    <Badge variant={variant}>{days}d</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Recent invoices */}
        <Card className="col-span-3">
          <p className="text-white font-semibold mb-3">Recent Invoices</p>
          {recentInvoices.length === 0 ? (
            <p className="text-slate-400 text-sm">No invoices</p>
          ) : (
            <div className="space-y-2">
              {recentInvoices.map((inv) => {
                const over = inv.amount > inv.budgeted_amount * 1.05
                return (
                  <div key={inv.id} className="py-1.5 border-b border-slate-800 last:border-0">
                    <p className="text-white text-xs font-medium truncate">{inv.subject}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-slate-400 text-xs">{inv.received_date}</span>
                      <Badge variant={over ? 'danger' : 'success'}>{fmt(inv.amount)}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Projects */}
        <Card className="col-span-3">
          <p className="text-white font-semibold mb-3">Vendor Projects</p>
          <div className="space-y-3">
            {[
              { label: 'Active', count: projectCounts.active, color: '#10b981' },
              { label: 'On Hold', count: projectCounts.on_hold, color: '#f59e0b' },
              { label: 'Completed', count: projectCounts.completed, color: '#6b7280' }
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-slate-300 text-sm">{s.label}</span>
                </div>
                <span className="text-white font-bold text-sm">{s.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
