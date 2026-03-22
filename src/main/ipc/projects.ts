import { ipcMain } from 'electron'
import { getDb } from '../database'
import type { IpcResponse, VendorProject } from '../../shared/types'

export function registerProjectHandlers(): void {
  ipcMain.handle(
    'projects:list',
    async (_e, opts?: { contract_id?: number; department_id?: number }): Promise<IpcResponse<VendorProject[]>> => {
      try {
        const db = getDb()
        let query = `
          SELECT vp.*, c.vendor_name, c.department_id
          FROM vendor_projects vp
          LEFT JOIN contracts c ON vp.contract_id = c.id
          WHERE 1=1
        `
        const params: (string | number)[] = []
        if (opts?.contract_id) {
          query += ' AND vp.contract_id = ?'
          params.push(opts.contract_id)
        }
        if (opts?.department_id) {
          query += ' AND c.department_id = ?'
          params.push(opts.department_id)
        }
        query += ' ORDER BY vp.start_date DESC'
        const rows = db.prepare(query).all(...params) as VendorProject[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'projects:create',
    async (_e, payload: Omit<VendorProject, 'id'>): Promise<IpcResponse<VendorProject>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            `INSERT INTO vendor_projects (contract_id, name, status, start_date, end_date, description)
             VALUES (?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            payload.name,
            payload.status,
            payload.start_date,
            payload.end_date,
            payload.description
          )
        const row = db
          .prepare('SELECT * FROM vendor_projects WHERE id = ?')
          .get(result.lastInsertRowid) as VendorProject
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'projects:update',
    async (
      _e,
      payload: Partial<VendorProject> & { id: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const fields = Object.keys(payload).filter((k) => k !== 'id')
        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(`UPDATE vendor_projects SET ${sets} WHERE id = ?`).run(...values, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('projects:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM vendor_projects WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
