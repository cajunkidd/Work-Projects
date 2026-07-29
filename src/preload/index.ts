import { contextBridge, ipcRenderer } from 'electron'

// Expose all IPC channels to renderer via window.api
contextBridge.exposeInMainWorld('api', {
  // Users
  users: {
    login: (creds: any) => ipcRenderer.invoke('users:login', creds),
    list: () => ipcRenderer.invoke('users:list'),
    create: (payload: any) => ipcRenderer.invoke('users:create', payload),
    update: (payload: any) => ipcRenderer.invoke('users:update', payload),
    delete: (arg: any) => ipcRenderer.invoke('users:delete', arg),
    hasAdmin: () => ipcRenderer.invoke('users:hasAdmin')
  },

  // Departments & Budget
  departments: {
    list: () => ipcRenderer.invoke('departments:list'),
    create: (arg: any) => ipcRenderer.invoke('departments:create', arg),
    update: (payload: any) => ipcRenderer.invoke('departments:update', payload),
    delete: (arg: any) => ipcRenderer.invoke('departments:delete', arg)
  },
  branches: {
    list: () => ipcRenderer.invoke('branches:list'),
    create: (payload: any) => ipcRenderer.invoke('branches:create', payload),
    update: (payload: any) => ipcRenderer.invoke('branches:update', payload),
    delete: (arg: any) => ipcRenderer.invoke('branches:delete', arg)
  },
  budget: {
    list: () => ipcRenderer.invoke('budget:list'),
    upsert: (payload: any) => ipcRenderer.invoke('budget:upsert', payload),
    summaries: (fiscal_year: number, filter?: any) => ipcRenderer.invoke('budget:summaries', fiscal_year, filter),
    monthlyList: (opts: any) => ipcRenderer.invoke('monthlyBudget:list', opts),
    monthlyUpsert: (payload: any) => ipcRenderer.invoke('monthlyBudget:upsert', payload),
    monthlyBulkUpsert: (entries: any[], actor?: any) => ipcRenderer.invoke('monthlyBudget:bulkUpsert', entries, actor),
    monthlySummary: (opts: any) => ipcRenderer.invoke('monthlyBudget:summary', opts)
  },

  // Contracts
  contracts: {
    list: (opts?: any) => ipcRenderer.invoke('contracts:list', opts),
    get: (arg: number | { id: number; actor?: any }) => ipcRenderer.invoke('contracts:get', arg),
    create: (payload: any) => ipcRenderer.invoke('contracts:create', payload),
    update: (payload: any) => ipcRenderer.invoke('contracts:update', payload),
    delete: (arg: number | { id: number; actor?: any }) =>
      ipcRenderer.invoke('contracts:delete', arg),
    uploadFile: () => ipcRenderer.invoke('contracts:uploadFile'),
    parseImport: () => ipcRenderer.invoke('contracts:parseImport'),
    bulkCreate: (rows: any[], actor?: any) => ipcRenderer.invoke('contracts:bulkCreate', rows, actor)
  },
  lineItems: {
    list: (arg: any) => ipcRenderer.invoke('lineItems:list', arg),
    upsert: (items: any[], actor?: any) => ipcRenderer.invoke('lineItems:upsert', items, actor),
    delete: (arg: any) => ipcRenderer.invoke('lineItems:delete', arg)
  },
  renewals: {
    list: (arg: any) => ipcRenderer.invoke('renewals:list', arg),
    create: (payload: any) => ipcRenderer.invoke('renewals:create', payload)
  },

  // Invoices
  invoices: {
    list: (opts?: any) => ipcRenderer.invoke('invoices:list', opts),
    delete: (arg: any) => ipcRenderer.invoke('invoices:delete', arg),
    restore: (arg: any) => ipcRenderer.invoke('invoices:restore', arg),
    insert: (payload: any) => ipcRenderer.invoke('invoices:insert', payload)
  },

  // Competitors
  competitors: {
    list: (arg: any) => ipcRenderer.invoke('competitors:list', arg),
    create: (payload: any) => ipcRenderer.invoke('competitors:create', payload),
    delete: (arg: any) => ipcRenderer.invoke('competitors:delete', arg),
    pickFile: () => ipcRenderer.invoke('competitors:pickFile')
  },

  // Projects
  projects: {
    list: (opts?: any) => ipcRenderer.invoke('projects:list', opts),
    create: (payload: any) => ipcRenderer.invoke('projects:create', payload),
    update: (payload: any) => ipcRenderer.invoke('projects:update', payload),
    delete: (arg: any) => ipcRenderer.invoke('projects:delete', arg)
  },

  // Notes
  notes: {
    list: (arg: any) => ipcRenderer.invoke('notes:list', arg),
    create: (payload: any) => ipcRenderer.invoke('notes:create', payload),
    delete: (arg: any) => ipcRenderer.invoke('notes:delete', arg)
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

  // Credential encryption
  secrets: {
    status: () => ipcRenderer.invoke('secrets:status'),
    setPassphrase: (payload: any) => ipcRenderer.invoke('secrets:setPassphrase', payload),
    unlock: (payload: any) => ipcRenderer.invoke('secrets:unlock', payload),
    lock: (payload?: any) => ipcRenderer.invoke('secrets:lock', payload)
  },

  // Gmail
  gmail: {
    getAuthUrl: (opts?: any) => ipcRenderer.invoke('gmail:getAuthUrl', opts),
    connect: (arg: any) => ipcRenderer.invoke('gmail:connect', arg),
    disconnect: (opts?: any) => ipcRenderer.invoke('gmail:disconnect', opts),
    poll: (opts?: any) => ipcRenderer.invoke('gmail:poll', opts),
    openUrl: (url: string) => ipcRenderer.invoke('gmail:openUrl', url)
  },

  // Dashboard
  dashboard: {
    spendTrend: (opts: any) => ipcRenderer.invoke('dashboard:spendTrend', opts),
    upcomingRenewals: (opts?: any) => ipcRenderer.invoke('scheduler:upcomingRenewals', opts)
  },

  // IT Assets
  assets: {
    list: () => ipcRenderer.invoke('assets:list'),
    save: (rows: any[], actor?: any) => ipcRenderer.invoke('assets:save', rows, actor),
    importFile: () => ipcRenderer.invoke('assets:importFile')
  },

  // IT Contract Allocations
  allocations: {
    list: (arg: any) => ipcRenderer.invoke('allocations:list', arg),
    save: (contract_id: number, allocations: any[], actor?: any) =>
      ipcRenderer.invoke('allocations:save', contract_id, allocations, actor)
  },

  // Exports
  exports: {
    invoices: (data: any[]) => ipcRenderer.invoke('exports:invoices', data),
    contractsList: (data: any[]) => ipcRenderer.invoke('exports:contractsList', data),
    contractDetail: (payload: any) => ipcRenderer.invoke('exports:contractDetail', payload)
  },

  // Contract Creation & E-Signature
  contractCreation: {
    saveTemplate: (payload: any) => ipcRenderer.invoke('contractCreation:saveTemplate', payload),
    uploadTemplate: (payload?: any) => ipcRenderer.invoke('contractCreation:uploadTemplate', payload),
    listTemplates: () => ipcRenderer.invoke('contractCreation:listTemplates'),
    deleteTemplate: (arg: any) => ipcRenderer.invoke('contractCreation:deleteTemplate', arg),
    generatePdf: (html: string, title: string) => ipcRenderer.invoke('contractCreation:generatePdf', html, title),
    send: (payload: any) => ipcRenderer.invoke('contractCreation:send', payload),
    listRequests: () => ipcRenderer.invoke('contractCreation:listRequests'),
    refreshStatus: (requestId: number) => ipcRenderer.invoke('contractCreation:refreshStatus', requestId),
    testDocumenso: () => ipcRenderer.invoke('contractCreation:testDocumenso')
  },

  // Audit Trail
  audit: {
    list: (filter?: any) => ipcRenderer.invoke('audit:list', filter),
    entityHistory: (opts: any) => ipcRenderer.invoke('audit:entityHistory', opts),
    actors: (opts?: any) => ipcRenderer.invoke('audit:actors', opts),
    stats: (opts?: any) => ipcRenderer.invoke('audit:stats', opts)
  },

  // Approval Workflows
  approvalRules: {
    list: () => ipcRenderer.invoke('approvalRules:list'),
    create: (payload: any) => ipcRenderer.invoke('approvalRules:create', payload),
    update: (payload: any) => ipcRenderer.invoke('approvalRules:update', payload),
    delete: (payload: any) => ipcRenderer.invoke('approvalRules:delete', payload)
  },
  approvals: {
    preview: (contract_id: number) => ipcRenderer.invoke('approvals:preview', contract_id),
    submit: (payload: any) => ipcRenderer.invoke('approvals:submit', payload),
    decide: (payload: any) => ipcRenderer.invoke('approvals:decide', payload),
    cancel: (payload: any) => ipcRenderer.invoke('approvals:cancel', payload),
    forContract: (contract_id: number) => ipcRenderer.invoke('approvals:forContract', contract_id),
    inbox: (opts: any) => ipcRenderer.invoke('approvals:inbox', opts),
    inboxCount: (opts: any) => ipcRenderer.invoke('approvals:inboxCount', opts)
  },

  // Contract Versions & Redlining
  versions: {
    list: (arg: any) => ipcRenderer.invoke('versions:list', arg),
    get: (arg: any) => ipcRenderer.invoke('versions:get', arg),
    create: (payload: any) => ipcRenderer.invoke('versions:create', payload),
    importFile: () => ipcRenderer.invoke('versions:importFile'),
    diff: (opts: any) => ipcRenderer.invoke('versions:diff', opts),
    restore: (payload: any) => ipcRenderer.invoke('versions:restore', payload),
    delete: (payload: any) => ipcRenderer.invoke('versions:delete', payload)
  },

  // Clause Library
  clauses: {
    list: (filter?: any) => ipcRenderer.invoke('clauses:list', filter),
    get: (id: number) => ipcRenderer.invoke('clauses:get', id),
    create: (payload: any) => ipcRenderer.invoke('clauses:create', payload),
    update: (payload: any) => ipcRenderer.invoke('clauses:update', payload),
    archive: (payload: any) => ipcRenderer.invoke('clauses:archive', payload),
    delete: (payload: any) => ipcRenderer.invoke('clauses:delete', payload),
    categories: () => ipcRenderer.invoke('clauses:categories'),
    recordUsage: (id: number) => ipcRenderer.invoke('clauses:recordUsage', id)
  },

  // Vendors
  vendors: {
    list: (opts?: any) => ipcRenderer.invoke('vendors:list', opts),
    get: (id: number) => ipcRenderer.invoke('vendors:get', id),
    create: (payload: any) => ipcRenderer.invoke('vendors:create', payload),
    update: (payload: any) => ipcRenderer.invoke('vendors:update', payload),
    delete: (payload: any) => ipcRenderer.invoke('vendors:delete', payload),
    merge: (payload: any) => ipcRenderer.invoke('vendors:merge', payload),
    findDuplicates: () => ipcRenderer.invoke('vendors:findDuplicates'),
    createContact: (payload: any) => ipcRenderer.invoke('vendorContacts:create', payload),
    deleteContact: (id: number) => ipcRenderer.invoke('vendorContacts:delete', id)
  },

  // Documents & full-text search
  documents: {
    upload: (payload: any) => ipcRenderer.invoke('documents:upload', payload),
    list: (opts?: any) => ipcRenderer.invoke('documents:list', opts),
    get: (arg: any) => ipcRenderer.invoke('documents:get', arg),
    search: (opts: any) => ipcRenderer.invoke('documents:search', opts),
    indexStats: () => ipcRenderer.invoke('documents:indexStats'),
    open: (arg: any) => ipcRenderer.invoke('documents:open', arg),
    saveAs: (arg: any) => ipcRenderer.invoke('documents:saveAs', arg),
    update: (payload: any) => ipcRenderer.invoke('documents:update', payload),
    delete: (payload: any) => ipcRenderer.invoke('documents:delete', payload),
    reindex: (arg: any) => ipcRenderer.invoke('documents:reindex', arg)
  },

  // Obligations & milestones
  obligations: {
    list: (filter?: any) => ipcRenderer.invoke('obligations:list', filter),
    create: (payload: any) => ipcRenderer.invoke('obligations:create', payload),
    update: (payload: any) => ipcRenderer.invoke('obligations:update', payload),
    complete: (payload: any) => ipcRenderer.invoke('obligations:complete', payload),
    delete: (payload: any) => ipcRenderer.invoke('obligations:delete', payload),
    stats: (opts?: any) => ipcRenderer.invoke('obligations:stats', opts)
  },

  // AI extraction
  ai: {
    settings: () => ipcRenderer.invoke('ai:settings'),
    test: (opts?: any) => ipcRenderer.invoke('ai:test', opts),
    defaults: () => ipcRenderer.invoke('ai:defaults')
  },
  extraction: {
    run: (payload: any) => ipcRenderer.invoke('extraction:run', payload),
    history: (opts?: any) => ipcRenderer.invoke('extraction:history', opts),
    apply: (payload: any) => ipcRenderer.invoke('extraction:apply', payload)
  },

  // Integrations
  calendar: {
    export: (options: any) => ipcRenderer.invoke('calendar:export', options),
    preview: (options: any) => ipcRenderer.invoke('calendar:preview', options)
  },
  webhooks: {
    list: () => ipcRenderer.invoke('webhooks:list'),
    create: (payload: any) => ipcRenderer.invoke('webhooks:create', payload),
    update: (payload: any) => ipcRenderer.invoke('webhooks:update', payload),
    delete: (payload: any) => ipcRenderer.invoke('webhooks:delete', payload),
    test: (id: number) => ipcRenderer.invoke('webhooks:test', id),
    deliveries: (webhook_id: number) => ipcRenderer.invoke('webhooks:deliveries', webhook_id)
  }
})
