import cron from 'node-cron'
import { Notification } from 'electron'
import { getDb } from './database'
import { markOverdueObligations } from './ipc/obligations'
import type { Contract, ContractObligation } from '../shared/types'

const REMINDER_DAYS = [120, 90, 60, 30]
const OBLIGATION_REMINDER_DAYS = [14, 7, 1]
const NOTIFIED_KEY_PREFIX = 'reminder_sent_'
const OBLIGATION_KEY_PREFIX = 'obligation_reminder_sent_'

export function startScheduler(): void {
  // Run once on startup and then daily at 9 AM.
  // Wrap in try/catch so a scheduler failure can never abort app startup
  // (this callback runs inside app.whenReady().then, which skips createWindow if it throws).
  runAllChecks('initial')
  cron.schedule('0 9 * * *', () => runAllChecks('scheduled'))
}

function runAllChecks(kind: 'initial' | 'scheduled'): void {
  try {
    checkRenewals()
  } catch (err) {
    console.error(`[scheduler] ${kind} checkRenewals failed:`, err)
  }
  try {
    markOverdueObligations()
  } catch (err) {
    console.error(`[scheduler] ${kind} markOverdueObligations failed:`, err)
  }
  try {
    checkObligations()
  } catch (err) {
    console.error(`[scheduler] ${kind} checkObligations failed:`, err)
  }
}

function checkRenewals(): void {
  const db = getDb()

  for (const days of REMINDER_DAYS) {
    const contracts = db
      .prepare(
        `SELECT c.*, d.name as department_name
         FROM contracts c
         LEFT JOIN departments d ON c.department_id = d.id
         WHERE
           status IN ('active','expiring_soon') AND
           CAST(julianday(end_date) - julianday('now') AS INTEGER) BETWEEN ? AND ?`
      )
      .all(days - 1, days) as Contract[]

    for (const contract of contracts) {
      const notifyKey = `${NOTIFIED_KEY_PREFIX}${contract.id}_${days}`
      const alreadySent = db
        .prepare("SELECT value FROM app_settings WHERE key = ?")
        .get(notifyKey) as any

      if (alreadySent) continue

      // Send system notification
      if (Notification.isSupported()) {
        new Notification({
          title: `Contract Renewal in ${days} Days`,
          body: `${contract.vendor_name} (${contract.department_name}) expires on ${contract.end_date}`,
          urgency: days <= 30 ? 'critical' : 'normal'
        }).show()
      }

      // Mark as sent
      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES (?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(notifyKey)
    }
  }
}

// Fire system notifications for pending obligations hitting the
// 14 / 7 / 1-day-out windows. Deduplicated via app_settings rows keyed
// by obligation_reminder_sent_{id}_{days}.
function checkObligations(): void {
  const db = getDb()

  for (const days of OBLIGATION_REMINDER_DAYS) {
    const obligations = db
      .prepare(
        `SELECT o.*, c.vendor_name
         FROM contract_obligations o
         JOIN contracts c ON c.id = o.contract_id
         WHERE o.status IN ('pending','overdue')
           AND CAST(julianday(o.due_date) - julianday('now') AS INTEGER) BETWEEN ? AND ?`
      )
      .all(days - 1, days) as (ContractObligation & { vendor_name: string })[]

    for (const ob of obligations) {
      const notifyKey = `${OBLIGATION_KEY_PREFIX}${ob.id}_${days}`
      const alreadySent = db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(notifyKey)
      if (alreadySent) continue

      if (Notification.isSupported()) {
        new Notification({
          title: `Obligation due in ${days} day${days === 1 ? '' : 's'}`,
          body: `${ob.title} — ${ob.vendor_name} (due ${ob.due_date})`,
          urgency: days <= 1 ? 'critical' : 'normal'
        }).show()
      }

      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES (?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(notifyKey)
    }
  }
}

export function getUpcomingRenewals(): Contract[] {
  return getDb()
    .prepare(
      `SELECT c.*, d.name as department_name,
        CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal
       FROM contracts c
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE status IN ('active','expiring_soon')
         AND julianday(end_date) - julianday('now') <= 120
       ORDER BY end_date ASC`
    )
    .all() as Contract[]
}
