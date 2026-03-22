import { ipcMain, dialog } from 'electron'
import path from 'path'
import { getDb, switchDatabase } from '../database'
import type { IpcResponse, AppSettings } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async (): Promise<IpcResponse<AppSettings>> => {
    try {
      const rows = getDb().prepare('SELECT key, value FROM app_settings').all() as {
        key: string
        value: string
      }[]
      const settings: AppSettings = {}
      for (const row of rows) {
        ;(settings as any)[row.key] = row.value
      }
      return { success: true, data: settings }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'settings:set',
    async (_e, payload: Partial<AppSettings>): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const stmt = db.prepare(
          'INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )
        const tx = db.transaction((obj: Partial<AppSettings>) => {
          for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) stmt.run(key, value)
          }
        })
        tx(payload)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Logo upload dialog
  ipcMain.handle('settings:uploadLogo', async (): Promise<IpcResponse<string>> => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No file selected' }
      }
      return { success: true, data: result.filePaths[0] }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Pick network DB folder
  ipcMain.handle('settings:pickDbFolder', async (): Promise<IpcResponse<string>> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No folder selected' }
      }
      const folderPath = result.filePaths[0]
      // Switch database
      switchDatabase(folderPath)
      return { success: true, data: folderPath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Extract brand colors from logo using PNG pixel sampling
  ipcMain.handle('settings:extractColors', async (_e, imagePath: string): Promise<IpcResponse<{
    primary: string
    secondary: string
    palette: string[]
  }>> => {
    try {
      const fs = await import('fs')
      if (!fs.existsSync(imagePath)) {
        return { success: false, error: 'Image not found' }
      }

      // For SVG or unsupported formats, return defaults
      const ext = path.extname(imagePath).toLowerCase()
      if (ext === '.svg') {
        return {
          success: true,
          data: {
            primary: '#2563eb',
            secondary: '#1e40af',
            palette: ['#2563eb', '#1e40af', '#3b82f6', '#93c5fd', '#eff6ff']
          }
        }
      }

      // Use PNG/raw pixel approach via the 'sharp' package if available,
      // otherwise fall back to a sensible default palette.
      const sharp = await import('sharp').catch(() => null)
      if (!sharp) {
        return {
          success: true,
          data: {
            primary: '#2563eb',
            secondary: '#1e40af',
            palette: ['#2563eb', '#1e40af', '#3b82f6', '#93c5fd', '#eff6ff']
          }
        }
      }

      const { data, info } = await sharp.default(imagePath)
        .resize(50, 50, { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true })

      const channels = info.channels // 3 = RGB, 4 = RGBA
      const colorCounts: Map<string, number> = new Map()

      for (let i = 0; i < data.length; i += channels) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = channels === 4 ? data[i + 3] : 255
        if (a < 128) continue // skip transparent
        // Skip near-white and near-black
        if (r > 230 && g > 230 && b > 230) continue
        if (r < 25 && g < 25 && b < 25) continue
        // Quantize (capped at 255 to prevent invalid hex like #100xxxx)
        const qr = Math.min(255, Math.round(r / 32) * 32)
        const qg = Math.min(255, Math.round(g / 32) * 32)
        const qb = Math.min(255, Math.round(b / 32) * 32)
        const hex = `#${qr.toString(16).padStart(2, '0')}${qg.toString(16).padStart(2, '0')}${qb.toString(16).padStart(2, '0')}`
        colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1)
      }

      const sorted = [...colorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([hex]) => hex)

      const primary = sorted[0] || '#2563eb'
      const secondary = sorted[1] || '#1e40af'
      const palette = sorted.slice(0, 5).length > 0 ? sorted.slice(0, 5) : ['#2563eb', '#1e40af', '#3b82f6', '#93c5fd', '#eff6ff']

      return { success: true, data: { primary, secondary, palette } }
    } catch (err: any) {
      // Color extraction is non-critical — return a default palette
      return {
        success: true,
        data: {
          primary: '#2563eb',
          secondary: '#1e40af',
          palette: ['#2563eb', '#1e40af', '#3b82f6', '#93c5fd', '#eff6ff']
        }
      }
    }
  })

  // Dashboard spend trend data
  ipcMain.handle(
    'dashboard:spendTrend',
    async (_e, opts: { fiscal_year: number; department_id?: number }): Promise<IpcResponse<{ month: string; amount: number }[]>> => {
      try {
        const db = getDb()
        let query = `
          SELECT
            strftime('%Y-%m', start_date) as month,
            SUM(monthly_cost) as amount
          FROM contracts
          WHERE strftime('%Y', start_date) = ?
          AND status != 'expired'
        `
        const params: (string | number)[] = [String(opts.fiscal_year)]
        if (opts.department_id) {
          query += ' AND department_id = ?'
          params.push(opts.department_id)
        }
        query += " GROUP BY month ORDER BY month"
        const rows = db.prepare(query).all(...params) as { month: string; amount: number }[]
        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
