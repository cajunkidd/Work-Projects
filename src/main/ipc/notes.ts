import { ipcMain } from 'electron'
import { getDb } from '../database'
import type { IpcResponse, VendorNote } from '../../shared/types'

export function registerNoteHandlers(): void {
  ipcMain.handle(
    'notes:list',
    async (_e, contract_id: number): Promise<IpcResponse<VendorNote[]>> => {
      try {
        const rows = getDb()
          .prepare('SELECT * FROM vendor_notes WHERE contract_id = ? ORDER BY created_at DESC')
          .all(contract_id) as VendorNote[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'notes:create',
    async (
      _e,
      payload: { contract_id: number; note: string; created_by: string }
    ): Promise<IpcResponse<VendorNote>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            'INSERT INTO vendor_notes (contract_id, note, created_by) VALUES (?,?,?)'
          )
          .run(payload.contract_id, payload.note, payload.created_by)
        const row = db
          .prepare('SELECT * FROM vendor_notes WHERE id = ?')
          .get(result.lastInsertRowid) as VendorNote
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('notes:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM vendor_notes WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
