import { getDb } from './database'
import { ipcMain } from 'electron'
import type { IpcResponse } from '../shared/types'

// Module-level "who is performing the action" set by the renderer on login.
// IPC handlers that don't know/receive an explicit actor fall back to this.
let currentActor: AuditActor | null = null

export function getCurrentActor(): AuditActor | null {
  return currentActor
}

export function setCurrentActor(actor: AuditActor | null): void {
  currentActor = actor
}

export type AuditEntityType =
  | 'contract'
  | 'contract_line_item'
  | 'renewal'
  | 'obligation'
  | 'note'
  | 'project'
  | 'competitor'
  | 'invoice'
  | 'budget'
  | 'user'
  | 'allocation'
  | 'approval_request'

export type AuditAction = 'create' | 'update' | 'delete'

export interface AuditActor {
  user_id?: number | null
  user_name?: string | null
}

export interface AuditLogEntry {
  id: number
  user_id: number | null
  user_name: string
  entity_type: AuditEntityType
  entity_id: number
  action: AuditAction
  diff_json: string
  timestamp: string
}

/**
 * Record a user-attributable mutation. `diff` for 'update' should be
 * { field: { from, to } } — computed with computeDiff() below. For
 * 'create' / 'delete' it's usually a snapshot of the new/old row.
 */
export function logChange(
  actor: AuditActor | null,
  entity_type: AuditEntityType,
  entity_id: number,
  action: AuditAction,
  diff: Record<string, unknown>
): void {
  try {
    const db = getDb()
    const effectiveActor = actor ?? currentActor
    db.prepare(
      `INSERT INTO audit_log (user_id, user_name, entity_type, entity_id, action, diff_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      effectiveActor?.user_id ?? null,
      effectiveActor?.user_name ?? 'system',
      entity_type,
      entity_id,
      action,
      JSON.stringify(diff)
    )
  } catch (err) {
    // Never let audit logging break the real operation.
    console.error('[audit] logChange failed:', err)
  }
}

/**
 * Compute a shallow { field: { from, to } } diff between two objects,
 * skipping fields that match or are not in the `updated` keys. Useful
 * for `action = 'update'` entries.
 */
export function computeDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  if (!before) return diff
  for (const key of Object.keys(after)) {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') continue
    const a = (before as any)[key]
    const b = (after as any)[key]
    if (a !== b) diff[key] = { from: a, to: b }
  }
  return diff
}

export function registerAuditHandlers(): void {
  // Called from the renderer on login / logout so audit entries created
  // by subsequent IPC mutations can attribute themselves.
  ipcMain.handle(
    'audit:setActor',
    async (_e, actor: AuditActor | null): Promise<IpcResponse<void>> => {
      setCurrentActor(actor)
      return { success: true }
    }
  )

  // Timeline for a single entity (e.g. "Contract history" tab)
  ipcMain.handle(
    'audit:entity',
    async (
      _e,
      payload: { entity_type: AuditEntityType; entity_id: number; limit?: number }
    ): Promise<IpcResponse<AuditLogEntry[]>> => {
      try {
        const rows = getDb()
          .prepare(
            `SELECT * FROM audit_log
             WHERE entity_type = ? AND entity_id = ?
             ORDER BY id DESC
             LIMIT ?`
          )
          .all(payload.entity_type, payload.entity_id, payload.limit ?? 200) as AuditLogEntry[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Recent activity across the whole app (settings-page style view)
  ipcMain.handle(
    'audit:recent',
    async (_e, limit?: number): Promise<IpcResponse<AuditLogEntry[]>> => {
      try {
        const rows = getDb()
          .prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`)
          .all(limit ?? 200) as AuditLogEntry[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
