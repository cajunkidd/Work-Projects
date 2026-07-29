import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../database'
import {
  notifyContractCreated,
  notifyContractUpdated,
  notifyContractDeleted
} from '../emailNotifier'
import { recordAudit, recordFieldChanges } from '../audit'
import { dispatchWebhook } from '../webhooks'
import { linkContractToVendor } from '../vendorLink'
import { resolveActor, contractScopeClause, canAccessScope, requireContractAccess } from '../authz'
import type {
  Actor,
  IpcResponse,
  Contract,
  ContractLineItem,
  RenewalHistory
} from '../../shared/types'

// Lazy imports for parsing (native modules)
async function parsePdf(filePath: string): Promise<string> {
  const pdfParse = await import('pdf-parse')
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse.default(buffer)
  return data.text
}

async function parseXlsx(filePath: string): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws) as Record<string, string>[]
}

/**
 * Loads a contract and checks the actor may see it.
 *
 * Returns the row, or a string describing why not. Out-of-scope and missing are
 * deliberately given the same message: telling a store manager "that contract
 * exists but isn't yours" leaks the existence of contracts they can't see.
 */
function loadInScope(
  db: ReturnType<typeof getDb>,
  id: number,
  actor: Actor | { id?: number } | null | undefined
): { contract: Contract } | { error: string } {
  const resolved = resolveActor(db, actor)
  if (!resolved) {
    return { error: 'Could not identify the acting user. Sign out and back in, then try again.' }
  }
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id) as Contract | undefined
  if (!row) return { error: 'Contract not found.' }
  if (!canAccessScope(resolved, row.department_id ?? null, row.branch_id ?? null)) {
    return { error: 'Contract not found.' }
  }
  return { contract: row }
}

