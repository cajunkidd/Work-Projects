import type { Database } from 'better-sqlite3'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SmtpSettings {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

interface DbUser {
  email: string
  role: string
  department_ids: string
  branch_ids: string
}

// ─── SMTP config reader ───────────────────────────────────────────────────────

function getSmtpSettings(db: Database): SmtpSettings | null {
  const rows = db
    .prepare(
      `SELECT key, value FROM app_settings
       WHERE key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure','smtp_enabled')`
    )
    .all() as { key: string; value: string }[]

  const s: Record<string, string> = {}
  for (const r of rows) s[r.key] = r.value

  if (!s.smtp_host || s.smtp_enabled !== 'true') return null

  return {
    host: s.smtp_host,
    port: parseInt(s.smtp_port || '587'),
    secure: s.smtp_secure === 'true',
    user: s.smtp_user || '',
    pass: s.smtp_pass || '',
    from: s.smtp_from || s.smtp_user || ''
  }
}

// ─── User targeting ───────────────────────────────────────────────────────────

export function getUserEmailsToNotify(
  db: Database,
  department_id: number | null,
  branch_id: number | null
): string[] {
  const users = db
    .prepare('SELECT email, role, department_ids, branch_ids FROM users')
    .all() as DbUser[]

  const emails = new Set<string>()

  for (const u of users) {
    if (!u.email) continue

    // Super admins always get notified
    if (u.role === 'super_admin') {
      emails.add(u.email)
      continue
    }

    let deptIds: number[] = []
    let branchIds: number[] = []
    try { deptIds = JSON.parse(u.department_ids) } catch { deptIds = [] }
    try { branchIds = JSON.parse(u.branch_ids) } catch { branchIds = [] }

    if (department_id !== null && deptIds.includes(department_id)) {
      emails.add(u.email)
    }
    if (branch_id !== null && branchIds.includes(branch_id)) {
      emails.add(u.email)
    }
  }

  return [...emails]
}

// ─── Email sender ─────────────────────────────────────────────────────────────

async function sendEmail(
  db: Database,
  to: string[],
  subject: string,
  html: string
): Promise<void> {
  if (to.length === 0) return

  const smtp = getSmtpSettings(db)
  if (!smtp) return

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
  } as any)

  await transporter.sendMail({
    from: smtp.from,
    to: to.join(', '),
    subject,
    html
  })
}

// ─── HTML email template ──────────────────────────────────────────────────────

function emailTemplate(title: string, rows: { label: string; value: string }[]): string {
  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;">${r.label}</td>
        <td style="padding:6px 0;color:#1e293b;font-size:13px;">${r.value}</td>
      </tr>`
    )
    .join('')

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;padding:32px 24px;background:#f8fafc;">
      <div style="background:#ffffff;border-radius:10px;padding:28px 32px;border:1px solid #e2e8f0;">
        <h2 style="margin:0 0 20px;color:#1e293b;font-size:18px;font-weight:600;">${title}</h2>
        <table style="border-collapse:collapse;width:100%;">${rowsHtml}</table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0 16px;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">
          Sent by Contract Manager &middot;
          You are receiving this because this change affects your assigned department or branch.
        </p>
      </div>
    </div>`
}

function scopeLabel(
  db: Database,
  department_id: number | null,
  branch_id: number | null
): string {
  if (department_id) {
    const d = db
      .prepare('SELECT name FROM departments WHERE id = ?')
      .get(department_id) as { name: string } | undefined
    return d ? `Department: ${d.name}` : `Department #${department_id}`
  }
  if (branch_id) {
    const b = db
      .prepare('SELECT number, name FROM branches WHERE id = ?')
      .get(branch_id) as { number: number; name: string } | undefined
    return b ? `Branch ${b.number} – ${b.name}` : `Branch #${branch_id}`
  }
  return 'Company-wide'
}

function fmtCost(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n)
}

// ─── Public notification helpers ──────────────────────────────────────────────

