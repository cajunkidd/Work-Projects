// Type declarations for window.api (exposed via preload)
import type {
  User,
  LoginCredentials,
  Department,
  Branch,
  Budget,
  BudgetSummary,
  MonthlyBudget,
  MonthlyBudgetSummary,
  Contract,
  ContractAllocation,
  ContractLineItem,
  RenewalHistory,
  CompetitorOffering,
  Invoice,
  VendorProject,
  VendorNote,
  AppSettings,
  BranchAsset,
  ContractTemplate,
  SigningRequest,
  AuditEntry,
  AuditFilter,
  ApprovalRule,
  ApprovalRequest,
  PendingApproval,
  ContractVersion,
  Clause,
  ClauseFilter,
  DiffLine,
  DiffStats,
  FieldChange,
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
        monthlyList: (opts: { fiscal_year: number; department_id?: number | null; branch_id?: number | null }) => Promise<IpcResponse<MonthlyBudget[]>>
        monthlyUpsert: (payload: MonthlyBudget) => Promise<IpcResponse<void>>
        monthlyBulkUpsert: (entries: MonthlyBudget[]) => Promise<IpcResponse<void>>
        monthlySummary: (opts: { fiscal_year: number; department_id?: number | null; branch_id?: number | null }) => Promise<IpcResponse<MonthlyBudgetSummary[]>>
      }
      contracts: {
        list: (opts?: any) => Promise<IpcResponse<Contract[]>>
        get: (id: number) => Promise<IpcResponse<Contract>>
        create: (payload: any) => Promise<IpcResponse<Contract>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (arg: number | { id: number; actor?: any }) => Promise<IpcResponse<void>>
        uploadFile: () => Promise<IpcResponse<any>>
        parseImport: () => Promise<IpcResponse<unknown[]>>
        bulkCreate: (rows: any[]) => Promise<IpcResponse<any>>
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
      assets: {
        list: () => Promise<IpcResponse<BranchAsset[]>>
        save: (rows: BranchAsset[]) => Promise<IpcResponse<void>>
        importFile: () => Promise<IpcResponse<any>>
      }
      allocations: {
        list: (contract_id: number) => Promise<IpcResponse<ContractAllocation[]>>
        save: (contract_id: number, allocations: Omit<ContractAllocation, 'id' | 'created_at'>[]) => Promise<IpcResponse<void>>
      }
      exports: {
        invoices: (data: any[]) => Promise<IpcResponse<string>>
        contractsList: (data: any[]) => Promise<IpcResponse<string>>
        contractDetail: (payload: any) => Promise<IpcResponse<string>>
      }
      contractCreation: {
        saveTemplate: (payload: any) => Promise<IpcResponse<ContractTemplate>>
        uploadTemplate: (payload?: any) => Promise<IpcResponse<ContractTemplate>>
        listTemplates: () => Promise<IpcResponse<ContractTemplate[]>>
        deleteTemplate: (id: number) => Promise<IpcResponse<void>>
        generatePdf: (html: string, title: string) => Promise<IpcResponse<{ path: string }>>
        send: (payload: any) => Promise<IpcResponse<SigningRequest>>
        listRequests: () => Promise<IpcResponse<SigningRequest[]>>
        refreshStatus: (requestId: number) => Promise<IpcResponse<SigningRequest>>
        testDocumenso: () => Promise<IpcResponse<string>>
      }
      audit: {
        list: (filter?: AuditFilter) => Promise<IpcResponse<AuditEntry[]>>
        entityHistory: (opts: { entity_type: string; entity_id: number }) => Promise<IpcResponse<AuditEntry[]>>
        actors: () => Promise<IpcResponse<{ user_id: number | null; user_name: string }[]>>
        stats: () => Promise<IpcResponse<{ total: number; today: number; this_week: number; actors: number }>>
      }
      approvalRules: {
        list: () => Promise<IpcResponse<ApprovalRule[]>>
        create: (payload: any) => Promise<IpcResponse<ApprovalRule>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (payload: { id: number; actor?: any }) => Promise<IpcResponse<void>>
      }
      approvals: {
        preview: (contract_id: number) => Promise<IpcResponse<ApprovalRule[]>>
        submit: (payload: { contract_id: number; note?: string; actor?: any }) => Promise<IpcResponse<{ request_id: number | null; auto_approved: boolean; steps: number }>>
        decide: (payload: { step_id: number; decision: 'approve' | 'reject'; comment?: string; actor?: any }) => Promise<IpcResponse<{ request_status: string; advanced_to: number | null }>>
        cancel: (payload: { request_id: number; actor?: any }) => Promise<IpcResponse<void>>
        forContract: (contract_id: number) => Promise<IpcResponse<ApprovalRequest[]>>
        inbox: (opts: { user_id: number }) => Promise<IpcResponse<PendingApproval[]>>
        inboxCount: (opts: { user_id: number }) => Promise<IpcResponse<number>>
      }
      versions: {
        list: (contract_id: number) => Promise<IpcResponse<ContractVersion[]>>
        get: (id: number) => Promise<IpcResponse<ContractVersion>>
        create: (payload: any) => Promise<IpcResponse<ContractVersion>>
        importFile: () => Promise<IpcResponse<{ path: string; text: string }>>
        diff: (opts: { from_id: number; to_id: number }) => Promise<IpcResponse<{
          lines: DiffLine[]
          stats: DiffStats
          field_changes: FieldChange[]
          from: ContractVersion | null
          to: ContractVersion
        }>>
        restore: (payload: { version_id: number; actor?: any }) => Promise<IpcResponse<{ restored_fields: string[] }>>
        delete: (payload: { id: number; actor?: any }) => Promise<IpcResponse<void>>
      }
      clauses: {
        list: (filter?: ClauseFilter) => Promise<IpcResponse<Clause[]>>
        get: (id: number) => Promise<IpcResponse<Clause>>
        create: (payload: any) => Promise<IpcResponse<Clause>>
        update: (payload: any) => Promise<IpcResponse<void>>
        archive: (payload: { id: number; archived: boolean; actor?: any }) => Promise<IpcResponse<void>>
        delete: (payload: { id: number; actor?: any }) => Promise<IpcResponse<void>>
        categories: () => Promise<IpcResponse<string[]>>
        recordUsage: (id: number) => Promise<IpcResponse<void>>
      }
    }
  }
}
