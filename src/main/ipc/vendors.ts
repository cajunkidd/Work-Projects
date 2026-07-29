import { ipcMain } from 'electron'
import { getDb, normalizeVendorName } from '../database'
import { recordAudit, recordFieldChanges } from '../audit'
import { dispatchWebhook } from '../webhooks'
import type { Actor, IpcResponse, Vendor, VendorContact } from '../../shared/types'

/**
 * Vendors as first-class records.
 *
 * Contracts keep their denormalised `vendor_name` (existing exports, Gmail
 * matching, and invoice reconciliation all read it) while `vendor_id` carries
 * the real relationship. Writes keep the two in step.
 */

const EDITABLE_FIELDS = [
  'name',
  'website',
  'email',
  'phone',
  'address',
  'account_number',
  'tax_id',
  'category',
  'status',
  'rating',
  'notes'
]

/** Contract roll-ups attached to every vendor row. */
const ROLLUP_SELECT = `
  (SELECT COUNT(*) FROM contracts c WHERE c.vendor_id = v.id) as contract_count,
  (SELECT COUNT(*) FROM contracts c WHERE c.vendor_id = v.id
     AND c.status IN ('active','expiring_soon')) as active_contract_count,
  (SELECT COALESCE(SUM(c.annual_cost), 0) FROM contracts c WHERE c.vendor_id = v.id
     AND c.status IN ('active','expiring_soon')) as total_annual_cost,
  (SELECT MIN(c.end_date) FROM contracts c WHERE c.vendor_id = v.id
     AND c.status IN ('active','expiring_soon')) as next_renewal
`

