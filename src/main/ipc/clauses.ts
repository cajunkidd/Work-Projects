import { ipcMain } from 'electron'
import { getDb } from '../database'
import { recordAudit, recordFieldChanges } from '../audit'
import type { Actor, Clause, ClauseFilter, IpcResponse } from '../../shared/types'

/**
 * Clause library.
 *
 * Clauses are organised as standard positions with optional fallback or
 * alternative variants hanging off them via parent_id, which is how drafters
 * actually work: lead with the standard, fall back when the vendor pushes.
 */

const EDITABLE_FIELDS = [
  'title',
  'category',
  'body',
  'clause_type',
  'parent_id',
  'risk_level',
  'tags',
  'guidance',
  'is_archived'
]

export function registerClauseHandlers(): void {
  ipcMain.handle(
    'clauses:list',
    async (_e, filter?: ClauseFilter): Promise<IpcResponse<Clause[]>> => {
      try {
        let query = `
          SELECT c.*, p.title as parent_title
          FROM clauses c
          LEFT JOIN clauses p ON c.parent_id = p.id
          WHERE 1=1
        `
        const params: (string | number)[] = []

        if (!filter?.include_archived) query += ' AND c.is_archived = 0'

        if (filter?.category) {
          query += ' AND c.category = ?'
          params.push(filter.category)
        }
        if (filter?.clause_type) {
          query += ' AND c.clause_type = ?'
          params.push(filter.clause_type)
        }
        if (filter?.risk_level) {
          query += ' AND c.risk_level = ?'
          params.push(filter.risk_level)
        }
        if (filter?.search) {
          // Clause-level search across the title, body text, and tags.
          query += ' AND (c.title LIKE ? OR c.body LIKE ? OR c.tags LIKE ? OR c.category LIKE ?)'
          const term = `%${filter.search}%`
          params.push(term, term, term, term)
        }

        query += ' ORDER BY c.category COLLATE NOCASE, c.clause_type DESC, c.title COLLATE NOCASE'

        const rows = getDb().prepare(query).all(...params) as Clause[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /** A standard clause with its fallback/alternative variants attached. */
  ipcMain.handle('clauses:get', async (_e, id: number): Promise<IpcResponse<Clause>> => {
    try {
      const db = getDb()
      const row = db
        .prepare(
          `SELECT c.*, p.title as parent_title
           FROM clauses c LEFT JOIN clauses p ON c.parent_id = p.id
           WHERE c.id = ?`
        )
        .get(id) as Clause | undefined
      if (!row) return { success: false, error: 'Clause not found' }

      row.variants = db
        .prepare('SELECT * FROM clauses WHERE parent_id = ? ORDER BY clause_type, title')
        .all(id) as Clause[]

      return { success: true, data: row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'clauses:create',
    async (
      _e,
      payload: Partial<Clause> & { actor?: Actor }
    ): Promise<IpcResponse<Clause>> => {
      try {
        const db = getDb()
        if (!payload.title?.trim()) return { success: false, error: 'A clause needs a title.' }
        if (!payload.body?.trim()) return { success: false, error: 'A clause needs body text.' }

        const result = db
          .prepare(
            `INSERT INTO clauses
              (title, category, body, clause_type, parent_id, risk_level, tags, guidance, created_by_name)
             VALUES (?,?,?,?,?,?,?,?,?)`
          )
          .run(
            payload.title.trim(),
            payload.category?.trim() || 'General',
            payload.body,
            payload.clause_type ?? 'standard',
            payload.parent_id ?? null,
            payload.risk_level ?? 'medium',
            payload.tags ?? '',
            payload.guidance ?? '',
            payload.actor?.name ?? 'Unknown'
          )

        const row = db
          .prepare('SELECT * FROM clauses WHERE id = ?')
          .get(result.lastInsertRowid) as Clause

        recordAudit(db, {
          entity_type: 'clause',
          entity_id: row.id,
          entity_label: row.title,
          action: 'create',
          summary: `Clause "${row.title}" added to the ${row.category} category (${row.clause_type})`,
          actor: payload.actor
        })

        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'clauses:update',
    async (
      _e,
      payload: Partial<Clause> & { id: number; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const before = db.prepare('SELECT * FROM clauses WHERE id = ?').get(payload.id) as
          | Clause
          | undefined
        if (!before) return { success: false, error: 'Clause not found' }

        const { id, actor, ...rest } = payload
        const fields = Object.keys(rest).filter((k) => EDITABLE_FIELDS.includes(k))
        if (fields.length === 0) return { success: true }

        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (rest as any)[f])
        db.prepare(
          `UPDATE clauses SET ${sets}, updated_at = datetime('now') WHERE id = ?`
        ).run(...values, id)

        recordFieldChanges(db, {
          entity_type: 'clause',
          entity_id: id,
          entity_label: before.title,
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

  /** Archiving keeps the clause for historical reference but hides it from drafting. */
  ipcMain.handle(
    'clauses:archive',
    async (
      _e,
      payload: { id: number; archived: boolean; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const clause = db.prepare('SELECT title FROM clauses WHERE id = ?').get(payload.id) as
          | { title: string }
          | undefined
        if (!clause) return { success: false, error: 'Clause not found' }

        db.prepare(
          `UPDATE clauses SET is_archived = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(payload.archived ? 1 : 0, payload.id)

        recordAudit(db, {
          entity_type: 'clause',
          entity_id: payload.id,
          entity_label: clause.title,
          action: 'archive',
          summary: `Clause "${clause.title}" ${payload.archived ? 'archived' : 'restored'}`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'clauses:delete',
    async (_e, payload: { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const clause = db.prepare('SELECT title FROM clauses WHERE id = ?').get(payload.id) as
          | { title: string }
          | undefined
        // Variants cascade with the parent via the schema's ON DELETE CASCADE.
        db.prepare('DELETE FROM clauses WHERE id = ?').run(payload.id)

        recordAudit(db, {
          entity_type: 'clause',
          entity_id: payload.id,
          entity_label: clause?.title ?? `Clause #${payload.id}`,
          action: 'delete',
          summary: `Clause "${clause?.title ?? payload.id}" deleted`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('clauses:categories', async (): Promise<IpcResponse<string[]>> => {
    try {
      const rows = getDb()
        .prepare(
          'SELECT DISTINCT category FROM clauses WHERE is_archived = 0 ORDER BY category COLLATE NOCASE'
        )
        .all() as { category: string }[]
      return { success: true, data: rows.map((r) => r.category) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /** Bumps the usage counter when a clause is inserted into a draft. */
  ipcMain.handle('clauses:recordUsage', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('UPDATE clauses SET usage_count = usage_count + 1 WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
