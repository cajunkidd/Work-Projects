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
    summaries: (fiscal_year: number, filter?: any) => ipcRenderer.invoke('budget:summaries', fiscal_year, filter),
    uploadFile: () => ipcRenderer.invoke('budget:uploadFile')
  },

  // Contracts
  contracts: {
    list: (opts?: any) => ipcRenderer.invoke('contracts:list', opts),
    get: (id: number, opts?: any) => ipcRenderer.invoke('contracts:get', id, opts),
    create: (payload: any) => ipcRenderer.invoke('contracts:create', payload),
    update: (payload: any) => ipcRenderer.invoke('contracts:update', payload),
    delete: (id: number) => ipcRenderer.invoke('contracts:delete', id),
    uploadFile: () => ipcRenderer.invoke('contracts:uploadFile'),
    parseImport: () => ipcRenderer.invoke('contracts:parseImport'),
    bulkCreate: (rows: any[]) => ipcRenderer.invoke('contracts:bulkCreate', rows),
    searchFullText: (opts: any) => ipcRenderer.invoke('contracts:searchFullText', opts),
    reextractText: (id: number) => ipcRenderer.invoke('contracts:reextractText', id)
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

  // Obligations
  obligations: {
    list: (contract_id: number) => ipcRenderer.invoke('obligations:list', contract_id),
    create: (payload: any) => ipcRenderer.invoke('obligations:create', payload),
    update: (payload: any) => ipcRenderer.invoke('obligations:update', payload),
    complete: (id: number) => ipcRenderer.invoke('obligations:complete', id),
    delete: (id: number) => ipcRenderer.invoke('obligations:delete', id),
    upcoming: (opts?: any) => ipcRenderer.invoke('obligations:upcoming', opts)
  },

  // Audit log
  audit: {
    setActor: (actor: any) => ipcRenderer.invoke('audit:setActor', actor),
    entity: (payload: any) => ipcRenderer.invoke('audit:entity', payload),
    recent: (limit?: number) => ipcRenderer.invoke('audit:recent', limit)
  },

  // Custom fields + tags
  customFields: {
    list: (entity_type?: string) => ipcRenderer.invoke('customFields:list', entity_type),
    create: (payload: any) => ipcRenderer.invoke('customFields:create', payload),
    update: (payload: any) => ipcRenderer.invoke('customFields:update', payload),
    delete: (id: number) => ipcRenderer.invoke('customFields:delete', id),
    values: (payload: any) => ipcRenderer.invoke('customFields:values', payload),
    setValue: (payload: any) => ipcRenderer.invoke('customFields:setValue', payload)
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (payload: any) => ipcRenderer.invoke('tags:create', payload),
    update: (payload: any) => ipcRenderer.invoke('tags:update', payload),
    delete: (id: number) => ipcRenderer.invoke('tags:delete', id),
    forEntity: (payload: any) => ipcRenderer.invoke('tags:forEntity', payload),
    attach: (payload: any) => ipcRenderer.invoke('tags:attach', payload),
    detach: (payload: any) => ipcRenderer.invoke('tags:detach', payload),
    bulkAttach: (payload: any) => ipcRenderer.invoke('tags:bulkAttach', payload)
  },

  // Approval workflow
  approvals: {
    create: (payload: any) => ipcRenderer.invoke('approvals:create', payload),
    decide: (payload: any) => ipcRenderer.invoke('approvals:decide', payload),
    cancel: (payload: any) => ipcRenderer.invoke('approvals:cancel', payload),
    forContract: (contract_id: number) => ipcRenderer.invoke('approvals:forContract', contract_id),
    myQueue: (user_id: number) => ipcRenderer.invoke('approvals:myQueue', user_id)
  },

  // AI (Anthropic) — clause extraction, connectivity test
  ai: {
    testConnection: () => ipcRenderer.invoke('ai:testConnection'),
    extractClauses: (contract_id: number) => ipcRenderer.invoke('ai:extractClauses', contract_id),
    getClauses: (contract_id: number) => ipcRenderer.invoke('ai:getClauses', contract_id)
  },

  // Clause library
  clauses: {
    list: (category?: string) => ipcRenderer.invoke('clauses:list', category),
    create: (payload: any) => ipcRenderer.invoke('clauses:create', payload),
    update: (payload: any) => ipcRenderer.invoke('clauses:update', payload),
    delete: (id: number) => ipcRenderer.invoke('clauses:delete', id)
  },

  // Settings & Branding
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (payload: any) => ipcRenderer.invoke('settings:set', payload),
    uploadLogo: () => ipcRenderer.invoke('settings:uploadLogo'),
    pickDbFolder: () => ipcRenderer.invoke('settings:pickDbFolder'),
    extractColors: (imagePath: string) => ipcRenderer.invoke('settings:extractColors', imagePath),
    testEmail: (toEmail: string) => ipcRenderer.invoke('settings:testEmail', toEmail)
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
    upcomingRenewals: () => ipcRenderer.invoke('scheduler:upcomingRenewals'),
    savingsTotal: (fiscal_year: number) => ipcRenderer.invoke('dashboard:savingsTotal', fiscal_year)
  },

  // IT Assets
  assets: {
    list: () => ipcRenderer.invoke('assets:list'),
    save: (rows: any[]) => ipcRenderer.invoke('assets:save', rows),
    importFile: () => ipcRenderer.invoke('assets:importFile')
  },

  // IT Contract Allocations
  allocations: {
    list: (contract_id: number) => ipcRenderer.invoke('allocations:list', contract_id),
    save: (contract_id: number, allocations: any[]) =>
      ipcRenderer.invoke('allocations:save', contract_id, allocations)
  },

  // Exports
  exports: {
    invoices: (data: any[]) => ipcRenderer.invoke('exports:invoices', data),
    contractsList: (data: any[]) => ipcRenderer.invoke('exports:contractsList', data),
    contractDetail: (payload: any) => ipcRenderer.invoke('exports:contractDetail', payload)
  },

  // Reports
  reports: {
    overview: () => ipcRenderer.invoke('reports:overview'),
    vendorSpend: () => ipcRenderer.invoke('reports:vendorSpend'),
    monthlyTrend: () => ipcRenderer.invoke('reports:monthlyTrend'),
    renewals: () => ipcRenderer.invoke('reports:renewals'),
    budgetVsActual: (fiscal_year: number) => ipcRenderer.invoke('reports:budgetVsActual', fiscal_year),
    invoiceSummary: () => ipcRenderer.invoke('reports:invoiceSummary'),
    spendByDept: () => ipcRenderer.invoke('reports:spendByDept'),
    spendByBranch: () => ipcRenderer.invoke('reports:spendByBranch'),
    contractList: () => ipcRenderer.invoke('reports:contractList'),
    export: (payload: any) => ipcRenderer.invoke('reports:export', payload),
    email: (payload: any) => ipcRenderer.invoke('reports:email', payload)
  },

  // Auto-updater
  updater: {
    getReleasesPath: () => ipcRenderer.invoke('updater:getReleasesPath'),
    setReleasesPath: () => ipcRenderer.invoke('updater:setReleasesPath'),
    checkNow: () => ipcRenderer.invoke('updater:checkNow')
  },

  // Contract Creation & E-Signature
  contractCreation: {
    saveTemplate: (payload: any) => ipcRenderer.invoke('contractCreation:saveTemplate', payload),
    uploadTemplate: (payload?: any) => ipcRenderer.invoke('contractCreation:uploadTemplate', payload),
    listTemplates: () => ipcRenderer.invoke('contractCreation:listTemplates'),
    deleteTemplate: (id: number) => ipcRenderer.invoke('contractCreation:deleteTemplate', id),
    generatePdf: (html: string, title: string) => ipcRenderer.invoke('contractCreation:generatePdf', html, title),
    send: (payload: any) => ipcRenderer.invoke('contractCreation:send', payload),
    listRequests: () => ipcRenderer.invoke('contractCreation:listRequests'),
    refreshStatus: (requestId: number) => ipcRenderer.invoke('contractCreation:refreshStatus', requestId),
    testDocumenso: () => ipcRenderer.invoke('contractCreation:testDocumenso')
  }
})
