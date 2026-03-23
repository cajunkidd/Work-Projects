import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import type { IpcResponse } from '../../shared/types'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function registerExportHandlers(): void {
  // ── Export Invoices List ────────────────────────────────────────────────────
  ipcMain.handle('exports:invoices', async (_e, invoices: any[]): Promise<IpcResponse<void>> => {
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: `invoices-${todayStr()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      })
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }

      const XLSX = await import('xlsx')
      const rows = invoices.map((inv) => {
        const amount = Number(inv.amount) || 0
        const budgeted = Number(inv.budgeted_amount) || 0
        const variance = amount - budgeted
        return {
          Date: inv.received_date ?? '',
          Vendor: inv.vendor_name ?? '',
          Subject: inv.subject ?? '',
          Sender: inv.sender ?? '',
          Amount: amount,
          'Budgeted Amount': budgeted,
          Variance: variance
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      // Format currency columns
      const currencyCols = ['E', 'F', 'G']
      for (const col of currencyCols) {
        for (let r = 2; r <= rows.length + 1; r++) {
          const cell = ws[`${col}${r}`]
          if (cell) cell.z = '"$"#,##0.00'
        }
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
      XLSX.writeFile(wb, result.filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Export Contracts List ──────────────────────────────────────────────────
  ipcMain.handle('exports:contractsList', async (_e, contracts: any[]): Promise<IpcResponse<void>> => {
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: `contracts-${todayStr()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      })
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }

      const XLSX = await import('xlsx')
      const rows = contracts.map((c) => ({
        Vendor: c.vendor_name ?? '',
        Status: c.status ?? '',
        Department: c.department_name ?? '',
        Branch: c.branch_name ?? '',
        'Start Date': c.start_date ?? '',
        'End Date': c.end_date ?? '',
        'Monthly Cost': Number(c.monthly_cost) || 0,
        'Annual Cost': Number(c.annual_cost) || 0,
        'Total Cost': Number(c.total_cost) || 0,
        'POC Name': c.poc_name ?? '',
        'POC Email': c.poc_email ?? '',
        'POC Phone': c.poc_phone ?? ''
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const currencyCols = ['G', 'H', 'I']
      for (const col of currencyCols) {
        for (let r = 2; r <= rows.length + 1; r++) {
          const cell = ws[`${col}${r}`]
          if (cell) cell.z = '"$"#,##0.00'
        }
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Contracts')
      XLSX.writeFile(wb, result.filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Export Single Contract Full Detail ─────────────────────────────────────
  ipcMain.handle(
    'exports:contractDetail',
    async (_e, payload: {
      contract: any
      lineItems: any[]
      renewals: any[]
      notes: any[]
      projects: any[]
      competitors: any[]
      allocations: any[]
    }): Promise<IpcResponse<void>> => {
      try {
        const { contract, lineItems, renewals, notes, projects, competitors, allocations } = payload
        const slug = slugify(contract.vendor_name ?? 'contract')
        const result = await dialog.showSaveDialog({
          defaultPath: `${slug}-${todayStr()}.xlsx`,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        })
        if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }

        const XLSX = await import('xlsx')
        const wb = XLSX.utils.book_new()

        // Sheet 1: Overview
        const overview = [
          { Field: 'Vendor', Value: contract.vendor_name ?? '' },
          { Field: 'Status', Value: contract.status ?? '' },
          { Field: 'Department', Value: contract.department_name ?? '' },
          { Field: 'Branch', Value: contract.branch_name ?? '' },
          { Field: 'Start Date', Value: contract.start_date ?? '' },
          { Field: 'End Date', Value: contract.end_date ?? '' },
          { Field: 'Monthly Cost', Value: Number(contract.monthly_cost) || 0 },
          { Field: 'Annual Cost', Value: Number(contract.annual_cost) || 0 },
          { Field: 'Total Contract Value', Value: Number(contract.total_cost) || 0 },
          { Field: 'POC Name', Value: contract.poc_name ?? '' },
          { Field: 'POC Email', Value: contract.poc_email ?? '' },
          { Field: 'POC Phone', Value: contract.poc_phone ?? '' },
          { Field: 'Created', Value: contract.created_at ?? '' }
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), 'Overview')

        // Sheet 2: Line Items (skip if empty)
        if (lineItems.length > 0) {
          const rows = lineItems.map((li) => ({
            Description: li.description ?? '',
            Quantity: Number(li.quantity) || 0,
            'Unit Price': Number(li.unit_price) || 0,
            'Total Price': Number(li.total_price) || 0
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Line Items')
        }

        // Sheet 3: Renewals (skip if empty)
        if (renewals.length > 0) {
          const rows = renewals.map((r) => ({
            Date: r.renewal_date ?? '',
            'Previous Cost': Number(r.prev_cost) || 0,
            'New Cost': Number(r.new_cost) || 0,
            'License Change': Number(r.license_count_change) || 0,
            Reason: r.reason ?? ''
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Renewals')
        }

        // Sheet 4: Notes (skip if empty)
        if (notes.length > 0) {
          const rows = notes.map((n) => ({
            'Created By': n.created_by ?? '',
            Date: n.created_at ?? '',
            Note: n.note ?? ''
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Notes')
        }

        // Sheet 5: Projects (skip if empty)
        if (projects.length > 0) {
          const rows = projects.map((p) => ({
            Name: p.name ?? '',
            Status: p.status ?? '',
            'Start Date': p.start_date ?? '',
            'End Date': p.end_date ?? '',
            Description: p.description ?? ''
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Projects')
        }

        // Sheet 6: Competitors (skip if empty)
        if (competitors.length > 0) {
          const rows = competitors.map((c) => ({
            Competitor: c.competitor_vendor ?? '',
            Offering: c.offering_name ?? '',
            Price: Number(c.price) || 0,
            Notes: c.notes ?? ''
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Competitors')
        }

        // Sheet 7: Allocations (skip if empty)
        if (allocations.length > 0) {
          const annualCost = Number(contract.annual_cost) || 0
          const rows = allocations.map((a) => {
            const recipient = a.branch_id !== null
              ? `#${a.branch_number ?? ''} – ${a.branch_name ?? ''}`
              : (a.department_name ?? '')
            const computedAmount = a.allocation_type === 'percentage'
              ? annualCost * Number(a.value) / 100
              : Number(a.value)
            return {
              Recipient: recipient,
              Type: a.allocation_type === 'percentage' ? 'Percentage' : 'Fixed',
              'Allocation Value': a.allocation_type === 'percentage'
                ? `${Number(a.value).toFixed(2)}%`
                : Number(a.value),
              'Computed Annual Amount': computedAmount
            }
          })
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Allocations')
        }

        XLSX.writeFile(wb, result.filePath)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
