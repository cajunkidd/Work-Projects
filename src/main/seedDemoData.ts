import { getDb } from './database'
import bcrypt from 'bcryptjs'

/**
 * Seeds the database with realistic demo data for presentations.
 * Uses an app_settings flag to track whether seeding already ran.
 */
export function seedDemoData(): void {
  const db = getDb()

  // Always ensure demo users exist with correct passwords (upsert)
  const hash = bcrypt.hashSync('demo123', 10)

  // Fetch/create departments first (needed for user assignments)
  const deptInsert = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)')
  ;['Information Technology', 'Operations', 'Marketing', 'Human Resources', 'Finance'].forEach((d) => deptInsert.run(d))

  const deptRows = db.prepare('SELECT id, name FROM departments').all() as {
    id: number
    name: string
  }[]
  const deptMap: Record<string, number> = {}
  deptRows.forEach((r) => (deptMap[r.name] = r.id))

  const branchRows = db.prepare('SELECT id, number, name FROM branches').all() as {
    id: number
    number: number
    name: string
  }[]

  // Upsert demo users — always force the password hash so login works
  const userUpsert = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, department_ids, branch_ids)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
      role = excluded.role, department_ids = excluded.department_ids,
      branch_ids = excluded.branch_ids
  `)
  userUpsert.run('Admin User', 'admin@demo.com', hash, 'super_admin', '[]', '[]')
  userUpsert.run(
    'Sarah Mitchell',
    'sarah@demo.com',
    hash,
    'director',
    JSON.stringify([deptMap['Information Technology'], deptMap['Operations']]),
    JSON.stringify(branchRows.slice(0, 5).map((b) => b.id))
  )
  userUpsert.run(
    'James Cooper',
    'james@demo.com',
    hash,
    'store_manager',
    '[]',
    JSON.stringify([branchRows[0]?.id])
  )

  console.log('[seed] Demo users upserted (admin@demo.com / demo123)')

  // Guard: skip rest of seeding if already done
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM contracts').get() as { cnt: number }
  if (existing.cnt > 0) return

  // Wrap the rest in a transaction for atomicity & speed
  db.transaction(() => {

    // ── Budget (FY 2026) ────────────────────────────────────────────────
    const budgetInsert = db.prepare(
      'INSERT OR IGNORE INTO budget (department_id, branch_id, fiscal_year, total_amount) VALUES (?,?,?,?)'
    )
    // Company-level budget
    budgetInsert.run(null, null, 2026, 7500000)
    // Department budgets
    budgetInsert.run(deptMap['Information Technology'], null, 2026, 2400000)
    budgetInsert.run(deptMap['Operations'], null, 2026, 1800000)
    budgetInsert.run(deptMap['Marketing'], null, 2026, 950000)
    budgetInsert.run(deptMap['Human Resources'], null, 2026, 620000)
    budgetInsert.run(deptMap['Finance'], null, 2026, 780000)

    // Branch budgets (first 6 branches)
    const branchBudgets = [185000, 142000, 210000, 128000, 165000, 155000]
    branchRows.slice(0, 6).forEach((b, i) => {
      budgetInsert.run(null, b.id, 2026, branchBudgets[i])
    })

    // ── Contracts ────────────────────────────────────────────────────────
    // Start dates spread across 2026 months so the spend trend chart populates
    const contractInsert = db.prepare(`
      INSERT INTO contracts (vendor_name, status, start_date, end_date, monthly_cost, annual_cost, total_cost, poc_name, poc_email, poc_phone, department_id, branch_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `)

    const contracts = [
      // IT contracts — stagger start dates across 2026
      {
        vendor: 'Microsoft 365',
        status: 'active',
        start: '2026-01-01',
        end: '2027-12-31',
        monthly: 18500,
        poc: 'Lisa Chen',
        email: 'lisa.chen@microsoft.com',
        phone: '(425) 555-0142',
        dept: 'Information Technology',
        branch: null
      },
      {
        vendor: 'Cisco Systems',
        status: 'active',
        start: '2026-01-15',
        end: '2027-12-31',
        monthly: 12800,
        poc: 'Robert Hayes',
        email: 'rhayes@cisco.com',
        phone: '(408) 555-0198',
        dept: 'Information Technology',
        branch: null
      },
      {
        vendor: 'CrowdStrike',
        status: 'active',
        start: '2026-02-01',
        end: '2027-01-31',
        monthly: 8400,
        poc: 'Amanda Torres',
        email: 'atorres@crowdstrike.com',
        phone: '(512) 555-0167',
        dept: 'Information Technology',
        branch: null
      },
      {
        vendor: 'Salesforce',
        status: 'expiring_soon',
        start: '2026-01-01',
        end: '2026-06-30',
        monthly: 15200,
        poc: 'Kevin Wright',
        email: 'kwright@salesforce.com',
        phone: '(415) 555-0133',
        dept: 'Operations',
        branch: null
      },
      {
        vendor: 'Adobe Creative Cloud',
        status: 'active',
        start: '2026-02-01',
        end: '2028-01-31',
        monthly: 4800,
        poc: 'Diana Patel',
        email: 'dpatel@adobe.com',
        phone: '(408) 555-0211',
        dept: 'Marketing',
        branch: null
      },
      {
        vendor: 'ADP Workforce Now',
        status: 'active',
        start: '2026-01-01',
        end: '2027-12-31',
        monthly: 9600,
        poc: 'Marcus Johnson',
        email: 'mjohnson@adp.com',
        phone: '(973) 555-0188',
        dept: 'Human Resources',
        branch: null
      },
      {
        vendor: 'Oracle NetSuite',
        status: 'expiring_soon',
        start: '2026-01-01',
        end: '2026-07-15',
        monthly: 22000,
        poc: 'Rachel Kim',
        email: 'rkim@oracle.com',
        phone: '(650) 555-0155',
        dept: 'Finance',
        branch: null
      },
      {
        vendor: 'ServiceNow',
        status: 'active',
        start: '2026-03-01',
        end: '2028-02-28',
        monthly: 11500,
        poc: 'Thomas Baker',
        email: 'tbaker@servicenow.com',
        phone: '(669) 555-0177',
        dept: 'Information Technology',
        branch: null
      },
      {
        vendor: 'Zoom Communications',
        status: 'active',
        start: '2026-01-01',
        end: '2027-12-31',
        monthly: 3200,
        poc: 'Emily Nguyen',
        email: 'enguyen@zoom.us',
        phone: '(888) 555-0144',
        dept: 'Operations',
        branch: null
      },
      {
        vendor: 'AWS Cloud Services',
        status: 'active',
        start: '2026-01-01',
        end: '2028-12-31',
        monthly: 34000,
        poc: 'David Park',
        email: 'dpark@amazon.com',
        phone: '(206) 555-0199',
        dept: 'Information Technology',
        branch: null
      },
      // Branch-level contracts
      {
        vendor: 'Xerox Copier Lease',
        status: 'active',
        start: '2026-01-01',
        end: '2027-12-31',
        monthly: 850,
        poc: 'Janet Hill',
        email: 'jhill@xerox.com',
        phone: '(585) 555-0122',
        dept: null,
        branch: 0
      },
      {
        vendor: 'ADT Security',
        status: 'expiring_soon',
        start: '2026-01-01',
        end: '2026-05-31',
        monthly: 1200,
        poc: 'Brian Scott',
        email: 'bscott@adt.com',
        phone: '(561) 555-0166',
        dept: null,
        branch: 1
      },
      {
        vendor: 'Cintas Uniforms',
        status: 'active',
        start: '2026-02-01',
        end: '2028-01-31',
        monthly: 680,
        poc: 'Laura Adams',
        email: 'ladams@cintas.com',
        phone: '(513) 555-0188',
        dept: null,
        branch: 2
      },
      {
        vendor: 'Waste Management',
        status: 'active',
        start: '2026-01-01',
        end: '2027-12-31',
        monthly: 475,
        poc: 'Greg Turner',
        email: 'gturner@wm.com',
        phone: '(713) 555-0133',
        dept: null,
        branch: 3
      },
      {
        vendor: 'FedEx Shipping',
        status: 'pending',
        start: '2026-04-01',
        end: '2028-03-31',
        monthly: 2100,
        poc: 'Nicole Brown',
        email: 'nbrown@fedex.com',
        phone: '(901) 555-0177',
        dept: 'Operations',
        branch: null
      },
      {
        vendor: 'Comcast Business',
        status: 'expired',
        start: '2023-06-01',
        end: '2025-05-31',
        monthly: 1600,
        poc: 'Chris Davis',
        email: 'cdavis@comcast.com',
        phone: '(215) 555-0155',
        dept: 'Information Technology',
        branch: null
      }
    ]

    const contractIds: number[] = []
    contracts.forEach((c) => {
      const annual = c.monthly * 12
      const startMs = new Date(c.start).getTime()
      const endMs = new Date(c.end).getTime()
      const months = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24 * 30)))
      const total = c.monthly * months
      const deptId = c.dept ? deptMap[c.dept] ?? null : null
      const branchId = c.branch !== null ? branchRows[c.branch]?.id ?? null : null
      const result = contractInsert.run(
        c.vendor,
        c.status,
        c.start,
        c.end,
        c.monthly,
        annual,
        total,
        c.poc,
        c.email,
        c.phone,
        deptId,
        branchId
      )
      contractIds.push(result.lastInsertRowid as number)
    })

    // ── Contract Line Items ──────────────────────────────────────────────
    const lineInsert = db.prepare(
      'INSERT INTO contract_line_items (contract_id, description, quantity, unit_price, total_price) VALUES (?,?,?,?,?)'
    )
    // Microsoft
    lineInsert.run(contractIds[0], 'Microsoft 365 E3 Licenses', 250, 36, 9000)
    lineInsert.run(contractIds[0], 'Azure Reserved Instances', 1, 5500, 5500)
    lineInsert.run(contractIds[0], 'Power BI Pro Licenses', 50, 20, 1000)
    lineInsert.run(contractIds[0], 'Premier Support', 1, 3000, 3000)
    // Cisco
    lineInsert.run(contractIds[1], 'Meraki MX Firewalls', 15, 320, 4800)
    lineInsert.run(contractIds[1], 'Meraki Switch Licenses', 40, 120, 4800)
    lineInsert.run(contractIds[1], 'Webex Calling Licenses', 200, 16, 3200)
    // AWS
    lineInsert.run(contractIds[9], 'EC2 Reserved Instances', 1, 18000, 18000)
    lineInsert.run(contractIds[9], 'RDS Database Hosting', 1, 8500, 8500)
    lineInsert.run(contractIds[9], 'S3 Storage & Transfer', 1, 4500, 4500)
    lineInsert.run(contractIds[9], 'CloudFront CDN', 1, 3000, 3000)

    // ── Contract Allocations ─────────────────────────────────────────────
    const allocInsert = db.prepare(
      'INSERT INTO contract_allocations (contract_id, branch_id, department_id, allocation_type, value) VALUES (?,?,?,?,?)'
    )
    // Microsoft allocated across branches
    branchRows.slice(0, 5).forEach((b) => {
      allocInsert.run(contractIds[0], b.id, null, 'percentage', 20)
    })
    // Cisco allocated to IT dept
    allocInsert.run(contractIds[1], null, deptMap['Information Technology'], 'percentage', 100)

    // ── Invoices ─────────────────────────────────────────────────────────
    const invInsert = db.prepare(
      'INSERT INTO invoices (contract_id, gmail_message_id, subject, sender, amount, budgeted_amount, received_date) VALUES (?,?,?,?,?,?,?)'
    )
    let invIdx = 0
    const mkId = () => `demo-inv-${++invIdx}`
    const invoices = [
      { cIdx: 0, subject: 'Microsoft 365 - March 2026', sender: 'billing@microsoft.com', amount: 18500, budgeted: 18500, date: '2026-03-01' },
      { cIdx: 0, subject: 'Microsoft 365 - February 2026', sender: 'billing@microsoft.com', amount: 18500, budgeted: 18500, date: '2026-02-01' },
      { cIdx: 0, subject: 'Microsoft 365 - January 2026', sender: 'billing@microsoft.com', amount: 18500, budgeted: 18500, date: '2026-01-01' },
      { cIdx: 9, subject: 'AWS Monthly - March 2026', sender: 'aws-billing@amazon.com', amount: 36200, budgeted: 34000, date: '2026-03-05' },
      { cIdx: 9, subject: 'AWS Monthly - February 2026', sender: 'aws-billing@amazon.com', amount: 33100, budgeted: 34000, date: '2026-02-05' },
      { cIdx: 9, subject: 'AWS Monthly - January 2026', sender: 'aws-billing@amazon.com', amount: 31800, budgeted: 34000, date: '2026-01-05' },
      { cIdx: 1, subject: 'Cisco Meraki License Q1', sender: 'invoices@cisco.com', amount: 12800, budgeted: 12800, date: '2026-03-10' },
      { cIdx: 3, subject: 'Salesforce CRM - March 2026', sender: 'billing@salesforce.com', amount: 15200, budgeted: 15200, date: '2026-03-02' },
      { cIdx: 5, subject: 'ADP Payroll - March 2026', sender: 'billing@adp.com', amount: 9600, budgeted: 9600, date: '2026-03-01' },
      { cIdx: 6, subject: 'Oracle NetSuite - March 2026', sender: 'ar@oracle.com', amount: 22000, budgeted: 22000, date: '2026-03-08' },
      { cIdx: 2, subject: 'CrowdStrike Falcon Q1 2026', sender: 'billing@crowdstrike.com', amount: 25200, budgeted: 25200, date: '2026-01-15' },
      { cIdx: 4, subject: 'Adobe CC - March 2026', sender: 'billing@adobe.com', amount: 4800, budgeted: 4800, date: '2026-03-01' }
    ]
    invoices.forEach((inv) => {
      invInsert.run(contractIds[inv.cIdx], mkId(), inv.subject, inv.sender, inv.amount, inv.budgeted, inv.date)
    })

    // ── Vendor Projects ──────────────────────────────────────────────────
    const projInsert = db.prepare(
      'INSERT INTO vendor_projects (contract_id, name, status, start_date, end_date, description) VALUES (?,?,?,?,?,?)'
    )
    projInsert.run(contractIds[0], 'Microsoft 365 Migration', 'active', '2026-01-15', '2026-06-30', 'Migrating all users from on-prem Exchange to M365 cloud')
    projInsert.run(contractIds[1], 'Network Refresh - Phase 2', 'active', '2025-11-01', '2026-04-30', 'Replacing legacy switches with Meraki across branches')
    projInsert.run(contractIds[9], 'Cloud Infrastructure Optimization', 'active', '2026-02-01', '2026-08-31', 'Right-sizing EC2 instances and implementing cost controls')
    projInsert.run(contractIds[2], 'Endpoint Protection Rollout', 'completed', '2025-09-01', '2026-01-31', 'Deploying CrowdStrike Falcon to all endpoints')
    projInsert.run(contractIds[3], 'Salesforce CPQ Implementation', 'active', '2026-01-01', '2026-07-31', 'Implementing Configure-Price-Quote module')
    projInsert.run(contractIds[5], 'HR System Integration', 'on_hold', '2026-02-01', '2026-09-30', 'Integrating ADP with internal timekeeping system')
    projInsert.run(contractIds[7], 'ITSM Process Automation', 'active', '2026-03-01', '2026-12-31', 'Automating incident and change management workflows')

    // ── Vendor Notes ─────────────────────────────────────────────────────
    const noteInsert = db.prepare(
      'INSERT INTO vendor_notes (contract_id, note, created_by) VALUES (?,?,?)'
    )
    noteInsert.run(contractIds[0], 'Negotiated 15% volume discount for 250+ licenses. Renewal locked at current rate for 2 years.', 'Sarah Mitchell')
    noteInsert.run(contractIds[3], 'Salesforce rep offered 10% discount if we renew by April 15. Need to discuss with VP of Sales.', 'Admin User')
    noteInsert.run(contractIds[6], 'Oracle pushing us to upgrade to SuiteAnalytics. Quoted additional $4,200/mo. Under review.', 'Sarah Mitchell')
    noteInsert.run(contractIds[9], 'AWS costs trending 6% above forecast due to increased compute usage. Reviewing reserved instance coverage.', 'Admin User')
    noteInsert.run(contractIds[1], 'Cisco account team changed. New SE is Robert Hayes - very responsive.', 'James Cooper')

    // ── Competitor Offerings ─────────────────────────────────────────────
    const compInsert = db.prepare(
      'INSERT INTO competitor_offerings (contract_id, competitor_vendor, offering_name, price, notes) VALUES (?,?,?,?,?)'
    )
    compInsert.run(contractIds[0], 'Google', 'Google Workspace Enterprise', 14400, 'Comparable feature set. Migration complexity is a concern.')
    compInsert.run(contractIds[2], 'SentinelOne', 'Singularity Complete', 7200, 'Slightly cheaper. Good detection rates but less threat intel.')
    compInsert.run(contractIds[3], 'HubSpot', 'HubSpot Enterprise CRM', 12000, 'Lower cost but would require significant data migration.')
    compInsert.run(contractIds[6], 'SAP', 'SAP Business ByDesign', 25000, 'More expensive but better manufacturing modules.')

    // ── Branch Assets ────────────────────────────────────────────────────
    const assetInsert = db.prepare(
      'INSERT OR IGNORE INTO branch_assets (branch_id, asset_type, count) VALUES (?,?,?)'
    )
    branchRows.forEach((b, i) => {
      assetInsert.run(b.id, 'computer', 8 + (i % 5) * 3)
      assetInsert.run(b.id, 'thin_client', 4 + (i % 4) * 2)
      assetInsert.run(b.id, 'printer', 2 + (i % 3))
      assetInsert.run(b.id, 'ingenico', 3 + (i % 4))
      if (i < 5) assetInsert.run(b.id, 'server', 1 + (i % 2))
    })

    // ── Renewal History ──────────────────────────────────────────────────
    const renewInsert = db.prepare(
      'INSERT INTO renewal_history (contract_id, renewal_date, prev_cost, new_cost, license_count_change, reason) VALUES (?,?,?,?,?,?)'
    )
    renewInsert.run(contractIds[0], '2025-07-01', 16200, 18500, 50, 'Added 50 licenses for new hires; negotiated volume discount')
    renewInsert.run(contractIds[1], '2025-01-15', 11500, 12800, 0, 'Price increase per new Meraki licensing model')
    renewInsert.run(contractIds[3], '2024-05-01', 13800, 15200, 20, 'Added 20 CRM seats for sales expansion')
  })()

  console.log('[seed] Demo data inserted successfully')
}
