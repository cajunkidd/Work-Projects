import { ipcMain, dialog } from 'electron'
import { getDb } from '../database'
import type { IpcResponse } from '../../shared/types'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function registerReportHandlers(): void {
  // ── Contract Overview: status counts + KPI totals ─────────────────────────
  ipcMain.handle('reports:overview', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()

      const statusCounts = db
        .prepare(`SELECT status, COUNT(*) as count FROM contracts GROUP BY status`)
        .all() as { status: string; count: number }[]

      const totals = db
        .prepare(
          `SELECT
            COUNT(*) as total_contracts,
            COALESCE(SUM(annual_cost), 0) as total_annual_spend,
            COALESCE(SUM(monthly_cost), 0) as total_monthly_spend,
            COALESCE(AVG(annual_cost), 0) as avg_contract_value,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
            COUNT(CASE WHEN status = 'expiring_soon' THEN 1 END) as expiring_count,
            COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_count,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
          FROM contracts`
        )
        .get() as any

      const recentContracts = db
        .prepare(
          `SELECT c.vendor_name, c.status, c.annual_cost, c.end_date,
              d.name as department_name, b.name as branch_name
           FROM contracts c
           LEFT JOIN departments d ON c.department_id = d.id
           LEFT JOIN branches b ON c.branch_id = b.id
           ORDER BY c.created_at DESC LIMIT 10`
        )
        .all()

      return { success: true, data: { statusCounts, totals, recentContracts } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Top vendors by annual spend ────────────────────────────────────────────
  ipcMain.handle('reports:vendorSpend', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT vendor_name, SUM(annual_cost) as annual_spend,
              SUM(monthly_cost) as monthly_spend,
              COUNT(*) as contract_count
           FROM contracts
           GROUP BY vendor_name
           ORDER BY annual_spend DESC
           LIMIT 15`
        )
        .all()
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Monthly spend trend (last 24 months of start dates) ───────────────────
  ipcMain.handle('reports:monthlyTrend', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT
              strftime('%Y-%m', start_date) as month,
              COALESCE(SUM(monthly_cost), 0) as total_monthly,
              COALESCE(SUM(annual_cost), 0) as total_annual,
              COUNT(*) as contract_count
           FROM contracts
           WHERE start_date IS NOT NULL
           GROUP BY month
           ORDER BY month ASC
           LIMIT 24`
        )
        .all()
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Upcoming renewals (next 90 days) ──────────────────────────────────────
  ipcMain.handle('reports:renewals', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT
              c.id, c.vendor_name, c.status, c.end_date,
              c.annual_cost, c.monthly_cost,
              d.name as department_name,
              b.name as branch_name, b.number as branch_number,
              CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal
           FROM contracts c
           LEFT JOIN departments d ON c.department_id = d.id
           LEFT JOIN branches b ON c.branch_id = b.id
           WHERE c.end_date IS NOT NULL
             AND c.end_date >= date('now')
             AND c.end_date <= date('now', '+90 days')
           ORDER BY c.end_date ASC`
        )
        .all()
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Budget vs Actual by dept and branch ───────────────────────────────────
  ipcMain.handle(
    'reports:budgetVsActual',
    async (_e, fiscal_year: number): Promise<IpcResponse<any>> => {
      try {
        const db = getDb()

        const departments = db
          .prepare(
            `SELECT
                d.name as name,
                COALESCE(b.total_amount, 0) as budget,
                COALESCE((
                  SELECT SUM(c.annual_cost) FROM contracts c WHERE c.department_id = d.id
                ), 0) as actual
             FROM departments d
             LEFT JOIN budget b ON b.department_id = d.id AND b.fiscal_year = ?
             ORDER BY d.name`
          )
          .all(fiscal_year) as any[]

        const branches = db
          .prepare(
            `SELECT
                ('Branch ' || br.number || ' – ' || br.name) as name,
                COALESCE(b.total_amount, 0) as budget,
                COALESCE((
                  SELECT SUM(c.annual_cost) FROM contracts c WHERE c.branch_id = br.id
                ), 0) as actual
             FROM branches br
             LEFT JOIN budget b ON b.branch_id = br.id AND b.fiscal_year = ?
             ORDER BY br.number`
          )
          .all(fiscal_year) as any[]

        return { success: true, data: { departments, branches } }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ── Invoice summary by month + top vendors ────────────────────────────────
  ipcMain.handle('reports:invoiceSummary', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()

      const monthly = db
        .prepare(
          `SELECT
              strftime('%Y-%m', received_date) as month,
              COALESCE(SUM(amount), 0) as total_amount,
              COALESCE(SUM(budgeted_amount), 0) as total_budgeted,
              COUNT(*) as invoice_count,
              SUM(CASE WHEN contract_id IS NOT NULL THEN 1 ELSE 0 END) as matched_count
           FROM invoices
           WHERE is_deleted = 0 AND received_date IS NOT NULL
           GROUP BY month
           ORDER BY month ASC
           LIMIT 24`
        )
        .all()

      const topVendors = db
        .prepare(
          `SELECT
              COALESCE(c.vendor_name, i.sender) as vendor,
              COALESCE(SUM(i.amount), 0) as total_amount,
              COUNT(*) as invoice_count
           FROM invoices i
           LEFT JOIN contracts c ON i.contract_id = c.id
           WHERE i.is_deleted = 0
           GROUP BY vendor
           ORDER BY total_amount DESC
           LIMIT 10`
        )
        .all()

      const totals = db
        .prepare(
          `SELECT
              COALESCE(SUM(amount), 0) as total_amount,
              COALESCE(SUM(budgeted_amount), 0) as total_budgeted,
              COUNT(*) as total_count,
              SUM(CASE WHEN contract_id IS NOT NULL THEN 1 ELSE 0 END) as matched_count
           FROM invoices
           WHERE is_deleted = 0`
        )
        .get() as any

      return { success: true, data: { monthly, topVendors, totals } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Spend by department ────────────────────────────────────────────────────
  ipcMain.handle('reports:spendByDept', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT
              COALESCE(d.name, 'Unassigned') as name,
              COALESCE(SUM(c.annual_cost), 0) as annual_spend,
              COALESCE(SUM(c.monthly_cost), 0) as monthly_spend,
              COUNT(*) as contract_count
           FROM contracts c
           LEFT JOIN departments d ON c.department_id = d.id
           GROUP BY c.department_id, d.name
           ORDER BY annual_spend DESC`
        )
        .all()
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Spend by branch ────────────────────────────────────────────────────────
  ipcMain.handle('reports:spendByBranch', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT
              COALESCE('Branch ' || b.number || ' – ' || b.name, 'Unassigned') as name,
              COALESCE(SUM(c.annual_cost), 0) as annual_spend,
              COALESCE(SUM(c.monthly_cost), 0) as monthly_spend,
              COUNT(*) as contract_count
           FROM contracts c
           LEFT JOIN branches b ON c.branch_id = b.id
           GROUP BY c.branch_id, b.name
           ORDER BY annual_spend DESC`
        )
        .all()
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Expiring contracts (all statuses, sorted by end date) ─────────────────
  ipcMain.handle('reports:contractList', async (): Promise<IpcResponse<any>> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT
              c.id, c.vendor_name, c.status, c.start_date, c.end_date,
              c.annual_cost, c.monthly_cost,
              d.name as department_name,
              b.name as branch_name, b.number as branch_number,
              CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_renewal
           FROM contracts c
           LEFT JOIN departments d ON c.department_id = d.id
           LEFT JOIN branches b ON c.branch_id = b.id
           ORDER BY c.annual_cost DESC`
        )
        .all()
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Export report to Excel ─────────────────────────────────────────────────
  ipcMain.handle(
    'reports:export',
    async (_e, payload: { reportName: string; data: any }): Promise<IpcResponse<void>> => {
      try {
        const { reportName, data } = payload
        const slug = reportName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const result = await dialog.showSaveDialog({
          defaultPath: `${slug}-${todayStr()}.xlsx`,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        })
        if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }

        const XLSX = await import('xlsx')
        const wb = XLSX.utils.book_new()

        if (Array.isArray(data)) {
          if (data.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), reportName.slice(0, 31))
          }
        } else if (data && typeof data === 'object') {
          for (const [sheetName, sheetData] of Object.entries(data)) {
            if (Array.isArray(sheetData) && (sheetData as any[]).length > 0) {
              XLSX.utils.book_append_sheet(
                wb,
                XLSX.utils.json_to_sheet(sheetData as any[]),
                sheetName.slice(0, 31)
              )
            }
          }
        }

        if (wb.SheetNames.length === 0) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), 'Sheet1')
        }

        XLSX.writeFile(wb, result.filePath)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ── Email report via SMTP ──────────────────────────────────────────────────
  ipcMain.handle(
    'reports:email',
    async (
      _e,
      payload: { to: string; reportName: string; tableHtml: string }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const smtpRows = db
          .prepare(
            `SELECT key, value FROM app_settings
             WHERE key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure','smtp_enabled')`
          )
          .all() as { key: string; value: string }[]

        const s: Record<string, string> = {}
        for (const r of smtpRows) s[r.key] = r.value

        if (!s.smtp_host || s.smtp_enabled !== 'true') {
          return { success: false, error: 'SMTP is not configured. Enable it in Settings → Email Notifications.' }
        }

        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:900px;margin:0 auto;padding:32px 24px;background:#f8fafc;">
            <div style="background:#ffffff;border-radius:10px;padding:28px 32px;border:1px solid #e2e8f0;">
              <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;font-weight:700;">${payload.reportName}</h2>
              <p style="margin:0 0 24px;color:#64748b;font-size:13px;">Generated ${todayStr()}</p>
              ${payload.tableHtml}
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">Sent by Contract Manager</p>
            </div>
          </div>`

        const nodemailer = await import('nodemailer')
        const transporter = nodemailer.createTransport({
          host: s.smtp_host,
          port: parseInt(s.smtp_port || '587'),
          secure: s.smtp_secure === 'true',
          auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined
        } as any)

        await transporter.sendMail({
          from: s.smtp_from || s.smtp_user,
          to: payload.to,
          subject: `Report: ${payload.reportName} — ${todayStr()}`,
          html
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
