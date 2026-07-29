// ─── Users & Auth ───────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'director' | 'store_manager'

/**
 * Role names from before the super_admin/director/store_manager rename.
 * Permission checks still map these, so UI written against the old names
 * keeps working; storage only ever holds a current UserRole.
 */
export type LegacyUserRole = 'admin' | 'editor' | 'viewer'

/** Any role name accepted by a permission check. */
export type PermissionRole = UserRole | LegacyUserRole

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

export interface MonthlyBudget {
  id?: number
  department_id: number | null
  branch_id: number | null
  fiscal_year: number
  month: number // 1-12
  amount: number
  created_at?: string
}

export interface MonthlyBudgetSummary {
  month: number
  month_label: string // e.g. 'Jan', 'Feb'
  budgeted: number
  actual: number
  variance: number  // actual - budgeted
  remaining: number // budgeted - actual
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

export type RenewalType = 'fixed_term' | 'evergreen'

/**
 * Governance state, tracked separately from `status` so the date-driven
 * lifecycle (active/expiring/expired) and the approval lifecycle can't
 * overwrite each other. 'not_required' is the default for contracts that
 * were never routed for approval.
 */
export type ApprovalState = 'not_required' | 'draft' | 'pending' | 'approved' | 'rejected'

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
  file_path?: string
  notes_count?: number
  created_at: string
  days_until_renewal?: number
  renewal_type: RenewalType
  cancellation_notice_days: number
  // Computed (evergreen contracts with notice days only)
  cancellation_deadline?: string | null
  days_until_cancellation?: number | null
  vendor_id?: number | null
  approval_state: ApprovalState
  updated_at?: string | null
  updated_by?: string
}

