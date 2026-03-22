import { useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import type { Contract, CompetitorOffering } from '../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function CompetitorsPage() {
  const { selectedDeptId } = useThemeStore()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [offerings, setOfferings] = useState<Record<number, CompetitorOffering[]>>({})
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    const opts: any = { status: 'active' }
    if (selectedDeptId) opts.department_id = selectedDeptId
    window.api.contracts.list(opts).then(async (res) => {
      if (res.success && res.data) {
        setContracts(res.data)
        const offeringsMap: Record<number, CompetitorOffering[]> = {}
        for (const c of res.data) {
          const cRes = await window.api.competitors.list(c.id)
          if (cRes.success && cRes.data) offeringsMap[c.id] = cRes.data
        }
        setOfferings(offeringsMap)
      }
    })
  }, [selectedDeptId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Competitor Analysis</h1>
        <p className="text-slate-400 text-sm">Compare current vendors with competitor offerings. Add competitor offerings from the contract detail page.</p>
      </div>

      {contracts.filter((c) => (offerings[c.id] || []).length > 0).length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-slate-400 mb-2">No competitor offerings added yet.</p>
          <p className="text-slate-500 text-sm">Go to a contract's detail page → Competitors tab to add offerings.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {contracts
            .filter((c) => (offerings[c.id] || []).length > 0)
            .map((c) => {
              const contractOfferings = offerings[c.id] || []
              const isExpanded = expanded === c.id
              const bestDeal = contractOfferings.reduce(
                (best, o) => (o.price < best.price ? o : best),
                contractOfferings[0]
              )
              const savings = c.annual_cost - bestDeal.price

              return (
                <Card key={c.id} onClick={() => setExpanded(isExpanded ? null : c.id)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">{c.vendor_name}</h3>
                      <p className="text-slate-400 text-sm">{c.department_name} · {contractOfferings.length} competitor(s)</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-white font-bold">{fmt(c.annual_cost)}<span className="text-slate-400 text-sm font-normal">/yr</span></p>
                        <p className="text-slate-400 text-xs">Current</p>
                      </div>
                      {savings > 0 ? (
                        <Badge variant="success">Save {fmt(savings)}/yr</Badge>
                      ) : (
                        <Badge variant="neutral">Best deal</Badge>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-800">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400 text-left border-b border-slate-800">
                            <th className="pb-2 font-medium">Vendor</th>
                            <th className="pb-2 font-medium">Offering</th>
                            <th className="pb-2 font-medium">Price/yr</th>
                            <th className="pb-2 font-medium">Savings vs Current</th>
                            <th className="pb-2 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-800/50">
                            <td className="py-2 font-medium text-white">{c.vendor_name} (Current)</td>
                            <td className="py-2 text-slate-400">—</td>
                            <td className="py-2 text-white font-bold">{fmt(c.annual_cost)}</td>
                            <td className="py-2">—</td>
                            <td className="py-2">—</td>
                          </tr>
                          {contractOfferings.map((o) => {
                            const diff = o.price - c.annual_cost
                            return (
                              <tr key={o.id} className="border-b border-slate-800/50 last:border-0">
                                <td className="py-2 text-slate-300">{o.competitor_vendor}</td>
                                <td className="py-2 text-slate-300">{o.offering_name}</td>
                                <td className="py-2 text-white">{fmt(o.price)}</td>
                                <td className="py-2">
                                  <Badge variant={diff < 0 ? 'success' : 'danger'}>
                                    {diff < 0 ? '' : '+'}{fmt(diff)}
                                  </Badge>
                                </td>
                                <td className="py-2 text-slate-400 text-xs">{o.notes}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )
            })}
        </div>
      )}
    </div>
  )
}
