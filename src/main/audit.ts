import type Database from 'better-sqlite3'
import { compareRecords } from '../shared/diff'
import type { Actor, AuditAction, AuditEntityType } from '../shared/types'

/**
 * Append-only audit trail.
 *
 * Every mutation handler calls through here. Writes are best-effort: an audit
 * failure must never roll back or block the business operation it describes,
 * so all entry points swallow their own errors after logging to the console.
 */

interface AuditInput {
  entity_type: AuditEntityType
  entity_id?: number | null
  entity_label?: string
  action: AuditAction
  field_name?: string | null
  old_value?: string | null
  new_value?: string | null
  summary?: string
  actor?: Actor | null
}

/** Values longer than this are truncated before being stored. */
const MAX_VALUE_LENGTH = 2000

function truncate(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}… (truncated)` : value
}

export function recordAudit(db: Database.Database, entry: AuditInput): void {
  try {
    db.prepare(
      `INSERT INTO audit_log
        (entity_type, entity_id, entity_label, action, field_name, old_value, new_value,
         summary, user_id, user_name)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      entry.entity_type,
      entry.entity_id ?? null,
      entry.entity_label ?? '',
      entry.action,
      entry.field_name ?? null,
      truncate(entry.old_value),
      truncate(entry.new_value),
      entry.summary ?? '',
      entry.actor?.id ?? null,
      entry.actor?.name ?? 'System'
    )
  } catch (err) {
    console.error('[audit] failed to record entry:', err)
  }
}

/**
 * Records one audit row per changed field. Returns the fields that actually
 * changed so callers can skip notifying on a no-op update.
 */
export function recordFieldChanges(
  db: Database.Database,
  options: {
    entity_type: AuditEntityType
    entity_id: number
    entity_label: string
    before: Record<string, unknown>
    after: Record<string, unknown>
    fields?: string[]
    actor?: Actor | null
  }
): string[] {
  const changes = compareRecords(options.before, options.after, options.fields)
  if (changes.length === 0) return []

  for (const change of changes) {
    recordAudit(db, {
      entity_type: options.entity_type,
      entity_id: options.entity_id,
      entity_label: options.entity_label,
      action: 'update',
      field_name: change.field,
      old_value: change.old_value,
      new_value: change.new_value,
      summary: `${change.label} changed from "${change.old_value || '(empty)'}" to "${change.new_value || '(empty)'}"`,
      actor: options.actor
    })
  }

  return changes.map((c) => c.field)
}

/** Stamps updated_at/updated_by on a contract. Call alongside any contract mutation. */
export function touchContract(
  db: Database.Database,
  contract_id: number,
  actor?: Actor | null
): void {
  try {
    db.prepare(
      `UPDATE contracts SET updated_at = datetime('now'), updated_by = ? WHERE id = ?`
    ).run(actor?.name ?? 'System', contract_id)
  } catch (err) {
    console.error('[audit] failed to stamp contract:', err)
  }
}
