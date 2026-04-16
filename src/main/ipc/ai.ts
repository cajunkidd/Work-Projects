import { ipcMain } from 'electron'
import { getDb } from '../database'
import { logChange } from '../audit'
import type { IpcResponse } from '../../shared/types'

const EXTRACTION_MODEL = 'claude-sonnet-4-6'

export interface ExtractedClauses {
  counter_party: string | null
  effective_date: string | null
  termination_date: string | null
  auto_renewal: boolean | null
  notice_period_days: number | null
  payment_terms: string | null
  liability_cap: string | null
  governing_law: string | null
  termination_for_convenience: string | null
  confidentiality: string | null
  data_security: string | null
  warnings: string[]
}

const EXTRACTION_PROMPT = `You are a contract analyst. Extract the following information from the contract text provided and return ONLY valid JSON (no prose, no markdown fences). If a field cannot be determined from the text, return null for that field.

Schema:
{
  "counter_party": string | null,           // the non-customer party's legal name
  "effective_date": string | null,          // ISO YYYY-MM-DD
  "termination_date": string | null,        // ISO YYYY-MM-DD
  "auto_renewal": boolean | null,           // does the contract auto-renew?
  "notice_period_days": number | null,      // days of notice required to cancel/non-renew
  "payment_terms": string | null,           // e.g. "Net 30", "monthly in advance"
  "liability_cap": string | null,           // short description, e.g. "fees paid in prior 12 months"
  "governing_law": string | null,           // e.g. "Delaware", "State of New York"
  "termination_for_convenience": string | null, // short description or null
  "confidentiality": string | null,         // short description or null
  "data_security": string | null,           // short description of data protection obligations
  "warnings": string[]                      // notable risks / unusual clauses a reviewer should see
}`

function getAnthropicConfig(): { apiKey: string; model: string } | null {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT key, value FROM app_settings
       WHERE key IN ('anthropic_api_key','anthropic_model')`
    )
    .all() as { key: string; value: string }[]
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const apiKey = map.anthropic_api_key
  if (!apiKey) return null
  return { apiKey, model: map.anthropic_model || EXTRACTION_MODEL }
}

function stripJsonFences(raw: string): string {
  let trimmed = raw.trim()
  // Remove ```json ... ``` or ``` ... ``` fences if the model slipped them in.
  if (trimmed.startsWith('```')) {
    const firstNewline = trimmed.indexOf('\n')
    if (firstNewline >= 0) trimmed = trimmed.slice(firstNewline + 1)
    if (trimmed.endsWith('```')) trimmed = trimmed.slice(0, -3)
    trimmed = trimmed.trim()
  }
  // If the model returned a JSON object inside prose, isolate the first balanced object.
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace > 0) trimmed = trimmed.slice(firstBrace)
  const lastBrace = trimmed.lastIndexOf('}')
  if (lastBrace >= 0 && lastBrace < trimmed.length - 1) trimmed = trimmed.slice(0, lastBrace + 1)
  return trimmed
}

export function registerAiHandlers(): void {
  // Ping / connectivity test — used by the Settings UI to verify the key works
  ipcMain.handle('ai:testConnection', async (): Promise<IpcResponse<{ model: string }>> => {
    try {
      const cfg = getAnthropicConfig()
      if (!cfg) return { success: false, error: 'Anthropic API key is not set in Settings.' }
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: cfg.apiKey })
      const resp = await client.messages.create({
        model: cfg.model,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with the word OK.' }]
      })
      const text = resp.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
      return { success: true, data: { model: cfg.model, ...({ reply: text } as any) } }
    } catch (err: any) {
      return { success: false, error: err.message || 'Anthropic request failed' }
    }
  })

  // Extract clause metadata from a contract's cached extracted PDF text.
  ipcMain.handle(
    'ai:extractClauses',
    async (_e, contract_id: number): Promise<IpcResponse<ExtractedClauses>> => {
      try {
        const cfg = getAnthropicConfig()
        if (!cfg) return { success: false, error: 'Anthropic API key is not set in Settings.' }

        const db = getDb()
        const row = db
          .prepare('SELECT text FROM contract_extracted_text WHERE contract_id = ?')
          .get(contract_id) as { text: string } | undefined
        const text = row?.text?.trim()
        if (!text) {
          return {
            success: false,
            error: 'This contract has no extracted text. Upload a PDF first or run Re-extract Text on it.'
          }
        }
        // Cap input size to stay within a reasonable request (first 30k chars ≈ covers most contracts).
        const input = text.slice(0, 30_000)

        const { default: Anthropic } = await import('@anthropic-ai/sdk')
        const client = new Anthropic({ apiKey: cfg.apiKey })
        const resp = await client.messages.create({
          model: cfg.model,
          max_tokens: 2048,
          system: EXTRACTION_PROMPT,
          messages: [{ role: 'user', content: `Contract text:\n\n${input}` }]
        })
        const raw = resp.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')
        let parsed: ExtractedClauses
        try {
          parsed = JSON.parse(stripJsonFences(raw)) as ExtractedClauses
        } catch (e: any) {
          return {
            success: false,
            error: `Failed to parse model output as JSON: ${e.message}`
          }
        }

        // Persist the result as an app_setting keyed by contract id (no new table
        // needed — the structure is stable and callers always read a single blob).
        db.prepare(
          `INSERT INTO app_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).run(`ai_clauses_${contract_id}`, JSON.stringify(parsed))

        logChange(null, 'contract', contract_id, 'update', {
          ai_clauses_extracted: {
            counter_party: parsed.counter_party,
            warning_count: parsed.warnings?.length ?? 0
          }
        })
        return { success: true, data: parsed }
      } catch (err: any) {
        return { success: false, error: err.message || 'Anthropic request failed' }
      }
    }
  )

  // Return the last extraction for a contract (or null if never run).
  ipcMain.handle(
    'ai:getClauses',
    async (_e, contract_id: number): Promise<IpcResponse<ExtractedClauses | null>> => {
      try {
        const row = getDb()
          .prepare('SELECT value FROM app_settings WHERE key = ?')
          .get(`ai_clauses_${contract_id}`) as { value: string } | undefined
        if (!row) return { success: true, data: null }
        return { success: true, data: JSON.parse(row.value) as ExtractedClauses }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
