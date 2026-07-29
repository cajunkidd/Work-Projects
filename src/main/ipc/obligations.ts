import { ipcMain } from 'electron'
import { getDb } from '../database'
import { recordAudit, recordFieldChanges } from '../audit'
import { dispatchWebhook } from '../webhooks'
import type {
  Actor,
  IpcResponse,
  Obligation,
  ObligationFilter,
  ObligationRecurrence
} from '../../shared/types'

/**
 * Obligation, milestone, and SLA tracking.
 *
 * Overdue is computed from the due date at read time rather than stored, so a
 * row never needs a background job to become correct.
 */

const EDITABLE_FIELDS = [
  'title',
  'description',
  'obligation_type',
  'responsible_party',
  'owner_user_id',
  'owner_name',
  'due_date',
  'recurrence',
  'status',
  'reminder_days',
  'critical'
]

const COMPUTED_SELECT = `
  CASE WHEN o.due_date IS NULL OR o.due_date = '' THEN NULL
    ELSE CAST(julianday(o.due_date) - julianday('now') AS INTEGER)
  END as days_until_due,
  CASE WHEN o.status IN ('open','in_progress')
    AND o.due_date IS NOT NULL AND o.due_date != ''
    AND date(o.due_date) < date('now')
  THEN 1 ELSE 0 END as is_overdue
`

/** Advances a due date by one recurrence interval. */
function nextDueDate(dueDate: string, recurrence: ObligationRecurrence): string | null {
  if (recurrence === 'none' || !dueDate) return null
  const months =
    recurrence === 'monthly'
      ? 1
      : recurrence === 'quarterly'
        ? 3
        : recurrence === 'semiannual'
          ? 6
          : 12

  const row = getDb()
    .prepare(`SELECT date(?, '+' || ? || ' months') as next`)
    .get(dueDate, months) as { next: string | null }
  return row.next
}

