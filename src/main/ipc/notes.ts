import { ipcMain } from 'electron'
import { getDb } from '../database'
import { recordAudit } from '../audit'
import { requireContractAccess } from '../authz'
import type { Actor, IpcResponse, VendorNote } from '../../shared/types'

export function registerNoteHandlers(): void {
  ipcMain.handle(
    'notes:list',
    async (_e, arg: number | { contract_id: number; actor?: Actor }): Promise<IpcResponse<VendorNote[]>> => {
      try {
        const contract_id = typeof arg === 'number' ? arg : arg.contract_id
        const gate = requireContractAccess(getDb(), contract_id, typeof arg === 'number' ? undefined : arg.actor)
        if (gate) return gate
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
      payload: { contract_id: number; note: string; created_by: string; actor?: Actor }
    ): Promise<IpcResponse<VendorNote>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            'INSERT INTO vendor_notes (contract_id, note, created_by, created_by_user_id) VALUES (?,?,?,?)'
          )
          .run(
            payload.contract_id,
            payload.note,
            payload.created_by,
            payload.actor?.id ?? null
          )
        const row = db
          .prepare('SELECT * FROM vendor_notes WHERE id = ?')
          .get(result.lastInsertRowid) as VendorNote

        const contract = db
          .prepare('SELECT vendor_name FROM contracts WHERE id = ?')
          .get(payload.contract_id) as { vendor_name: string } | undefined
        recordAudit(db, {
          entity_type: 'contract',
          entity_id: payload.contract_id,
          entity_label: contract?.vendor_name ?? `Contract #${payload.contract_id}`,
          action: 'create',
          field_name: 'note',
          new_value: payload.note,
          summary: 'Note added',
          actor: payload.actor
        })

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
