import { getDb } from './database'
import type { CalendarFeedOptions } from '../shared/types'

/**
 * iCalendar (RFC 5545) feed of contract dates.
 *
 * Written to a file rather than served over HTTP: pointing this at a shared
 * network path gives the whole team a calendar they can subscribe to from
 * Outlook, Google Calendar, or Apple Calendar, and the daily scheduler keeps
 * it current.
 */

export const DEFAULT_FEED_OPTIONS: CalendarFeedOptions = {
  include_renewals: true,
  include_cancellation_deadlines: true,
  include_obligations: true,
  reminder_minutes: 0
}

/** Escapes a value per RFC 5545 (backslashes, semicolons, commas, newlines). */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** RFC 5545 caps content lines at 75 octets; continuations start with a space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest.length > 0) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

function icsDate(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, '')
}

/** DTEND on an all-day VEVENT is exclusive, so it lands on the following day. */
function exclusiveEnd(isoDate: string): string {
  const row = getDb().prepare(`SELECT date(?, '+1 day') as d`).get(isoDate) as {
    d: string | null
  }
  return icsDate(row.d ?? isoDate)
}

export interface CalendarEvent {
  uid: string
  date: string
  summary: string
  description: string
}

/** Collects the dated items that belong on the calendar. */
export function collectCalendarEvents(options: CalendarFeedOptions): CalendarEvent[] {
  const db = getDb()
  const events: CalendarEvent[] = []

  if (options.include_renewals) {
    const rows = db
      .prepare(
        `SELECT c.id, c.vendor_name, c.end_date, c.annual_cost, c.renewal_type,
                d.name as department_name, b.name as branch_name
         FROM contracts c
         LEFT JOIN departments d ON c.department_id = d.id
         LEFT JOIN branches b ON c.branch_id = b.id
         WHERE c.status IN ('active','expiring_soon')
           AND c.end_date IS NOT NULL AND c.end_date != ''`
      )
      .all() as any[]

    for (const row of rows) {
      const scope = row.department_name ?? row.branch_name ?? 'Company-wide'
      events.push({
        uid: `renewal-${row.id}@contract-manager`,
        date: row.end_date,
        summary: `${row.renewal_type === 'evergreen' ? 'Auto-renews' : 'Contract expires'}: ${row.vendor_name}`,
        description: `${row.vendor_name} — ${scope}. Annual cost ${row.annual_cost}. Contract #${row.id}.`
      })
    }
  }

  if (options.include_cancellation_deadlines) {
    const rows = db
      .prepare(
        `SELECT c.id, c.vendor_name, c.cancellation_notice_days,
                date(c.end_date, '-' || c.cancellation_notice_days || ' days') as deadline
         FROM contracts c
         WHERE c.renewal_type = 'evergreen' AND c.cancellation_notice_days > 0
           AND c.status IN ('active','expiring_soon')`
      )
      .all() as any[]

    for (const row of rows) {
      if (!row.deadline) continue
      events.push({
        uid: `cancel-${row.id}@contract-manager`,
        date: row.deadline,
        summary: `Cancellation deadline: ${row.vendor_name}`,
        description: `To stop the automatic renewal of ${row.vendor_name}, notify the vendor by ${row.deadline} (${row.cancellation_notice_days} days notice required). Contract #${row.id}.`
      })
    }
  }

  if (options.include_obligations) {
    const rows = db
      .prepare(
        `SELECT o.id, o.title, o.description, o.due_date, o.obligation_type,
                o.responsible_party, o.owner_name, c.vendor_name
         FROM obligations o
         JOIN contracts c ON o.contract_id = c.id
         WHERE o.status IN ('open','in_progress')
           AND o.due_date IS NOT NULL AND o.due_date != ''`
      )
      .all() as any[]

    for (const row of rows) {
      const owner = row.owner_name ? ` Owner: ${row.owner_name}.` : ''
      events.push({
        uid: `obligation-${row.id}@contract-manager`,
        date: row.due_date,
        summary: `${row.title} (${row.vendor_name})`,
        description:
          `${String(row.obligation_type).replace('_', ' ')} — responsibility: ${row.responsible_party}.${owner} ${row.description}`.trim()
      })
    }
  }

  return events
}

export function renderIcs(events: CalendarEvent[], reminderMinutes: number): string {
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Contract Manager//Contract Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Contract Manager',
    'X-WR-CALDESC:Contract renewals, cancellation deadlines, and obligations'
  ]

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART;VALUE=DATE:${icsDate(event.date)}`)
    lines.push(`DTEND;VALUE=DATE:${exclusiveEnd(event.date)}`)
    lines.push(foldLine(`SUMMARY:${icsEscape(event.summary)}`))
    lines.push(foldLine(`DESCRIPTION:${icsEscape(event.description)}`))
    lines.push('TRANSP:TRANSPARENT')

    if (reminderMinutes > 0) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(foldLine(`DESCRIPTION:${icsEscape(event.summary)}`))
      lines.push(`TRIGGER:-PT${reminderMinutes}M`)
      lines.push('END:VALARM')
    }

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/** Convenience wrapper used by the scheduler's daily feed refresh. */
export function buildCalendarFeed(options: CalendarFeedOptions = DEFAULT_FEED_OPTIONS): string {
  return renderIcs(collectCalendarEvents(options), options.reminder_minutes ?? 0)
}
