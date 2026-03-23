import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import type { Department, Branch } from '../../../../shared/types'

// ---------------------------------------------------------------------------
// Types (mirror backend ParsedImportResult)
// ---------------------------------------------------------------------------

interface ImportLineItem {
  description: string
  quantity: number
  unit_price: number
  total_price: number
}

interface ParsedRow {
  _sourceFile: string
  _rowIndex: number
  _confidence: Record<string, 'high' | 'low' | 'missing'>
  vendor_name: string
  status: string
  start_date: string
  end_date: string
  monthly_cost: number
  annual_cost: number
  total_cost: number
  poc_name: string
  poc_email: string
  poc_phone: string
  department_id: number | null
  _department_raw: string
  branch_id: number | null
  _branch_raw: string
  line_items: ImportLineItem[]
  notes: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  onComplete: () => void
  departments: Department[]
  branches: Branch[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  if (!n) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function rowConfidenceLevel(row: ParsedRow): 'green' | 'yellow' | 'red' {
  const c = row._confidence
  const required = ['vendor_name', 'start_date', 'end_date']
  if (required.some((f) => c[f] === 'missing')) return 'red'
  if (Object.values(c).some((v) => v === 'low' || v === 'missing')) return 'yellow'
  return 'green'
}

const confidenceDot: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500'
}

const confidenceLabel: Record<string, string> = {
  green: 'Ready',
  yellow: 'Review',
  red: 'Missing required'
}

// ---------------------------------------------------------------------------
// Row editor (expanded inline)
// ---------------------------------------------------------------------------

function RowEditor({
  row,
  departments,
  branches,
  onChange
}: {
  row: ParsedRow
  departments: Department[]
  branches: Branch[]
  onChange: (updated: ParsedRow) => void
}) {
  const set = (key: keyof ParsedRow, value: any) => onChange({ ...row, [key]: value })

  const setLineItem = (idx: number, field: keyof ImportLineItem, value: any) => {
    const items = [...row.line_items]
    items[idx] = { ...items[idx], [field]: value }
    // auto-calc total
    if (field === 'quantity' || field === 'unit_price') {
      items[idx].total_price = (items[idx].quantity || 0) * (items[idx].unit_price || 0)
    }
    onChange({ ...row, line_items: items })
  }

  const addLineItem = () =>
    onChange({ ...row, line_items: [...row.line_items, { description: '', quantity: 1, unit_price: 0, total_price: 0 }] })

  const removeLineItem = (idx: number) =>
    onChange({ ...row, line_items: row.line_items.filter((_, i) => i !== idx) })

  const inputCls = 'bg-slate-800 border border-slate-600 text-white text-xs rounded px-2 py-1.5 focus:outline-none w-full'

  return (
    <div className="px-4 py-4 bg-slate-800/50 border-t border-slate-700 space-y-4">
      {/* Basic fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-slate-400 text-xs mb-1 block">Vendor Name *</label>
          <input className={inputCls} value={row.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">Status</label>
          <select
            className={inputCls}
            value={row.status}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">Start Date *</label>
          <input className={inputCls} type="date" value={row.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">End Date *</label>
          <input className={inputCls} type="date" value={row.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">Monthly Cost ($)</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={row.monthly_cost || ''} onChange={(e) => {
            const mc = parseFloat(e.target.value) || 0
            onChange({ ...row, monthly_cost: mc, annual_cost: row.annual_cost || mc * 12 })
          }} />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">Annual Cost ($)</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={row.annual_cost || ''} onChange={(e) => set('annual_cost', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">Total Contract Value ($)</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={row.total_cost || ''} onChange={(e) => set('total_cost', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {/* Dept / Branch assignment */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-slate-400 text-xs mb-1 block">
            Department
            {row._department_raw && !row.department_id && (
              <span className="ml-2 text-amber-400">Unresolved: "{row._department_raw}"</span>
            )}
          </label>
          <select
            className={inputCls}
            value={row.department_id ?? ''}
            onChange={(e) => set('department_id', e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">— None —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">
            Branch
            {row._branch_raw && !row.branch_id && (
              <span className="ml-2 text-amber-400">Unresolved: "{row._branch_raw}"</span>
            )}
          </label>
          <select
            className={inputCls}
            value={row.branch_id ?? ''}
            onChange={(e) => set('branch_id', e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">— None —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>Branch {b.number} – {b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* POC */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-slate-400 text-xs mb-1 block">POC Name</label>
          <input className={inputCls} value={row.poc_name} onChange={(e) => set('poc_name', e.target.value)} />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">POC Email</label>
          <input className={inputCls} type="email" value={row.poc_email} onChange={(e) => set('poc_email', e.target.value)} />
        </div>
        <div>
          <label className="text-slate-400 text-xs mb-1 block">POC Phone</label>
          <input className={inputCls} value={row.poc_phone} onChange={(e) => set('poc_phone', e.target.value)} />
        </div>
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-slate-400 text-xs font-medium">Line Items</p>
          <button onClick={addLineItem} className="text-xs text-slate-400 hover:text-white">+ Add</button>
        </div>
        {row.line_items.length > 0 && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_60px_90px_90px_24px] gap-2 text-slate-500 text-xs px-1">
              <span>Description</span><span>Qty</span><span>Unit Price</span><span>Total</span><span></span>
            </div>
            {row.line_items.map((li, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_60px_90px_90px_24px] gap-2 items-center">
                <input className={inputCls} value={li.description} onChange={(e) => setLineItem(idx, 'description', e.target.value)} placeholder="Description" />
                <input className={inputCls} type="number" min="0" value={li.quantity} onChange={(e) => setLineItem(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                <input className={inputCls} type="number" min="0" step="0.01" value={li.unit_price} onChange={(e) => setLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} />
                <input className={inputCls} type="number" min="0" step="0.01" value={li.total_price} onChange={(e) => setLineItem(idx, 'total_price', parseFloat(e.target.value) || 0)} />
                <button onClick={() => removeLineItem(idx)} className="text-slate-500 hover:text-red-400 text-sm leading-none">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-slate-400 text-xs mb-1 block">Notes (one per line)</label>
        <textarea
          className="bg-slate-800 border border-slate-600 text-white text-xs rounded px-2 py-1.5 focus:outline-none w-full h-16 resize-none"
          value={row.notes.join('\n')}
          onChange={(e) => set('notes', e.target.value.split('\n').filter(Boolean))}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

type Step = 'select' | 'review' | 'results'

export default function ImportContractsModal({ open, onClose, onComplete, departments, branches }: Props) {
  const [step, setStep] = useState<Step>('select')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ created: number; errors: { row: number; vendor: string; message: string }[] } | null>(null)

  const reset = () => {
    setStep('select')
    setParsing(false)
    setParseError('')
    setRows([])
    setSelected(new Set())
    setExpanded(new Set())
    setImporting(false)
    setResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Step 1: open file dialog and parse
  const handleSelectFiles = async () => {
    setParsing(true)
    setParseError('')
    const res = await window.api.contracts.parseImport()
    setParsing(false)
    if (!res.success || !res.data) {
      if (res.error !== 'No files selected') setParseError(res.error || 'Failed to parse files')
      return
    }
    setRows(res.data as ParsedRow[])
    setSelected(new Set(res.data.map((_, i) => i)))
    setStep('review')
  }

  // Toggle row selection
  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }
  const toggleAll = () =>
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)))

  // Toggle row expansion
  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // Update a row after inline editing
  const updateRow = (idx: number, updated: ParsedRow) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? updated : r)))
  }

  // Step 3: bulk create
  const handleImport = async () => {
    setImporting(true)
    const toImport = rows.filter((_, i) => selected.has(i))
    const res = await window.api.contracts.bulkCreate(toImport)
    setImporting(false)
    if (res.success && res.data) {
      setResult(res.data as any)
      setStep('results')
    }
  }

  const selectedCount = selected.size

  // ---- Render ----

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Contracts"
      width="max-w-5xl"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Select files                                               */}
      {/* ------------------------------------------------------------------ */}
      {step === 'select' && (
        <div className="space-y-6 py-4">
          <div className="text-center">
            <p className="text-slate-300 text-sm mb-2">
              Select one or more contract files to import.
            </p>
            <p className="text-slate-500 text-xs">
              Supported formats: <span className="text-slate-400">CSV, Excel (XLSX/XLS), PDF</span>
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Fields are auto-detected from column headers or document content. You can review and correct everything before importing.
            </p>
          </div>

          <div
            className="border-2 border-dashed border-slate-600 rounded-xl p-12 flex flex-col items-center gap-4 hover:border-slate-500 transition-colors cursor-pointer"
            onClick={!parsing ? handleSelectFiles : undefined}
          >
            {parsing ? (
              <>
                <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400 text-sm">Parsing files...</p>
              </>
            ) : (
              <>
                <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div className="text-center">
                  <p className="text-white font-medium">Click to browse files</p>
                  <p className="text-slate-500 text-xs mt-1">CSV · XLSX · XLS · PDF — multiple files supported</p>
                </div>
                <Button onClick={handleSelectFiles} disabled={parsing}>
                  Browse Files
                </Button>
              </>
            )}
          </div>

          {parseError && (
            <p className="text-red-400 text-sm text-center">{parseError}</p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2 — Review & edit                                              */}
      {/* ------------------------------------------------------------------ */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">{rows.length} contract{rows.length !== 1 ? 's' : ''} detected</p>
              <p className="text-slate-500 text-xs">Review and correct fields before importing. Click a row to expand and edit.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Ready</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Review needed</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Missing required</span>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[32px_20px_1fr_80px_100px_100px_110px_100px] gap-2 px-3 py-2 bg-slate-800 text-slate-500 text-xs font-medium border-b border-slate-700">
              <input
                type="checkbox"
                checked={selectedCount === rows.length && rows.length > 0}
                onChange={toggleAll}
                className="cursor-pointer"
              />
              <span></span>
              <span>Vendor</span>
              <span>Status</span>
              <span>Start</span>
              <span>End</span>
              <span>Annual Cost</span>
              <span>Source</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-800">
              {rows.map((row, idx) => {
                const level = rowConfidenceLevel(row)
                const isExpanded = expanded.has(idx)
                const isSelected = selected.has(idx)
                return (
                  <div key={idx}>
                    <div
                      className={`grid grid-cols-[32px_20px_1fr_80px_100px_100px_110px_100px] gap-2 px-3 py-2.5 items-center cursor-pointer transition-colors ${isExpanded ? 'bg-slate-800/70' : 'hover:bg-slate-800/40'}`}
                      onClick={() => toggleExpand(idx)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(idx)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                      />
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${confidenceDot[level]}`} title={confidenceLabel[level]} />
                      <span className="text-white text-sm truncate font-medium">
                        {row.vendor_name || <span className="text-slate-500 italic">No vendor name</span>}
                      </span>
                      <span className="text-slate-400 text-xs capitalize">{row.status.replace('_', ' ')}</span>
                      <span className="text-slate-400 text-xs">{row.start_date || <span className="text-red-400">—</span>}</span>
                      <span className="text-slate-400 text-xs">{row.end_date || <span className="text-red-400">—</span>}</span>
                      <span className="text-slate-300 text-xs">{fmt(row.annual_cost)}</span>
                      <span className="text-slate-500 text-xs truncate">{row._sourceFile}</span>
                    </div>
                    {isExpanded && (
                      <RowEditor
                        row={row}
                        departments={departments}
                        branches={branches}
                        onChange={(updated) => updateRow(idx, updated)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('select')}>
              ← Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm">{selectedCount} of {rows.length} selected</span>
              <Button onClick={handleImport} disabled={importing || selectedCount === 0}>
                {importing ? 'Importing...' : `Import ${selectedCount} Contract${selectedCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — Results                                                    */}
      {/* ------------------------------------------------------------------ */}
      {step === 'results' && result && (
        <div className="space-y-6 py-4">
          <div className="text-center">
            {result.created > 0 && (
              <div className="mb-4">
                <div className="w-14 h-14 bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white text-lg font-semibold">
                  {result.created} contract{result.created !== 1 ? 's' : ''} imported successfully
                </p>
              </div>
            )}
            {result.errors.length > 0 && (
              <div>
                <p className="text-amber-400 text-sm font-medium mb-2">
                  {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} failed
                </p>
                <div className="bg-slate-800 rounded-lg border border-slate-700 text-left divide-y divide-slate-700 max-h-48 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <div key={i} className="px-4 py-2">
                      <p className="text-white text-xs font-medium">{e.vendor || `Row ${e.row + 1}`}</p>
                      <p className="text-red-400 text-xs">{e.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-3">
            {result.errors.length > 0 && (
              <Button variant="secondary" onClick={() => setStep('review')}>
                Fix & Retry
              </Button>
            )}
            <Button onClick={() => { onComplete(); handleClose() }}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
