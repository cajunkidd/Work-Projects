import { app, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getConfigValue, setConfigValue } from './localConfig'

/**
 * Lightweight auto-updater that checks a network share (UNC path) for a
 * `latest.json` file. If the version in the file is newer than the running
 * app, the user is prompted to open the installer.
 *
 * Expected layout on the share:
 *   \\server\share\releases\
 *     latest.json          ← { "version": "1.2.0", "file": "Contract Manager Setup 1.2.0.exe" }
 *     Contract Manager Setup 1.2.0.exe
 *
 * The releases path is stored in config.json (same mechanism as db_network_path).
 */

interface LatestRelease {
  version: string
  file: string
  notes?: string
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

export async function checkForUpdates(): Promise<void> {
  try {
    const releasesPath = getConfigValue('releases_path')
    if (!releasesPath) return // No releases path configured — skip silently

    const latestJsonPath = path.join(releasesPath, 'latest.json')
    if (!fs.existsSync(latestJsonPath)) {
      console.log('[updater] No latest.json found at', latestJsonPath)
      return
    }

    const raw = fs.readFileSync(latestJsonPath, 'utf-8')
    const latest: LatestRelease = JSON.parse(raw)

    const currentVersion = app.getVersion()
    if (compareVersions(currentVersion, latest.version) >= 0) {
      console.log(`[updater] Up to date (current: ${currentVersion}, latest: ${latest.version})`)
      return
    }

    const installerPath = path.join(releasesPath, latest.file)
    if (!fs.existsSync(installerPath)) {
      console.log('[updater] Installer file not found:', installerPath)
      return
    }

    const notes = latest.notes ? `\n\nRelease notes:\n${latest.notes}` : ''
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version of Contract Manager is available.\n\nCurrent: v${currentVersion}\nLatest: v${latest.version}${notes}`,
      buttons: ['Install Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    })

    if (result.response === 0) {
      // Open the installer and quit so it can replace the running exe
      shell.openPath(installerPath)
      setTimeout(() => app.quit(), 1000)
    }
  } catch (err) {
    console.error('[updater] Check failed:', err)
  }
}

/**
 * IPC handlers for the updater settings UI.
 */
export function registerUpdaterHandlers(): void {
  const { ipcMain } = require('electron')

  ipcMain.handle(
    'updater:getReleasesPath',
    async (): Promise<{ success: boolean; data?: string }> => {
      return { success: true, data: getConfigValue('releases_path') || '' }
    }
  )

  ipcMain.handle(
    'updater:setReleasesPath',
    async (): Promise<{ success: boolean; data?: string; error?: string }> => {
      try {
        const { dialog: dlg } = require('electron')
        const result = await dlg.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select the releases folder on your network share'
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: 'No folder selected' }
        }
        const folderPath = result.filePaths[0]
        setConfigValue('releases_path', folderPath)
        return { success: true, data: folderPath }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'updater:checkNow',
    async (): Promise<{ success: boolean; error?: string }> => {
      try {
        await checkForUpdates()
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
