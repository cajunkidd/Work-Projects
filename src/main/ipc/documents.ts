import { ipcMain, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDb, getDbDirectory } from '../database'
import { recordAudit } from '../audit'
import { resolveActor, contractScopeClause, requireContractAccess } from '../authz'
import type {
  Actor,
  ContractDocument,
  DocumentSearchHit,
  DocumentType,
  IpcResponse
} from '../../shared/types'

/**
 * Document vault with full-text search.
 *
 * Uploaded files are copied into managed storage beside the database and
 * addressed by content hash, so a document can't be broken by someone moving
 * or renaming the original. The extracted text is indexed in FTS5, which is
 * what makes search cover document *contents* rather than just filenames.
 */

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.log'])

function storageRoot(): string {
  const root = path.join(getDbDirectory(), 'documents')
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true })
  return root
}

function hashFile(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function mimeFor(ext: string): string {
  switch (ext) {
    case '.pdf':
      return 'application/pdf'
    case '.txt':
      return 'text/plain'
    case '.md':
      return 'text/markdown'
    case '.csv':
      return 'text/csv'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.doc':
      return 'application/msword'
    default:
      return 'application/octet-stream'
  }
}

interface Extraction {
  text: string
  pages: number | null
  status: 'extracted' | 'no_text_layer' | 'failed'
  note: string
}

/**
 * Pulls text out of a document. A PDF whose text layer is empty is reported as
 * 'no_text_layer' rather than 'failed' — that's the scanned-document case, and
 * AI extraction can still read it by sending the pages as images.
 */
async function extractText(filePath: string, buffer: Buffer): Promise<Extraction> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    try {
      const pdfParse = await import('pdf-parse')
      const data = await pdfParse.default(buffer)
      const text = (data.text ?? '').trim()
      if (text.length === 0) {
        return {
          text: '',
          pages: data.numpages ?? null,
          status: 'no_text_layer',
          note: 'This PDF has no text layer — it is most likely a scan. Run AI extraction to read it.'
        }
      }
      return { text, pages: data.numpages ?? null, status: 'extracted', note: '' }
    } catch (err: any) {
      return { text: '', pages: null, status: 'failed', note: err.message }
    }
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    try {
      return { text: buffer.toString('utf-8'), pages: null, status: 'extracted', note: '' }
    } catch (err: any) {
      return { text: '', pages: null, status: 'failed', note: err.message }
    }
  }

  return {
    text: '',
    pages: null,
    status: 'no_text_layer',
    note: `${ext || 'This file type'} cannot be indexed for text search. The file is stored and downloadable.`
  }
}

/**
 * Turns a user's search box input into a safe FTS5 query. Bare user input can
 * contain characters FTS5 treats as syntax, so each token is quoted; a trailing
 * token also gets a prefix match so search feels responsive as you type.
 */
export function toFtsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length > 0)

  if (tokens.length === 0) return ''

  return tokens
    .map((token, index) =>
      index === tokens.length - 1 ? `"${token}"*` : `"${token}"`
    )
    .join(' AND ')
}