export function registerObligationHandlers(): void {
  ipcMain.handle(
    'obligations:list',
    async (_e, filter?: ObligationFilter): Promise<IpcResponse<Obligation[]>> => {
      try {
        let query = `
          SELECT o.*, c.vendor_name, ${COMPUTED_SELECT}
          FROM obligations o
          JOIN contracts c ON o.contract_id = c.id
          WHERE 1=1
        `
        const params: (string | number)[] = []

        if (filter?.contract_id) {
          query += ' AND o.contract_id = ?'
          params.push(filter.contract_id)
        }
        if (filter?.status) {
          query += ' AND o.status = ?'
          params.push(filter.status)
        }
        if (filter?.obligation_type) {
          query += ' AND o.obligation_type = ?'
          params.push(filter.obligation_type)
        }
        if (filter?.owner_user_id) {
          query += ' AND o.owner_user_id = ?'
          params.push(filter.owner_user_id)
        }
        if (filter?.overdue_only) {
          query += ` AND o.status IN ('open','in_progress') AND o.due_date IS NOT NULL
                     AND o.due_date != '' AND date(o.due_date) < date('now')`
        }
        if (filter?.due_within_days !== undefined) {
          query += ` AND o.due_date IS NOT NULL AND o.due_date != ''
                     AND date(o.due_date) BETWEEN date('now') AND date('now', '+' || ? || ' days')`
          params.push(filter.due_within_days)
        }
        if (filter?.search) {
          query += ' AND (o.title LIKE ? OR o.description LIKE ? OR c.vendor_name LIKE ?)'
          const term = `%${filter.search}%`
          params.push(term, term, term)
        }

        // Undated obligations sort last; everything else by soonest due.
        query += ` ORDER BY
          CASE WHEN o.due_date IS NULL OR o.due_date = '' THEN 1 ELSE 0 END,
          o.due_date ASC, o.critical DESC`

        const rows = getDb().prepare(query).all(...params) as Obligation[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'obligations:create',
    async (
      _e,
      payload: Partial<Obligation> & { contract_id: number; actor?: Actor }
    ): Promise<IpcResponse<Obligation>> => {
      try {
        const db = getDb()
        if (!payload.title?.trim()) {
          return { success: false, error: 'An obligation needs a title.' }
        }

        const result = db
          .prepare(
            `INSERT INTO obligations
              (contract_id, title, description, obligation_type, responsible_party,
               owner_user_id, owner_name, due_date, recurrence, status, reminder_days,
               critical, source, source_document_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            payload.title.trim(),
            payload.description ?? '',
            payload.obligation_type ?? 'deliverable',
            payload.responsible_party ?? 'vendor',
            payload.owner_user_id ?? null,
            payload.owner_name ?? '',
            payload.due_date || null,
            payload.recurrence ?? 'none',
            payload.status ?? 'open',
            payload.reminder_days ?? 7,
            payload.critical ? 1 : 0,
            payload.source ?? 'manual',
            payload.source_document_id ?? null
          )

        const row = db
          .prepare(
            `SELECT o.*, c.vendor_name, ${COMPUTED_SELECT}
             FROM obligations o JOIN contracts c ON o.contract_id = c.id WHERE o.id = ?`
          )
          .get(result.lastInsertRowid) as Obligation

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: payload.contract_id,
          entity_label: row.vendor_name ?? `Contract #${payload.contract_id}`,
          action: 'create',
          field_name: 'obligation',
          new_value: row.title,
          summary: `Obligation "${row.title}" added${row.due_date ? `, due ${row.due_date}` : ''}`,
          actor: payload.actor
        })

        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'obligations:update',
    async (
      _e,
      payload: Partial<Obligation> & { id: number; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const before = db.prepare('SELECT * FROM obligations WHERE id = ?').get(payload.id) as
          | Obligation
          | undefined
        if (!before) return { success: false, error: 'Obligation not found' }

        const { id, actor, ...rest } = payload
        const fields = Object.keys(rest).filter((k) => EDITABLE_FIELDS.includes(k))
        if (fields.length === 0) return { success: true }

        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (rest as any)[f])
        db.prepare(
          `UPDATE obligations SET ${sets}, updated_at = datetime('now') WHERE id = ?`
        ).run(...values, id)

        recordFieldChanges(db, {
          entity_type: 'contract',
          entity_id: before.contract_id,
          entity_label: before.title,
          before: before as unknown as Record<string, unknown>,
          after: rest as Record<string, unknown>,
          fields,
          actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /**
   * Marks an obligation done. A recurring obligation immediately spawns the
   * next occurrence so the schedule keeps rolling forward.
   */
  ipcMain.handle(
    'obligations:complete',
    async (
      _e,
      payload: { id: number; actor?: Actor }
    ): Promise<IpcResponse<{ next_id: number | null; next_due: string | null }>> => {
      try {
        const db = getDb()
        const obligation = db
          .prepare('SELECT * FROM obligations WHERE id = ?')
          .get(payload.id) as Obligation | undefined
        if (!obligation) return { success: false, error: 'Obligation not found' }
        if (obligation.status === 'completed') {
          return { success: false, error: 'This obligation is already completed.' }
        }

        db.prepare(
          `UPDATE obligations SET status = 'completed', completed_at = datetime('now'),
             completed_by_name = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(payload.actor?.name ?? 'Unknown', payload.id)

        let nextId: number | null = null
        let nextDue: string | null = null

        if (obligation.recurrence !== 'none' && obligation.due_date) {
          nextDue = nextDueDate(obligation.due_date, obligation.recurrence)
          if (nextDue) {
            const inserted = db
              .prepare(
                `INSERT INTO obligations
                  (contract_id, title, description, obligation_type, responsible_party,
                   owner_user_id, owner_name, due_date, recurrence, status, reminder_days,
                   critical, source, source_document_id)
                 VALUES (?,?,?,?,?,?,?,?,?,'open',?,?,?,?)`
              )
              .run(
                obligation.contract_id,
                obligation.title,
                obligation.description,
                obligation.obligation_type,
                obligation.responsible_party,
                obligation.owner_user_id,
                obligation.owner_name,
                nextDue,
                obligation.recurrence,
                obligation.reminder_days,
                obligation.critical,
                obligation.source,
                obligation.source_document_id
              )
            nextId = inserted.lastInsertRowid as number
          }
        }

        const contract = db
          .prepare('SELECT vendor_name FROM contracts WHERE id = ?')
          .get(obligation.contract_id) as { vendor_name: string } | undefined

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: obligation.contract_id,
          entity_label: contract?.vendor_name ?? `Contract #${obligation.contract_id}`,
          action: 'update',
          field_name: 'obligation',
          old_value: obligation.status,
          new_value: 'completed',
          summary: `Obligation "${obligation.title}" completed${
            nextDue ? ` — next occurrence due ${nextDue}` : ''
          }`,
          actor: payload.actor
        })

        dispatchWebhook(db, 'obligation.completed', {
          obligation_id: obligation.id,
          contract_id: obligation.contract_id,
          vendor_name: contract?.vendor_name ?? '',
          title: obligation.title,
          completed_by: payload.actor?.name ?? 'Unknown',
          next_due_date: nextDue
        })

        return { success: true, data: { next_id: nextId, next_due: nextDue } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'obligations:delete',
    async (_e, payload: { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const obligation = db
          .prepare('SELECT contract_id, title FROM obligations WHERE id = ?')
          .get(payload.id) as { contract_id: number; title: string } | undefined
        if (!obligation) return { success: false, error: 'Obligation not found' }

        db.prepare('DELETE FROM obligations WHERE id = ?').run(payload.id)

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: obligation.contract_id,
          entity_label: obligation.title,
          action: 'delete',
          summary: `Obligation "${obligation.title}" deleted`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /** Headline counts for the obligations dashboard strip. */
  ipcMain.handle(
    'obligations:stats',
    async (): Promise<
      IpcResponse<{ open: number; overdue: number; due_soon: number; critical_open: number }>
    > => {
      try {
        const row = getDb()
          .prepare(
            `SELECT
               SUM(CASE WHEN status IN ('open','in_progress') THEN 1 ELSE 0 END) as open,
               SUM(CASE WHEN status IN ('open','in_progress') AND due_date IS NOT NULL
                 AND due_date != '' AND date(due_date) < date('now') THEN 1 ELSE 0 END) as overdue,
               SUM(CASE WHEN status IN ('open','in_progress') AND due_date IS NOT NULL
                 AND due_date != '' AND date(due_date)
                 BETWEEN date('now') AND date('now','+30 days') THEN 1 ELSE 0 END) as due_soon,
               SUM(CASE WHEN status IN ('open','in_progress') AND critical = 1 THEN 1 ELSE 0 END)
                 as critical_open
             FROM obligations`
          )
          .get() as any
        return {
          success: true,
          data: {
            open: row.open ?? 0,
            overdue: row.overdue ?? 0,
            due_soon: row.due_soon ?? 0,
            critical_open: row.critical_open ?? 0
          }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
