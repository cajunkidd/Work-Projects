// ─── Users & Auth ───────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'director' | 'store_manager'

export interface User {
  id: number
  name: string
  email: string
  role: UserRole
  department_ids: number[] // empty = access all (super_admin); specific dept for director
  branch_ids: number[]     // empty = access all (super_admin); specific branches for director/store_manager
  created_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

// ─── Departments ────────────────────────────────────────────────────────────

export interface Department {
  id: number
  name: string
  created_at: string
}

// ─── Branches ────────────────────────────────────────────────────────────────

export interface Branch {
  id: number
  number: number
  name: string
  created_at: string
}

// ─── Budget ─────────────────────────────────────────────────────────────────

export interface Budget {
  id: number
  department_id: number | null // null when branch-level or company-level
  branch_id: number | null     // null when department-level or company-level
  fiscal_year: number
  total_amount: number
  created_at: string
}

export interface BudgetSummary {
  department_id: number | null
  department_name: string | null
  branch_id: number | null
  branch_name: string | null
  branch_number?: number | null
  fiscal_year: number
  total_budget: number
  total_spent: number
  remaining: number
}

// ─── Contract Allocations ────────────────────────────────────────────────────

export interface ContractAllocation {
  id: number
  contract_id: number
  branch_id: number | null
  branch_name?: string | null
  branch_number?: number | null
  department_id: number | null
  department_name?: string | null
  allocation_type: 'percentage' | 'fixed'
  value: number
  created_at: string
}

// ─── Branch Assets ───────────────────────────────────────────────────────────

export type AssetType = 'computer' | 'thin_client' | 'server' | 'printer' | 'ingenico'

export interface BranchAsset {
  id?: number
  branch_id: number
  branch_name?: string
  branch_number?: number
  asset_type: AssetType
  count: number
  updated_at?: string
}

// ─── Contracts ──────────────────────────────────────────────────────────────

export type ContractStatus = 'active' | 'expiring_soon' | 'expired' | 'pending'

export interface Contract {
  id: number
  vendor_name: string
  status: ContractStatus
  start_date: string
  end_date: string
  monthly_cost: number
  annual_cost: number
  total_cost: number
  poc_name: string
  poc_email: string
  poc_phone: string
  department_id: number | null
  department_name?: string
  branch_id: number | null
  branch_name?: string
  gl_code: string
  file_path?: string
  notes_count?: number
  created_at: string
  days_until_renewal?: number
}

export interface ContractLineItem {
  id: number
  contract_id: number
  description: string
  quantity: number
  unit_price: number
  total_price: number
}

export interface RenewalHistory {
  id: number
  contract_id: number
  renewal_date: string
  prev_cost: number
  new_cost: number
  license_count_change: number
  reason: string
}

// ─── Competitor Offerings ───────────────────────────────────────────────────

export interface CompetitorOffering {
  id: number
  contract_id: number
  competitor_vendor: string
  offering_name: string
  price: number
  file_path?: string
  notes: string
  created_at: string
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export interface Invoice {
  id: number
  contract_id: number | null
  vendor_name?: string
  gmail_message_id: string
  subject: string
  sender: string
  amount: number
  budgeted_amount: number
  received_date: string
  gl_code: string
  is_deleted: number
}

// ─── Vendor Projects ────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'on_hold' | 'completed'

export interface VendorProject {
  id: number
  contract_id: number
  name: string
  status: ProjectStatus
  start_date: string
  end_date: string
  description: string
}

// ─── Vendor Notes ────────────────────────────────────────────────────────────

export interface VendorNote {
  id: number
  contract_id: number
  note: string
  created_by: string
  created_at: string
}

// ─── App Settings ────────────────────────────────────────────────────────────

export interface AppSettings {
  logo_path?: string
  brand_primary?: string
  brand_secondary?: string
  brand_accent?: string
  brand_light?: string
  brand_dark?: string
  db_network_path?: string
  gmail_connected?: string
  gmail_email?: string
  // Email / SMTP notifications
  smtp_enabled?: string   // 'true' | 'false'
  smtp_host?: string
  smtp_port?: string
  smtp_secure?: string    // 'true' = SSL/TLS
  smtp_user?: string
  smtp_pass?: string
  smtp_from?: string
  // E-Signature (Documenso)
  documenso_url?: string
  documenso_api_key?: string
}

// ─── Contract Builder / E-Signature ─────────────────────────────────────────

export interface ContractTemplate {
  id: number
  title: string
  type: 'built' | 'uploaded'
  content?: string      // TipTap JSON (for 'built')
  file_path?: string    // absolute path to PDF (for 'uploaded')
  created_at: string
}

export type SigningRequestStatus = 'pending' | 'sent' | 'viewed' | 'completed' | 'declined'

export interface SigningRequest {
  id: number
  template_id?: number
  contract_id?: number
  document_title: string
  recipient_name: string
  recipient_email: string
  documenso_document_id?: string
  status: SigningRequestStatus
  document_path?: string
  sent_at?: string
  completed_at?: string
  created_at: string
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  budget_summary: BudgetSummary
  dept_budgets: BudgetSummary[]
  branch_budgets: BudgetSummary[]
  contract_status_counts: { status: ContractStatus; count: number }[]
  upcoming_renewals: Contract[]
  recent_invoices: Invoice[]
  monthly_spend: { month: string; amount: number; department?: string }[]
  active_projects_count: number
}

// ─── IPC Response ────────────────────────────────────────────────────────────

export interface IpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
