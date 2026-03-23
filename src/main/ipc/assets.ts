import { ipcMain, dialog } from 'electron'
import { getDb } from '../database'
import type { IpcResponse, BranchAsset } from '../../shared/types'

const ASSET_TYPES = ['computer', 'thin_client', 'server', 'printer', 'ingenico'] as const

export function registerAssetHandlers(): void {
  // List all branch assets — returns one row per branch per asset type (0 count if not set)
  ipcMain.handle('assets:list', async (): Promise<IpcResponse<BranchAsset[]>> => {
    try {
      const db = getDb()
      const branches = db.prepare('SELECT id, number, name FROM branches ORDER BY number').all() as {
        id: number; number: number; name: string
      }[]

      const rows: BranchAsset[] = []
      for (const br of branches) {
        for (const type of ASSET_TYPES) {
          const saved = db
            .prepare('SELECT id, count, updated_at FROM branch_assets WHERE branch_id = ? AND asset_type = ?')
            .get(br.id, type) as { id: number; count: number; updated_at: string } | undefined
          rows.push({
            id: saved?.id,
            branch_id: br.id,
            branch_name: br.name,
            branch_number: br.number,
            asset_type: type,
            count: saved?.count ?? 0,
            updated_at: saved?.updated_at
          })
        }
      }
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Save (bulk upsert) asset counts
  ipcMain.handle(
    'assets:save',
    async (_e, rows: { branch_id: number; asset_type: string; count: number }[]): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const stmt = db.prepare(`
          INSERT INTO branch_assets (branch_id, asset_type, count, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(branch_id, asset_type) DO UPDATE SET
            count = excluded.count,
            updated_at = datetime('now')
        `)
        const tx = db.transaction((items: typeof rows) => {
          for (const r of items) {
            stmt.run(r.branch_id, r.asset_type, r.count)
          }
        })
        tx(rows)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Import from Excel / CSV
  ipcMain.handle('assets:importFile', async (): Promise<IpcResponse<{
    rows: { branch_id: number | null; branch_raw: string; computers: number; thin_clients: number; servers: number; printers: number; ingenicos: number }[]
    unmapped: string[]
  }>> => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No file selected' }
      }

      const XLSX = await import('xlsx')
      const wb = XLSX.readFile(result.filePaths[0])
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[]

      if (raw.length === 0) return { success: false, error: 'Spreadsheet is empty' }

      const db = getDb()
      const branches = db.prepare('SELECT id, number, name FROM branches').all() as {
        id: number; number: number; name: string
      }[]

      // Normalize header key to canonical field
      const COMPUTER_ALIASES = ['computers', 'computer', 'pcs', 'desktops', 'workstations', 'pc count', 'pc']
      const TC_ALIASES = ['thin clients', 'thin client', 'tc', 'thin', 'tc count', 'thin_clients', 'thinclients']
      const SERVER_ALIASES = ['servers', 'server', 'svr', 'server count', 'server_count']
      const PRINTER_ALIASES = ['printers', 'printer', 'print', 'printer count', 'printers count']
      const INGENICO_ALIASES = ['ingenico', 'ingenicos', 'ingenico count', 'terminals', 'terminal', 'payment terminal', 'payment terminals', 'pos', 'pos terminal']
      const BRANCH_ALIASES = ['branch', 'branch name', 'branch_name', 'location', 'store', 'site', 'branch number', 'branch_number']

      function findKey(headers: string[], aliases: string[]): string | null {
        for (const h of headers) {
          if (aliases.includes(h.toLowerCase().trim())) return h
        }
        return null
      }

      const headers = Object.keys(raw[0])
      const branchKey = findKey(headers, BRANCH_ALIASES)
      const computerKey = findKey(headers, COMPUTER_ALIASES)
      const tcKey = findKey(headers, TC_ALIASES)
      const serverKey = findKey(headers, SERVER_ALIASES)
      const printerKey = findKey(headers, PRINTER_ALIASES)
      const ingenicoKey = findKey(headers, INGENICO_ALIASES)

      // If no explicit branch column, look for a column whose values are branch numbers
      let detectedBranchKey = branchKey
      if (!detectedBranchKey) {
        for (const h of headers) {
          const vals = raw.map((r) => parseInt(String(r[h]))).filter((v) => !isNaN(v))
          const branchNums = branches.map((b) => b.number)
          const matchCount = vals.filter((v) => branchNums.includes(v)).length
          if (matchCount > 0 && matchCount >= vals.length * 0.5) {
            detectedBranchKey = h
            break
          }
        }
      }

      function resolveBranch(val: any): number | null {
        const str = String(val).trim()
        const num = parseInt(str)
        // Try matching by branch number
        const byNumber = branches.find((b) => b.number === num)
        if (byNumber) return byNumber.id
        // Try matching by name (case-insensitive, partial)
        const lower = str.toLowerCase()
        const byName = branches.find((b) => b.name.toLowerCase().includes(lower) || lower.includes(b.name.toLowerCase()))
        if (byName) return byName.id
        return null
      }

      const parsed: { branch_id: number | null; branch_raw: string; computers: number; thin_clients: number; servers: number; printers: number; ingenicos: number }[] = []
      const unmapped: string[] = []

      for (const row of raw) {
        const branchRaw = detectedBranchKey ? String(row[detectedBranchKey] ?? '').trim() : ''
        if (!branchRaw) continue

        const branch_id = resolveBranch(branchRaw)
        if (!branch_id) {
          if (!unmapped.includes(branchRaw)) unmapped.push(branchRaw)
        }

        parsed.push({
          branch_id,
          branch_raw: branchRaw,
          computers: computerKey ? Math.max(0, parseInt(String(row[computerKey])) || 0) : 0,
          thin_clients: tcKey ? Math.max(0, parseInt(String(row[tcKey])) || 0) : 0,
          servers: serverKey ? Math.max(0, parseInt(String(row[serverKey])) || 0) : 0,
          printers: printerKey ? Math.max(0, parseInt(String(row[printerKey])) || 0) : 0,
          ingenicos: ingenicoKey ? Math.max(0, parseInt(String(row[ingenicoKey])) || 0) : 0
        })
      }

      return { success: true, data: { rows: parsed, unmapped } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