export async function notifyContractCreated(
  db: Database,
  contract: {
    vendor_name: string
    status: string
    start_date: string
    end_date: string
    annual_cost: number
    monthly_cost: number
    department_id: number | null
    branch_id: number | null
    poc_name?: string
  }
): Promise<void> {
  const to = getUserEmailsToNotify(db, contract.department_id, contract.branch_id)
  const scope = scopeLabel(db, contract.department_id, contract.branch_id)

  const html = emailTemplate('New Contract Added', [
    { label: 'Vendor', value: contract.vendor_name },
    { label: 'Scope', value: scope },
    { label: 'Status', value: contract.status.replace('_', ' ') },
    { label: 'Start Date', value: contract.start_date },
    { label: 'End Date', value: contract.end_date },
    { label: 'Annual Cost', value: fmtCost(contract.annual_cost) },
    { label: 'Monthly Cost', value: fmtCost(contract.monthly_cost) },
    ...(contract.poc_name ? [{ label: 'Point of Contact', value: contract.poc_name }] : [])
  ])

  await sendEmail(db, to, `New Contract Added: ${contract.vendor_name}`, html)
}

export async function notifyContractUpdated(
  db: Database,
  contract: {
    id: number
    vendor_name: string
    status: string
    start_date: string
    end_date: string
    annual_cost: number
    monthly_cost: number
    department_id: number | null
    branch_id: number | null
  },
  changedFields: string[]
): Promise<void> {
  const to = getUserEmailsToNotify(db, contract.department_id, contract.branch_id)
  const scope = scopeLabel(db, contract.department_id, contract.branch_id)

  const readableFields = changedFields
    .filter((f) => f !== 'id')
    .map((f) => f.replace(/_/g, ' '))
    .join(', ')

  const html = emailTemplate('Contract Updated', [
    { label: 'Vendor', value: contract.vendor_name },
    { label: 'Scope', value: scope },
    { label: 'Fields Changed', value: readableFields || 'general update' },
    { label: 'Current Status', value: contract.status.replace('_', ' ') },
    { label: 'End Date', value: contract.end_date },
    { label: 'Annual Cost', value: fmtCost(contract.annual_cost) }
  ])

  await sendEmail(db, to, `Contract Updated: ${contract.vendor_name}`, html)
}

export async function notifyContractDeleted(
  db: Database,
  vendor_name: string,
  department_id: number | null,
  branch_id: number | null
): Promise<void> {
  const to = getUserEmailsToNotify(db, department_id, branch_id)
  const scope = scopeLabel(db, department_id, branch_id)

  const html = emailTemplate('Contract Removed', [
    { label: 'Vendor', value: vendor_name },
    { label: 'Scope', value: scope }
  ])

  await sendEmail(db, to, `Contract Removed: ${vendor_name}`, html)
}

export async function notifyBudgetUpdated(
  db: Database,
  payload: {
    department_id: number | null
    branch_id: number | null
    fiscal_year: number
    total_amount: number
  }
): Promise<void> {
  const to = getUserEmailsToNotify(db, payload.department_id, payload.branch_id)
  const scope = scopeLabel(db, payload.department_id, payload.branch_id)

  const html = emailTemplate('Budget Updated', [
    { label: 'Scope', value: scope },
    { label: 'Fiscal Year', value: String(payload.fiscal_year) },
    { label: 'Total Budget', value: fmtCost(payload.total_amount) }
  ])

  await sendEmail(db, to, `Budget Updated: ${scope}`, html)
}

// ─── Standalone test email ────────────────────────────────────────────────────

export async function sendTestEmail(db: Database, toEmail: string): Promise<void> {
  const smtp = getSmtpSettings(db)
  if (!smtp) throw new Error('SMTP is not configured or notifications are disabled.')

  const html = emailTemplate('Test Email', [
    { label: 'Status', value: 'SMTP connection successful' },
    { label: 'Host', value: smtp.host },
    { label: 'Port', value: String(smtp.port) }
  ])

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
  } as any)

  await transporter.sendMail({
    from: smtp.from,
    to: toEmail,
    subject: 'Contract Manager — Test Email',
    html
  })
}
