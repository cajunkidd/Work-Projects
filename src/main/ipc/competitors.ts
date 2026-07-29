import { ipcMain, dialog } from 'electron'
import { getDb } from '../database'
import { requireContractAccess, requireRowContractAccess } from '../authz'
import type { Actor, IpcResponse, CompetitorOffering } from '../../shared/types'

export function registerCompetitorHandlers(): void {
  ipcMain.handle(
    'competitors:list',
    async (_e, arg: number | { contract_id: number; actor?: Actor }): Promise<IpcResponse<CompetitorOffering[]>> => {
      try {
        const contract_id = typeof arg === 'number' ? arg : arg.contract_id
        const gate = requireContractAccess(getDb(), contract_id, typeof arg === 'number' ? undefined : arg.actor)
        if (gate) return gate
        const rows = getDb()
          .prepare(
            'SELECT * FROM competitor_offerings WHERE contract_id = ? ORDER BY created_at DESC'
          )
          .all(contract_id) as CompetitorOffering[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'competitors:create',
    async (
      _e,
      payload: Omit<CompetitorOffering, 'id' | 'created_at'> & { actor?: Actor }
    ): Promise<IpcResponse<CompetitorOffering>> => {
      try {
        const db = getDb()
        const gate = requireContractAccess(db, payload.contract_id, payload.actor)
        if (gate) return gate
        const result = db
          .prepare(
            `INSERT INTO competitor_offerings
             (contract_id, competitor_vendor, offering_name, price, file_path, notes)
             VALUES (?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            payload.competitor_vendor,
            payload.offering_name,
            payload.price,
            payload.file_path || null,
            payload.notes
          )
        const row = db
          .prepare('SELECT * FROM competitor_offerings WHERE id = ?')
          .get(result.lastInsertRowid) as CompetitorOffering
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('competitors:delete', async (_e, arg: number | { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
    try {
      const id = typeof arg === 'number' ? arg : arg.id
      const gate = requireRowContractAccess(
        getDb(), 'competitor_offerings', id, typeof arg === 'number' ? undefined : arg.actor
      )
      if (gate) return gate
      getDb().prepare('DELETE FROM competitor_offerings WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // File picker for competitor offering
  ipcMain.handle('competitors:pickFile', async (): Promise<IpcResponse<string>> => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Documents', extensions: ['pdf', 'xlsx', 'xls', 'docx'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No file selected' }
      }
      return { success: true, data: result.filePaths[0] }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
