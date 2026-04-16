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
      }
      contracts: {
        list: (opts?: any) => Promise<IpcResponse<Contract[]>>
        get: (id: number) => Promise<IpcResponse<Contract>>
        create: (payload: any) => Promise<IpcResponse<Contract>>
        update: (payload: any) => Promise<IpcResponse<void>>
        delete: (id: number) => Promise<IpcResponse<void>>
        uploadFile: () => Promise<IpcResponse<any>>
        searchFullText: (opts: any) => Promise<IpcResponse<(Contract & { snippet: string })[]>>
        reextractText: (id: number) => Promise<IpcResponse<{ length: number }>>
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
