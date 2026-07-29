import crypto from 'crypto'
import type Database from 'better-sqlite3'
import type { WebhookEvent } from '../shared/types'

/**
 * Outbound webhooks.
 *
 * A generic HTTP-POST integration point: each delivery is signed with an
 * HMAC-SHA256 of the body so the receiver can verify it, which is enough to
 * drive Zapier, Power Automate, a Salesforce flow, or any internal endpoint.
 *
 * Deliveries are fire-and-forget — a failing endpoint records its error and
 * never blocks or rolls back the business operation that triggered it.
 */

const DELIVERY_TIMEOUT_MS = 10_000

/** Deliveries older than this are pruned when a new one is recorded. */
const DELIVERY_HISTORY_LIMIT = 200

export function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

interface WebhookRow {
  id: number
  name: string
  url: string
  secret: string
  events: string
}

function subscribers(db: Database.Database, event: WebhookEvent): WebhookRow[] {
  const rows = db
    .prepare('SELECT id, name, url, secret, events FROM webhooks WHERE active = 1')
    .all() as WebhookRow[]

  return rows.filter((row) => {
    try {
      const events = JSON.parse(row.events) as string[]
      // An empty subscription list means "every event".
      return events.length === 0 || events.includes(event)
    } catch {
      return false
    }
  })
}

/**
 * Sends an event to every active subscriber. Safe to call from any handler —
 * it never throws and never blocks the caller.
 */
export function dispatchWebhook(
  db: Database.Database,
  event: WebhookEvent,
  data: Record<string, unknown>
): void {
  let targets: WebhookRow[]
  try {
    targets = subscribers(db, event)
  } catch (err) {
    console.error('[webhooks] could not read subscribers:', err)
    return
  }
  if (targets.length === 0) return

  const body = JSON.stringify({
    event,
    sent_at: new Date().toISOString(),
    data
  })

  for (const target of targets) {
    deliver(db, target, event, body).catch((err) => {
      console.error(`[webhooks] delivery to ${target.name} failed:`, err)
    })
  }
}

async function deliver(
  db: Database.Database,
  webhook: WebhookRow,
  event: WebhookEvent,
  body: string
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)

  let statusCode: number | null = null
  let error = ''

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ContractManager-Webhook/1.0',
      'X-CM-Event': event
    }
    if (webhook.secret) {
      headers['X-CM-Signature'] = `sha256=${signPayload(webhook.secret, body)}`
    }

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    })
    statusCode = response.status
    if (!response.ok) {
      error = `HTTP ${response.status} ${response.statusText}`
    }
  } catch (err: any) {
    error = err?.name === 'AbortError' ? 'Timed out after 10s' : (err?.message ?? 'Request failed')
  } finally {
    clearTimeout(timer)
  }

  try {
    db.prepare(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload, status_code, error)
       VALUES (?,?,?,?,?)`
    ).run(webhook.id, event, body.slice(0, 4000), statusCode, error)

    db.prepare(
      `UPDATE webhooks SET last_status = ?, last_error = ?, last_fired_at = datetime('now')
       WHERE id = ?`
    ).run(statusCode, error, webhook.id)

    // Keep the delivery log from growing without bound.
    db.prepare(
      `DELETE FROM webhook_deliveries
       WHERE webhook_id = ? AND id NOT IN (
         SELECT id FROM webhook_deliveries WHERE webhook_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?
       )`
    ).run(webhook.id, webhook.id, DELIVERY_HISTORY_LIMIT)
  } catch (err) {
    console.error('[webhooks] could not record delivery:', err)
  }
}
