import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  expiring_soon: '#f59e0b',
  expired: '#ef4444',
  pending: '#6b7280'
}

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#14b8a6']

const TABS = [
  { id: 'overview',    label: 'Overview',        icon: '📊' },
  { id: 'vendor',      label: 'Vendor Spend',    icon: '🏢' },
  { id: 'trend',       label: 'Spend Trend',     icon: '📈' },
  { id: 'renewals',    label: 'Renewals',         icon: '🔄' },
  { id: 'budget',      label: 'Budget vs Actual', icon: '💰' },
  { id: 'invoices',    label: 'Invoices',         icon: '🧾' },
  { id: 'department',  label: 'By Department',   icon: '🏛' },
  { id: 'branch',      label: 'By Branch',       icon: '🏪' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl px-5 py-4 flex flex-col gap-1">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
      {sub && <p className="text-slate-500 text-xs">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-white font-semibold text-sm uppercase tracking-wide mb-3">{children}</h3>
}

function NoData() {
  return (
    <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
      No data available
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-slate-300 font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Table builder for email HTML ─────────────────────────────────────────────

function buildTableHtml(rows: Record<string, any>[]): string {
  if (!rows?.length) return '<p>No data</p>'
  const cols = Object.keys(rows[0])
  const header = cols.map((c) => `<th style="padding:6px 10px;text-align:left;background:#f1f5f9;font-size:12px;color:#475569;">${c}</th>`).join('')
  const body = rows
    .slice(0, 100)
    .map((r) =>
      `<tr>${cols.map((c) => `<td style="padding:6px 10px;font-size:12px;color:#1e293b;border-top:1px solid #e2e8f0;">${r[c] ?? ''}</td>`).join('')}</tr>`
    )
    .join('')
  return `<table style="border-collapse:collapse;width:100%;">\n<thead><tr>${header}</tr></thead>\n<tbody>${body}</tbody>\n</table>`
}

// ─── Export helpers ───────────────────────────────────────────────────────────

async function doExport(reportName: string, data: any) {
  await (window as any).api.reports.export({ reportName, data })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  // Report data
  const [overview, setOverview] = useState<any>(null)
  const [vendorSpend, setVendorSpend] = useState<any[]>([])
  const [trend, setTrend] = useState<any[]>([])
  const [renewals, setRenewals] = useState<any[]>([])
  const [budget, setBudget] = useState<{ departments: any[]; branches: any[] } | null>(null)
  const [invoices, setInvoices] = useState<any>(null)
  const [deptSpend, setDeptSpend] = useState<any[]>([])
  const [branchSpend, setBranchSpend] = useState<any[]>([])

  // Email modal
  const [showEmail, setShowEmail] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')

  // Budget fiscal year
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())

  const load = useCallback(async () => {
    setLoading(true)
    const api = (window as any).api.reports
    const [ov, vs, tr, rn, inv, ds, bs] = await Promise.all([
      api.overview(),
      api.vendorSpend(),
      api.monthlyTrend(),
      api.renewals(),
      api.invoiceSummary(),
      api.spendByDept(),
      api.spendByBranch()
    ])
    if (ov.success) setOverview(ov.data)
    if (vs.success) setVendorSpend(vs.data)
    if (tr.success) setTrend(tr.data)
    if (rn.success) setRenewals(rn.data)
    if (inv.success) setInvoices(inv.data)
    if (ds.success) setDeptSpend(ds.data)
    if (bs.success) setBranchSpend(bs.data)
    setLoading(false)
  }, [])

  const loadBudget = useCallback(async () => {
    const res = await (window as any).api.reports.budgetVsActual(fiscalYear)
    if (res.success) setBudget(res.data)
  }, [fiscalYear])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadBudget() }, [loadBudget])

  // Build export payload for current tab
  const getExportPayload = () => {
    switch (activeTab) {
      case 'overview':   return { name: 'Contract Overview', data: overview?.recentContracts ?? [] }
      case 'vendor':     return { name: 'Vendor Spend', data: vendorSpend }
      case 'trend':      return { name: 'Monthly Spend Trend', data: trend }
      case 'renewals':   return { name: 'Upcoming Renewals', data: renewals }
      case 'budget':     return { name: 'Budget vs Actual', data: budget ?? {} }
      case 'invoices':   return { name: 'Invoice Summary', data: { Monthly: invoices?.monthly ?? [], 'Top Vendors': invoices?.topVendors ?? [] } }
      case 'department': return { name: 'Spend by Department', data: deptSpend }
      case 'branch':     return { name: 'Spend by Branch', data: branchSpend }
      default:           return { name: 'Report', data: [] }
    }
  }

  const getEmailTableHtml = (): string => {
    switch (activeTab) {
      case 'overview':   return buildTableHtml(overview?.recentContracts ?? [])
      case 'vendor':     return buildTableHtml(vendorSpend)
      case 'trend':      return buildTableHtml(trend)
      case 'renewals':   return buildTableHtml(renewals)
      case 'budget': {
        const dRows = (budget?.departments ?? []).map((r: any) => ({ ...r, type: 'Department' }))
        const bRows = (budget?.branches ?? []).map((r: any) => ({ ...r, type: 'Branch' }))
        return buildTableHtml([...dRows, ...bRows])
      }
      case 'invoices':   return buildTableHtml(invoices?.monthly ?? [])
      case 'department': return buildTableHtml(deptSpend)
      case 'branch':     return buildTableHtml(branchSpend)
      default:           return '<p>No data</p>'
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailSending(true)
    setEmailMsg('')
    const { name } = getExportPayload()
    const res = await (window as any).api.reports.email({
      to: emailTo,
      reportName: name,
      tableHtml: getEmailTableHtml()
    })
    setEmailSending(false)
    if (res.success) {
      setEmailMsg('Report sent successfully.')
      setTimeout(() => { setShowEmail(false); setEmailMsg('') }, 1500)
    } else {
      setEmailMsg(res.error ?? 'Failed to send.')
    }
  }

  const currentTabLabel = TABS.find((t) => t.id === activeTab)?.label ?? 'Report'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400 text-sm">Loading reports…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Reports</h1>
          <p className="text-slate-400 text-sm">Analytics and exports for your contract portfolio</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => doExport(getExportPayload().name, getExportPayload().data)}>
            ↓ Export Excel
          </Button>
          <Button size="sm" onClick={() => { setEmailMsg(''); setShowEmail(true) }}>
            ✉ Email Report
          </Button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-900 rounded-xl p-1 border border-slate-800 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab data={overview} />}
      {activeTab === 'vendor' && <VendorSpendTab data={vendorSpend} />}
      {activeTab === 'trend' && <TrendTab data={trend} />}
      {activeTab === 'renewals' && <RenewalsTab data={renewals} />}
      {activeTab === 'budget' && (
        <BudgetTab
          data={budget}
          fiscalYear={fiscalYear}
          onYearChange={(y) => setFiscalYear(y)}
        />
      )}
      {activeTab === 'invoices' && <InvoicesTab data={invoices} />}
      {activeTab === 'department' && <OrgSpendTab data={deptSpend} label="Department" />}
      {activeTab === 'branch' && <OrgSpendTab data={branchSpend} label="Branch" />}

      {/* Email Modal */}
      <Modal open={showEmail} onClose={() => setShowEmail(false)} title={`Email: ${currentTabLabel}`}>
        <form onSubmit={handleEmail} className="space-y-4">
          <p className="text-slate-400 text-sm">Send this report as an email with an inline data table.</p>
          <Input
            label="Recipient Email"
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            required
            placeholder="recipient@example.com"
          />
          {emailMsg && (
            <p className={`text-sm ${emailMsg.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
              {emailMsg}
            </p>
          )}
          <Button type="submit" className="w-full justify-center" disabled={emailSending}>
            {emailSending ? 'Sending…' : 'Send Report'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: any }) {
  if (!data) return <NoData />
  const { totals, statusCounts, recentContracts } = data

  const pieData = statusCounts.map((s: any) => ({
    name: s.status.replace('_', ' '),
    value: s.count,
    fill: STATUS_COLORS[s.status] ?? '#6b7280'
  }))

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Contracts" value={String(totals.total_contracts)} />
        <StatCard label="Annual Spend" value={fmtShort(totals.total_annual_spend)} sub={fmt(totals.total_annual_spend)} />
        <StatCard label="Monthly Spend" value={fmtShort(totals.total_monthly_spend)} />
        <StatCard label="Avg Contract Value" value={fmtShort(totals.avg_contract_value)} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Active" value={String(totals.active_count)} />
        <StatCard label="Expiring Soon" value={String(totals.expiring_count)} />
        <StatCard label="Expired" value={String(totals.expired_count)} />
        <StatCard label="Pending" value={String(totals.pending_count)} />
      </div>

      {/* Status Distribution Pie */}
      <Card>
        <SectionTitle>Contract Status Distribution</SectionTitle>
        {pieData.length === 0 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((entry: any, i: number) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [v, 'Contracts']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Recent Contracts Table */}
      <Card>
        <SectionTitle>Recently Added Contracts</SectionTitle>
        <DataTable
          rows={recentContracts}
          cols={[
            { key: 'vendor_name', label: 'Vendor' },
            { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
            { key: 'department_name', label: 'Department' },
            { key: 'branch_name', label: 'Branch' },
            { key: 'annual_cost', label: 'Annual Cost', render: (v) => fmt(v) },
            { key: 'end_date', label: 'End Date' }
          ]}
        />
      </Card>
    </div>
  )
}

// ─── Vendor Spend Tab ─────────────────────────────────────────────────────────

function VendorSpendTab({ data }: { data: any[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Vendors Tracked" value={String(data.length)} />
        <StatCard label="Total Annual Spend" value={fmtShort(data.reduce((s, r) => s + (r.annual_spend || 0), 0))} />
        <StatCard label="Top Vendor" value={data[0]?.vendor_name ?? '—'} sub={data[0] ? fmt(data[0].annual_spend) : ''} />
      </div>

      <Card>
        <SectionTitle>Top Vendors by Annual Spend</SectionTitle>
        {data.length === 0 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={Math.max(300, data.length * 36)}>
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtShort} />
              <YAxis type="category" dataKey="vendor_name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={140} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="annual_spend" name="Annual Spend" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <SectionTitle>Vendor Spend Details</SectionTitle>
        <DataTable
          rows={data}
          cols={[
            { key: 'vendor_name', label: 'Vendor' },
            { key: 'contract_count', label: 'Contracts' },
            { key: 'annual_spend', label: 'Annual Spend', render: (v) => fmt(v) },
            { key: 'monthly_spend', label: 'Monthly Spend', render: (v) => fmt(v) }
          ]}
        />
      </Card>
    </div>
  )
}

// ─── Spend Trend Tab ──────────────────────────────────────────────────────────

function TrendTab({ data }: { data: any[] }) {
  const totalSpend = data.reduce((s, r) => s + (r.total_annual || 0), 0)
  const totalContracts = data.reduce((s, r) => s + (r.contract_count || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Months Tracked" value={String(data.length)} />
        <StatCard label="Total Spend (Period)" value={fmtShort(totalSpend)} sub={fmt(totalSpend)} />
        <StatCard label="Contracts Started" value={String(totalContracts)} />
      </div>

      <Card>
        <SectionTitle>Monthly Contract Spend</SectionTitle>
        {data.length === 0 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtShort} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="total_monthly" name="Monthly Cost" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="total_annual" name="Annual Cost" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <SectionTitle>Spend by Month</SectionTitle>
        <DataTable
          rows={data}
          cols={[
            { key: 'month', label: 'Month' },
            { key: 'contract_count', label: 'Contracts' },
            { key: 'total_monthly', label: 'Monthly Cost', render: (v) => fmt(v) },
            { key: 'total_annual', label: 'Annual Cost', render: (v) => fmt(v) }
          ]}
        />
      </Card>
    </div>
  )
}

// ─── Renewals Tab ─────────────────────────────────────────────────────────────

function RenewalsTab({ data }: { data: any[] }) {
  const in30 = data.filter((r) => r.days_until_renewal <= 30).length
  const in60 = data.filter((r) => r.days_until_renewal <= 60).length
  const totalValue = data.reduce((s, r) => s + (r.annual_cost || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Renewing in 90 Days" value={String(data.length)} />
        <StatCard label="Within 30 Days" value={String(in30)} />
        <StatCard label="Within 60 Days" value={String(in60)} />
        <StatCard label="Total Value at Risk" value={fmtShort(totalValue)} sub={fmt(totalValue)} />
      </div>

      <Card>
        <SectionTitle>Days Until Renewal Distribution</SectionTitle>
        {data.length === 0 ? <NoData /> : (() => {
          const bands = [
            { name: '0–30 days', count: data.filter((r) => r.days_until_renewal <= 30).length, fill: '#ef4444' },
            { name: '31–60 days', count: data.filter((r) => r.days_until_renewal > 30 && r.days_until_renewal <= 60).length, fill: '#f59e0b' },
            { name: '61–90 days', count: data.filter((r) => r.days_until_renewal > 60).length, fill: '#10b981' }
          ]
          return (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bands}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                <Bar dataKey="count" name="Contracts">
                  {bands.map((b, i) => <Cell key={i} fill={b.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        })()}
      </Card>

      <Card>
        <SectionTitle>Upcoming Renewals (Next 90 Days)</SectionTitle>
        {data.length === 0 ? (
          <p className="text-slate-400 text-sm">No contracts renewing in the next 90 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Vendor', 'End Date', 'Days Left', 'Annual Cost', 'Dept / Branch', 'Status'].map((h) => (
                    <th key={h} className="text-left text-slate-400 text-xs font-medium pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => {
                  const urgency = r.days_until_renewal <= 30 ? 'text-red-400' : r.days_until_renewal <= 60 ? 'text-yellow-400' : 'text-green-400'
                  const scope = r.department_name ?? (r.branch_name ? `Branch ${r.branch_number} – ${r.branch_name}` : '—')
                  return (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 pr-4 text-white font-medium">{r.vendor_name}</td>
                      <td className="py-2.5 pr-4 text-slate-300">{r.end_date}</td>
                      <td className={`py-2.5 pr-4 font-semibold ${urgency}`}>{r.days_until_renewal}d</td>
                      <td className="py-2.5 pr-4 text-slate-300">{fmt(r.annual_cost)}</td>
                      <td className="py-2.5 pr-4 text-slate-400">{scope}</td>
                      <td className="py-2.5"><StatusBadge status={r.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Budget vs Actual Tab ─────────────────────────────────────────────────────

function BudgetTab({ data, fiscalYear, onYearChange }: { data: any; fiscalYear: number; onYearChange: (y: number) => void }) {
  const allRows = [...(data?.departments ?? []), ...(data?.branches ?? [])]
  const totalBudget = allRows.reduce((s: number, r: any) => s + (r.budget || 0), 0)
  const totalActual = allRows.reduce((s: number, r: any) => s + (r.actual || 0), 0)
  const overBudget = allRows.filter((r: any) => r.actual > r.budget && r.budget > 0).length

  return (
    <div className="space-y-6">
      {/* Fiscal Year Picker */}
      <div className="flex items-center gap-3">
        <span className="text-slate-400 text-sm">Fiscal Year:</span>
        <div className="flex gap-1">
          {[fiscalYear - 1, fiscalYear, fiscalYear + 1].map((y) => (
            <button
              key={y}
              onClick={() => onYearChange(y)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                y === fiscalYear ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Budget" value={fmtShort(totalBudget)} sub={fmt(totalBudget)} />
        <StatCard label="Total Actual" value={fmtShort(totalActual)} sub={fmt(totalActual)} />
        <StatCard label="Variance" value={fmtShort(totalBudget - totalActual)} sub={totalBudget > 0 ? `${((totalActual / totalBudget) * 100).toFixed(0)}% utilized` : ''} />
        <StatCard label="Over Budget" value={String(overBudget)} sub="units" />
      </div>

      {(data?.departments?.length ?? 0) > 0 && (
        <Card>
          <SectionTitle>Departments — Budget vs Actual ({fiscalYear})</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(200, (data.departments.length * 50))}>
            <BarChart data={data.departments} layout="vertical" margin={{ left: 20, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtShort} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={140} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="budget" name="Budget" fill="#6366f1" radius={[0, 4, 4, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {(data?.branches?.length ?? 0) > 0 && (
        <Card>
          <SectionTitle>Branches — Budget vs Actual ({fiscalYear})</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(200, (data.branches.length * 50))}>
            <BarChart data={data.branches} layout="vertical" margin={{ left: 20, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtShort} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={160} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="budget" name="Budget" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {allRows.length === 0 && <NoData />}
    </div>
  )
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────

function InvoicesTab({ data }: { data: any }) {
  if (!data) return <NoData />
  const { monthly, topVendors, totals } = data
  const matchRate = totals.total_count > 0 ? ((totals.matched_count / totals.total_count) * 100).toFixed(0) : '0'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Invoiced" value={fmtShort(totals.total_amount)} sub={fmt(totals.total_amount)} />
        <StatCard label="Total Budgeted" value={fmtShort(totals.total_budgeted)} />
        <StatCard label="Invoices" value={String(totals.total_count)} />
        <StatCard label="Match Rate" value={`${matchRate}%`} sub={`${totals.matched_count} matched`} />
      </div>

      <Card>
        <SectionTitle>Invoice Amount by Month</SectionTitle>
        {monthly.length === 0 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtShort} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="total_amount" name="Invoiced" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total_budgeted" name="Budgeted" fill="#334155" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <SectionTitle>Monthly Breakdown</SectionTitle>
          <DataTable
            rows={monthly}
            cols={[
              { key: 'month', label: 'Month' },
              { key: 'invoice_count', label: 'Count' },
              { key: 'matched_count', label: 'Matched' },
              { key: 'total_amount', label: 'Amount', render: (v) => fmt(v) }
            ]}
          />
        </Card>
        <Card>
          <SectionTitle>Top Vendors by Invoice Total</SectionTitle>
          <DataTable
            rows={topVendors}
            cols={[
              { key: 'vendor', label: 'Vendor' },
              { key: 'invoice_count', label: 'Invoices' },
              { key: 'total_amount', label: 'Total', render: (v) => fmt(v) }
            ]}
          />
        </Card>
      </div>
    </div>
  )
}

// ─── Dept / Branch Spend Tab (shared) ─────────────────────────────────────────

function OrgSpendTab({ data, label }: { data: any[]; label: string }) {
  const totalSpend = data.reduce((s, r) => s + (r.annual_spend || 0), 0)
  const totalContracts = data.reduce((s, r) => s + (r.contract_count || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={`${label}s Tracked`} value={String(data.length)} />
        <StatCard label="Total Annual Spend" value={fmtShort(totalSpend)} sub={fmt(totalSpend)} />
        <StatCard label="Total Contracts" value={String(totalContracts)} />
      </div>

      <Card>
        <SectionTitle>Annual Spend by {label}</SectionTitle>
        {data.length === 0 ? <NoData /> : (
          <ResponsiveContainer width="100%" height={Math.max(250, data.length * 42)}>
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtShort} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={160} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="annual_spend" name="Annual Spend">
                {data.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <SectionTitle>{label} Spend Details</SectionTitle>
        <DataTable
          rows={data}
          cols={[
            { key: 'name', label: label },
            { key: 'contract_count', label: 'Contracts' },
            { key: 'annual_spend', label: 'Annual Spend', render: (v) => fmt(v) },
            { key: 'monthly_spend', label: 'Monthly Spend', render: (v) => fmt(v) }
          ]}
        />
      </Card>
    </div>
  )
}

// ─── Reusable Table ───────────────────────────────────────────────────────────

interface ColDef {
  key: string
  label: string
  render?: (value: any, row: any) => React.ReactNode
}

function DataTable({ rows, cols }: { rows: any[]; cols: ColDef[] }) {
  if (!rows?.length) return <NoData />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            {cols.map((c) => (
              <th key={c.key} className="text-left text-slate-400 text-xs font-medium pb-2 pr-4 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
              {cols.map((c) => (
                <td key={c.key} className="py-2.5 pr-4 text-slate-300">
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    active: 'success',
    expiring_soon: 'warning',
    expired: 'danger',
    pending: 'neutral'
  }
  return (
    <Badge variant={variants[status] ?? 'neutral'}>
      {status.replace('_', ' ')}
    </Badge>
  )
}
