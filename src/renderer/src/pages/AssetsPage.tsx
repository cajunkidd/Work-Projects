import { useEffect, useState, useMemo } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import type { BranchAsset, AssetType } from '../../../shared/types'

// Types that count toward per-machine contract allocations
const CONTRACT_ASSET_TYPES: { key: AssetType; label: string }[] = [
  { key: 'computer', label: 'Computers' },
  { key: 'thin_client', label: 'Thin Clients' },
  { key: 'server', label: 'Servers' }
]

// Types tracked for inventory but excluded from contract allocation calculations
const TRACKED_ONLY_TYPES: { key: AssetType; label: string }[] = [
  { key: 'printer', label: 'Printers' },
  { key: 'ingenico', label: 'Ingenicos' }
]

const ALL_ASSET_TYPES = [...CONTRACT_ASSET_TYPES, ...TRACKED_ONLY_TYPES]

const EMPTY_COUNTS: Record<AssetType, number> = {
  computer: 0, thin_client: 0, server: 0, printer: 0, ingenico: 0
}

// Group flat asset rows into { branch_id -> { name, number, counts } }
type AssetGrid = Map<number, { name: string; number: number; counts: Record<AssetType, number> }>

function buildGrid(assets: BranchAsset[]): AssetGrid {
  const grid: AssetGrid = new Map()
  for (const a of assets) {
    if (!grid.has(a.branch_id)) {
      grid.set(a.branch_id, {
        name: a.branch_name ?? '',
        number: a.branch_number ?? 0,
        counts: { ...EMPTY_COUNTS }
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
  printers: number
  ingenicos: number
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
      const map = new Map<number, Record<AssetType, number>>()
      for (const a of res.data) {
        if (!map.has(a.branch_id)) {
          map.set(a.branch_id, { ...EMPTY_COUNTS })
        }
        map.get(a.branch_id)![a.asset_type] = a.count
      }
      setDraft(map)
      setDirty(false)
    }
  }

  const grid = useMemo(() => buildGrid(assets), [assets])

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
      const entry = next.get(branchId) ?? { ...EMPTY_COUNTS }
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
      for (const { key } of ALL_ASSET_TYPES) {
        rows.push({ branch_id: branchId, asset_type: key, count: counts[key] })
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
        const existing = next.get(row.branch_id) ?? { ...EMPTY_COUNTS }
        next.set(row.branch_id, {
          ...existing,
          computer: row.computers,
          thin_client: row.thin_clients,
          server: row.servers,
          printer: row.printers,
          ingenico: row.ingenicos
        })
      }
      return next
    })
    setDirty(true)
    setImportRows(null)
    setImportUnmapped([])
  }

  // Totals broken down by category
  const totals = useMemo(() => {
    let computers = 0, thin_clients = 0, servers = 0, printers = 0, ingenicos = 0
    for (const [, counts] of draft.entries()) {
      computers += counts.computer
      thin_clients += counts.thin_client
      servers += counts.server
      printers += counts.printer
      ingenicos += counts.ingenico
    }
    const contractTotal = computers + thin_clients + servers
    const trackedTotal = printers + ingenicos
    return { computers, thin_clients, servers, printers, ingenicos, contractTotal, trackedTotal }
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
      <div className="space-y-2">
        {/* Contract-billed devices */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium w-24 shrink-0">Per Contract</span>
          {[
            { label: 'Computers', value: totals.computers, color: 'bg-blue-900/40 text-blue-300' },
            { label: 'Thin Clients', value: totals.thin_clients, color: 'bg-purple-900/40 text-purple-300' },
            { label: 'Servers', value: totals.servers, color: 'bg-amber-900/40 text-amber-300' },
            { label: 'Billable Total', value: totals.contractTotal, color: 'bg-emerald-900/40 text-emerald-300 font-semibold' }
          ].map((chip) => (
            <div key={chip.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${chip.color}`}>
              <span className="text-xs font-medium">{chip.label}:</span>
              <span className="text-sm font-bold">{chip.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
        {/* Tracked-only devices */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium w-24 shrink-0">Tracked Only</span>
          {[
            { label: 'Printers', value: totals.printers, color: 'bg-slate-700/60 text-slate-300' },
            { label: 'Ingenicos', value: totals.ingenicos, color: 'bg-slate-700/60 text-slate-300' }
          ].map((chip) => (
            <div key={chip.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${chip.color}`}>
              <span className="text-xs font-medium">{chip.label}:</span>
              <span className="text-sm font-bold">{chip.value.toLocaleString()}</span>
            </div>
          ))}
          <span className="text-xs text-slate-600 italic">Not included in contract allocation calculations</span>
        </div>
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
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 px-3">Computers</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 px-3">Thin Clients</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 px-3">Servers</th>
                  <th className="text-right text-slate-500 text-xs uppercase pb-2 px-3">Printers</th>
                  <th className="text-right text-slate-500 text-xs uppercase pb-2 px-3">Ingenicos</th>
                  <th className="text-right text-slate-400 text-xs uppercase pb-2 pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800 last:border-0">
                    <td className="py-2 pr-4 text-white">{row.branch_raw}</td>
                    <td className="py-2 px-3 text-right text-slate-300">{row.computers}</td>
                    <td className="py-2 px-3 text-right text-slate-300">{row.thin_clients}</td>
                    <td className="py-2 px-3 text-right text-slate-300">{row.servers}</td>
                    <td className="py-2 px-3 text-right text-slate-400">{row.printers}</td>
                    <td className="py-2 px-3 text-right text-slate-400">{row.ingenicos}</td>
                    <td className="py-2 pl-3 text-right">
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
                <th className="text-left text-slate-400 text-xs uppercase tracking-wide pb-1 pr-6" rowSpan={2}>Branch</th>
                {/* Per-contract header group */}
                <th
                  colSpan={CONTRACT_ASSET_TYPES.length}
                  className="text-center text-emerald-500 text-xs uppercase tracking-wide pb-1 border-b border-slate-700/50"
                >
                  Per-Contract
                </th>
                {/* Vertical divider placeholder */}
                <th className="pb-1 w-4" rowSpan={2} />
                {/* Tracked-only header group */}
                <th
                  colSpan={TRACKED_ONLY_TYPES.length}
                  className="text-center text-slate-500 text-xs uppercase tracking-wide pb-1 border-b border-slate-700/50"
                >
                  Tracked Only
                </th>
                <th className="pb-1" rowSpan={2} />
              </tr>
              <tr className="border-b border-slate-700">
                {CONTRACT_ASSET_TYPES.map((t) => (
                  <th key={t.key} className="text-right text-slate-400 text-xs uppercase tracking-wide pb-2 px-3">
                    {t.label}
                  </th>
                ))}
                {TRACKED_ONLY_TYPES.map((t) => (
                  <th key={t.key} className="text-right text-slate-500 text-xs uppercase tracking-wide pb-2 px-3">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map(([branchId, branch]) => {
                const contractRowTotal = CONTRACT_ASSET_TYPES.reduce((s, t) => s + getCellValue(branchId, t.key), 0)
                const trackedRowTotal = TRACKED_ONLY_TYPES.reduce((s, t) => s + getCellValue(branchId, t.key), 0)
                return (
                  <tr key={branchId} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                    <td className="py-2.5 pr-6">
                      <span className="text-white font-medium">#{branch.number} – {branch.name}</span>
                    </td>
                    {CONTRACT_ASSET_TYPES.map((t) => (
                      <td key={t.key} className="py-1.5 px-2">
                        <input
                          type="number"
                          min="0"
                          value={getCellValue(branchId, t.key)}
                          onChange={(e) => setCellValue(branchId, t.key, parseInt(e.target.value) || 0)}
                          className="w-20 text-right bg-slate-800/60 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-slate-500 focus:bg-slate-700/60 transition-colors ml-auto block"
                        />
                      </td>
                    ))}
                    {/* Divider cell */}
                    <td className="w-4">
                      <div className="w-px h-8 bg-slate-700 mx-auto" />
                    </td>
                    {TRACKED_ONLY_TYPES.map((t) => (
                      <td key={t.key} className="py-1.5 px-2">
                        <input
                          type="number"
                          min="0"
                          value={getCellValue(branchId, t.key)}
                          onChange={(e) => setCellValue(branchId, t.key, parseInt(e.target.value) || 0)}
                          className="w-20 text-right bg-slate-800/30 border border-slate-700/60 rounded px-2 py-1 text-slate-300 text-sm focus:outline-none focus:border-slate-600 focus:bg-slate-700/40 transition-colors ml-auto block"
                        />
                      </td>
                    ))}
                    {/* Row totals */}
                    <td className="py-2.5 pl-3 text-right">
                      <span className="text-white font-semibold">{contractRowTotal.toLocaleString()}</span>
                      {trackedRowTotal > 0 && (
                        <span className="text-slate-500 text-xs ml-1">(+{trackedRowTotal})</span>
                      )}
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
                <td className="w-4" />
                <td className="py-3 px-2 text-right">
                  <span className="text-slate-400 font-bold">{totals.printers.toLocaleString()}</span>
                </td>
                <td className="py-3 px-2 text-right">
                  <span className="text-slate-400 font-bold">{totals.ingenicos.toLocaleString()}</span>
                </td>
                <td className="py-3 pl-3 text-right">
                  <span className="text-emerald-400 font-bold text-base">{totals.contractTotal.toLocaleString()}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-slate-600 text-xs mt-3">
          * Total column shows per-contract billable devices (computers + thin clients + servers). Printers and Ingenicos are tracked for inventory only.
        </p>
      </Card>
    </div>
  )
}
