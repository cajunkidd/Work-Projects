import { ipcMain, dialog } from 'electron'
import path from 'path'
import { getDb } from '../database'
import { uploadToDrive } from './drive'
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
             (contract_id, competitor_vendor, offering_name, price,
              drive_file_id, drive_web_view_link, notes)
             VALUES (?,?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            payload.competitor_vendor,
            payload.offering_name,
            payload.price,
            payload.drive_file_id || null,
            payload.drive_web_view_link || null,
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

  // File picker for competitor offering (uploads to Google Drive)
  ipcMain.handle(
    'competitors:pickFile',
    async (): Promise<
      IpcResponse<{ driveFileId: string; webViewLink: string; filename: string }>
    > => {
      try {
        const result = await dialog.showOpenDialog({
          filters: [{ name: 'Documents', extensions: ['pdf', 'xlsx', 'xls', 'docx'] }],
          properties: ['openFile']
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'No file selected' }
        }
        const filePath = result.filePaths[0]
        const filename = path.basename(filePath)
        const { fileId, webViewLink } = await uploadToDrive(filePath, filename)
        return { success: true, data: { driveFileId: fileId, webViewLink, filename } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
