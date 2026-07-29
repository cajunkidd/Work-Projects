import cron from 'node-cron'
import fs from 'fs'
import { Notification } from 'electron'
import { getDb } from './database'
import {
  notifyRenewalDue,
  notifyObligationsDue,
  getUserEmailsToNotify
} from './emailNotifier'
import { dispatchWebhook } from './webhooks'
import { buildCalendarFeed } from './calendarFeed'
import type { Contract } from '../shared/types'

/**
 * Daily reminder sweep.
 *
 * Every reminder now goes out on three channels: a desktop toast, an email to
 * the users scoped to that contract, and any subscribed webhook. The toast
 * alone was unreliable — it only fires while the app happens to be running.
 *
 * De-duplication is per contract, per threshold, so a machine that was offline
 * on the exact day a threshold was crossed still sends the reminder the next
 * time the app opens, rather than skipping it forever.
 */

const REMINDER_DAYS = [120, 90, 60, 30]
const NOTIFIED_KEY_PREFIX = 'reminder_sent_'

/** Obligations this many days out (or already overdue) go in the daily digest. */
const OBLIGATION_LOOKAHEAD_DAYS = 14

export function startScheduler(): void {
  runDailySweep()
  cron.schedule('0 9 * * *', runDailySweep)
}

function runDailySweep(): void {
  try {
    checkRenewals()
    checkEvergreenCancellations()
    checkObligations()
    refreshCalendarFeed()
  } catch (err) {
    console.error('[scheduler] daily sweep failed:', err)
  }
}

function alreadyNotified(key: string): boolean {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
  return row !== undefined
}

function markNotified(key: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key)
}

function checkRenewals(): void {
  const db = getDb()

  for (const days of REMINDER_DAYS) {
    // `<= days` rather than a one-day band, so a threshold crossed while the
    // app was closed is still caught. The dedup key stops repeat sends.
    const contracts = db
      .prepare(
        `SELECT c.*, d.name as department_name
         FROM contracts c
         LEFT JOIN departments d ON c.department_id = d.id
         WHERE c.status IN ('active','expiring_soon')
           AND c.approval_state NOT IN ('draft','pending','rejected')
           AND CAST(julianday(c.end_date) - julianday('now') AS INTEGER) <= ?
           AND CAST(julianday(c.end_date) - julianday('now') AS INTEGER) > 0`
      )
      .all(days) as Contract[]

    for (const contract of contracts) {
      const key = `${NOTIFIED_KEY_PREFIX}${contract.id}_${days}`
      if (alreadyNotified(key)) continue

      if (Notification.isSupported()) {
        new Notification({
          title: `Contract Renewal in ${days} Days`,
          body: `${contract.vendor_name} (${contract.department_name ?? 'Company-wide'}) expires on ${contract.end_date}`,
          urgency: days <= 30 ? 'critical' : 'normal'
        }).show()
      }

      notifyRenewalDue(db, {
        vendor_name: contract.vendor_name,
        end_date: contract.end_date,
        annual_cost: contract.annual_cost,
        department_id: contract.department_id,
        branch_id: contract.branch_id,
        days_out: days,
        kind: 'renewal'
      }).catch(() => {})

      dispatchWebhook(db, 'renewal.upcoming', {
        contract_id: contract.id,
        vendor_name: contract.vendor_name,
        end_date: contract.end_date,
        annual_cost: contract.annual_cost,
        days_out: days,
        kind: 'renewal'
      })

      markNotified(key)
    }
  }
}

function checkEvergreenCancellations(): void {
  const db = getDb()

  for (const days of REMINDER_DAYS) {
    const contracts = db
      .prepare(
        `SELECT c.*, d.name as department_name,
           date(c.end_date, '-' || c.cancellation_notice_days || ' days') as cancellation_deadline,
           CAST(julianday(c.end_date, '-' || c.cancellation_notice_days || ' days')
             - julianday('now') AS INTEGER) as days_until_cancellation
         FROM contracts c
         LEFT JOIN departments d ON c.department_id = d.id
         WHERE c.renewal_type = 'evergreen'
           AND c.cancellation_notice_days > 0
           AND c.status IN ('active','expiring_soon')
           AND c.approval_state NOT IN ('draft','pending','rejected')
           AND CAST(julianday(c.end_date, '-' || c.cancellation_notice_days || ' days')
             - julianday('now') AS INTEGER) <= ?
           AND CAST(julianday(c.end_date, '-' || c.cancellation_notice_days || ' days')
             - julianday('now') AS INTEGER) > 0`
      )
      .all(days) as Contract[]

    for (const contract of contracts) {
      const key = `${NOTIFIED_KEY_PREFIX}cancel_${contract.id}_${days}`
      if (alreadyNotified(key)) continue

      if (Notification.isSupported()) {
        new Notification({
          title: `Cancellation Deadline in ${days} Days`,
          body: `${contract.vendor_name} auto-renews on ${contract.end_date}. To cancel, you MUST notify the vendor by ${contract.cancellation_deadline}. You have ${contract.days_until_cancellation} days.`,
          urgency: days <= 30 ? 'critical' : 'normal'
        }).show()
      }

      notifyRenewalDue(db, {
        vendor_name: contract.vendor_name,
        end_date: contract.end_date,
        annual_cost: contract.annual_cost,
        department_id: contract.department_id,
        branch_id: contract.branch_id,
        days_out: days,
        kind: 'cancellation',
        cancellation_deadline: contract.cancellation_deadline ?? undefined,
        notice_days: contract.cancellation_notice_days
      }).catch(() => {})

      dispatchWebhook(db, 'renewal.upcoming', {
        contract_id: contract.id,
        vendor_name: contract.vendor_name,
        end_date: contract.end_date,
        cancellation_deadline: contract.cancellation_deadline,
        days_out: days,
        kind: 'cancellation'
      })

      markNotified(key)
    }
  }
}

