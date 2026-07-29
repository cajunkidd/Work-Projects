import { ipcMain } from 'electron'
import { getDb } from '../database'
import { requireRole, denied, requireContractAccess } from '../authz'
import type { AuditEntry, AuditFilter, IpcResponse } from '../../shared/types'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 5000

export function registerAuditHandlers(): void {
  // Filtered audit log query
  ipcMain.handle(
    'audit:list',
    async (_e, filter?: AuditFilter): Promise<IpcResponse<AuditEntry[]>> => {
      try {
        // The log spans contracts, users, settings, and approvals in one
        // stream, so it can't be filtered down to a branch meaningfully — it is
        // a compliance view, restricted to director and above.
        const gate = requireRole(getDb(), filter?.actor, 'director')
        if (denied(gate)) return gate

        let query = 'SELECT * FROM audit_log WHERE 1=1'
        const params: (string | number)[] = []

        if (filter?.entity_type) {
          query += ' AND entity_type = ?'
          params.push(filter.entity_type)
        }
        if (filter?.entity_id) {
          query += ' AND entity_id = ?'
          params.push(filter.entity_id)
        }
        if (filter?.action) {
          query += ' AND action = ?'
          params.push(filter.action)
        }
        if (filter?.user_id) {
          query += ' AND user_id = ?'
          params.push(filter.user_id)
        }
        if (filter?.from_date) {
          query += " AND date(created_at) >= date(?)"
          params.push(filter.from_date)
        }
        if (filter?.to_date) {
          query += " AND date(created_at) <= date(?)"
          params.push(filter.to_date)
        }
        if (filter?.search) {
          query += ' AND (entity_label LIKE ? OR summary LIKE ? OR user_name LIKE ?)'
          const term = `%${filter.search}%`
          params.push(term, term, term)
        }

        const limit = Math.min(filter?.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
        query += ' ORDER BY created_at DESC, id DESC LIMIT ?'
        params.push(limit)

        const rows = getDb().prepare(query).all(...params) as AuditEntry[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Full history for one entity — powers the History tab on a contract
  ipcMain.handle(
    'audit:entityHistory',
    async (
      _e,
      opts: { entity_type: string; entity_id: number; actor?: { id: number } }
    ): Promise<IpcResponse<AuditEntry[]>> => {
      try {
        // A contract's own history is visible to anyone who can open the
        // contract — that's the History tab. History for anything else (users,
        // settings, approval rules) is a compliance view, director and above.
        if (opts.entity_type === 'contract') {
          const gate = requireContractAccess(getDb(), opts.entity_id, opts.actor)
          if (gate) return gate
        } else {
          const gate = requireRole(getDb(), opts.actor, 'director')
          if (denied(gate)) return gate
        }

        const rows = getDb()
          .prepare(
            `SELECT * FROM audit_log
             WHERE entity_type = ? AND entity_id = ?
             ORDER BY created_at DESC, id DESC`
          )
          .all(opts.entity_type, opts.entity_id) as AuditEntry[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Distinct actors, for the audit log's user filter dropdown
  ipcMain.handle(
    'audit:actors',
    async (
      _e,
      opts?: { actor?: { id: number } }
    ): Promise<IpcResponse<{ user_id: number | null; user_name: string }[]>> => {
      try {
        const gate = requireRole(getDb(), opts?.actor, 'director')
        if (denied(gate)) return gate
        const rows = getDb()
          .prepare(
            `SELECT DISTINCT user_id, user_name FROM audit_log ORDER BY user_name COLLATE NOCASE`
          )
          .all() as { user_id: number | null; user_name: string }[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Summary counts for the audit dashboard strip
  ipcMain.handle(
    'audit:stats',
    async (
      _e,
      opts?: { actor?: { id: number } }
    ): Promise<
      IpcResponse<{ total: number; today: number; this_week: number; actors: number }>
    > => {
      try {
        const db = getDb()
        const gate = requireRole(db, opts?.actor, 'director')
        if (denied(gate)) return gate
        const row = db
          .prepare(
            `SELECT
               COUNT(*) as total,
               SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) as today,
               SUM(CASE WHEN date(created_at) >= date('now','-7 days') THEN 1 ELSE 0 END) as this_week,
               COUNT(DISTINCT user_name) as actors
             FROM audit_log`
          )
          .get() as { total: number; today: number | null; this_week: number | null; actors: number }
        return {
          success: true,
          data: {
            total: row.total ?? 0,
            today: row.today ?? 0,
            this_week: row.this_week ?? 0,
            actors: row.actors ?? 0
          }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
