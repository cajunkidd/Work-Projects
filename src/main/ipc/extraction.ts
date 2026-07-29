import { ipcMain } from 'electron'
import { getDb } from '../database'
import { recordAudit } from '../audit'
import {
  extractContractTerms,
  testConnection,
  getApiKey,
  getModel,
  getEffort,
  DEFAULT_MODEL,
  DEFAULT_EFFORT
} from '../ai/anthropic'
import { requireRole, denied, requireContractAccess, requireRowContractAccess } from '../authz'
import type {
  Actor,
  AiSettings,
  ContractDocument,
  ExtractionResult,
  ExtractionRun,
  IpcResponse
} from '../../shared/types'

/**
 * AI extraction of contract terms.
 *
 * Extraction never writes to a contract on its own — it returns a result the
 * user reviews and explicitly applies. Every run is recorded with its token
 * usage so the cost of the feature is visible.
 */

export function registerExtractionHandlers(): void {
  ipcMain.handle('ai:settings', async (): Promise<IpcResponse<AiSettings>> => {
    try {
      const db = getDb()
      return {
        success: true,
        data: {
          configured: getApiKey(db) !== null,
          model: getModel(db),
          effort: getEffort(db)
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('ai:test', async (_e, opts?: { actor?: Actor }): Promise<IpcResponse<string>> => {
    const gate = requireRole(getDb(), opts?.actor, 'super_admin')
    if (denied(gate)) return gate
    try {
      const outcome = await testConnection(getDb())
      return outcome.ok
        ? { success: true, data: outcome.message }
        : { success: false, error: outcome.message }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('ai:defaults', async (): Promise<IpcResponse<{ model: string; effort: string }>> => {
    return { success: true, data: { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT } }
  })

  /** Runs extraction against a stored document. */
  ipcMain.handle(
    'extraction:run',
    async (
      _e,
      payload: { document_id: number; actor?: Actor }
    ): Promise<IpcResponse<{ run_id: number; result: ExtractionResult }>> => {
      const db = getDb()
      let runId: number | null = null

      try {
        // Extraction reads the whole document and bills the Anthropic account,
        // so it needs access to the contract the document belongs to.
        const gate = requireRowContractAccess(db, 'documents', payload.document_id, payload.actor)
        if (gate) return { success: false, error: 'Document not found' }

        const document = db
          .prepare('SELECT * FROM documents WHERE id = ?')
          .get(payload.document_id) as ContractDocument | undefined
        if (!document) return { success: false, error: 'Document not found' }

        const model = getModel(db)
        const effort = getEffort(db)

        const started = db
          .prepare(
            `INSERT INTO extraction_runs
              (document_id, contract_id, status, model, effort, created_by_name)
             VALUES (?,?,'running',?,?,?)`
          )
          .run(
            document.id,
            document.contract_id,
            model,
            effort,
            payload.actor?.name ?? 'Unknown'
          )
        runId = started.lastInsertRowid as number

        // Prefer the text layer; fall back to sending the PDF pages so scanned
        // documents still work.
        const hasText =
          document.extraction_status === 'extracted' && document.extracted_text.trim().length > 0

        const outcome = await extractContractTerms(db, {
          title: document.title,
          text: hasText ? document.extracted_text : undefined,
          pdfPath: hasText ? undefined : document.stored_path
        })

        if (!outcome.ok || !outcome.result) {
          db.prepare(
            `UPDATE extraction_runs SET status = ?, error = ?, input_tokens = ?,
               output_tokens = ?, completed_at = datetime('now') WHERE id = ?`
          ).run(
            outcome.refusal ? 'refused' : 'failed',
            outcome.error ?? 'Unknown error',
            outcome.input_tokens,
            outcome.output_tokens,
            runId
          )
          return { success: false, error: outcome.error ?? 'Extraction failed' }
        }

        db.prepare(
          `UPDATE extraction_runs SET status = 'completed', result_json = ?,
             input_tokens = ?, output_tokens = ?, completed_at = datetime('now') WHERE id = ?`
        ).run(
          JSON.stringify(outcome.result),
          outcome.input_tokens,
          outcome.output_tokens,
          runId
        )

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: document.contract_id,
          entity_label: document.title,
          action: 'create',
          field_name: 'ai_extraction',
          summary: `AI extraction run on "${document.title}" using ${model} (${outcome.input_tokens} in / ${outcome.output_tokens} out tokens)`,
          actor: payload.actor
        })

        return { success: true, data: { run_id: runId, result: outcome.result } }
      } catch (err: any) {
        if (runId) {
          db.prepare(
            `UPDATE extraction_runs SET status = 'failed', error = ?,
               completed_at = datetime('now') WHERE id = ?`
          ).run(err.message, runId)
        }
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'extraction:history',
    async (
      _e,
      opts?: { document_id?: number; contract_id?: number }
    ): Promise<IpcResponse<ExtractionRun[]>> => {
      try {
        let query = 'SELECT * FROM extraction_runs WHERE 1=1'
        const params: number[] = []
        if (opts?.document_id) {
          query += ' AND document_id = ?'
          params.push(opts.document_id)
        }
        if (opts?.contract_id) {
          query += ' AND contract_id = ?'
          params.push(opts.contract_id)
        }
        query += ' ORDER BY created_at DESC LIMIT 50'

        const rows = getDb().prepare(query).all(...params) as ExtractionRun[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /**
   * Writes reviewed extraction values onto a contract, and optionally creates
   * the extracted obligations. Only the fields the user ticked are applied.
   */
  ipcMain.handle(
    'extraction:apply',
    async (
      _e,
      payload: {
        contract_id: number
        run_id?: number
        fields: Record<string, string | number>
        obligations?: {
          title: string
          description: string
          obligation_type: string
          responsible_party: string
          due_date: string | null
          recurrence: string
          critical: boolean
        }[]
        source_document_id?: number | null
        actor?: Actor
      }
    ): Promise<IpcResponse<{ fields_applied: number; obligations_created: number }>> => {
      try {
        const db = getDb()
        // Applying extracted terms rewrites the contract.
        const gate = requireContractAccess(db, payload.contract_id, payload.actor)
        if (gate) return gate
        const contract = db
          .prepare('SELECT * FROM contracts WHERE id = ?')
          .get(payload.contract_id) as Record<string, unknown> | undefined
        if (!contract) return { success: false, error: 'Contract not found' }

        const ALLOWED = [
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

        const entries = Object.entries(payload.fields ?? {}).filter(
          ([key, value]) => ALLOWED.includes(key) && value !== null && value !== ''
        )

        let fieldsApplied = 0
        let obligationsCreated = 0

        db.transaction(() => {
          if (entries.length > 0) {
            const sets = entries.map(([key]) => `${key} = ?`).join(', ')
            const values = entries.map(([, value]) => value)
            db.prepare(
              `UPDATE contracts SET ${sets}, updated_at = datetime('now'), updated_by = ?
               WHERE id = ?`
            ).run(...values, payload.actor?.name ?? 'System', payload.contract_id)
            fieldsApplied = entries.length

            for (const [field, value] of entries) {
              recordAudit(db, {
                entity_type: 'contract',
                entity_id: payload.contract_id,
                entity_label: String(contract.vendor_name ?? ''),
                action: 'update',
                field_name: field,
                old_value: String(contract[field] ?? ''),
                new_value: String(value),
                summary: `${field} set from AI extraction`,
                actor: payload.actor
              })
            }
          }

          for (const obligation of payload.obligations ?? []) {
            db.prepare(
              `INSERT INTO obligations
                (contract_id, title, description, obligation_type, responsible_party,
                 due_date, recurrence, critical, source, source_document_id)
               VALUES (?,?,?,?,?,?,?,?,'ai_extracted',?)`
            ).run(
              payload.contract_id,
              obligation.title,
              obligation.description,
              obligation.obligation_type,
              obligation.responsible_party,
              obligation.due_date || null,
              obligation.recurrence,
              obligation.critical ? 1 : 0,
              payload.source_document_id ?? null
            )
            obligationsCreated++
          }
        })()

        if (obligationsCreated > 0) {
          recordAudit(db, {
            entity_type: 'contract',
            entity_id: payload.contract_id,
            entity_label: String(contract.vendor_name ?? ''),
            action: 'create',
            field_name: 'obligation',
            summary: `${obligationsCreated} obligation(s) created from AI extraction`,
            actor: payload.actor
          })
        }

        return {
          success: true,
          data: { fields_applied: fieldsApplied, obligations_created: obligationsCreated }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
