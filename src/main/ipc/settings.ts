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

  // Extract brand colors from logo using Electron's nativeImage (no native module issues)
  ipcMain.handle('settings:extractColors', async (_e, imagePath: string): Promise<IpcResponse<{
    primary: string
    secondary: string
    palette: string[]
  }>> => {
    const defaults = {
      primary: '#2563eb',
      secondary: '#1e40af',
      palette: ['#2563eb', '#1e40af', '#3b82f6', '#93c5fd', '#eff6ff']
    }

    try {
      const fs = await import('fs')
      if (!fs.existsSync(imagePath)) {
        return { success: false, error: 'Image not found' }
      }

      const ext = path.extname(imagePath).toLowerCase()

      // SVG: parse hex color values directly from the XML
      if (ext === '.svg') {
        const text = fs.readFileSync(imagePath, 'utf8')
        const matches = text.match(/#([0-9a-fA-F]{6})\b/g) ?? []
        const seen = new Set<string>()
        const svgColors: string[] = []
        for (const hex of matches) {
          const normalized = hex.toLowerCase()
          const r = parseInt(normalized.slice(1, 3), 16)
          const g = parseInt(normalized.slice(3, 5), 16)
          const b = parseInt(normalized.slice(5, 7), 16)
          // Skip near-white, near-black, low-saturation (backgrounds/grays)
          if (r > 210 && g > 210 && b > 210) continue
          if (r < 30 && g < 30 && b < 30) continue
          const maxC = Math.max(r, g, b)
          const minC = Math.min(r, g, b)
          if (maxC === 0 || (maxC - minC) / maxC < 0.2) continue
          if (seen.has(normalized)) continue
          seen.add(normalized)
          svgColors.push(normalized)
        }
        if (svgColors.length >= 1) {
          return {
            success: true,
            data: {
              primary: svgColors[0],
              secondary: svgColors[1] ?? svgColors[0],
              palette: svgColors.slice(0, 5)
            }
          }
        }
        return { success: true, data: defaults }
      }

      // Raster images: use Electron's built-in nativeImage — no native module needed
      const { nativeImage } = await import('electron')
      const img = nativeImage.createFromPath(imagePath)
      if (img.isEmpty()) return { success: true, data: defaults }

      // Scale down to max 50px on longest side for fast pixel sampling
      const origSize = img.getSize()
      const scale = Math.min(1, 50 / Math.max(origSize.width, origSize.height))
      const small = img.resize({
        width: Math.max(1, Math.round(origSize.width * scale)),
        height: Math.max(1, Math.round(origSize.height * scale))
      })

      // toBitmap() returns raw pixels in BGRA order, 4 bytes per pixel
      const bitmap = small.toBitmap()
      const colorCounts = new Map<string, number>()

      for (let i = 0; i < bitmap.length; i += 4) {
        const b = bitmap[i]
        const g = bitmap[i + 1]
        const r = bitmap[i + 2]
        const a = bitmap[i + 3]
        if (a < 128) continue
        // Skip near-white and near-black by brightness
        if (r > 210 && g > 210 && b > 210) continue
        if (r < 30 && g < 30 && b < 30) continue
        // Skip low-saturation pixels (grays, off-whites, beiges — backgrounds)
        // Saturation in HSV = (max - min) / max; brand colors typically > 0.2
        const maxC = Math.max(r, g, b)
        const minC = Math.min(r, g, b)
        if (maxC === 0 || (maxC - minC) / maxC < 0.2) continue
        // Quantize to 32-step increments for color clustering
        const qr = Math.min(224, Math.round(r / 32) * 32)
        const qg = Math.min(224, Math.round(g / 32) * 32)
        const qb = Math.min(224, Math.round(b / 32) * 32)
        const hex = `#${qr.toString(16).padStart(2, '0')}${qg.toString(16).padStart(2, '0')}${qb.toString(16).padStart(2, '0')}`
        colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1)
      }

      const sorted = [...colorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([hex]) => hex)

      if (sorted.length === 0) return { success: true, data: defaults }

      return {
        success: true,
        data: {
          primary: sorted[0],
          secondary: sorted[1] ?? sorted[0],
          palette: sorted.slice(0, 5)
        }
      }
    } catch (err: any) {
      return { success: true, data: defaults }
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
