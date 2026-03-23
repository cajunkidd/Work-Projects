import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { useThemeStore } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import type { BudgetSummary, Contract } from '../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function statusVariant(s: string) {
  return s === 'active' ? 'success' : s === 'expiring_soon' ? 'warning' : s === 'expired' ? 'danger' : 'neutral'
}

interface OrgDetailPageProps {
  type: 'department' | 'branch'
}

export default function OrgDetailPage({ type }: OrgDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { brandPrimary } = useThemeStore()
  const { user } = useAuthStore()
  const year = new Date().getFullYear()

  const [summary, setSummary] = useState<BudgetSummary | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [spendTrend, setSpendTrend] = useState<{ month: string; amount: number }[]>([])
  const [upcomingRenewals, setUpcomingRenewals] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  const entityId = id ? parseInt(id) : null

  useEffect(() => {
    if (!entityId || !user) return
    setLoading(true)

    const budgetFilter = user.role !== 'super_admin'
      ? { role: user.role, department_ids: user.department_ids, branch_ids: user.branch_ids }
      : undefined

    const contractOpts: any = type === 'department'
      ? { department_id: entityId }
      : { branch_id: entityId }

    const trendOpts: any = { fiscal_year: year }
    if (type === 'department') trendOpts.department_id = entityId
    else trendOpts.branch_id = entityId

    Promise.all([
      window.api.budget.summaries(year, budgetFilter),
      window.api.contracts.list(contractOpts),
      window.api.dashboard.spendTrend(trendOpts),
      window.api.dashboard.upcomingRenewals()
    ]).then(([summaryRes, contractsRes, trendRes, renewalsRes]) => {
      if (summaryRes.success && summaryRes.data) {
        const match = summaryRes.data.find((s: BudgetSummary) =>
          type === 'department'
            ? s.department_id === entityId && s.branch_id === null
            : s.branch_id === entityId
        )
        setSummary(match ?? null)
      }
      if (contractsRes.success && contractsRes.data) setContracts(contractsRes.data)
      if (trendRes.success && trendRes.data) setSpendTrend(trendRes.data)
      if (renewalsRes.success && renewalsRes.data) {
        let filtered = renewalsRes.data as Contract[]
        if (type === 'department') {
          filtered = filtered.filter((c) => c.department_id === entityId)
        } else {
          filtered = filtered.filter((c) => c.branch_id === entityId)
        }
        setUpcomingRenewals(filtered.slice(0, 8))
      }
      setLoading(false)
    })
  }, [entityId, type, year, user])

  const entityName = summary
    ? type === 'branch'
      ? `#${(summary as any).branch_number ?? ''} – ${summary.branch_name}`
      : summary.department_name
    : type === 'branch' ? 'Branch' : 'Department'

  const pct = summary && summary.total_budget > 0
    ? Math.min((summary.total_spent / summary.total_budget) * 100, 100)
    : 0
  const over = summary && summary.total_budget > 0 && summary.total_spent > summary.total_budget
  const near = !over && pct >= 70

  const activeContracts = contracts.filter((c) => c.status === 'active').length
  const annualSpend = contracts.reduce((s, c) => s + (c.annual_cost || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <span className="text-slate-600">/</span>
          <h1 className="text-white text-xl font-bold">{entityName}</h1>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            type === 'branch' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
          }`}>
            {type === 'branch' ? 'Branch' : 'Department'}
          </span>
        </div>
        {summary && summary.total_budget > 0 && (
          over ? (
            <span className="text-xs px-3 py-1 rounded-full bg-red-900/50 text-red-300 font-medium">Over Budget</span>
          ) : near ? (
            <span className="text-xs px-3 py-1 rounded-full bg-amber-900/50 text-amber-300 font-medium">Near Limit</span>
          ) : (
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-900/50 text-emerald-300 font-medium">Within Budget</span>
          )
        )}
      </div>

      {/* Budget gauge + stat cards */}
      <div className="grid grid-cols-12 gap-4">
        {/* Budget gauge */}
        <Card className="col-span-3 flex flex-col items-center justify-center py-4">
          {summary && summary.total_budget > 0 ? (
            <>
              <div className="relative w-32 h-32 flex items-center justify-center mb-2">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="14" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={over ? '#ef4444' : near ? '#f59e0b' : '#10b981'}
                    strokeWidth="14"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - pct / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-white text-2xl font-bold">{Math.round(pct)}%</span>
                  <span className="text-slate-400 text-xs">used</span>
                </div>
              </div>
              <p className="text-white text-sm font-medium text-center">{entityName}</p>
              <p className="text-slate-400 text-xs">{fmt(summary.total_spent)} / {fmt(summary.total_budget)}</p>
            </>
          ) : (
            <p className="text-slate-400 text-sm">No budget set</p>
          )}
        </Card>

        {/* Stat cards */}
        <div className="col-span-9 grid grid-cols-4 gap-4">
          {[
            { label: 'Total Contracts', value: contracts.length, sub: 'all time' },
            { label: 'Active', value: activeContracts, sub: 'contracts' },
            { label: 'Annual Spend', value: fmt(annualSpend), sub: 'active contracts' },
            {
              label: 'Budget Remaining',
              value: summary && summary.total_budget > 0
                ? fmt(summary.total_budget - summary.total_spent)
                : '—',
              sub: summary && summary.total_budget > 0 ? `of ${fmt(summary.total_budget)}` : 'no budget set'
            }
          ].map((stat) => (
            <Card key={stat.label}>
              <p className="text-slate-400 text-xs mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${
                stat.label === 'Budget Remaining' && summary && summary.remaining < 0
                  ? 'text-red-400'
                  : 'text-white'
              }`}>{stat.value}</p>
              <p className="text-slate-500 text-xs mt-0.5">{stat.sub}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Monthly Spend Trend */}
      <Card>
        <p className="text-white font-semibold mb-4">Monthly Spend Trend · FY {year}</p>
        {spendTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={spendTrend}>
              <defs>
                <linearGradient id="orgSpendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={brandPrimary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={brandPrimary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => [fmt(v), 'Spend']}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              />
              <Area type="monotone" dataKey="amount" stroke={brandPrimary} fill="url(#orgSpendGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-400 text-sm text-center py-8">No spend data for this fiscal year</p>
        )}
      </Card>

      {/* Contracts */}
      <div>
        <h2 className="text-white font-semibold mb-3">Contracts ({contracts.length})</h2>
        {contracts.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-slate-400">No contracts found.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {contracts.map((c) => (
              <Card
                key={c.id}
                onClick={() => navigate(`/contracts/${c.id}`)}
                className="hover:border-slate-600 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-semibold">{c.vendor_name}</h3>
                      <Badge variant={statusVariant(c.status)}>
                        {c.status.replace('_', ' ')}
                      </Badge>
                      {c.days_until_renewal !== undefined && c.days_until_renewal >= 0 && c.days_until_renewal <= 120 && (
                        <Badge variant={c.days_until_renewal <= 30 ? 'danger' : 'warning'}>
                          {c.days_until_renewal}d to renewal
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                      <span>Start: <span className="text-slate-300">{c.start_date}</span></span>
                      <span>End: <span className="text-slate-300">{c.end_date}</span></span>
                      {c.poc_name && <span>POC: <span className="text-slate-300">{c.poc_name}</span></span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white font-bold text-lg">{fmt(c.annual_cost)}<span className="text-slate-400 text-sm font-normal">/yr</span></p>
                    <p className="text-slate-400 text-sm">{fmt(c.monthly_cost)}/mo</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Renewals */}
      {upcomingRenewals.length > 0 && (
        <Card>
          <p className="text-white font-semibold mb-3">Upcoming Renewals</p>
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
                    <p className="text-slate-400 text-xs">{c.end_date}</p>
                  </div>
                  <Badge variant={variant}>{days}d</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
