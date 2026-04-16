import { ipcMain } from 'electron'
import { getDb, refreshContractFts } from '../database'
import { logChange } from '../audit'
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
        refreshContractFts(payload.contract_id)
        logChange(null, 'note', row.id, 'create', { contract_id: row.contract_id, note: row.note })
        // Record against the parent contract too so its History tab surfaces note activity.
        logChange(null, 'contract', row.contract_id, 'update', {
          note_added: { id: row.id, preview: row.note.slice(0, 120) }
        })
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('notes:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      const db = getDb()
      const row = db.prepare('SELECT * FROM vendor_notes WHERE id = ?').get(id) as
        | VendorNote
        | undefined
      db.prepare('DELETE FROM vendor_notes WHERE id = ?').run(id)
      if (row) {
        refreshContractFts(row.contract_id)
        logChange(null, 'note', id, 'delete', { contract_id: row.contract_id, note: row.note })
        logChange(null, 'contract', row.contract_id, 'update', {
          note_deleted: { id, preview: row.note.slice(0, 120) }
        })
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