/** Identifies who performed an action, for the audit trail. */
export interface Actor {
  id: number
  name: string
  role: UserRole
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
  // AI extraction (Anthropic)
  anthropic_api_key?: string
  anthropic_model?: string
  anthropic_effort?: string
  // Calendar feed
  calendar_feed_path?: string
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

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export type AuditEntityType =
  | 'contract'
  | 'user'
  | 'budget'
  | 'clause'
  | 'approval'
  | 'version'
  | 'department'
  | 'branch'
  | 'note'
  | 'settings'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'restore'
  | 'archive'

export interface AuditEntry {
  id: number
  entity_type: AuditEntityType
  entity_id: number | null
  entity_label: string
  action: AuditAction
  field_name: string | null
  old_value: string | null
  new_value: string | null
  summary: string
  user_id: number | null
  user_name: string
  created_at: string
}

export interface AuditFilter {
  entity_type?: AuditEntityType
  entity_id?: number
  action?: AuditAction
  user_id?: number
  from_date?: string
  to_date?: string
  search?: string
  limit?: number
}

// ─── Approval Workflows ──────────────────────────────────────────────────────

export type ApprovalAmountField = 'annual_cost' | 'monthly_cost' | 'total_cost'

export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped'

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/**
 * A routing rule. A contract submitted for approval collects every active rule
 * whose scope, amount band, and vendor pattern it matches; those become the
 * steps of its approval request, ordered by step_order.
 */
export interface ApprovalRule {
  id: number
  name: string
  department_id: number | null
  department_name?: string | null
  branch_id: number | null
  branch_name?: string | null
  min_amount: number
  max_amount: number | null // null = no upper bound
  amount_field: ApprovalAmountField
  vendor_pattern: string // '' = any vendor
  approver_user_id: number | null
  approver_name?: string | null
  approver_role: UserRole | null // any user holding this role may decide
  step_order: number
  active: number
  created_at: string
}

export interface ApprovalStep {
  id: number
  request_id: number
  rule_id: number | null
  rule_name: string
  step_order: number
  approver_user_id: number | null
  approver_name?: string | null
  approver_role: UserRole | null
  status: ApprovalStepStatus
  decided_by_user_id: number | null
  decided_by_name: string
  decided_at: string | null
  comment: string
}

export interface ApprovalRequest {
  id: number
  contract_id: number
  vendor_name?: string
  annual_cost?: number
  requested_by_user_id: number | null
  requested_by_name: string
  status: ApprovalRequestStatus
  note: string
  current_step: number
  created_at: string
  decided_at: string | null
  steps?: ApprovalStep[]
}

/** One pending step surfaced in a user's approval inbox. */
export interface PendingApproval {
  step_id: number
  request_id: number
  contract_id: number
  vendor_name: string
  annual_cost: number
  department_name: string | null
  branch_name: string | null
  rule_name: string
  step_order: number
  requested_by_name: string
  requested_at: string
  note: string
}

// ─── Contract Versions & Redlining ───────────────────────────────────────────

// The diff engine lives in ./diff; re-exported here so consumers have one import.
export type { DiffType, DiffSegment, DiffLineType, DiffLine, DiffStats } from './diff'

export type VersionSource = 'manual' | 'upload' | 'template' | 'import'

export interface ContractVersion {
  id: number
  contract_id: number
  version_no: number
  title: string
  body: string
  source: VersionSource
  file_path: string | null
  fields_snapshot: string // JSON blob of contract fields at capture time
  change_summary: string
  created_by_user_id: number | null
  created_by_name: string
  created_at: string
}

/** Snapshot of the contract's structured fields, stored alongside the document body. */
export interface VersionFieldSnapshot {
  vendor_name?: string
  start_date?: string
  end_date?: string
  monthly_cost?: number
  annual_cost?: number
  total_cost?: number
  poc_name?: string
  poc_email?: string
  poc_phone?: string
  renewal_type?: RenewalType
  cancellation_notice_days?: number
}

export interface FieldChange {
  field: string
  label: string
  old_value: string
  new_value: string
}

// ─── Clause Library ──────────────────────────────────────────────────────────

export type ClauseType = 'standard' | 'fallback' | 'alternative'

export type ClauseRisk = 'low' | 'medium' | 'high'

export interface Clause {
  id: number
  title: string
  category: string
  body: string
  clause_type: ClauseType
  parent_id: number | null // fallback/alternative variants point at their standard
  parent_title?: string | null
  risk_level: ClauseRisk
  tags: string
  guidance: string // when to use this variant
  is_archived: number
  usage_count: number
  created_by_name: string
  created_at: string
  updated_at: string | null
  variants?: Clause[]
}

export interface ClauseFilter {
  search?: string
  category?: string
  clause_type?: ClauseType
  risk_level?: ClauseRisk
  include_archived?: boolean
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export type VendorStatus = 'active' | 'inactive' | 'do_not_use'

export interface Vendor {
  id: number
  name: string
  normalized_name: string
  website: string
  email: string
  phone: string
  address: string
  account_number: string
  tax_id: string
  category: string
  status: VendorStatus
  rating: number | null
  notes: string
  created_at: string
  updated_at: string | null
  // Roll-ups (populated by the list/get queries)
  contract_count?: number
  active_contract_count?: number
  total_annual_cost?: number
  next_renewal?: string | null
  contacts?: VendorContact[]
}

export interface VendorContact {
  id: number
  vendor_id: number
  name: string
  title: string
  email: string
  phone: string
  is_primary: number
  notes: string
  created_at: string
}

// ─── Documents & Full-Text Search ────────────────────────────────────────────

export type DocumentType =
  | 'contract'
  | 'amendment'
  | 'sow'
  | 'invoice'
  | 'quote'
  | 'correspondence'
  | 'other'

export type ExtractionStatus = 'pending' | 'extracted' | 'no_text_layer' | 'failed'

export interface ContractDocument {
  id: number
  contract_id: number | null
  vendor_id: number | null
  vendor_name?: string | null
  title: string
  doc_type: DocumentType
  original_path: string | null
  stored_path: string
  file_hash: string
  file_size: number
  mime_type: string
  page_count: number | null
  extracted_text: string
  extraction_status: ExtractionStatus
  extraction_note: string
  uploaded_by_user_id: number | null
  uploaded_by_name: string
  created_at: string
}

/** One full-text hit, with a highlighted snippet around the match. */
export interface DocumentSearchHit {
  id: number
  contract_id: number | null
  vendor_id: number | null
  vendor_name: string | null
  title: string
  doc_type: DocumentType
  file_size: number
  page_count: number | null
  created_at: string
  snippet: string
  score: number
}

// ─── Obligations & Milestones ────────────────────────────────────────────────

export type ObligationType =
  | 'deliverable'
  | 'milestone'
  | 'sla'
  | 'payment'
  | 'compliance'
  | 'renewal_task'
  | 'other'

export type ResponsibleParty = 'us' | 'vendor' | 'both'

export type ObligationStatus = 'open' | 'in_progress' | 'completed' | 'waived'

export type ObligationRecurrence = 'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export interface Obligation {
  id: number
  contract_id: number
  vendor_name?: string
  title: string
  description: string
  obligation_type: ObligationType
  responsible_party: ResponsibleParty
  owner_user_id: number | null
  owner_name: string
  due_date: string | null
  recurrence: ObligationRecurrence
  status: ObligationStatus
  completed_at: string | null
  completed_by_name: string
  reminder_days: number
  critical: number
  source: 'manual' | 'ai_extracted'
  source_document_id: number | null
  created_at: string
  updated_at: string | null
  // Computed
  days_until_due?: number | null
  is_overdue?: number
}

export interface ObligationFilter {
  contract_id?: number
  status?: ObligationStatus
  obligation_type?: ObligationType
  owner_user_id?: number
  overdue_only?: boolean
  due_within_days?: number
  search?: string
  actor?: Actor
}

// ─── AI Extraction ───────────────────────────────────────────────────────────

export type ExtractionRunStatus = 'running' | 'completed' | 'failed' | 'refused'

export interface ExtractionRun {
  id: number
  document_id: number | null
  contract_id: number | null
  status: ExtractionRunStatus
  model: string
  effort: string
  input_tokens: number
  output_tokens: number
  result_json: string
  error: string
  created_by_name: string
  created_at: string
  completed_at: string | null
}

/** A term the model pulled out of a document, with its confidence and evidence. */
export interface ExtractedTerm<T = string> {
  value: T | null
  confidence: 'high' | 'medium' | 'low'
  evidence: string
}

export interface ExtractedObligation {
  title: string
  description: string
  obligation_type: ObligationType
  responsible_party: ResponsibleParty
  due_date: string | null
  recurrence: ObligationRecurrence
  critical: boolean
  evidence: string
}

/** The structured result the model returns for a contract document. */
export interface ExtractionResult {
  vendor_name: ExtractedTerm
  counterparty_name: ExtractedTerm
  effective_date: ExtractedTerm
  expiration_date: ExtractedTerm
  renewal_type: ExtractedTerm
  cancellation_notice_days: ExtractedTerm<number>
  annual_value: ExtractedTerm<number>
  monthly_value: ExtractedTerm<number>
  total_value: ExtractedTerm<number>
  payment_terms: ExtractedTerm
  governing_law: ExtractedTerm
  liability_cap: ExtractedTerm
  contact_name: ExtractedTerm
  contact_email: ExtractedTerm
  contact_phone: ExtractedTerm
  obligations: ExtractedObligation[]
  risk_flags: { severity: 'low' | 'medium' | 'high'; issue: string; evidence: string }[]
  summary: string
}

export interface AiSettings {
  configured: boolean
  model: string
  effort: string
}

// ─── Integrations: Webhooks ──────────────────────────────────────────────────

export type WebhookEvent =
  | 'contract.created'
  | 'contract.updated'
  | 'contract.deleted'
  | 'contract.submitted'
  | 'contract.approved'
  | 'contract.rejected'
  | 'renewal.upcoming'
  | 'obligation.due'
  | 'obligation.completed'
  | 'vendor.created'

export interface Webhook {
  id: number
  name: string
  url: string
  secret: string
  events: string // JSON array of WebhookEvent
  active: number
  last_status: number | null
  last_error: string
  last_fired_at: string | null
  created_at: string
}

export interface WebhookDelivery {
  id: number
  webhook_id: number
  event: string
  payload: string
  status_code: number | null
  error: string
  created_at: string
}

// ─── Integrations: Calendar ──────────────────────────────────────────────────

export interface CalendarFeedOptions {
  include_renewals: boolean
  include_cancellation_deadlines: boolean
  include_obligations: boolean
  reminder_minutes: number
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
