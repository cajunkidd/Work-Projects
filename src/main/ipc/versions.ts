import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../database'
import { recordAudit, touchContract } from '../audit'
import { diffText, diffStats, compareRecords } from '../../shared/diff'
import type {
  Actor,
  Contract,
  ContractVersion,
  DiffLine,
  DiffStats,
  FieldChange,
  IpcResponse,
  VersionFieldSnapshot,
  VersionSource
} from '../../shared/types'

/**
 * Document version history and redlining.
 *
 * Each version stores the document text plus a snapshot of the contract's
 * structured fields at capture time, so a comparison can show both the
 * negotiated wording and the commercial terms that moved with it.
 */

/** Contract fields captured alongside every version. */
const SNAPSHOT_FIELDS: (keyof VersionFieldSnapshot)[] = [
  'vendor_name',
  'start_date',
  'end_date',
  'monthly_cost',
  'annual_cost',
  'total_cost',
  'poc_name',
  'poc_email',
  'poc_phone',
  'renewal_type',
  'cancellation_notice_days'
]

function snapshotOf(contract: Contract): VersionFieldSnapshot {
  const snapshot: Record<string, unknown> = {}
  for (const field of SNAPSHOT_FIELDS) snapshot[field] = contract[field as keyof Contract]
  return snapshot as VersionFieldSnapshot
}

function parseSnapshot(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json || '{}')
  } catch {
    return {}
  }
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') {
    const pdfParse = await import('pdf-parse')
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse.default(buffer)
    return data.text
  }
  return fs.readFileSync(filePath, 'utf-8')
}

