import { ipcMain } from 'electron'
import { getDb } from '../database'
import type { IpcResponse } from '../../shared/types'

export interface Clause {
  id: number
  title: string
  category: string
  body_html: string
  description: string
  approved: number
  created_at: string
}

export function registerClauseLibraryHandlers(): void {
  ipcMain.handle('clauses:list', async (_e, category?: string): Promise<IpcResponse<Clause[]>> => {
    try {
      const db = getDb()
      const rows = category
        ? (db
            .prepare('SELECT * FROM clause_library WHERE category = ? ORDER BY title ASC')
            .all(category) as Clause[])
        : (db
            .prepare('SELECT * FROM clause_library ORDER BY category ASC, title ASC')
            .all() as Clause[])
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'clauses:create',
    async (
      _e,
      payload: Omit<Clause, 'id' | 'created_at'>
    ): Promise<IpcResponse<Clause>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            `INSERT INTO clause_library (title, category, body_html, description, approved)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            payload.title,
            payload.category || 'general',
            payload.body_html,
            payload.description ?? '',
            payload.approved ?? 1
          )
        const row = db
          .prepare('SELECT * FROM clause_library WHERE id = ?')
          .get(result.lastInsertRowid) as Clause
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
      payload: Partial<Clause> & { id: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const fields = Object.keys(payload).filter((k) => k !== 'id' && k !== 'created_at')
        if (fields.length === 0) return { success: true }
        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(`UPDATE clause_library SET ${sets} WHERE id = ?`).run(...values, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('clauses:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM clause_library WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
