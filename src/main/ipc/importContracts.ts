import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb, refreshContractFts } from '../database'
import type { IpcResponse } from '../../shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportLineItem {
  description: string
  quantity: number
  unit_price: number
  total_price: number
}

export interface ParsedImportResult {
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

interface BulkCreateResult {
  created: number
  errors: { row: number; vendor: string; message: string }[]
}

// ---------------------------------------------------------------------------
// Column alias map for CSV / XLSX header matching
// ---------------------------------------------------------------------------

const FIELD_ALIASES: Record<string, string[]> = {
  vendor_name: ['vendor', 'vendor name', 'vendorname', 'company', 'supplier', 'provider', 'software', 'product'],
  start_date: ['start date', 'startdate', 'start', 'begin', 'begin date', 'effective date', 'effectivedate', 'contract start', 'contractstart'],
  end_date: ['end date', 'enddate', 'end', 'expiry', 'expiry date', 'expiration', 'expiration date', 'expirationdate', 'contract end', 'contractend', 'renewal date', 'renewaldate'],
  annual_cost: ['annual cost', 'annualcost', 'annual', 'yearly', 'yearly cost', 'yearlycost', 'cost per year', 'annual value', 'annualvalue', 'annual price', 'annualprice'],
  monthly_cost: ['monthly cost', 'monthlycost', 'monthly', 'cost per month', 'monthly value', 'monthlyvalue', 'monthly price', 'monthlyprice'],
  total_cost: ['total cost', 'totalcost', 'total', 'contract value', 'contractvalue', 'total value', 'totalvalue', 'contract amount', 'amount'],
  poc_name: ['poc', 'poc name', 'pocname', 'contact', 'contact name', 'contactname', 'point of contact', 'account manager', 'accountmanager', 'rep', 'representative'],
  poc_email: ['poc email', 'pocemail', 'email', 'contact email', 'contactemail', 'e-mail'],
  poc_phone: ['poc phone', 'pocphone', 'phone', 'contact phone', 'contactphone', 'telephone', 'tel', 'phone number', 'phonenumber'],
  department: ['department', 'dept', 'department name', 'departmentname', 'team', 'group', 'division'],
  branch: ['branch', 'branch name', 'branchname', 'location', 'store', 'site', 'office'],
  status: ['status', 'contract status', 'contractstatus', 'state'],
  notes: ['notes', 'note', 'comments', 'comment', 'description', 'details', 'memo']
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]+/g, ' ')
}

function matchHeader(header: string): string | null {
  const norm = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(norm)) return field
  }
  return null
}

// ---------------------------------------------------------------------------
// Date normalization helpers
// ---------------------------------------------------------------------------

function normalizeDate(raw: string): string {
  if (!raw) return ''
  const s = String(raw).trim()

  // Already ISO: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // US formats: 1/15/2024 or 01-15-2024
  const usMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (usMatch) {
    const [, m, d, y] = usMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Short year: 1/15/24
  const usShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (usShort) {
    const [, m, d, y] = usShort
    const year = parseInt(y) >= 50 ? `19${y}` : `20${y}`
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Excel serial date (number)
  const num = parseFloat(s)
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // Excel date serial: days since 1900-01-00
    const excelEpoch = new Date(1899, 11, 30)
    const date = new Date(excelEpoch.getTime() + num * 86400000)
    return date.toISOString().slice(0, 10)
  }

  // Written month: "January 15, 2024" or "Jan 15 2024"
  const written = s.match(/(\w+)\s+(\d{1,2})[,\s]+(\d{4})/)
  if (written) {
    const months: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12',
      jan: '01', feb: '02', mar: '03', apr: '04',
      jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    }
    const mo = months[written[1].toLowerCase()]
    if (mo) return `${written[3]}-${mo}-${written[2].padStart(2, '0')}`
  }

  return s // return as-is; UI will flag as low confidence
}

