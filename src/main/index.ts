import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { initDatabase, updateContractStatuses } from './database'
import { registerUserHandlers } from './ipc/users'
import { registerBudgetHandlers } from './ipc/budget'
import { registerContractHandlers } from './ipc/contracts'
import { registerInvoiceHandlers } from './ipc/invoices'
import { registerCompetitorHandlers } from './ipc/competitors'
import { registerProjectHandlers } from './ipc/projects'
import { registerNoteHandlers } from './ipc/notes'
import { registerSettingsHandlers } from './ipc/settings'
import { registerGmailHandlers } from './ipc/gmail'
import { registerImportHandlers } from './ipc/importContracts'
import { registerAssetHandlers } from './ipc/assets'
import { registerExportHandlers } from './ipc/exports'
import { registerContractCreationHandlers } from './ipc/contractCreation'
import { registerReportHandlers } from './ipc/reports'
import { registerObligationHandlers } from './ipc/obligations'
import { registerCustomFieldHandlers } from './ipc/customFields'
import { registerAuditHandlers } from './audit'
import { startScheduler, getUpcomingRenewals } from './scheduler'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#0f172a'
  })

  // Load app
  if (process.env.NODE_ENV === 'development' || process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
}

// Register custom protocol for serving local image files safely in the renderer
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-local', privileges: { secure: true, supportFetchAPI: true } }
])

app.whenReady().then(() => {
  // Serve local files via app-local:// (bypasses file:// cross-origin restriction)
  protocol.handle('app-local', (request) => {
    const filePath = decodeURIComponent(request.url.slice('app-local://'.length))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  // Init database (will use userData path by default)
  initDatabase()

  // Register all IPC handlers
  registerUserHandlers()
  registerBudgetHandlers()
  registerContractHandlers()
  registerInvoiceHandlers()
  registerCompetitorHandlers()
  registerProjectHandlers()
  registerNoteHandlers()
  registerSettingsHandlers()
  registerGmailHandlers()
  registerImportHandlers()
  registerAssetHandlers()
  registerExportHandlers()
  registerContractCreationHandlers()
  registerReportHandlers()
  registerObligationHandlers()
  registerCustomFieldHandlers()
  registerAuditHandlers()

  // IPC for getting upcoming renewals (used by renderer)
  ipcMain.handle('scheduler:upcomingRenewals', () => {
    return { success: true, data: getUpcomingRenewals() }
  })

  // Update contract statuses on startup
  updateContractStatuses()

  // Start the renewal reminder scheduler
  startScheduler()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
