import { ipcMain, dialog } from 'electron'
import { getDb } from '../database'
import type { IpcResponse, CompetitorOffering } from '../../shared/types'

export function registerCompetitorHandlers(): void {
  ipcMain.handle(
    'competitors:list',
    async (_e, contract_id: number): Promise<IpcResponse<CompetitorOffering[]>> => {
      try {
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
      payload: Omit<CompetitorOffering, 'id' | 'created_at'>
    ): Promise<IpcResponse<CompetitorOffering>> => {
      try {
        const db = getDb()
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

  ipcMain.handle('competitors:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
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
