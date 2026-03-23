import { useEffect, useState, useMemo } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import type { BranchAsset, AssetType } from '../../../shared/types'

const ASSET_TYPES: { key: AssetType; label: string }[] = [
  { key: 'computer', label: 'Computers' },
  { key: 'thin_client', label: 'Thin Clients' },
  { key: 'server', label: 'Servers' }
]

// Group flat asset rows into { branch_id -> { asset_type -> count } }
type AssetGrid = Map<number, { name: string; number: number; counts: Record<AssetType, number> }>

function buildGrid(assets: BranchAsset[]): AssetGrid {
  const grid: AssetGrid = new Map()
  for (const a of assets) {
    if (!grid.has(a.branch_id)) {
      grid.set(a.branch_id, {
        name: a.branch_name ?? '',
        number: a.branch_number ?? 0,
        counts: { computer: 0, thin_client: 0, server: 0 }
      })
    }
    grid.get(a.branch_id)!.counts[a.asset_type] = a.count
  }
  return grid
}

interface ImportRow {
  branch_id: number | null
  branch_raw: string
  computers: number
  thin_clients: number
  servers: number
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<BranchAsset[]>([])
  const [draft, setDraft] = useState<Map<number, Record<AssetType, number>>>(new Map())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null)
  const [importUnmapped, setImportUnmapped] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const res = await window.api.assets.list()
    if (res.success && res.data) {
      setAssets(res.data)
      // Initialize draft from loaded data
      const map = new Map<number, Record<AssetType, number>>()
      for (const a of res.data) {
        if (!map.has(a.branch_id)) {
          map.set(a.branch_id, { computer: 0, thin_client: 0, server: 0 })
        }
        map.get(a.branch_id)![a.asset_type] = a.count
      }
      setDraft(map)
      setDirty(false)
    }
  }

  const grid = useMemo(() => buildGrid(assets), [assets])

  // Sorted branches
  const branches = useMemo(
    () => [...grid.entries()].sort((a, b) => a[1].number - b[1].number),
    [grid]
  )

  function getCellValue(branchId: number, type: AssetType): number {
    return draft.get(branchId)?.[type] ?? 0
  }

  function setCellValue(branchId: number, type: AssetType, value: number) {
    setDraft((prev) => {
      const next = new Map(prev)
      const entry = next.get(branchId) ?? { computer: 0, thin_client: 0, server: 0 }
      next.set(branchId, { ...entry, [type]: Math.max(0, value) })
      return next
    })
    setDirty(true)
    setSaveMsg('')
  }

  async function handleSave() {
    setSaving(true)
    const rows: { branch_id: number; asset_type: string; count: number }[] = []
    for (const [branchId, counts] of draft.entries()) {
      for (const type of ['computer', 'thin_client', 'server'] as AssetType[]) {
        rows.push({ branch_id: branchId, asset_type: type, count: counts[type] })
      }
    }
    const res = await window.api.assets.save(rows)
    setSaving(false)
    if (res.success) {
      setSaveMsg('Saved!')
      setDirty(false)
      setTimeout(() => setSaveMsg(''), 3000)
    } else {
      setSaveMsg(`Error: ${res.error}`)
    }
  }

  async function handleImport() {
    setImporting(true)
    const res = await window.api.assets.importFile()
    setImporting(false)
    if (res.success && res.data) {
      setImportRows(res.data.rows)
      setImportUnmapped(res.data.unmapped)
    }
  }

  function applyImport() {
    if (!importRows) return
    setDraft((prev) => {
      const next = new Map(prev)
      for (const row of importRows) {
        if (!row.branch_id) continue
        const entry = next.get(row.branch_id) ?? { computer: 0, thin_client: 0, server: 0 }
        next.set(row.branch_id, {
          computer: row.computers,
          thin_client: row.thin_clients,
          server: row.servers
        })
        void entry
      }
      return next
    })
    setDirty(true)
    setImportRows(null)
    setImportUnmapped([])
  }

  // Totals
  const totals = useMemo(() => {
    let computers = 0, thin_clients = 0, servers = 0
    for (const [, counts] of draft.entries()) {
      computers += counts.computer
      thin_clients += counts.thin_client
      servers += counts.server
    }
    return { computers, thin_clients, servers, total: computers + thin_clients + servers }
  }, [draft])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">IT Assets</h1>
          <p className="text-slate-400 text-sm">Track devices per branch location for per-machine contract allocations</p>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-sm ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {saveMsg}
            </span>
          )}
          <Button variant="ghost" onClick={handleImport} disabled={importing}>
            {importing ? 'Opening...' : 'Import from Excel'}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex gap-4">
        {[
          { label: 'Computers', value: totals.computers, color: 'bg-blue-900/40 text-blue-300' },
          { label: 'Thin Clients', value: totals.thin_clients, color: 'bg-purple-900/40 text-purple-300' },
          { label: 'Servers', value: totals.servers, color: 'bg-amber-900/40 text-amber-300' },
          { label: 'Total Devices', value: totals.total, color: 'bg-emerald-900/40 text-emerald-300' }
        ].map((chip) => (
          <div key={chip.label} className={`flex items-center gap-2 px-4 py-2 rounded-lg ${chip.color}`}>
            <span className="text-sm font-medium">{chip.label}:</span>
            <span className="text-lg font-bold">{chip.value.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Import preview */}
      {importRows && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-white font-semibold">Import Preview</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setImportRows(null); setImportUnmapped([]) }}>
                Cancel
              </Button>
              <Button onClick={applyImport}>Apply Import</Button>
            </div>
          </div>
          {importUnmapped.length > 0 && (
            <div className="mb-3 p-3 rounded-lg bg-amber-900/30 border border-amber-700/50">
              <p className="text-amber-300 text-sm font-medium">
                Could not map {importUnmapped.length} branch value(s): {importUnmapped.join(', ')}
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 text-xs uppercase pb-2 pr-4">Branch</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 px-4">Computers</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 px-4">Thin Clients</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 px-4">Servers</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 pl-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800 last:border-0">
                    <td className="py-2 pr-4 text-white">{row.branch_raw}</td>
                    <td className="py-2 px-4 text-right text-slate-300">{row.computers}</td>
                    <td className="py-2 px-4 text-right text-slate-300">{row.thin_clients}</td>
                    <td className="py-2 px-4 text-right text-slate-300">{row.servers}</td>
                    <td className="py-2 pl-4 text-right">
                      {row.branch_id ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300">Mapped</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-300">Unmapped</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Asset grid */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 text-xs uppercase tracking-wide pb-3 pr-6">Branch</th>
                {ASSET_TYPES.map((t) => (
                  <th key={t.key} className="text-right text-slate-400 text-xs uppercase tracking-wide pb-3 px-4">
                    {t.label}
                  </th>
                ))}
                <th className="text-right text-slate-400 text-xs uppercase tracking-wide pb-3 pl-4">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {branches.map(([branchId, branch]) => {
                const rowTotal = ASSET_TYPES.reduce((s, t) => s + getCellValue(branchId, t.key), 0)
                return (
                  <tr key={branchId} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                    <td className="py-2.5 pr-6">
                      <span className="text-white font-medium">#{branch.number} – {branch.name}</span>
                    </td>
                    {ASSET_TYPES.map((t) => (
                      <td key={t.key} className="py-1.5 px-2">
                        <input
                          type="number"
                          min="0"
                          value={getCellValue(branchId, t.key)}
                          onChange={(e) => setCellValue(branchId, t.key, parseInt(e.target.value) || 0)}
                          className="w-24 text-right bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-slate-500 focus:bg-slate-700/60 transition-colors ml-auto block"
                        />
                      </td>
                    ))}
                    <td className="py-2.5 pl-4 text-right">
                      <span className="text-white font-semibold">{rowTotal.toLocaleString()}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-600">
                <td className="py-3 pr-6 text-slate-400 text-xs uppercase tracking-wide font-semibold">Totals</td>
                <td className="py-3 px-2 text-right">
                  <span className="text-white font-bold">{totals.computers.toLocaleString()}</span>
                </td>
                <td className="py-3 px-2 text-right">
                  <span className="text-white font-bold">{totals.thin_clients.toLocaleString()}</span>
                </td>
                <td className="py-3 px-2 text-right">
                  <span className="text-white font-bold">{totals.servers.toLocaleString()}</span>
                </td>
                <td className="py-3 pl-4 text-right">
                  <span className="text-emerald-400 font-bold text-base">{totals.total.toLocaleString()}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}