/**
 * One digest per day covering obligations that are overdue or due soon —
 * a per-obligation email would be unusable for a team with many contracts.
 */
function checkObligations(): void {
  const db = getDb()

  const rows = db
    .prepare(
      `SELECT o.id, o.title, o.due_date, o.owner_name, o.responsible_party, o.critical,
              o.contract_id, c.vendor_name, c.department_id, c.branch_id,
              CAST(julianday(o.due_date) - julianday('now') AS INTEGER) as days_out
       FROM obligations o
       JOIN contracts c ON o.contract_id = c.id
       WHERE o.status IN ('open','in_progress')
         AND o.due_date IS NOT NULL AND o.due_date != ''
         AND date(o.due_date) <= date('now', '+' || ? || ' days')
       ORDER BY o.due_date ASC`
    )
    .all(OBLIGATION_LOOKAHEAD_DAYS) as any[]

  if (rows.length === 0) return

  const digestKey = `${NOTIFIED_KEY_PREFIX}obligations_${new Date().toISOString().slice(0, 10)}`
  if (alreadyNotified(digestKey)) return

  const overdue = rows.filter((r) => r.days_out < 0)

  if (Notification.isSupported()) {
    new Notification({
      title:
        overdue.length > 0
          ? `${overdue.length} Overdue Contract Obligation${overdue.length === 1 ? '' : 's'}`
          : `${rows.length} Obligation${rows.length === 1 ? '' : 's'} Due Soon`,
      body: rows
        .slice(0, 3)
        .map((r) => `${r.title} — ${r.vendor_name} (${r.due_date})`)
        .join('\n'),
      urgency: overdue.length > 0 ? 'critical' : 'normal'
    }).show()
  }

  // Recipients are the union of everyone scoped to the affected contracts.
  const recipients = new Set<string>()
  for (const row of rows) {
    for (const email of getUserEmailsToNotify(db, row.department_id, row.branch_id)) {
      recipients.add(email)
    }
  }

  notifyObligationsDue(db, {
    to: [...recipients],
    obligations: rows.map((r) => ({
      title: r.title,
      vendor_name: r.vendor_name,
      due_date: r.due_date,
      owner_name: r.owner_name,
      responsible_party: r.responsible_party,
      days_out: r.days_out,
      overdue: r.days_out < 0
    }))
  }).catch(() => {})

  for (const row of rows) {
    dispatchWebhook(db, 'obligation.due', {
      obligation_id: row.id,
      contract_id: row.contract_id,
      vendor_name: row.vendor_name,
      title: row.title,
      due_date: row.due_date,
      days_out: row.days_out,
      overdue: row.days_out < 0,
      critical: row.critical === 1
    })
  }

  markNotified(digestKey)
}

/**
 * Rewrites the .ics feed when a path is configured, so a subscribed calendar
 * picks up new renewals and obligations without anyone re-exporting by hand.
 */
function refreshCalendarFeed(): void {
  const db = getDb()
  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'calendar_feed_path'`)
    .get() as { value: string } | undefined
  const target = row?.value?.trim()
  if (!target) return

  try {
    fs.writeFileSync(target, buildCalendarFeed(), 'utf-8')
  } catch (err) {
    console.error('[scheduler] calendar feed refresh failed:', err)
  }
}

export function getUpcomingRenewals(): Contract[] {
  return getDb()
    .prepare(
      `SELECT c.*, d.name as department_name,
        CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal,
        CASE WHEN c.renewal_type = 'evergreen' AND c.cancellation_notice_days > 0
          THEN date(c.end_date, '-' || c.cancellation_notice_days || ' days')
          ELSE NULL
        END as cancellation_deadline,
        CASE WHEN c.renewal_type = 'evergreen' AND c.cancellation_notice_days > 0
          THEN CAST(julianday(c.end_date, '-' || c.cancellation_notice_days || ' days')
            - julianday('now') AS INTEGER)
          ELSE NULL
        END as days_until_cancellation
       FROM contracts c
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE status IN ('active','expiring_soon')
         AND julianday(end_date) - julianday('now') <= 120
       ORDER BY end_date ASC`
    )
    .all() as Contract[]
}
