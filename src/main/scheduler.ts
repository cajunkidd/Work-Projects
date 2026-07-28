import cron from 'node-cron'
import { Notification } from 'electron'
import { getDb } from './database'
import type { Contract } from '../shared/types'

const REMINDER_DAYS = [120, 90, 60, 30]
const NOTIFIED_KEY_PREFIX = 'reminder_sent_'

export function startScheduler(): void {
  // Run once on startup and then daily at 9 AM
  checkRenewals()
  checkEvergreenCancellations()
  cron.schedule('0 9 * * *', () => {
    checkRenewals()
    checkEvergreenCancellations()
  })
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
      ).run(notifyKey, '1')
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
         WHERE
           c.renewal_type = 'evergreen' AND
           c.cancellation_notice_days > 0 AND
           c.status IN ('active','expiring_soon') AND
           CAST(julianday(c.end_date, '-' || c.cancellation_notice_days || ' days')
             - julianday('now') AS INTEGER) BETWEEN ? AND ?`
      )
      .all(days - 1, days) as Contract[]

    for (const contract of contracts) {
      const notifyKey = `${NOTIFIED_KEY_PREFIX}cancel_${contract.id}_${days}`
      const alreadySent = db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(notifyKey) as any

      if (alreadySent) continue

      if (Notification.isSupported()) {
        new Notification({
          title: `Cancellation Deadline in ${days} Days`,
          body: `${contract.vendor_name} auto-renews on ${contract.end_date}. To cancel, you MUST notify the vendor by ${contract.cancellation_deadline}. You have ${contract.days_until_cancellation} days.`,
          urgency: days <= 30 ? 'critical' : 'normal'
        }).show()
      }

      db.prepare(
        "INSERT INTO app_settings (key, value) VALUES (?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(notifyKey, '1')
    }
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
