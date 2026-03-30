import Modal from '../ui/Modal'
import Badge from '../ui/Badge'
import type { DrillDownState } from '../../hooks/useDrillDown'
import type { Contract, BudgetSummary, Invoice, VendorProject } from '../../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  expiring_soon: 'warning',
  expired: 'danger',
  pending: 'neutral'
}

function ContractListView({ contracts, onNavigate }: { contracts: Contract[]; onNavigate: (path: string) => void }) {
  if (contracts.length === 0) return <p className="text-slate-400 text-sm text-center py-6">No contracts found</p>
  return (
    <div>
      <p className="text-slate-400 text-xs mb-3">{contracts.length} contract{contracts.length !== 1 ? 's' : ''}</p>
      {/* Column headers */}
      <div className="grid grid-cols-12 gap-2 pb-2 border-b border-slate-700 mb-1">
        <span className="col-span-4 text-slate-500 text-xs uppercase tracking-wide">Vendor</span>
        <span className="col-span-2 text-slate-500 text-xs uppercase tracking-wide">Status</span>
        <span className="col-span-3 text-slate-500 text-xs uppercase tracking-wide">Dept / Branch</span>
        <span className="col-span-3 text-slate-500 text-xs uppercase tracking-wide text-right">Annual Cost</span>
      </div>
      <div className="space-y-0">
        {contracts.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-slate-800 last:border-0 cursor-pointer hover:bg-slate-800/50 rounded px-1 -mx-1 transition-colors"
            onClick={() => onNavigate(`/contracts/${c.id}`)}
          >
            <div className="col-span-4 min-w-0">
              <p className="text-white text-sm font-medium truncate">{c.vendor_name}</p>
            </div>
            <div className="col-span-2">
              <Badge variant={STATUS_VARIANT[c.status] ?? 'neutral'}>
                {c.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="col-span-3 min-w-0">
              <p className="text-slate-400 text-xs truncate">{c.branch_name ?? c.department_name ?? '—'}</p>
            </div>
            <div className="col-span-3 text-right">
              <span className="text-white text-sm font-medium">{fmt(c.annual_cost || 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BudgetDetailView({
  summary,
  contracts,
  onNavigate
}: {
  summary: BudgetSummary
  contracts: Contract[]
  onNavigate: (path: string) => void
}) {
  const pct = summary.total_budget > 0 ? Math.min((summary.total_spent / summary.total_budget) * 100, 100) : 0
  const remaining = summary.total_budget - summary.total_spent
  const over = remaining < 0
  const barColor = over ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'

  return (
    <div>
      {/* Budget summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-slate-400 text-xs mb-1">Total Budget</p>
          <p className="text-white text-lg font-bold">{fmt(summary.total_budget)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-slate-400 text-xs mb-1">Total Spent</p>
          <p className="text-white text-lg font-bold">{fmt(summary.total_spent)}</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-slate-400 text-xs mb-1">Remaining</p>
          <p className={`text-lg font-bold ${over ? 'text-red-400' : 'text-emerald-400'}`}>
            {over ? `-${fmt(Math.abs(remaining))}` : fmt(remaining)}
          </p>
        </div>
      </div>

      {/* Utilization bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-400 text-xs">Utilization</span>
          <span className="text-white text-xs font-medium">{Math.round(pct)}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      </div>

      {/* Contributing contracts */}
      <p className="text-white font-semibold text-sm mb-3">Contributing Contracts</p>
      <ContractListView contracts={contracts} onNavigate={onNavigate} />
    </div>
  )
}

function InvoiceListView({ invoices, onNavigate }: { invoices: Invoice[]; onNavigate: (path: string) => void }) {
  if (invoices.length === 0) return <p className="text-slate-400 text-sm text-center py-6">No invoices found</p>
  return (
    <div>
      <p className="text-slate-400 text-xs mb-3">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
      <div className="space-y-0">
        {invoices.map((inv) => {
          const over = inv.amount > inv.budgeted_amount * 1.05
          return (
            <div
              key={inv.id}
              className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0 cursor-pointer hover:bg-slate-800/50 rounded px-2 -mx-2 transition-colors"
              onClick={() => onNavigate('/invoices')}
            >
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{inv.subject}</p>
                <p className="text-slate-400 text-xs mt-0.5">{inv.sender} · {inv.received_date}</p>
              </div>
              <Badge variant={over ? 'danger' : 'success'}>{fmt(inv.amount)}</Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectListView({
  projects,
  statusFilter,
  onNavigate
}: {
  projects: VendorProject[]
  statusFilter?: string
  onNavigate: (path: string) => void
}) {
  const filtered = statusFilter ? projects.filter((p) => p.status === statusFilter) : projects
  if (filtered.length === 0) return <p className="text-slate-400 text-sm text-center py-6">No projects found</p>

  const STATUS_VARIANT_MAP: Record<string, 'success' | 'warning' | 'neutral'> = {
    active: 'success',
    on_hold: 'warning',
    completed: 'neutral'
  }

  return (
    <div>
      <p className="text-slate-400 text-xs mb-3">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</p>
      <div className="space-y-0">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0 cursor-pointer hover:bg-slate-800/50 rounded px-2 -mx-2 transition-colors"
            onClick={() => onNavigate('/projects')}
          >
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{p.name}</p>
              <p className="text-slate-400 text-xs mt-0.5">{p.start_date} → {p.end_date}</p>
            </div>
            <Badge variant={STATUS_VARIANT_MAP[p.status] ?? 'neutral'}>
              {p.status.replace('_', ' ')}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

interface DrillDownModalProps {
  state: DrillDownState
  onClose: () => void
  contracts: Contract[]
  invoices: Invoice[]
  projects: VendorProject[]
  budgetContracts?: Contract[]
  onNavigate: (path: string) => void
}

export default function DrillDownModal({
  state,
  onClose,
  contracts,
  invoices,
  projects,
  onNavigate
}: DrillDownModalProps) {
  if (state.type === 'closed') return null

  const title = state.type !== 'closed' ? state.title : ''

  const handleNavigate = (path: string) => {
    onClose()
    onNavigate(path)
  }

  return (
    <Modal open title={title} onClose={onClose} width="max-w-3xl">
      {state.type === 'contracts' && (() => {
        let filtered = contracts.filter(state.filter)
        if (state.sort) filtered = [...filtered].sort(state.sort)
        return <ContractListView contracts={filtered} onNavigate={handleNavigate} />
      })()}
      {state.type === 'budget' && (
        <BudgetDetailView summary={state.summary} contracts={contracts} onNavigate={handleNavigate} />
      )}
      {state.type === 'invoices' && (
        <InvoiceListView invoices={invoices} onNavigate={handleNavigate} />
      )}
      {state.type === 'projects' && (
        <ProjectListView projects={projects} statusFilter={state.statusFilter} onNavigate={handleNavigate} />
      )}
    </Modal>
  )
}
