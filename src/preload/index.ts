import { contextBridge, ipcRenderer } from 'electron'

// Expose all IPC channels to renderer via window.api
contextBridge.exposeInMainWorld('api', {
  // Users
  users: {
    login: (creds: any) => ipcRenderer.invoke('users:login', creds),
    list: () => ipcRenderer.invoke('users:list'),
    create: (payload: any) => ipcRenderer.invoke('users:create', payload),
    update: (payload: any) => ipcRenderer.invoke('users:update', payload),
    delete: (id: number) => ipcRenderer.invoke('users:delete', id),
    hasAdmin: () => ipcRenderer.invoke('users:hasAdmin')
  },

  // Departments & Budget
  departments: {
    list: () => ipcRenderer.invoke('departments:list'),
    create: (name: string) => ipcRenderer.invoke('departments:create', name),
    update: (payload: any) => ipcRenderer.invoke('departments:update', payload),
    delete: (id: number) => ipcRenderer.invoke('departments:delete', id)
  },
  branches: {
    list: () => ipcRenderer.invoke('branches:list'),
    create: (payload: any) => ipcRenderer.invoke('branches:create', payload),
    update: (payload: any) => ipcRenderer.invoke('branches:update', payload),
    delete: (id: number) => ipcRenderer.invoke('branches:delete', id)
  },
  budget: {
    list: () => ipcRenderer.invoke('budget:list'),
    upsert: (payload: any) => ipcRenderer.invoke('budget:upsert', payload),
    summaries: (fiscal_year: number, filter?: any) => ipcRenderer.invoke('budget:summaries', fiscal_year, filter)
  },

  // Contracts
  contracts: {
    list: (opts?: any) => ipcRenderer.invoke('contracts:list', opts),
    get: (id: number) => ipcRenderer.invoke('contracts:get', id),
    create: (payload: any) => ipcRenderer.invoke('contracts:create', payload),
    update: (payload: any) => ipcRenderer.invoke('contracts:update', payload),
    delete: (id: number) => ipcRenderer.invoke('contracts:delete', id),
    uploadFile: () => ipcRenderer.invoke('contracts:uploadFile')
  },
  lineItems: {
    list: (contract_id: number) => ipcRenderer.invoke('lineItems:list', contract_id),
    upsert: (items: any[]) => ipcRenderer.invoke('lineItems:upsert', items),
    delete: (id: number) => ipcRenderer.invoke('lineItems:delete', id)
  },
  renewals: {
    list: (contract_id: number) => ipcRenderer.invoke('renewals:list', contract_id),
    create: (payload: any) => ipcRenderer.invoke('renewals:create', payload)
  },

  // Invoices
  invoices: {
    list: (opts?: any) => ipcRenderer.invoke('invoices:list', opts),
    delete: (id: number) => ipcRenderer.invoke('invoices:delete', id),
    insert: (payload: any) => ipcRenderer.invoke('invoices:insert', payload)
  },

  // Competitors
  competitors: {
    list: (contract_id: number) => ipcRenderer.invoke('competitors:list', contract_id),
    create: (payload: any) => ipcRenderer.invoke('competitors:create', payload),
    delete: (id: number) => ipcRenderer.invoke('competitors:delete', id),
    pickFile: () => ipcRenderer.invoke('competitors:pickFile')
  },

  // Projects
  projects: {
    list: (opts?: any) => ipcRenderer.invoke('projects:list', opts),
    create: (payload: any) => ipcRenderer.invoke('projects:create', payload),
    update: (payload: any) => ipcRenderer.invoke('projects:update', payload),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id)
  },

  // Notes
  notes: {
    list: (contract_id: number) => ipcRenderer.invoke('notes:list', contract_id),
    create: (payload: any) => ipcRenderer.invoke('notes:create', payload),
    delete: (id: number) => ipcRenderer.invoke('notes:delete', id)
  },

  // Settings & Branding
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (payload: any) => ipcRenderer.invoke('settings:set', payload),
    uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),
    pickDbFolder: () => ipcRenderer.invoke('settings:pickDbFolder'),
    extractColors: (imagePath: string) => ipcRenderer.invoke('settings:extractColors', imagePath)
  },

  // Gmail
  gmail: {
    getAuthUrl: () => ipcRenderer.invoke('gmail:getAuthUrl'),
    connect: (code: string) => ipcRenderer.invoke('gmail:connect', code),
    disconnect: () => ipcRenderer.invoke('gmail:disconnect'),
    poll: () => ipcRenderer.invoke('gmail:poll'),
    openUrl: (url: string) => ipcRenderer.invoke('gmail:openUrl', url)
  },

  // Dashboard
  dashboard: {
    spendTrend: (opts: any) => ipcRenderer.invoke('dashboard:spendTrend', opts),
    upcomingRenewals: () => ipcRenderer.invoke('scheduler:upcomingRenewals')
  }
})
