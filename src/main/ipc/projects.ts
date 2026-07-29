import { ipcMain } from 'electron'
import { getDb } from '../database'
import {
  resolveActor,
  contractScopeClause,
  requireContractAccess,
  requireRowContractAccess
} from '../authz'
import type { Actor, IpcResponse, VendorProject } from '../../shared/types'

export function registerProjectHandlers(): void {
  ipcMain.handle(
    'projects:list',
    async (_e, opts?: { contract_id?: number; department_id?: number; actor?: Actor }): Promise<IpcResponse<VendorProject[]>> => {
      try {
        const db = getDb()
        let query = `
          SELECT vp.*, c.vendor_name, c.department_id
          FROM vendor_projects vp
          LEFT JOIN contracts c ON vp.contract_id = c.id
          WHERE 1=1
        `
        const params: (string | number)[] = []

        // Projects hang off a contract, so they inherit its visibility.
        const scope = contractScopeClause(resolveActor(db, opts?.actor), 'c')
        query += scope.sql
        params.push(...scope.params)

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
    async (_e, payload: Omit<VendorProject, 'id'> & { actor?: Actor }): Promise<IpcResponse<VendorProject>> => {
      try {
        const db = getDb()
        const gate = requireContractAccess(db, payload.contract_id, payload.actor)
        if (gate) return gate
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
      payload: Partial<VendorProject> & { id: number; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const gate = requireRowContractAccess(db, 'vendor_projects', payload.id, payload.actor)
        if (gate) return gate
        // A move must also land on a contract the actor can reach.
        if (payload.contract_id !== undefined) {
          const moved = requireContractAccess(db, payload.contract_id, payload.actor)
          if (moved) return moved
        }
        // `actor` is not a column.
        const fields = Object.keys(payload).filter((k) => k !== 'id' && k !== 'actor')
        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(`UPDATE vendor_projects SET ${sets} WHERE id = ?`).run(...values, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('projects:delete', async (_e, arg: number | { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
    try {
      const id = typeof arg === 'number' ? arg : arg.id
      const gate = requireRowContractAccess(
        getDb(), 'vendor_projects', id, typeof arg === 'number' ? undefined : arg.actor
      )
      if (gate) return gate
      getDb().prepare('DELETE FROM vendor_projects WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