export function registerVendorHandlers(): void {
  ipcMain.handle(
    'vendors:list',
    async (
      _e,
      opts?: { search?: string; status?: string; include_inactive?: boolean }
    ): Promise<IpcResponse<Vendor[]>> => {
      try {
        let query = `SELECT v.*, ${ROLLUP_SELECT} FROM vendors v WHERE 1=1`
        const params: string[] = []

        if (opts?.status) {
          query += ' AND v.status = ?'
          params.push(opts.status)
        } else if (!opts?.include_inactive) {
          query += ` AND v.status != 'inactive'`
        }
        if (opts?.search) {
          query += ' AND (v.name LIKE ? OR v.category LIKE ? OR v.email LIKE ?)'
          const term = `%${opts.search}%`
          params.push(term, term, term)
        }

        query += ' ORDER BY v.name COLLATE NOCASE'
        const rows = getDb().prepare(query).all(...params) as Vendor[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('vendors:get', async (_e, id: number): Promise<IpcResponse<Vendor>> => {
    try {
      const db = getDb()
      const row = db
        .prepare(`SELECT v.*, ${ROLLUP_SELECT} FROM vendors v WHERE v.id = ?`)
        .get(id) as Vendor | undefined
      if (!row) return { success: false, error: 'Vendor not found' }

      row.contacts = db
        .prepare(
          'SELECT * FROM vendor_contacts WHERE vendor_id = ? ORDER BY is_primary DESC, name'
        )
        .all(id) as VendorContact[]

      return { success: true, data: row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'vendors:create',
    async (_e, payload: Partial<Vendor> & { actor?: Actor }): Promise<IpcResponse<Vendor>> => {
      try {
        const db = getDb()
        const name = payload.name?.trim()
        if (!name) return { success: false, error: 'A vendor needs a name.' }

        const normalized = normalizeVendorName(name) || name.toLowerCase()
        const duplicate = db
          .prepare('SELECT id, name FROM vendors WHERE normalized_name = ?')
          .get(normalized) as { id: number; name: string } | undefined
        if (duplicate) {
          return {
            success: false,
            error: `"${duplicate.name}" already exists and matches this name. Edit that record instead.`
          }
        }

        const result = db
          .prepare(
            `INSERT INTO vendors
              (name, normalized_name, website, email, phone, address, account_number,
               tax_id, category, status, rating, notes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            name,
            normalized,
            payload.website ?? '',
            payload.email ?? '',
            payload.phone ?? '',
            payload.address ?? '',
            payload.account_number ?? '',
            payload.tax_id ?? '',
            payload.category ?? '',
            payload.status ?? 'active',
            payload.rating ?? null,
            payload.notes ?? ''
          )

        const row = db
          .prepare('SELECT * FROM vendors WHERE id = ?')
          .get(result.lastInsertRowid) as Vendor

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: row.id,
          entity_label: row.name,
          action: 'create',
          summary: `Vendor "${row.name}" created`,
          actor: payload.actor
        })
        dispatchWebhook(db, 'vendor.created', { vendor: row })

        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'vendors:update',
    async (
      _e,
      payload: Partial<Vendor> & { id: number; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const before = db.prepare('SELECT * FROM vendors WHERE id = ?').get(payload.id) as
          | Vendor
          | undefined
        if (!before) return { success: false, error: 'Vendor not found' }

        const { id, actor, ...rest } = payload
        const fields = Object.keys(rest).filter((k) => EDITABLE_FIELDS.includes(k))
        if (fields.length === 0) return { success: true }

        // A rename must not collide with another vendor, or it would silently
        // create the duplicate that create-time checking exists to prevent.
        if (rest.name && rest.name.trim() !== before.name) {
          const normalized = normalizeVendorName(rest.name) || rest.name.toLowerCase()
          const clash = db
            .prepare('SELECT id, name FROM vendors WHERE normalized_name = ? AND id != ?')
            .get(normalized, id) as { id: number; name: string } | undefined
          if (clash) {
            return {
              success: false,
              error: `"${clash.name}" already matches that name. Merge the two records instead of renaming.`
            }
          }
        }

        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (rest as any)[f])

        const apply = db.transaction(() => {
          db.prepare(
            `UPDATE vendors SET ${sets}, updated_at = datetime('now') WHERE id = ?`
          ).run(...values, id)

          // Renaming the vendor re-points the denormalised label on its contracts.
          if (rest.name && rest.name !== before.name) {
            const normalized = normalizeVendorName(rest.name) || rest.name.toLowerCase()
            db.prepare('UPDATE vendors SET normalized_name = ? WHERE id = ?').run(normalized, id)
            db.prepare('UPDATE contracts SET vendor_name = ? WHERE vendor_id = ?').run(
              rest.name,
              id
            )
          }
        })
        apply()

        recordFieldChanges(db, {
          entity_type: 'contract',
          entity_id: id,
          entity_label: before.name,
          before: before as unknown as Record<string, unknown>,
          after: rest as Record<string, unknown>,
          fields,
          actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'vendors:delete',
    async (_e, payload: { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const vendor = db.prepare('SELECT name FROM vendors WHERE id = ?').get(payload.id) as
          | { name: string }
          | undefined
        if (!vendor) return { success: false, error: 'Vendor not found' }

        const linked = db
          .prepare('SELECT COUNT(*) as n FROM contracts WHERE vendor_id = ?')
          .get(payload.id) as { n: number }
        if (linked.n > 0) {
          return {
            success: false,
            error: `"${vendor.name}" still has ${linked.n} contract(s). Reassign or delete them first, or set the vendor to inactive.`
          }
        }

        db.prepare('DELETE FROM vendors WHERE id = ?').run(payload.id)
        recordAudit(db, {
          entity_type: 'contract',
          entity_id: payload.id,
          entity_label: vendor.name,
          action: 'delete',
          summary: `Vendor "${vendor.name}" deleted`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /**
   * Folds a duplicate vendor into a survivor: contracts, documents, and
   * contacts move across, then the duplicate is removed.
   */
  ipcMain.handle(
    'vendors:merge',
    async (
      _e,
      payload: { keep_id: number; merge_id: number; actor?: Actor }
    ): Promise<IpcResponse<{ contracts_moved: number }>> => {
      try {
        const db = getDb()
        if (payload.keep_id === payload.merge_id) {
          return { success: false, error: 'Pick two different vendors to merge.' }
        }

        const keep = db.prepare('SELECT * FROM vendors WHERE id = ?').get(payload.keep_id) as
          | Vendor
          | undefined
        const merge = db.prepare('SELECT * FROM vendors WHERE id = ?').get(payload.merge_id) as
          | Vendor
          | undefined
        if (!keep || !merge) return { success: false, error: 'Vendor not found' }

        const moved = db
          .prepare('SELECT COUNT(*) as n FROM contracts WHERE vendor_id = ?')
          .get(payload.merge_id) as { n: number }

        db.transaction(() => {
          db.prepare(
            'UPDATE contracts SET vendor_id = ?, vendor_name = ? WHERE vendor_id = ?'
          ).run(keep.id, keep.name, merge.id)
          db.prepare('UPDATE documents SET vendor_id = ? WHERE vendor_id = ?').run(
            keep.id,
            merge.id
          )
          db.prepare('UPDATE vendor_contacts SET vendor_id = ? WHERE vendor_id = ?').run(
            keep.id,
            merge.id
          )
          db.prepare('DELETE FROM vendors WHERE id = ?').run(merge.id)
        })()

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: keep.id,
          entity_label: keep.name,
          action: 'update',
          summary: `Vendor "${merge.name}" merged into "${keep.name}" — ${moved.n} contract(s) moved`,
          actor: payload.actor
        })

        return { success: true, data: { contracts_moved: moved.n } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /** Vendors whose normalised names collide — likely typo duplicates. */
  ipcMain.handle(
    'vendors:findDuplicates',
    async (): Promise<IpcResponse<{ normalized_name: string; vendors: Vendor[] }[]>> => {
      try {
        const db = getDb()
        const groups = db
          .prepare(
            `SELECT normalized_name FROM vendors
             GROUP BY normalized_name HAVING COUNT(*) > 1`
          )
          .all() as { normalized_name: string }[]

        const data = groups.map((group) => ({
          normalized_name: group.normalized_name,
          vendors: db
            .prepare(`SELECT v.*, ${ROLLUP_SELECT} FROM vendors v WHERE v.normalized_name = ?`)
            .all(group.normalized_name) as Vendor[]
        }))

        return { success: true, data }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── Contacts ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'vendorContacts:create',
    async (
      _e,
      payload: Partial<VendorContact> & { vendor_id: number; actor?: Actor }
    ): Promise<IpcResponse<VendorContact>> => {
      try {
        const db = getDb()
        if (!payload.name?.trim()) return { success: false, error: 'A contact needs a name.' }

        // Only one primary contact per vendor.
        if (payload.is_primary) {
          db.prepare('UPDATE vendor_contacts SET is_primary = 0 WHERE vendor_id = ?').run(
            payload.vendor_id
          )
        }

        const result = db
          .prepare(
            `INSERT INTO vendor_contacts (vendor_id, name, title, email, phone, is_primary, notes)
             VALUES (?,?,?,?,?,?,?)`
          )
          .run(
            payload.vendor_id,
            payload.name.trim(),
            payload.title ?? '',
            payload.email ?? '',
            payload.phone ?? '',
            payload.is_primary ? 1 : 0,
            payload.notes ?? ''
          )

        const row = db
          .prepare('SELECT * FROM vendor_contacts WHERE id = ?')
          .get(result.lastInsertRowid) as VendorContact
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'vendorContacts:delete',
    async (_e, id: number): Promise<IpcResponse<void>> => {
      try {
        getDb().prepare('DELETE FROM vendor_contacts WHERE id = ?').run(id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
