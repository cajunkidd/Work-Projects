import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import type Database from 'better-sqlite3'
import type { ExtractionResult } from '../../shared/types'

/**
 * Contract term extraction via the Claude API.
 *
 * Two input paths, chosen by whether the document has a usable text layer:
 *   - Text layer present → send the extracted text (cheaper, no image tokens).
 *   - Scanned / no text layer → send the PDF itself, so the model reads the
 *     pages visually. That path doubles as OCR for scanned agreements.
 *
 * The response is constrained to a JSON schema, so the caller gets a validated
 * object rather than prose it has to parse.
 */

export const DEFAULT_MODEL = 'claude-opus-5'
export const DEFAULT_EFFORT = 'high'

/** Anthropic caps a request at 32 MB; stay clear of the boundary. */
const MAX_PDF_BYTES = 28 * 1024 * 1024

/** Text longer than this is truncated before being sent. */
const MAX_TEXT_CHARS = 600_000

/** Streaming keeps a large max_tokens from tripping the SDK's HTTP timeout. */
const MAX_TOKENS = 32_000

export function getApiKey(db: Database.Database): string | null {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'anthropic_api_key'`)
    .get() as { value: string } | undefined
  return row?.value?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null
}

export function getModel(db: Database.Database): string {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'anthropic_model'`)
    .get() as { value: string } | undefined
  return row?.value?.trim() || DEFAULT_MODEL
}

