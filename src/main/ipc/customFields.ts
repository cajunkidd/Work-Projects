import { ipcMain } from 'electron'
import { getDb } from '../database'
import { logChange } from '../audit'
import type { IpcResponse } from '../../shared/types'

export interface CustomField {
  id: number
  entity_type: 'contract'
  name: string
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options_json: string // JSON array (used when field_type = 'select')
  sort_order: number
  created_at: string
}

export interface CustomFieldValue {
  id: number
  field_id: number
  entity_type: string
  entity_id: number
  value: string
}

export interface CustomFieldValueWithDef extends CustomFieldValue {
  name: string
  field_type: CustomField['field_type']
  options_json: string
}

export interface Tag {
  id: number
  name: string
  color: string
  created_at: string
}

export function registerCustomFieldHandlers(): void {
  // ── Custom field definitions ──────────────────────────────────────────
  ipcMain.handle(
    'customFields:list',
    async (_e, entity_type = 'contract'): Promise<IpcResponse<CustomField[]>> => {
      try {
        const rows = getDb()
          .prepare(
            `SELECT * FROM custom_fields
             WHERE entity_type = ?
             ORDER BY sort_order ASC, id ASC`
          )
          .all(entity_type) as CustomField[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'customFields:create',
    async (
      _e,
      payload: Omit<CustomField, 'id' | 'created_at'>
    ): Promise<IpcResponse<CustomField>> => {
      try {
        const db = getDb()
        const result = db
          .prepare(
            `INSERT INTO custom_fields (entity_type, name, field_type, options_json, sort_order)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            payload.entity_type,
            payload.name,
            payload.field_type,
            payload.options_json ?? '[]',
            payload.sort_order ?? 0
          )
        const row = db
          .prepare('SELECT * FROM custom_fields WHERE id = ?')
          .get(result.lastInsertRowid) as CustomField
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'customFields:update',
    async (
      _e,
      payload: Partial<CustomField> & { id: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const fields = Object.keys(payload).filter((k) => k !== 'id' && k !== 'created_at')
        if (fields.length === 0) return { success: true }
        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (payload as any)[f])
        db.prepare(`UPDATE custom_fields SET ${sets} WHERE id = ?`).run(...values, payload.id)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('customFields:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM custom_fields WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Field values per entity ───────────────────────────────────────────
  ipcMain.handle(
    'customFields:values',
    async (
      _e,
      payload: { entity_type: string; entity_id: number }
    ): Promise<IpcResponse<CustomFieldValueWithDef[]>> => {
      try {
        const rows = getDb()
          .prepare(
            `SELECT cfv.*, cf.name, cf.field_type, cf.options_json
             FROM custom_field_values cfv
             JOIN custom_fields cf ON cf.id = cfv.field_id
             WHERE cfv.entity_type = ? AND cfv.entity_id = ?
             ORDER BY cf.sort_order ASC, cf.id ASC`
          )
          .all(payload.entity_type, payload.entity_id) as CustomFieldValueWithDef[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'customFields:setValue',
    async (
      _e,
      payload: {
        entity_type: string
        entity_id: number
        field_id: number
        value: string
      }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const before = db
          .prepare(
            `SELECT value FROM custom_field_values
             WHERE field_id = ? AND entity_type = ? AND entity_id = ?`
          )
          .get(payload.field_id, payload.entity_type, payload.entity_id) as
          | { value: string }
          | undefined
        if (payload.value === '') {
          db.prepare(
            `DELETE FROM custom_field_values
             WHERE field_id = ? AND entity_type = ? AND entity_id = ?`
          ).run(payload.field_id, payload.entity_type, payload.entity_id)
        } else {
          db.prepare(
            `INSERT INTO custom_field_values (field_id, entity_type, entity_id, value)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(field_id, entity_type, entity_id) DO UPDATE SET value = excluded.value`
          ).run(payload.field_id, payload.entity_type, payload.entity_id, payload.value)
        }
        if (payload.entity_type === 'contract') {
          const fieldName = (db
            .prepare('SELECT name FROM custom_fields WHERE id = ?')
            .get(payload.field_id) as { name: string } | undefined)?.name
          logChange(null, 'contract', payload.entity_id, 'update', {
            [`custom:${fieldName ?? payload.field_id}`]: {
              from: before?.value ?? null,
              to: payload.value === '' ? null : payload.value
            }
          })
        }
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ── Tags ──────────────────────────────────────────────────────────────
  ipcMain.handle('tags:list', async (): Promise<IpcResponse<Tag[]>> => {
    try {
      const rows = getDb().prepare('SELECT * FROM tags ORDER BY name ASC').all() as Tag[]
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'tags:create',
    async (
      _e,
      payload: { name: string; color?: string }
    ): Promise<IpcResponse<Tag>> => {
      try {
        const db = getDb()
        const result = db
          .prepare('INSERT INTO tags (name, color) VALUES (?, ?)')
          .run(payload.name, payload.color ?? '#6366f1')
        const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as Tag
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('tags:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'tags:forEntity',
    async (
      _e,
      payload: { entity_type: string; entity_id: number }
    ): Promise<IpcResponse<Tag[]>> => {
      try {
        const rows = getDb()
          .prepare(
            `SELECT t.* FROM tags t
             JOIN entity_tags et ON et.tag_id = t.id
             WHERE et.entity_type = ? AND et.entity_id = ?
             ORDER BY t.name ASC`
          )
          .all(payload.entity_type, payload.entity_id) as Tag[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'tags:attach',
    async (
      _e,
      payload: { entity_type: string; entity_id: number; tag_id: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        db.prepare(
          `INSERT OR IGNORE INTO entity_tags (tag_id, entity_type, entity_id)
           VALUES (?, ?, ?)`
        ).run(payload.tag_id, payload.entity_type, payload.entity_id)
        if (payload.entity_type === 'contract') {
          const tagName = (db
            .prepare('SELECT name FROM tags WHERE id = ?')
            .get(payload.tag_id) as { name: string } | undefined)?.name
          logChange(null, 'contract', payload.entity_id, 'update', {
            tag_added: { id: payload.tag_id, name: tagName }
          })
        }
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'tags:detach',
    async (
      _e,
      payload: { entity_type: string; entity_id: number; tag_id: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const tagName = (db
          .prepare('SELECT name FROM tags WHERE id = ?')
          .get(payload.tag_id) as { name: string } | undefined)?.name
        db.prepare(
          `DELETE FROM entity_tags
           WHERE tag_id = ? AND entity_type = ? AND entity_id = ?`
        ).run(payload.tag_id, payload.entity_type, payload.entity_id)
        if (payload.entity_type === 'contract') {
          logChange(null, 'contract', payload.entity_id, 'update', {
            tag_removed: { id: payload.tag_id, name: tagName }
          })
        }
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
