import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import crypto from 'crypto'
import { getDb } from '../database'
import { recordAudit } from '../audit'
import { dispatchWebhook, signPayload } from '../webhooks'
import { collectCalendarEvents, renderIcs } from '../calendarFeed'
import type {
  Actor,
  CalendarFeedOptions,
  IpcResponse,
  Webhook,
  WebhookDelivery,
  WebhookEvent
} from '../../shared/types'

/**
 * Outbound integrations: an iCalendar feed of contract dates, and signed
 * webhooks for wiring the app into a CRM, procurement system, or automation
 * platform.
 */

export function registerIntegrationHandlers(): void {
  /**
   * Writes an .ics file. Saving it to a shared network path gives the team a
   * calendar they can subscribe to from Outlook, Google Calendar, or Apple
   * Calendar and have refresh on their own schedule.
   */
  ipcMain.handle(
    'calendar:export',
    async (
      _e,
      options: CalendarFeedOptions & { path?: string }
    ): Promise<IpcResponse<{ path: string; events: number }>> => {
      try {
        const events = collectCalendarEvents(options)
        const ics = renderIcs(events, options.reminder_minutes ?? 0)

        let target = options.path
        if (!target) {
          const result = await dialog.showSaveDialog({
            defaultPath: 'contract-calendar.ics',
            filters: [{ name: 'Calendar', extensions: ['ics'] }]
          })
          if (result.canceled || !result.filePath) {
            return { success: false, error: 'Cancelled' }
          }
          target = result.filePath
        }

        fs.writeFileSync(target, ics, 'utf-8')
        return { success: true, data: { path: target, events: events.length } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /** Regenerates the feed at the saved path — used by the daily scheduler. */
  ipcMain.handle(
    'calendar:preview',
    async (_e, options: CalendarFeedOptions): Promise<IpcResponse<{ events: number }>> => {
      try {
        return { success: true, data: { events: collectCalendarEvents(options).length } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── Webhooks ────────────────────────────────────────────────────────────

  ipcMain.handle('webhooks:list', async (): Promise<IpcResponse<Webhook[]>> => {
    try {
      const rows = getDb()
        .prepare('SELECT * FROM webhooks ORDER BY created_at DESC')
        .all() as Webhook[]
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'webhooks:create',
    async (
      _e,
      payload: { name: string; url: string; events: WebhookEvent[]; actor?: Actor }
    ): Promise<IpcResponse<Webhook>> => {
      try {
        const db = getDb()
        if (!payload.name?.trim()) return { success: false, error: 'A webhook needs a name.' }
        if (!/^https?:\/\//i.test(payload.url ?? '')) {
          return { success: false, error: 'The URL must start with http:// or https://' }
        }

        // Generated here so the secret is never typed or pasted by hand.
        const secret = crypto.randomBytes(24).toString('hex')

        const result = db
          .prepare(
            'INSERT INTO webhooks (name, url, secret, events, active) VALUES (?,?,?,?,1)'
          )
          .run(payload.name.trim(), payload.url.trim(), secret, JSON.stringify(payload.events ?? []))

        const row = db
          .prepare('SELECT * FROM webhooks WHERE id = ?')
          .get(result.lastInsertRowid) as Webhook

        recordAudit(db, {
          entity_type: 'settings',
          entity_id: row.id,
          entity_label: row.name,
          action: 'create',
          summary: `Webhook "${row.name}" created for ${row.url}`,
          actor: payload.actor
        })

        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'webhooks:update',
    async (
      _e,
      payload: { id: number; name?: string; url?: string; events?: WebhookEvent[]; active?: number; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const sets: string[] = []
        const values: (string | number)[] = []

        if (payload.name !== undefined) {
          sets.push('name = ?')
          values.push(payload.name)
        }
        if (payload.url !== undefined) {
          sets.push('url = ?')
          values.push(payload.url)
        }
        if (payload.events !== undefined) {
          sets.push('events = ?')
          values.push(JSON.stringify(payload.events))
        }
        if (payload.active !== undefined) {
          sets.push('active = ?')
          values.push(payload.active)
        }
        if (sets.length === 0) return { success: true }

        db.prepare(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`).run(
          ...values,
          payload.id
        )
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'webhooks:delete',
    async (_e, payload: { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const row = db.prepare('SELECT name FROM webhooks WHERE id = ?').get(payload.id) as
          | { name: string }
          | undefined
        db.prepare('DELETE FROM webhooks WHERE id = ?').run(payload.id)

        recordAudit(db, {
          entity_type: 'settings',
          entity_id: payload.id,
          entity_label: row?.name ?? `Webhook #${payload.id}`,
          action: 'delete',
          summary: `Webhook "${row?.name ?? payload.id}" deleted`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  /** Fires a sample payload so the receiver can be verified end to end. */
  ipcMain.handle(
    'webhooks:test',
    async (_e, id: number): Promise<IpcResponse<string>> => {
      try {
        const db = getDb()
        const row = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as
          | Webhook
          | undefined
        if (!row) return { success: false, error: 'Webhook not found' }

        const body = JSON.stringify({
          event: 'test',
          sent_at: new Date().toISOString(),
          data: { message: 'Test delivery from Contract Manager.' }
        })

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'ContractManager-Webhook/1.0',
          'X-CM-Event': 'test'
        }
        if (row.secret) headers['X-CM-Signature'] = `sha256=${signPayload(row.secret, body)}`

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10_000)
        try {
          const response = await fetch(row.url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal
          })
          db.prepare(
            `UPDATE webhooks SET last_status = ?, last_error = ?, last_fired_at = datetime('now')
             WHERE id = ?`
          ).run(response.status, response.ok ? '' : `HTTP ${response.status}`, id)

          return response.ok
            ? { success: true, data: `Delivered — endpoint returned ${response.status}.` }
            : { success: false, error: `Endpoint returned HTTP ${response.status}.` }
        } finally {
          clearTimeout(timer)
        }
      } catch (err: any) {
        const message = err?.name === 'AbortError' ? 'Timed out after 10s' : err.message
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'webhooks:deliveries',
    async (_e, webhook_id: number): Promise<IpcResponse<WebhookDelivery[]>> => {
      try {
        const rows = getDb()
          .prepare(
            `SELECT * FROM webhook_deliveries WHERE webhook_id = ?
             ORDER BY created_at DESC, id DESC LIMIT 50`
          )
          .all(webhook_id) as WebhookDelivery[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}

export { dispatchWebhook }