export function registerVersionHandlers(): void {
  ipcMain.handle(
    'versions:list',
    async (_e, contract_id: number): Promise<IpcResponse<ContractVersion[]>> => {
      try {
        const rows = getDb()
          .prepare(
            `SELECT * FROM contract_versions WHERE contract_id = ? ORDER BY version_no DESC`
          )
          .all(contract_id) as ContractVersion[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('versions:get', async (_e, id: number): Promise<IpcResponse<ContractVersion>> => {
    try {
      const row = getDb()
        .prepare('SELECT * FROM contract_versions WHERE id = ?')
        .get(id) as ContractVersion | undefined
      if (!row) return { success: false, error: 'Version not found' }
      return { success: true, data: row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'versions:create',
    async (
      _e,
      payload: {
        contract_id: number
        title?: string
        body: string
        change_summary?: string
        source?: VersionSource
        file_path?: string | null
        actor?: Actor
      }
    ): Promise<IpcResponse<ContractVersion>> => {
      try {
        const db = getDb()
        const contract = db
          .prepare('SELECT * FROM contracts WHERE id = ?')
          .get(payload.contract_id) as Contract | undefined
        if (!contract) return { success: false, error: 'Contract not found' }

        const next = db
          .prepare(
            'SELECT COALESCE(MAX(version_no), 0) + 1 as n FROM contract_versions WHERE contract_id = ?'
          )
          .get(payload.contract_id) as { n: number }

        const result = db
          .prepare(
            `INSERT INTO contract_versions
              (contract_id, version_no, title, body, source, file_path, fields_snapshot,
               change_summary, created_by_user_id, created_by_name)
             VALUES (?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id,
            next.n,
            payload.title || `Version ${next.n}`,
            payload.body ?? '',
            payload.source ?? 'manual',
            payload.file_path ?? null,
            JSON.stringify(snapshotOf(contract)),
            payload.change_summary ?? '',
            payload.actor?.id ?? null,
            payload.actor?.name ?? 'Unknown'
          )

        const row = db
          .prepare('SELECT * FROM contract_versions WHERE id = ?')
          .get(result.lastInsertRowid) as ContractVersion

        touchContract(db, payload.contract_id, payload.actor)
        recordAudit(db, {
          entity_type: 'version',
          entity_id: row.id,
          entity_label: `${contract.vendor_name} — v${row.version_no}`,
          action: 'create',
          summary: `Version ${row.version_no} captured${
            payload.change_summary ? `: ${payload.change_summary}` : ''
          }`,
          actor: payload.actor
        })
        // Also surface it on the contract's own history.
        recordAudit(db, {
          entity_type: 'contract',
          entity_id: contract.id,
          entity_label: contract.vendor_name,
          action: 'create',
          field_name: 'version',
          new_value: `v${row.version_no}`,
          summary: `Document version ${row.version_no} captured${
            payload.change_summary ? `: ${payload.change_summary}` : ''
          }`,
          actor: payload.actor
        })

        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Import a document from disk as a new version.
  ipcMain.handle(
    'versions:importFile',
    async (): Promise<IpcResponse<{ path: string; text: string }>> => {
      try {
        const result = await dialog.showOpenDialog({
          filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'md'] }],
          properties: ['openFile']
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'Cancelled' }
        }
        const filePath = result.filePaths[0]
        const text = await extractText(filePath)
        return { success: true, data: { path: filePath, text } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /**
   * Redline between two versions. Pass from_id 0 to diff against an empty
   * document (i.e. show the first version as entirely new).
   */
  ipcMain.handle(
    'versions:diff',
    async (
      _e,
      opts: { from_id: number; to_id: number }
    ): Promise<
      IpcResponse<{
        lines: DiffLine[]
        stats: DiffStats
        field_changes: FieldChange[]
        from: ContractVersion | null
        to: ContractVersion
      }>
    > => {
      try {
        const db = getDb()
        const to = db
          .prepare('SELECT * FROM contract_versions WHERE id = ?')
          .get(opts.to_id) as ContractVersion | undefined
        if (!to) return { success: false, error: 'Target version not found' }

        const from = opts.from_id
          ? (db
              .prepare('SELECT * FROM contract_versions WHERE id = ?')
              .get(opts.from_id) as ContractVersion | undefined) ?? null
          : null

        const lines = diffText(from?.body ?? '', to.body)
        const fieldChanges = compareRecords(
          parseSnapshot(from?.fields_snapshot ?? '{}'),
          parseSnapshot(to.fields_snapshot),
          SNAPSHOT_FIELDS as string[]
        )

        return {
          success: true,
          data: {
            lines,
            stats: diffStats(lines),
            field_changes: fieldChanges,
            from,
            to
          }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /**
   * Restores a version's structured fields onto the live contract. The document
   * body is not overwritten — restoring captures a fresh version instead, so
   * history stays append-only.
   */
  ipcMain.handle(
    'versions:restore',
    async (
      _e,
      payload: { version_id: number; actor?: Actor }
    ): Promise<IpcResponse<{ restored_fields: string[] }>> => {
      try {
        const db = getDb()
        const version = db
          .prepare('SELECT * FROM contract_versions WHERE id = ?')
          .get(payload.version_id) as ContractVersion | undefined
        if (!version) return { success: false, error: 'Version not found' }

        const contract = db
          .prepare('SELECT * FROM contracts WHERE id = ?')
          .get(version.contract_id) as Contract | undefined
        if (!contract) return { success: false, error: 'Contract not found' }

        const snapshot = parseSnapshot(version.fields_snapshot)
        const changes = compareRecords(
          contract as unknown as Record<string, unknown>,
          snapshot,
          SNAPSHOT_FIELDS as string[]
        )

        if (changes.length === 0) {
          return { success: true, data: { restored_fields: [] } }
        }

        const sets = changes.map((c) => `${c.field} = ?`).join(', ')
        const values = changes.map((c) => snapshot[c.field])
        db.prepare(
          `UPDATE contracts SET ${sets}, updated_at = datetime('now'), updated_by = ? WHERE id = ?`
        ).run(...values, payload.actor?.name ?? 'System', contract.id)

        for (const change of changes) {
          recordAudit(db, {
            entity_type: 'contract',
            entity_id: contract.id,
            entity_label: contract.vendor_name,
            action: 'restore',
            field_name: change.field,
            old_value: change.old_value,
            new_value: change.new_value,
            summary: `${change.label} restored from version ${version.version_no}: "${
              change.old_value || '(empty)'
            }" → "${change.new_value || '(empty)'}"`,
            actor: payload.actor
          })
        }

        return { success: true, data: { restored_fields: changes.map((c) => c.field) } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'versions:delete',
    async (_e, payload: { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const version = db
          .prepare('SELECT * FROM contract_versions WHERE id = ?')
          .get(payload.id) as ContractVersion | undefined
        if (!version) return { success: false, error: 'Version not found' }

        db.prepare('DELETE FROM contract_versions WHERE id = ?').run(payload.id)

        recordAudit(db, {
          entity_type: 'version',
          entity_id: payload.id,
          entity_label: version.title,
          action: 'delete',
          summary: `Version ${version.version_no} deleted`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
