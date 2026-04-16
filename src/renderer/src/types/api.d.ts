// Type declarations for window.api (exposed via preload)
import type {
  User,
  LoginCredentials,
  Department,
  Branch,
  Budget,
  BudgetSummary,
  Contract,
  ContractAllocation,
  ContractLineItem,
  RenewalHistory,
  CompetitorOffering,
  Invoice,
  VendorProject,
  VendorNote,
  AppSettings,
  IpcResponse
} from '../../../shared/types'

declare global {
  interface Window {
    api: {
      users: {
        login: (creds: LoginCredentials) => Promise<IpcResponse<User>>
        list: () => Promise<IpcResponse<User[]>>
        create: (payload: any) => Promise<IpcResponse<User>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
        hasAdmin: () => Promise<IpcResponse<boolean>>
      }
      departments: {
        list: () => Promise<IpcResponse<Department[]>>
        create: (name: string) => Promise<IpcResponse<Department>>
        update: (payload: { id: number; name: string }) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
      }
      branches: {
        list: () => Promise<IpcResponse<Branch[]>>
        create: (payload: { number: number; name: string }) => Promise<IpcResponse<Branch>>
        update: (payload: { id: number; number?: number; name?: string }) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
      }
      budget: {
        list: () => Promise<IpcResponse<Budget[]>>
        upsert: (payload: any) => Promise<IpcResponse<void>>
        summaries: (fiscal_year: number, filter?: { role: string; department_ids: number[]; branch_ids: number[] }) => Promise<IpcResponse<BudgetSummary[]>>
        uploadFile: () => Promise<IpcResponse<any>>
      }
      contracts: {
        list: (opts?: any) => Promise<IpcResponse<Contract[]>>
        get: (id: number) => Promise<IpcResponse<Contract>>
        create: (payload: any) => Promise<IpcResponse<Contract>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
        uploadFile: () => Promise<IpcResponse<any>>
        parseImport: () => Promise<IpcResponse<any[]>>
        bulkCreate: (rows: any[]) => Promise<IpcResponse<any>>
        searchFullText: (opts: any) => Promise<IpcResponse<(Contract & { snippet: string })[]>>
        reextractText: (id: number) => Promise<IpcResponse<{ length: number }>>
      }
      contractCreation: {
        saveTemplate: (payload: any) => Promise<IpcResponse<any>>
        uploadTemplate: (payload?: any) => Promise<IpcResponse<any>>
        listTemplates: () => Promise<IpcResponse<any[]>>
        deleteTemplate: (id: number) => Promise<IpcResponse<void>>
        generatePdf: (html: string, title: string) => Promise<IpcResponse<any>>
        send: (payload: any) => Promise<IpcResponse<any>>
        listRequests: () => Promise<IpcResponse<any[]>>
        refreshStatus: (requestId: number) => Promise<IpcResponse<any>>
        testDocumenso: () => Promise<IpcResponse<any>>
      }
      obligations: {
        list: (contract_id: number) => Promise<IpcResponse<any[]>>
        create: (payload: any) => Promise<IpcResponse<any>>
        update: (payload: any) => Promise<IpcResponse<void>>
        complete: (id: number) => Promise<IpcResponse<any | null>>
        delete: (id: number) => Promise<IpcResponse<void>>
        upcoming: (opts?: any) => Promise<IpcResponse<any[]>>
      }
      audit: {
        setActor: (actor: { user_id: number; user_name: string } | null) => Promise<IpcResponse<void>>
        entity: (payload: { entity_type: string; entity_id: number; limit?: number }) => Promise<IpcResponse<any[]>>
        recent: (limit?: number) => Promise<IpcResponse<any[]>>
      }
      customFields: {
        list: (entity_type?: string) => Promise<IpcResponse<any[]>>
        create: (payload: any) => Promise<IpcResponse<any>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
        values: (payload: any) => Promise<IpcResponse<any[]>>
        setValue: (payload: any) => Promise<IpcResponse<void>>
      }
      tags: {
        list: () => Promise<IpcResponse<any[]>>
        create: (payload: any) => Promise<IpcResponse<any>>
        delete: (id: number) => Promise<IpcResponse<void>>
        forEntity: (payload: any) => Promise<IpcResponse<any[]>>
        attach: (payload: any) => Promise<IpcResponse<void>>
        detach: (payload: any) => Promise<IpcResponse<void>>
      }
      approvals: {
        create: (payload: any) => Promise<IpcResponse<any>>
        decide: (payload: any) => Promise<IpcResponse<any>>
        cancel: (payload: any) => Promise<IpcResponse<void>>
        forContract: (contract_id: number) => Promise<IpcResponse<any[]>>
        myQueue: (user_id: number) => Promise<IpcResponse<any[]>>
      }
      ai: {
        testConnection: () => Promise<IpcResponse<any>>
        extractClauses: (contract_id: number) => Promise<IpcResponse<any>>
        getClauses: (contract_id: number) => Promise<IpcResponse<any>>
      }
      clauses: {
        list: (category?: string) => Promise<IpcResponse<any[]>>
        create: (payload: any) => Promise<IpcResponse<any>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
      }
      lineItems: {
        list: (contract_id: number) => Promise<IpcResponse<ContractLineItem[]>>
        upsert: (items: ContractLineItem[]) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
      }
      renewals: {
        list: (contract_id: number) => Promise<IpcResponse<RenewalHistory[]>>
        create: (payload: any) => Promise<IpcResponse<RenewalHistory>>
      }
      invoices: {
        list: (opts?: any) => Promise<IpcResponse<Invoice[]>>
        delete: (id: number) => Promise<IpcResponse<void>>
        insert: (payload: any) => Promise<IpcResponse<Invoice>>
      }
      competitors: {
        list: (contract_id: number) => Promise<IpcResponse<CompetitorOffering[]>>
        create: (payload: any) => Promise<IpcResponse<CompetitorOffering>>
        delete: (id: number) => Promise<IpcResponse<void>>
        pickFile: () => Promise<IpcResponse<string>>
      }
      projects: {
        list: (opts?: any) => Promise<IpcResponse<VendorProject[]>>
        create: (payload: any) => Promise<IpcResponse<VendorProject>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
      }
      notes: {
        list: (contract_id: number) => Promise<IpcResponse<VendorNote[]>>
        create: (payload: any) => Promise<IpcResponse<VendorNote>>
        delete: (id: number) => Promise<IpcResponse<void>>
      }
      settings: {
        get: () => Promise<IpcResponse<AppSettings>>
        set: (payload: Partial<AppSettings>) => Promise<IpcResponse<void>>
        uploadLogo: () => Promise<IpcResponse<string>>
        pickDbFolder: () => Promise<IpcResponse<string>>
        extractColors: (imagePath: string) => Promise<IpcResponse<{ primary: string; secondary: string; palette: string[] }>>
        testEmail: (toEmail: string) => Promise<IpcResponse<void>>
      }
      assets: {
        list: () => Promise<IpcResponse<any[]>>
        save: (rows: any[]) => Promise<IpcResponse<void>>
        importFile: () => Promise<IpcResponse<any>>
      }
      exports: {
        invoices: (data: any[]) => Promise<IpcResponse<any>>
        contractsList: (data: any[]) => Promise<IpcResponse<any>>
        contractDetail: (payload: any) => Promise<IpcResponse<any>>
      }
      reports: {
        overview: () => Promise<IpcResponse<any>>
        vendorSpend: () => Promise<IpcResponse<any>>
        monthlyTrend: () => Promise<IpcResponse<any>>
        renewals: () => Promise<IpcResponse<any>>
        budgetVsActual: (fiscal_year: number) => Promise<IpcResponse<any>>
        invoiceSummary: () => Promise<IpcResponse<any>>
        spendByDept: () => Promise<IpcResponse<any>>
        spendByBranch: () => Promise<IpcResponse<any>>
        contractList: () => Promise<IpcResponse<any>>
        export: (payload: any) => Promise<IpcResponse<any>>
        email: (payload: any) => Promise<IpcResponse<any>>
      }
      gmail: {
        getAuthUrl: () => Promise<IpcResponse<string>>
        connect: (code: string) => Promise<IpcResponse<string>>
        disconnect: () => Promise<IpcResponse<void>>
        poll: () => Promise<IpcResponse<number>>
        openUrl: (url: string) => Promise<IpcResponse<void>>
      }
      dashboard: {
        spendTrend: (opts: any) => Promise<IpcResponse<{ month: string; amount: number }[]>>
        upcomingRenewals: () => Promise<IpcResponse<any[]>>
      }
      allocations: {
        list: (contract_id: number) => Promise<IpcResponse<ContractAllocation[]>>
        save: (contract_id: number, allocations: Omit<ContractAllocation, 'id' | 'created_at'>[]) => Promise<IpcResponse<void>>
      }
    }
  }
}