function parseCost(raw: any): number {
  if (raw === null || raw === undefined || raw === '') return 0
  const s = String(raw).replace(/[$,\s]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// ---------------------------------------------------------------------------
// Dept / Branch resolution
// ---------------------------------------------------------------------------

interface NamedEntity { id: number; name: string; number?: number }

function resolveEntity(raw: string, entities: NamedEntity[]): number | null {
  if (!raw) return null
  const lower = raw.toLowerCase().trim()
  // Exact match
  const exact = entities.find((e) => e.name.toLowerCase() === lower)
  if (exact) return exact.id
  // Contains match
  const contains = entities.find((e) => e.name.toLowerCase().includes(lower) || lower.includes(e.name.toLowerCase()))
  if (contains) return contains.id
  // Branch number match
  const numMatch = lower.match(/\d+/)
  if (numMatch) {
    const num = parseInt(numMatch[0])
    const byNum = entities.find((e) => e.number === num)
    if (byNum) return byNum.id
  }
  return null
}

// ---------------------------------------------------------------------------
// CSV / XLSX parsing
// ---------------------------------------------------------------------------

async function parseSpreadsheet(filePath: string): Promise<ParsedImportResult[]> {
  const XLSX = await import('xlsx')
  const ext = path.extname(filePath).toLowerCase()
  let wb: any

  if (ext === '.csv') {
    const buffer = fs.readFileSync(filePath)
    wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false })
  } else {
    wb = XLSX.readFile(filePath, { raw: false, cellDates: false })
  }

  const db = getDb()
  const departments = db.prepare('SELECT id, name FROM departments').all() as NamedEntity[]
  const branches = db.prepare('SELECT id, name, number FROM branches').all() as NamedEntity[]

  const results: ParsedImportResult[] = []

  // Process each sheet
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[]
    if (rawRows.length === 0) continue

    // Build header → field mapping
    const headers = Object.keys(rawRows[0])
    const mapping: Record<string, string> = {}
    for (const h of headers) {
      const field = matchHeader(h)
      if (field) mapping[h] = field
    }

    // Detect line item columns: line_item_N_description / line_item_N_quantity / etc.
    // or li_1_desc, item_1_price, etc.
    const liPattern = /^(line[_\s]?item|li|item)[_\s]?(\d+)[_\s]?(description|desc|name|qty|quantity|unit[_\s]?price|price|total)?/i

    rawRows.forEach((row, idx) => {
      const conf: Record<string, 'high' | 'low' | 'missing'> = {}

      const get = (field: string): string => {
        for (const [h, f] of Object.entries(mapping)) {
          if (f === field) return String(row[h] ?? '').trim()
        }
        return ''
      }

      const vendor_name = get('vendor_name')
      const rawStart = get('start_date')
      const rawEnd = get('end_date')
      const rawAnnual = get('annual_cost')
      const rawMonthly = get('monthly_cost')
      const rawTotal = get('total_cost')

      conf.vendor_name = vendor_name ? 'high' : 'missing'
      conf.start_date = rawStart ? (normalizeDate(rawStart) !== rawStart && !/\d{4}-\d{2}-\d{2}/.test(rawStart) ? 'low' : 'high') : 'missing'
      conf.end_date = rawEnd ? (normalizeDate(rawEnd) !== rawEnd && !/\d{4}-\d{2}-\d{2}/.test(rawEnd) ? 'low' : 'high') : 'missing'

      let annual = parseCost(rawAnnual)
      let monthly = parseCost(rawMonthly)
      let total = parseCost(rawTotal)

      // Auto-derive missing costs
      if (annual === 0 && monthly > 0) annual = monthly * 12
      if (monthly === 0 && annual > 0) monthly = annual / 12
      if (total === 0 && annual > 0) total = annual

      conf.annual_cost = annual > 0 ? 'high' : 'missing'

      const rawDept = get('department')
      const rawBranch = get('branch')
      const dept_id = resolveEntity(rawDept, departments)
      const branch_id = resolveEntity(rawBranch, branches)

      if (rawDept) conf.department = dept_id ? 'high' : 'low'
      if (rawBranch) conf.branch = branch_id ? 'high' : 'low'

      const rawStatus = get('status')
      const validStatuses = ['active', 'expiring_soon', 'expired', 'pending']
      let status = 'active'
      if (rawStatus) {
        const sl = rawStatus.toLowerCase().replace(/\s+/g, '_')
        status = validStatuses.includes(sl) ? sl : 'active'
      }

      // Notes (support semicolon-separated)
      const rawNotes = get('notes')
      const notes = rawNotes ? rawNotes.split(/[;|]+/).map((n) => n.trim()).filter(Boolean) : []

      // Line items — scan for li_N_* columns
      const lineItemMap: Record<number, Partial<ImportLineItem>> = {}
      for (const h of headers) {
        const m = h.match(/^(line[_\s]?item|li|item)[_\s]?(\d+)[_\s]?(.*)?/i)
        if (!m) continue
        const n = parseInt(m[2])
        const subField = (m[3] || '').toLowerCase().trim()
        if (!lineItemMap[n]) lineItemMap[n] = {}
        const val = String(row[h] ?? '').trim()
        if (!val) continue
        if (['desc', 'description', 'name', ''].includes(subField)) lineItemMap[n].description = val
        else if (['qty', 'quantity'].includes(subField)) lineItemMap[n].quantity = parseFloat(val) || 1
        else if (['unit_price', 'unitprice', 'price', 'unit price'].includes(subField)) lineItemMap[n].unit_price = parseCost(val)
        else if (['total', 'total_price', 'totalprice'].includes(subField)) lineItemMap[n].total_price = parseCost(val)
      }

      const line_items: ImportLineItem[] = Object.values(lineItemMap)
        .filter((li) => li.description)
        .map((li) => ({
          description: li.description!,
          quantity: li.quantity ?? 1,
          unit_price: li.unit_price ?? 0,
          total_price: li.total_price ?? (li.unit_price ?? 0) * (li.quantity ?? 1)
        }))

      results.push({
        _sourceFile: path.basename(filePath),
        _rowIndex: idx,
        _confidence: conf,
        vendor_name,
        status,
        start_date: normalizeDate(rawStart),
        end_date: normalizeDate(rawEnd),
        monthly_cost: monthly,
        annual_cost: annual,
        total_cost: total,
        poc_name: get('poc_name'),
        poc_email: get('poc_email'),
        poc_phone: get('poc_phone'),
        department_id: dept_id,
        _department_raw: rawDept,
        branch_id,
        _branch_raw: rawBranch,
        line_items,
        notes
      })
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// PDF parsing
// ---------------------------------------------------------------------------

async function parsePdfContract(filePath: string): Promise<ParsedImportResult> {
  const pdfParse = await import('pdf-parse')
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse.default(buffer)
  const text = data.text

  const db = getDb()
  const departments = db.prepare('SELECT id, name FROM departments').all() as NamedEntity[]
  const branches = db.prepare('SELECT id, name, number FROM branches').all() as NamedEntity[]

  const conf: Record<string, 'high' | 'low' | 'missing'> = {}

  // ---- Vendor name ----
  let vendor_name = ''
  const vendorPatterns = [
    /(?:vendor|supplier|company|software|product|licens(?:or|ee)|service provider)[:\s]+([A-Z][A-Za-z0-9\s&.,'-]{2,50})/i,
    /(?:agreement|contract)\s+(?:with|between)[:\s]+([A-Z][A-Za-z0-9\s&.,'-]{2,50})/i,
    /^([A-Z][A-Za-z0-9\s&.,'-]{2,50})(?:\s+(?:inc|llc|ltd|corp|co|services|software|solutions|group)\.?)?$/m
  ]
  for (const p of vendorPatterns) {
    const m = text.match(p)
    if (m) { vendor_name = m[1].trim(); break }
  }
  // Fallback: first line that looks like a company name
  if (!vendor_name) {
    const firstLines = text.split('\n').slice(0, 10)
    for (const line of firstLines) {
      const l = line.trim()
      if (l.length > 3 && l.length < 80 && /[A-Z]/.test(l) && !/^(page|date|contract|agreement)/i.test(l)) {
        vendor_name = l
        break
      }
    }
  }
  conf.vendor_name = vendor_name ? 'high' : 'missing'

  // ---- Dates ----
  const dateRegexes = [
    /\d{4}-\d{2}-\d{2}/g,
    /\d{1,2}\/\d{1,2}\/\d{4}/g,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi
  ]

  const allDates: string[] = []
  for (const r of dateRegexes) {
    const matches = text.matchAll(r)
    for (const m of matches) allDates.push(normalizeDate(m[0]))
  }

  // Look for labeled dates first
  let start_date = ''
  let end_date = ''

  const startMatch = text.match(/(?:start|begin|effective|commencement)\s+date[:\s]+([^\n]+)/i)
  const endMatch = text.match(/(?:end|expir(?:ation|y)|termination|renewal)\s+date[:\s]+([^\n]+)/i)

  if (startMatch) {
    const d = extractDateFromString(startMatch[1])
    if (d) start_date = d
  }
  if (endMatch) {
    const d = extractDateFromString(endMatch[1])
    if (d) end_date = d
  }

  // Fallback: use first two detected dates in sorted order
  if (!start_date && allDates.length > 0) start_date = allDates[0]
  if (!end_date && allDates.length > 1) end_date = allDates[1]

  conf.start_date = start_date ? 'high' : 'missing'
  conf.end_date = end_date ? 'high' : 'missing'

  // ---- Costs ----
  // Look for labeled amounts
  const amountPattern = /\$[\d,]+(?:\.\d{2})?/g
  const allAmounts = [...text.matchAll(amountPattern)].map((m) => parseCost(m[0]))

  let annual = 0, monthly = 0, total = 0

  const annualMatch = text.match(/annual(?:\s+(?:cost|fee|price|value|amount|total))?[:\s]*\$?([\d,]+(?:\.\d{2})?)/i)
  const monthlyMatch = text.match(/monthly(?:\s+(?:cost|fee|price|value|amount))?[:\s]*\$?([\d,]+(?:\.\d{2})?)/i)
  const totalMatch = text.match(/(?:total|contract\s+value|contract\s+amount)[:\s]*\$?([\d,]+(?:\.\d{2})?)/i)

  if (annualMatch) annual = parseCost(annualMatch[1])
  if (monthlyMatch) monthly = parseCost(monthlyMatch[1])
  if (totalMatch) total = parseCost(totalMatch[1])

  // Fallback: largest dollar amount is likely total/annual
  if (annual === 0 && monthly === 0 && allAmounts.length > 0) {
    const sorted = [...allAmounts].sort((a, b) => b - a)
    annual = sorted[0]
  }

  // Derive missing
  if (annual === 0 && monthly > 0) annual = monthly * 12
  if (monthly === 0 && annual > 0) monthly = annual / 12
  if (total === 0 && annual > 0) total = annual

  conf.annual_cost = annual > 0 ? 'high' : 'missing'

  // ---- POC ----
  let poc_name = '', poc_email = '', poc_phone = ''

  const emailMatch = text.match(/[\w.+\-]+@[\w\-]+\.[\w.]+/)
  if (emailMatch) poc_email = emailMatch[0]

  const phoneMatch = text.match(/(?:\+1\s?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}/)
  if (phoneMatch) poc_phone = phoneMatch[0].trim()

  const pocMatch = text.match(/(?:contact|representative|account manager|poc|point of contact)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)
  if (pocMatch) poc_name = pocMatch[1].trim()

  // ---- Dept / Branch ----
  let department_id: number | null = null
  let branch_id: number | null = null
  let _department_raw = ''
  let _branch_raw = ''

  const deptMatch = text.match(/department[:\s]+([A-Za-z\s]+)/i)
  if (deptMatch) {
    _department_raw = deptMatch[1].trim()
    department_id = resolveEntity(_department_raw, departments)
    conf.department = department_id ? 'high' : 'low'
  }
  const branchMatch = text.match(/(?:branch|location|store)[:\s]+([A-Za-z0-9\s]+)/i)
  if (branchMatch) {
    _branch_raw = branchMatch[1].trim()
    branch_id = resolveEntity(_branch_raw, branches)
    conf.branch = branch_id ? 'high' : 'low'
  }

  return {
    _sourceFile: path.basename(filePath),
    _rowIndex: 0,
    _confidence: conf,
    vendor_name,
    status: 'active',
    start_date,
    end_date,
    monthly_cost: monthly,
    annual_cost: annual,
    total_cost: total,
    poc_name,
    poc_email,
    poc_phone,
    department_id,
    _department_raw,
    branch_id,
    _branch_raw,
    line_items: [],
    notes: []
  }
}

function extractDateFromString(s: string): string {
  const patterns = [
    /\d{4}-\d{2}-\d{2}/,
    /\d{1,2}\/\d{1,2}\/\d{4}/,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i
  ]
  for (const p of patterns) {
    const m = s.match(p)
    if (m) return normalizeDate(m[0])
  }
  return ''
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

export function registerImportHandlers(): void {
  // Parse one or more files and return structured contract data for preview
  ipcMain.handle(
    'contracts:parseImport',
    async (): Promise<IpcResponse<ParsedImportResult[]>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Select Contract Files to Import',
          filters: [
            { name: 'Contract Files', extensions: ['csv', 'xlsx', 'xls', 'pdf'] }
          ],
          properties: ['openFile', 'multiSelections']
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'No files selected' }
        }

        const allResults: ParsedImportResult[] = []

        for (const filePath of result.filePaths) {
          const ext = path.extname(filePath).toLowerCase()
          if (ext === '.pdf') {
            const parsed = await parsePdfContract(filePath)
            allResults.push(parsed)
          } else {
            // CSV or XLSX
            const rows = await parseSpreadsheet(filePath)
            allResults.push(...rows)
          }
        }

        // Filter out completely empty rows
        const filtered = allResults.filter(
          (r) => r.vendor_name || r.start_date || r.end_date || r.annual_cost > 0
        )

        return { success: true, data: filtered }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Bulk create contracts from the reviewed/confirmed rows
  ipcMain.handle(
    'contracts:bulkCreate',
    async (_e, rows: ParsedImportResult[]): Promise<IpcResponse<BulkCreateResult>> => {
      const db = getDb()
      let created = 0
      const errors: BulkCreateResult['errors'] = []

      const insertContract = db.prepare(`
        INSERT INTO contracts
          (vendor_name, status, start_date, end_date, monthly_cost, annual_cost, total_cost,
           poc_name, poc_email, poc_phone, department_id, branch_id, file_path)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `)
      const insertLineItem = db.prepare(`
        INSERT INTO contract_line_items (contract_id, description, quantity, unit_price, total_price)
        VALUES (?,?,?,?,?)
      `)
      const insertNote = db.prepare(`
        INSERT INTO vendor_notes (contract_id, note, created_by, created_at)
        VALUES (?, ?, 'Import', datetime('now'))
      `)

      const insertedIds: number[] = []

      const bulkTx = db.transaction((rows: ParsedImportResult[]) => {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          try {
            if (!r.vendor_name) throw new Error('vendor_name is required')
            if (!r.start_date) throw new Error('start_date is required')
            if (!r.end_date) throw new Error('end_date is required')

            const result = insertContract.run(
              r.vendor_name,
              r.status || 'active',
              r.start_date,
              r.end_date,
              r.monthly_cost ?? 0,
              r.annual_cost ?? 0,
              r.total_cost ?? 0,
              r.poc_name ?? '',
              r.poc_email ?? '',
              r.poc_phone ?? '',
              r.department_id ?? null,
              r.branch_id ?? null,
              null
            )
            const contractId = result.lastInsertRowid as number
            insertedIds.push(contractId)

            for (const li of r.line_items ?? []) {
              insertLineItem.run(contractId, li.description, li.quantity, li.unit_price, li.total_price)
            }
            for (const note of r.notes ?? []) {
              if (note.trim()) insertNote.run(contractId, note.trim())
            }
            created++
          } catch (err: any) {
            errors.push({ row: i, vendor: r.vendor_name || '(unknown)', message: err.message })
          }
        }
      })

      bulkTx(rows)

      // Index all newly imported contracts in FTS (outside the transaction).
      for (const id of insertedIds) refreshContractFts(id)

      return { success: true, data: { created, errors } }
    }
  )
}