export function registerDocumentHandlers(): void {
  // ─── Upload ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'documents:upload',
    async (
      _e,
      payload: {
        contract_id?: number | null
        vendor_id?: number | null
        doc_type?: DocumentType
        actor?: Actor
      }
    ): Promise<IpcResponse<ContractDocument>> => {
      try {
        const result = await dialog.showOpenDialog({
          filters: [
            { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'csv', 'doc', 'docx'] }
          ],
          properties: ['openFile']
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'Cancelled' }
        }

        const sourcePath = result.filePaths[0]
        const buffer = fs.readFileSync(sourcePath)
        const hash = hashFile(buffer)
        const ext = path.extname(sourcePath).toLowerCase()
        const db = getDb()

        // Content-addressed storage: the same file uploaded twice is stored once.
        const storedPath = path.join(storageRoot(), `${hash}${ext}`)
        if (!fs.existsSync(storedPath)) fs.writeFileSync(storedPath, buffer)

        const extraction = await extractText(sourcePath, buffer)

        const insert = db
          .prepare(
            `INSERT INTO documents
              (contract_id, vendor_id, title, doc_type, original_path, stored_path,
               file_hash, file_size, mime_type, page_count, extracted_text,
               extraction_status, extraction_note, uploaded_by_user_id, uploaded_by_name)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            payload.contract_id ?? null,
            payload.vendor_id ?? null,
            path.basename(sourcePath),
            payload.doc_type ?? 'contract',
            sourcePath,
            storedPath,
            hash,
            buffer.length,
            mimeFor(ext),
            extraction.pages,
            extraction.text,
            extraction.status,
            extraction.note,
            payload.actor?.id ?? null,
            payload.actor?.name ?? 'Unknown'
          )

        const row = db
          .prepare('SELECT * FROM documents WHERE id = ?')
          .get(insert.lastInsertRowid) as ContractDocument

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: payload.contract_id ?? null,
          entity_label: row.title,
          action: 'create',
          field_name: 'document',
          new_value: row.title,
          summary: `Document "${row.title}" uploaded (${extraction.status.replace('_', ' ')})`,
          actor: payload.actor
        })

        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── Listing and retrieval ───────────────────────────────────────────────

  ipcMain.handle(
    'documents:list',
    async (
      _e,
      opts?: { contract_id?: number; vendor_id?: number; actor?: Actor }
    ): Promise<IpcResponse<ContractDocument[]>> => {
      try {
        let query = `
          SELECT d.*, v.name as vendor_name
          FROM documents d
          LEFT JOIN vendors v ON d.vendor_id = v.id
          LEFT JOIN contracts c ON d.contract_id = c.id
          WHERE 1=1
        `
        const params: number[] = []

        // Same rule as search: a document is visible if its contract is.
        const scope = contractScopeClause(resolveActor(getDb(), opts?.actor), 'c')
        query += scope.sql
        params.push(...scope.params)

        if (opts?.contract_id) {
          query += ' AND d.contract_id = ?'
          params.push(opts.contract_id)
        }
        if (opts?.vendor_id) {
          query += ' AND d.vendor_id = ?'
          params.push(opts.vendor_id)
        }
        query += ' ORDER BY d.created_at DESC'

        const rows = getDb().prepare(query).all(...params) as ContractDocument[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'documents:get',
    async (_e, arg: number | { id: number; actor?: Actor }): Promise<IpcResponse<ContractDocument>> => {
      try {
        const id = typeof arg === 'number' ? arg : arg.id
        const row = getDb()
          .prepare(
            `SELECT d.*, v.name as vendor_name FROM documents d
             LEFT JOIN vendors v ON d.vendor_id = v.id WHERE d.id = ?`
          )
          .get(id) as ContractDocument | undefined
        if (!row) return { success: false, error: 'Document not found' }
        const gate = requireContractAccess(getDb(), row.contract_id, typeof arg === 'number' ? undefined : arg.actor)
        if (gate) return { success: false, error: 'Document not found' }
        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── Full-text search across document contents ───────────────────────────

  ipcMain.handle(
    'documents:search',
    async (
      _e,
      opts: {
        query: string
        contract_id?: number
        doc_type?: DocumentType
        limit?: number
        actor?: Actor
      }
    ): Promise<IpcResponse<DocumentSearchHit[]>> => {
      try {
        const match = toFtsQuery(opts.query ?? '')
        if (!match) return { success: true, data: [] }

        let query = `
          SELECT
            d.id, d.contract_id, d.vendor_id, v.name as vendor_name,
            d.title, d.doc_type, d.file_size, d.page_count, d.created_at,
            snippet(documents_fts, 1, '[[', ']]', ' … ', 24) as snippet,
            bm25(documents_fts) as score
          FROM documents_fts
          JOIN documents d ON d.id = documents_fts.rowid
          LEFT JOIN vendors v ON d.vendor_id = v.id
          LEFT JOIN contracts c ON d.contract_id = c.id
          WHERE documents_fts MATCH ?
        `
        const params: (string | number)[] = [match]

        // Search follows contract scope: you can find text inside a document
        // only if you could open the contract it belongs to. Documents with no
        // contract (vendor-level files) are super-admin only, since there is no
        // department or branch to judge them by.
        const scope = contractScopeClause(resolveActor(getDb(), opts.actor), 'c')
        query += scope.sql
        params.push(...scope.params)

        if (opts.contract_id) {
          query += ' AND d.contract_id = ?'
          params.push(opts.contract_id)
        }
        if (opts.doc_type) {
          query += ' AND d.doc_type = ?'
          params.push(opts.doc_type)
        }

        // bm25() returns lower-is-better, so ascending order puts the best first.
        query += ' ORDER BY score ASC LIMIT ?'
        params.push(opts.limit ?? 50)

        const rows = getDb().prepare(query).all(...params) as DocumentSearchHit[]
        return { success: true, data: rows }
      } catch (err: any) {
        // A malformed FTS expression surfaces here rather than crashing the page.
        return { success: false, error: err.message }
      }
    }
  )

  /** Counts of what is and isn't searchable, for the search page's header. */
  ipcMain.handle(
    'documents:indexStats',
    async (): Promise<
      IpcResponse<{ total: number; indexed: number; no_text_layer: number; failed: number }>
    > => {
      try {
        const row = getDb()
          .prepare(
            `SELECT
               COUNT(*) as total,
               SUM(CASE WHEN extraction_status = 'extracted' THEN 1 ELSE 0 END) as indexed,
               SUM(CASE WHEN extraction_status = 'no_text_layer' THEN 1 ELSE 0 END) as no_text_layer,
               SUM(CASE WHEN extraction_status = 'failed' THEN 1 ELSE 0 END) as failed
             FROM documents`
          )
          .get() as any
        return {
          success: true,
          data: {
            total: row.total ?? 0,
            indexed: row.indexed ?? 0,
            no_text_layer: row.no_text_layer ?? 0,
            failed: row.failed ?? 0
          }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── File actions ────────────────────────────────────────────────────────

  ipcMain.handle('documents:open', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      const row = getDb()
        .prepare('SELECT stored_path FROM documents WHERE id = ?')
        .get(id) as { stored_path: string } | undefined
      if (!row) return { success: false, error: 'Document not found' }
      if (!fs.existsSync(row.stored_path)) {
        return { success: false, error: 'The stored file is missing from the document vault.' }
      }
      await shell.openPath(row.stored_path)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'documents:saveAs',
    async (_e, id: number): Promise<IpcResponse<string>> => {
      try {
        const row = getDb()
          .prepare('SELECT title, stored_path FROM documents WHERE id = ?')
          .get(id) as { title: string; stored_path: string } | undefined
        if (!row) return { success: false, error: 'Document not found' }

        const result = await dialog.showSaveDialog({ defaultPath: row.title })
        if (result.canceled || !result.filePath) {
          return { success: false, error: 'Cancelled' }
        }
        fs.copyFileSync(row.stored_path, result.filePath)
        return { success: true, data: result.filePath }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'documents:update',
    async (
      _e,
      payload: {
        id: number
        title?: string
        doc_type?: DocumentType
        contract_id?: number | null
        vendor_id?: number | null
        actor?: Actor
      }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const { id, actor, ...rest } = payload
        const fields = Object.keys(rest).filter((k) =>
          ['title', 'doc_type', 'contract_id', 'vendor_id'].includes(k)
        )
        if (fields.length === 0) return { success: true }

        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (rest as any)[f])
        db.prepare(`UPDATE documents SET ${sets} WHERE id = ?`).run(...values, id)

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: payload.contract_id ?? null,
          entity_label: payload.title ?? `Document #${id}`,
          action: 'update',
          summary: `Document updated (${fields.join(', ')})`,
          actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'documents:delete',
    async (_e, payload: { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const row = db
          .prepare('SELECT title, stored_path, file_hash FROM documents WHERE id = ?')
          .get(payload.id) as
          | { title: string; stored_path: string; file_hash: string }
          | undefined
        if (!row) return { success: false, error: 'Document not found' }

        db.prepare('DELETE FROM documents WHERE id = ?').run(payload.id)

        // Only remove the stored blob once nothing else references that hash.
        const stillUsed = db
          .prepare('SELECT COUNT(*) as n FROM documents WHERE file_hash = ?')
          .get(row.file_hash) as { n: number }
        if (stillUsed.n === 0 && fs.existsSync(row.stored_path)) {
          try {
            fs.unlinkSync(row.stored_path)
          } catch {
            /* leaving an orphaned blob is preferable to failing the delete */
          }
        }

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: null,
          entity_label: row.title,
          action: 'delete',
          summary: `Document "${row.title}" deleted`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /** Re-runs text extraction, e.g. after upgrading the parser. */
  ipcMain.handle(
    'documents:reindex',
    async (_e, id: number): Promise<IpcResponse<{ status: string; characters: number }>> => {
      try {
        const db = getDb()
        const row = db
          .prepare('SELECT stored_path FROM documents WHERE id = ?')
          .get(id) as { stored_path: string } | undefined
        if (!row) return { success: false, error: 'Document not found' }
        if (!fs.existsSync(row.stored_path)) {
          return { success: false, error: 'The stored file is missing from the document vault.' }
        }

        const buffer = fs.readFileSync(row.stored_path)
        const extraction = await extractText(row.stored_path, buffer)

        db.prepare(
          `UPDATE documents SET extracted_text = ?, extraction_status = ?,
             extraction_note = ?, page_count = COALESCE(?, page_count) WHERE id = ?`
        ).run(extraction.text, extraction.status, extraction.note, extraction.pages, id)

        return {
          success: true,
          data: { status: extraction.status, characters: extraction.text.length }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