export function getEffort(db: Database.Database): string {
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'anthropic_effort'`)
    .get() as { value: string } | undefined
  return row?.value?.trim() || DEFAULT_EFFORT
}

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey })
}

// ─── Response schema ─────────────────────────────────────────────────────────

/** A nullable value plus how sure the model is and the text it relied on. */
function term(valueType: 'string' | 'number'): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'confidence', 'evidence'],
    properties: {
      value: { anyOf: [{ type: valueType }, { type: 'null' }] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      evidence: {
        type: 'string',
        description: 'Short verbatim quote from the document supporting this value, or "" if absent.'
      }
    }
  }
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'vendor_name',
    'counterparty_name',
    'effective_date',
    'expiration_date',
    'renewal_type',
    'cancellation_notice_days',
    'annual_value',
    'monthly_value',
    'total_value',
    'payment_terms',
    'governing_law',
    'liability_cap',
    'contact_name',
    'contact_email',
    'contact_phone',
    'obligations',
    'risk_flags',
    'summary'
  ],
  properties: {
    vendor_name: term('string'),
    counterparty_name: term('string'),
    effective_date: { ...term('string'), description: 'ISO date (YYYY-MM-DD)' },
    expiration_date: { ...term('string'), description: 'ISO date (YYYY-MM-DD)' },
    renewal_type: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'confidence', 'evidence'],
      properties: {
        value: {
          anyOf: [{ type: 'string', enum: ['fixed_term', 'evergreen'] }, { type: 'null' }]
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        evidence: { type: 'string' }
      }
    },
    cancellation_notice_days: term('number'),
    annual_value: term('number'),
    monthly_value: term('number'),
    total_value: term('number'),
    payment_terms: term('string'),
    governing_law: term('string'),
    liability_cap: term('string'),
    contact_name: term('string'),
    contact_email: term('string'),
    contact_phone: term('string'),
    obligations: {
      type: 'array',
      description: 'Concrete, trackable commitments with an owner and (where stated) a date.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'description',
          'obligation_type',
          'responsible_party',
          'due_date',
          'recurrence',
          'critical',
          'evidence'
        ],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          obligation_type: {
            type: 'string',
            enum: [
              'deliverable',
              'milestone',
              'sla',
              'payment',
              'compliance',
              'renewal_task',
              'other'
            ]
          },
          responsible_party: { type: 'string', enum: ['us', 'vendor', 'both'] },
          due_date: {
            anyOf: [{ type: 'string', description: 'ISO date' }, { type: 'null' }]
          },
          recurrence: {
            type: 'string',
            enum: ['none', 'monthly', 'quarterly', 'semiannual', 'annual']
          },
          critical: { type: 'boolean' },
          evidence: { type: 'string' }
        }
      }
    },
    risk_flags: {
      type: 'array',
      description: 'Terms that expose the customer to unusual risk.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'issue', 'evidence'],
        properties: {
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          issue: { type: 'string' },
          evidence: { type: 'string' }
        }
      }
    },
    summary: { type: 'string', description: 'Two or three sentences on what this agreement covers.' }
  }
}

const SYSTEM_PROMPT = `You extract structured terms from vendor contracts for a contract-management system.

Rules:
- Report only what the document states. If a term is absent, set its value to null with confidence "low" — never infer, estimate, or fill from typical market terms.
- Quote the document verbatim in every "evidence" field, kept short. Use "" when the value is null.
- Dates must be ISO format (YYYY-MM-DD). Convert written dates ("the first day of January, 2030" → "2030-01-01"). If a date is relative and the anchor is not in the document, use null.
- Money values are plain numbers with no currency symbols or separators. Derive annual from monthly (or the reverse) only when the document states the billing period; otherwise leave the one that isn't stated as null.
- renewal_type is "evergreen" only when the agreement renews automatically absent notice; otherwise "fixed_term".
- Obligations are concrete, trackable commitments — a deliverable, milestone, SLA, payment, or compliance duty with an identifiable owner. Do not list general boilerplate as an obligation.
- Risk flags are terms that expose the customer to unusual risk: uncapped liability, automatic renewal with a long notice window, unilateral price increases, broad indemnities, restrictive termination.

Keep responses focused. Do not add commentary outside the requested fields.`

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ExtractionInput {
  /** Extracted text, when the document has a usable text layer. */
  text?: string
  /** Absolute path to a PDF, used when there is no text layer. */
  pdfPath?: string
  /** Filename or title, for context. */
  title: string
}

export interface ExtractionOutcome {
  ok: boolean
  result?: ExtractionResult
  error?: string
  refusal?: boolean
  model: string
  effort: string
  input_tokens: number
  output_tokens: number
}

export async function extractContractTerms(
  db: Database.Database,
  input: ExtractionInput
): Promise<ExtractionOutcome> {
  const apiKey = getApiKey(db)
  const model = getModel(db)
  const effort = getEffort(db)

  const empty = { model, effort, input_tokens: 0, output_tokens: 0 }

  if (!apiKey) {
    return {
      ...empty,
      ok: false,
      error: 'No Anthropic API key configured. Add one in Settings → AI Extraction.'
    }
  }

  // Build the user content. The document block comes before the instruction.
  const content: Anthropic.ContentBlockParam[] = []

  if (input.text && input.text.trim().length > 0) {
    const text =
      input.text.length > MAX_TEXT_CHARS
        ? `${input.text.slice(0, MAX_TEXT_CHARS)}\n\n[Document truncated at ${MAX_TEXT_CHARS} characters.]`
        : input.text
    content.push({
      type: 'text',
      text: `Contract document "${input.title}":\n\n<document>\n${text}\n</document>`
    })
  } else if (input.pdfPath) {
    let buffer: Buffer
    try {
      buffer = fs.readFileSync(input.pdfPath)
    } catch (err: any) {
      return { ...empty, ok: false, error: `Could not read the document: ${err.message}` }
    }
    if (buffer.length > MAX_PDF_BYTES) {
      return {
        ...empty,
        ok: false,
        error: `The PDF is ${(buffer.length / 1024 / 1024).toFixed(1)} MB, above the ${MAX_PDF_BYTES / 1024 / 1024} MB limit for AI extraction.`
      }
    }
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: buffer.toString('base64')
      }
    })
    content.push({
      type: 'text',
      text: `This is the contract document "${input.title}". It has no extractable text layer, so read the pages directly.`
    })
  } else {
    return { ...empty, ok: false, error: 'Nothing to extract — no text and no PDF supplied.' }
  }

  content.push({
    type: 'text',
    text: 'Extract the contract terms, obligations, and risk flags from this document.'
  })

  try {
    // Streaming so a large max_tokens doesn't hit the request timeout.
    const stream = client(apiKey).messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA }
      },
      messages: [{ role: 'user', content }]
    } as Anthropic.MessageStreamParams)

    const message = await stream.finalMessage()
    const usage = {
      input_tokens: message.usage.input_tokens ?? 0,
      output_tokens: message.usage.output_tokens ?? 0
    }

    // Check the stop reason before reading content — a refusal returns HTTP 200
    // with empty or partial content.
    if (message.stop_reason === 'refusal') {
      return {
        ...empty,
        ...usage,
        ok: false,
        refusal: true,
        error:
          'The model declined to process this document. If the content is benign, try again or extract it manually.'
      }
    }

    if (message.stop_reason === 'max_tokens') {
      return {
        ...empty,
        ...usage,
        ok: false,
        error:
          'The response was cut off before it finished. Try a shorter document, or extract sections separately.'
      }
    }

    const textBlock = message.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )
    if (!textBlock) {
      return { ...empty, ...usage, ok: false, error: 'The model returned no text to parse.' }
    }

    let parsed: ExtractionResult
    try {
      parsed = JSON.parse(textBlock.text) as ExtractionResult
    } catch {
      return {
        ...empty,
        ...usage,
        ok: false,
        error: 'The model response was not valid JSON.'
      }
    }

    return { ...empty, ...usage, ok: true, result: parsed }
  } catch (err: any) {
    return { ...empty, ok: false, error: describeError(err) }
  }
}

/** Round-trips a tiny request so Settings can verify the key works. */
export async function testConnection(
  db: Database.Database
): Promise<{ ok: boolean; message: string }> {
  const apiKey = getApiKey(db)
  if (!apiKey) return { ok: false, message: 'No API key configured.' }
  const model = getModel(db)

  try {
    const message = await client(apiKey).messages.create({
      model,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Reply with the single word: connected' }]
    })
    const text = message.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )
    return {
      ok: true,
      message: `Connected to ${message.model}. Response: "${(text?.text ?? '').trim().slice(0, 40)}"`
    }
  } catch (err: any) {
    return { ok: false, message: describeError(err) }
  }
}

/** Maps the SDK's typed errors onto messages a non-developer can act on. */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'The Anthropic API key was rejected. Check it in Settings → AI Extraction.'
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'This API key does not have access to the selected model.'
  }
  if (err instanceof Anthropic.NotFoundError) {
    return 'The selected model was not found. Pick a different model in Settings.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the Anthropic API. Wait a moment and try again.'
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the Anthropic API. Check the network connection.'
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error ${err.status ?? ''}: ${err.message}`
  }
  return (err as Error)?.message ?? 'Unknown error during extraction.'
}
