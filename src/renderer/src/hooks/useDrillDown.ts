import { useState } from 'react'
import type { BudgetSummary, Contract } from '../../../shared/types'

export type DrillDownState =
  | { type: 'closed' }
  | { type: 'contracts'; title: string; filter: (c: Contract) => boolean; sort?: (a: Contract, b: Contract) => number }
  | { type: 'budget'; title: string; summary: BudgetSummary }
  | { type: 'invoices'; title: string }
  | { type: 'projects'; title: string; statusFilter?: string }

export function useDrillDown() {
  const [state, setState] = useState<DrillDownState>({ type: 'closed' })
  const open = (s: Exclude<DrillDownState, { type: 'closed' }>) => setState(s)
  const close = () => setState({ type: 'closed' })
  return { state, open, close, isOpen: state.type !== 'closed' }
}