export function registerContractHandlers(): void {
  // List contracts. Visibility comes from the acting user's stored role — the
  // caller may narrow with department_id/branch_id but cannot widen.
  ipcMain.handle(
    'contracts:list',
    async (
      _e,
      opts?: {
        department_id?: number
        branch_id?: number
        search?: string
        actor?: Actor
      }
    ): Promise<IpcResponse<Contract[]>> => {
      try {
        const db = getDb()
        let query = `
          SELECT c.*, d.name as department_name, br.name as branch_name,
            (SELECT COUNT(*) FROM vendor_notes WHERE contract_id = c.id) as notes_count,
            CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal,
            CASE WHEN c.renewal_type = 'evergreen' AND c.cancellation_notice_days > 0
              THEN date(c.end_date, '-' || c.cancellation_notice_days || ' days')
              ELSE NULL
            END as cancellation_deadline,
            CASE WHEN c.renewal_type = 'evergreen' AND c.cancellation_notice_days > 0
              THEN CAST(julianday(c.end_date, '-' || c.cancellation_notice_days || ' days')
                - julianday('now') AS INTEGER)
              ELSE NULL
            END as days_until_cancellation
          FROM contracts c
          LEFT JOIN departments d ON c.department_id = d.id
          LEFT JOIN branches br ON c.branch_id = br.id
          WHERE 1=1
        `
        const params: (string | number)[] = []

        // Explicit filter by a single dept or branch
        if (opts?.department_id) {
          query += ' AND c.department_id = ?'
          params.push(opts.department_id)
        }
        if (opts?.branch_id) {
          query += ' AND c.branch_id = ?'
          params.push(opts.branch_id)
        }

        // Role-based visibility, derived from the stored role rather than
        // anything the renderer claims.
        const scope = contractScopeClause(resolveActor(db, opts?.actor), 'c')
        query += scope.sql
        params.push(...scope.params)

        if (opts?.search) {
          query += ' AND (c.vendor_name LIKE ? OR c.poc_name LIKE ?)'
          params.push(`%${opts.search}%`, `%${opts.search}%`)
        }
        query += ' ORDER BY c.end_date ASC'

        const rows = db.prepare(query).all(...params) as Contract[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Get single contract. Accepts a bare id or { id, actor }.
  ipcMain.handle('contracts:get', async (_e, arg: number | { id: number; actor?: Actor }): Promise<IpcResponse<Contract>> => {
    try {
      const db = getDb()
      const id = typeof arg === 'number' ? arg : arg.id
      const actor = typeof arg === 'number' ? undefined : arg.actor

      const gate = loadInScope(db, id, actor)
      if ('error' in gate) return { success: false, error: gate.error }

      const row = db
        .prepare(
          `SELECT c.*, d.name as department_name, br.name as branch_name,
            CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal,
            CASE WHEN c.renewal_type = 'evergreen' AND c.cancellation_notice_days > 0
              THEN date(c.end_date, '-' || c.cancellation_notice_days || ' days')
              ELSE NULL
            END as cancellation_deadline,
            CASE WHEN c.renewal_type = 'evergreen' AND c.cancellation_notice_days > 0
              THEN CAST(julianday(c.end_date, '-' || c.cancellation_notice_days || ' days')
                - julianday('now') AS INTEGER)
              ELSE NULL
            END as days_until_cancellation
           FROM contracts c
           LEFT JOIN departments d ON c.department_id = d.id
           LEFT JOIN branches br ON c.branch_id = br.id
           WHERE c.id = ?`
        )
        .get(id) as Contract
      return { success: true, data: row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Create contract
  ipcMain.handle(
    'contracts:create',
    async (
      _e,
      payload: Omit<Contract, 'id' | 'created_at'> & { actor?: Actor }
    ): Promise<IpcResponse<Contract>> => {
      try {
        const db = getDb()

        const resolved = resolveActor(db, payload.actor)
        if (!resolved) {
          return {
            success: false,
            error: 'Could not identify the acting user. Sign out and back in, then try again.'
          }
        }
        if (!canAccessScope(resolved, payload.department_id ?? null, payload.branch_id ?? null)) {
          return {
            success: false,
            error: 'You cannot create a contract outside your assigned departments and branches.'
          }
        }

        const result = db
          .prepare(
            `INSERT INTO contracts
             (vendor_name, status, start_date, end_date, monthly_cost, annual_cost, total_cost,
              poc_name, poc_email, poc_phone, department_id, branch_id, file_path,
              renewal_type, cancellation_notice_days)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            payload.vendor_name,
            payload.status,
            payload.start_date,
            payload.end_date,
            payload.monthly_cost,
            payload.annual_cost,
            payload.total_cost,
            payload.poc_name,
            payload.poc_email,
            payload.poc_phone,
            payload.department_id ?? null,
            payload.branch_id ?? null,
            payload.file_path || null,
            payload.renewal_type ?? 'fixed_term',
            payload.cancellation_notice_days ?? 0
          )
        const row = db
          .prepare('SELECT * FROM contracts WHERE id = ?')
          .get(result.lastInsertRowid) as Contract

        linkContractToVendor(db, row.id, row.vendor_name)

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: row.id,
          entity_label: row.vendor_name,
          action: 'create',
          summary: `Contract created for ${row.vendor_name} (${row.start_date} → ${row.end_date}, ${row.annual_cost}/yr)`,
          actor: payload.actor
        })

        dispatchWebhook(db, 'contract.created', { contract: row })
        notifyContractCreated(db, row).catch(() => {})
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Update contract
  ipcMain.handle(
    'contracts:update',
    async (
      _e,
      payload: Partial<Contract> & { id: number; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        // Fetch current contract for notification and audit context before
        // updating — and refuse outright if it is outside the actor's scope.
        const gate = loadInScope(db, payload.id, payload.actor)
        if ('error' in gate) return { success: false, error: gate.error }
        const current = gate.contract

        // A move must land somewhere the actor can also reach, or a store
        // manager could push a contract into a branch and lose sight of it.
        const resolved = resolveActor(db, payload.actor)!
        const nextDept = payload.department_id !== undefined ? payload.department_id : current.department_id
        const nextBranch = payload.branch_id !== undefined ? payload.branch_id : current.branch_id
        if (!canAccessScope(resolved, nextDept ?? null, nextBranch ?? null)) {
          return { success: false, error: 'You cannot move a contract outside your assigned scope.' }
        }

        // `actor` and the joined display-only columns are not contract columns.
        const NON_COLUMNS = [
          'id',
          'actor',
          'department_name',
          'branch_name',
          'notes_count',
          'days_until_renewal',
          'cancellation_deadline',
          'days_until_cancellation'
        ]
        const fields = Object.keys(payload).filter((k) => !NON_COLUMNS.includes(k))
        if (fields.length === 0) return { success: true }

        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(
          `UPDATE contracts SET ${sets}, updated_at = datetime('now'), updated_by = ? WHERE id = ?`
        ).run(...values, payload.actor?.name ?? 'System', payload.id)

        // A renamed vendor re-resolves to (or creates) the matching record.
        if (payload.vendor_name && payload.vendor_name !== current?.vendor_name) {
          linkContractToVendor(db, payload.id, payload.vendor_name)
        }

        if (current) {
          const changed = recordFieldChanges(db, {
            entity_type: 'contract',
            entity_id: payload.id,
            entity_label: current.vendor_name,
            before: current as unknown as Record<string, unknown>,
            after: payload as Record<string, unknown>,
            fields,
            actor: payload.actor
          })
          if (changed.length > 0) {
            dispatchWebhook(db, 'contract.updated', {
              contract_id: payload.id,
              vendor_name: payload.vendor_name ?? current.vendor_name,
              changed_fields: changed
            })
          }
          notifyContractUpdated(db, current, fields).catch(() => {})
        }
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Delete contract. Accepts a bare id or { id, actor }.
  ipcMain.handle('contracts:delete', async (_e, arg: number | { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
    try {
      const db = getDb()
      const id = typeof arg === 'number' ? arg : arg.id
      const actor = typeof arg === 'number' ? undefined : arg.actor

      const gate = loadInScope(db, id, actor)
      if ('error' in gate) return { success: false, error: gate.error }
      const contract = gate.contract

      db.prepare('DELETE FROM contracts WHERE id = ?').run(id)
      if (contract) {
        recordAudit(db, {
          entity_type: 'contract',
          entity_id: id,
          entity_label: contract.vendor_name,
          action: 'delete',
          summary: `Contract for ${contract.vendor_name} (${contract.annual_cost}/yr) was deleted`,
          actor
        })
        dispatchWebhook(db, 'contract.deleted', {
          contract_id: id,
          vendor_name: contract.vendor_name,
          annual_cost: contract.annual_cost
        })
        notifyContractDeleted(db, contract.vendor_name, contract.department_id, contract.branch_id).catch(() => {})
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Upload contract file (opens dialog)
  ipcMain.handle('contracts:uploadFile', async (): Promise<IpcResponse<{ path: string; text?: string; rows?: Record<string,string>[] }>> => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Contracts', extensions: ['pdf', 'xlsx', 'xls'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No file selected' }
      }
      const filePath = result.filePaths[0]
      const ext = path.extname(filePath).toLowerCase()

      if (ext === '.pdf') {
        const text = await parsePdf(filePath)
        return { success: true, data: { path: filePath, text } }
      } else {
        const rows = await parseXlsx(filePath)
        return { success: true, data: { path: filePath, rows } }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Line items
  ipcMain.handle(
    'lineItems:list',
    async (_e, arg: number | { contract_id: number; actor?: Actor }): Promise<IpcResponse<ContractLineItem[]>> => {
      try {
        const contract_id = typeof arg === 'number' ? arg : arg.contract_id
        const actor = typeof arg === 'number' ? undefined : arg.actor
        const gate = requireContractAccess(getDb(), contract_id, actor)
        if (gate) return gate
        const rows = getDb()
          .prepare('SELECT * FROM contract_line_items WHERE contract_id = ?')
          .all(contract_id) as ContractLineItem[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'lineItems:upsert',
    async (_e, items: ContractLineItem[]): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const upsert = db.prepare(`
          INSERT INTO contract_line_items (id, contract_id, description, quantity, unit_price, total_price)
          VALUES (@id, @contract_id, @description, @quantity, @unit_price, @total_price)
          ON CONFLICT(id) DO UPDATE SET
            description = excluded.description,
            quantity = excluded.quantity,
            unit_price = excluded.unit_price,
            total_price = excluded.total_price
        `)
        const insert = db.prepare(`
          INSERT INTO contract_line_items (contract_id, description, quantity, unit_price, total_price)
          VALUES (@contract_id, @description, @quantity, @unit_price, @total_price)
        `)
        const tx = db.transaction((items: ContractLineItem[]) => {
          for (const item of items) {
            if (item.id) {
              upsert.run(item)
            } else {
              insert.run(item)
            }
          }
        })
        tx(items)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('lineItems:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM contract_line_items WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Renewal history
  ipcMain.handle(
    'renewals:list',
    async (_e, arg: number | { contract_id: number; actor?: Actor }): Promise<IpcResponse<RenewalHistory[]>> => {
      try {
        const contract_id = typeof arg === 'number' ? arg : arg.contract_id
        const actor = typeof arg === 'number' ? undefined : arg.actor
        const gate = requireContractAccess(getDb(), contract_id, actor)
        if (gate) return gate
        const rows = getDb()
          .prepare('SELECT * FROM renewal_history WHERE contract_id = ? ORDER BY renewal_date DESC')
          .all(contract_id) as RenewalHistory[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'renewals:create',
    async (
      _e,
      payload: Omit<RenewalHistory, 'id'>
    ): Promise<IpcResponse<RenewalHistory>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            `INSERT INTO renewal_history (contract_id, renewal_date, prev_cost, new_cost, license_count_change, reason)
             VALUES (?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            payload.renewal_date,
            payload.prev_cost,
            payload.new_cost,
            payload.license_count_change,
            payload.reason
          )
        const row = db
          .prepare('SELECT * FROM renewal_history WHERE id = ?')
          .get(result.lastInsertRowid) as RenewalHistory
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
