import { app } from 'electron'
import path from 'path'
import fs from 'fs'

/**
 * Lightweight config file stored alongside the local DB in userData.
 * Used for settings that must survive a DB switch — particularly the
 * network DB path itself and the auto-updater releases folder.
 *
 * Stored at: %APPDATA%/contract-manager/config.json
 */

interface LocalConfig {
  /** UNC or local path to the shared DB folder, e.g. "\\\\server\\share\\contracts" */
  db_network_path?: string
  /** UNC or local path to the releases folder for auto-update, e.g. "\\\\server\\share\\releases" */
  releases_path?: string
}

const CONFIG_FILENAME = 'config.json'

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILENAME)
}

export function readLocalConfig(): LocalConfig {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8')
    return JSON.parse(raw) as LocalConfig
  } catch {
    return {}
  }
}

export function writeLocalConfig(config: LocalConfig): void {
  const existing = readLocalConfig()
  const merged = { ...existing, ...config }
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf-8')
}

export function getConfigValue<K extends keyof LocalConfig>(key: K): LocalConfig[K] {
  return readLocalConfig()[key]
}

export function setConfigValue<K extends keyof LocalConfig>(key: K, value: LocalConfig[K]): void {
  writeLocalConfig({ [key]: value } as LocalConfig)
}
