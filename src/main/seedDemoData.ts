import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

/**
 * Seeds the database with realistic demo data for presentations.
 * Accepts db instance directly to avoid circular dependency.
 */
export function seedDemoData(db: Database.Database): void {
  // Always ensure demo users exist with correct passwords (upsert)
  const hash = bcrypt.hashSync('demo123', 10)

  // Fetch/create departments first (needed for user assignments)
  const deptStmt = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)')
  ;['Information Technology', 'Operations', 'Marketing', 'Human Resources', 'Finance'].forEach((d) => deptStmt.run(d))

  const deptRows = db.prepare('SELECT id, name FROM departments').all() as { id: number; name: string }[]
  const D: Record<string, number> = {}
  deptRows.forEach((r) => (D[r.name] = r.id))

  const branchRows = db.prepare('SELECT id, number, name FROM branches').all() as { id: number; number: number; name: string }[]

  // Upsert demo users — always force the password hash so login works
  const userUpsert = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, department_ids, branch_ids)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
      role = excluded.role, department_ids = excluded.department_ids,
      branch_ids = excluded.branch_ids
  `)
  userUpsert.run('Admin User', 'admin@demo.com', hash, 'super_admin', '[]', '[]')
  userUpsert.run('Sarah Mitchell', 'sarah@demo.com', hash, 'director',
    JSON.stringify([D['Information Technology'], D['Operations']]),
    JSON.stringify(branchRows.slice(0, 5).map((b) => b.id)))
  userUpsert.run('James Cooper', 'james@demo.com', hash, 'store_manager', '[]',
    JSON.stringify([branchRows[0]?.id]))

  console.log('[seed] Demo users upserted (admin@demo.com / demo123)')

  // Guard: skip rest of seeding if contracts already exist
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM contracts').get() as { cnt: number }
  if (existing.cnt > 0) return

  db.transaction(() => {
    // ── Budget (FY 2026) ────────────────────────────────────────────────
    const bIns = db.prepare('INSERT OR IGNORE INTO budget (department_id, branch_id, fiscal_year, total_amount) VALUES (?,?,?,?)')
    bIns.run(null, null, 2026, 7500000)
    bIns.run(D['Information Technology'], null, 2026, 2400000)
    bIns.run(D['Operations'], null, 2026, 1800000)
    bIns.run(D['Marketing'], null, 2026, 950000)
    bIns.run(D['Human Resources'], null, 2026, 620000)
    bIns.run(D['Finance'], null, 2026, 780000)
    ;[185000, 142000, 210000, 128000, 165000, 155000].forEach((amt, i) => {
      if (branchRows[i]) bIns.run(null, branchRows[i].id, 2026, amt)
    })

    // ── Contracts ────────────────────────────────────────────────────────
    const cIns = db.prepare(`INSERT INTO contracts (vendor_name, status, start_date, end_date, monthly_cost, annual_cost, total_cost, poc_name, poc_email, poc_phone, department_id, branch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    const contracts = [
      { v:'Microsoft 365', s:'active', sd:'2026-01-01', ed:'2027-12-31', m:18500, poc:'Lisa Chen', pe:'lisa.chen@microsoft.com', pp:'(425) 555-0142', d:'Information Technology', b:null },
      { v:'Cisco Systems', s:'active', sd:'2026-01-15', ed:'2027-12-31', m:12800, poc:'Robert Hayes', pe:'rhayes@cisco.com', pp:'(408) 555-0198', d:'Information Technology', b:null },
      { v:'CrowdStrike', s:'active', sd:'2026-02-01', ed:'2027-01-31', m:8400, poc:'Amanda Torres', pe:'atorres@crowdstrike.com', pp:'(512) 555-0167', d:'Information Technology', b:null },
      { v:'Salesforce', s:'expiring_soon', sd:'2026-01-01', ed:'2026-06-30', m:15200, poc:'Kevin Wright', pe:'kwright@salesforce.com', pp:'(415) 555-0133', d:'Operations', b:null },
      { v:'Adobe Creative Cloud', s:'active', sd:'2026-02-01', ed:'2028-01-31', m:4800, poc:'Diana Patel', pe:'dpatel@adobe.com', pp:'(408) 555-0211', d:'Marketing', b:null },
      { v:'ADP Workforce Now', s:'active', sd:'2026-01-01', ed:'2027-12-31', m:9600, poc:'Marcus Johnson', pe:'mjohnson@adp.com', pp:'(973) 555-0188', d:'Human Resources', b:null },
      { v:'Oracle NetSuite', s:'expiring_soon', sd:'2026-01-01', ed:'2026-07-15', m:22000, poc:'Rachel Kim', pe:'rkim@oracle.com', pp:'(650) 555-0155', d:'Finance', b:null },
      { v:'ServiceNow', s:'active', sd:'2026-03-01', ed:'2028-02-28', m:11500, poc:'Thomas Baker', pe:'tbaker@servicenow.com', pp:'(669) 555-0177', d:'Information Technology', b:null },
      { v:'Zoom Communications', s:'active', sd:'2026-01-01', ed:'2027-12-31', m:3200, poc:'Emily Nguyen', pe:'enguyen@zoom.us', pp:'(888) 555-0144', d:'Operations', b:null },
      { v:'AWS Cloud Services', s:'active', sd:'2026-01-01', ed:'2028-12-31', m:34000, poc:'David Park', pe:'dpark@amazon.com', pp:'(206) 555-0199', d:'Information Technology', b:null },
      { v:'Xerox Copier Lease', s:'active', sd:'2026-01-01', ed:'2027-12-31', m:850, poc:'Janet Hill', pe:'jhill@xerox.com', pp:'(585) 555-0122', d:null, b:0 },
      { v:'ADT Security', s:'expiring_soon', sd:'2026-01-01', ed:'2026-05-31', m:1200, poc:'Brian Scott', pe:'bscott@adt.com', pp:'(561) 555-0166', d:null, b:1 },
      { v:'Cintas Uniforms', s:'active', sd:'2026-02-01', ed:'2028-01-31', m:680, poc:'Laura Adams', pe:'ladams@cintas.com', pp:'(513) 555-0188', d:null, b:2 },
      { v:'Waste Management', s:'active', sd:'2026-01-01', ed:'2027-12-31', m:475, poc:'Greg Turner', pe:'gturner@wm.com', pp:'(713) 555-0133', d:null, b:3 },
      { v:'FedEx Shipping', s:'pending', sd:'2026-04-01', ed:'2028-03-31', m:2100, poc:'Nicole Brown', pe:'nbrown@fedex.com', pp:'(901) 555-0177', d:'Operations', b:null },
      { v:'Comcast Business', s:'expired', sd:'2023-06-01', ed:'2025-05-31', m:1600, poc:'Chris Davis', pe:'cdavis@comcast.com', pp:'(215) 555-0155', d:'Information Technology', b:null },
    ]
    const ids: number[] = []
    contracts.forEach((c) => {
      const annual = c.m * 12
      const ms = Math.max(1, Math.round((new Date(c.ed).getTime() - new Date(c.sd).getTime()) / (1000*60*60*24*30)))
      const r = cIns.run(c.v, c.s, c.sd, c.ed, c.m, annual, c.m * ms, c.poc, c.pe, c.pp, c.d ? D[c.d] ?? null : null, c.b !== null ? branchRows[c.b]?.id ?? null : null)
      ids.push(r.lastInsertRowid as number)
    })

    // ── Line Items ───────────────────────────────────────────────────────
    const li = db.prepare('INSERT INTO contract_line_items (contract_id, description, quantity, unit_price, total_price) VALUES (?,?,?,?,?)')
    li.run(ids[0], 'Microsoft 365 E3 Licenses', 250, 36, 9000)
    li.run(ids[0], 'Azure Reserved Instances', 1, 5500, 5500)
    li.run(ids[0], 'Power BI Pro Licenses', 50, 20, 1000)
    li.run(ids[0], 'Premier Support', 1, 3000, 3000)
    li.run(ids[1], 'Meraki MX Firewalls', 15, 320, 4800)
    li.run(ids[1], 'Meraki Switch Licenses', 40, 120, 4800)
    li.run(ids[1], 'Webex Calling Licenses', 200, 16, 3200)
    li.run(ids[9], 'EC2 Reserved Instances', 1, 18000, 18000)
    li.run(ids[9], 'RDS Database Hosting', 1, 8500, 8500)
    li.run(ids[9], 'S3 Storage & Transfer', 1, 4500, 4500)
    li.run(ids[9], 'CloudFront CDN', 1, 3000, 3000)

    // ── Allocations ──────────────────────────────────────────────────────
    const ai = db.prepare('INSERT INTO contract_allocations (contract_id, branch_id, department_id, allocation_type, value) VALUES (?,?,?,?,?)')
    branchRows.slice(0, 5).forEach((b) => ai.run(ids[0], b.id, null, 'percentage', 20))
    ai.run(ids[1], null, D['Information Technology'], 'percentage', 100)

    // ── Invoices ─────────────────────────────────────────────────────────
    const ii = db.prepare('INSERT INTO invoices (contract_id, gmail_message_id, subject, sender, amount, budgeted_amount, received_date) VALUES (?,?,?,?,?,?,?)')
    let n = 0
    const mkId = () => `demo-inv-${++n}`
    ;[
      [ids[0], 'Microsoft 365 - March 2026', 'billing@microsoft.com', 18500, 18500, '2026-03-01'],
      [ids[0], 'Microsoft 365 - February 2026', 'billing@microsoft.com', 18500, 18500, '2026-02-01'],
      [ids[0], 'Microsoft 365 - January 2026', 'billing@microsoft.com', 18500, 18500, '2026-01-01'],
      [ids[9], 'AWS Monthly - March 2026', 'aws-billing@amazon.com', 36200, 34000, '2026-03-05'],
      [ids[9], 'AWS Monthly - February 2026', 'aws-billing@amazon.com', 33100, 34000, '2026-02-05'],
      [ids[9], 'AWS Monthly - January 2026', 'aws-billing@amazon.com', 31800, 34000, '2026-01-05'],
      [ids[1], 'Cisco Meraki License Q1', 'invoices@cisco.com', 12800, 12800, '2026-03-10'],
      [ids[3], 'Salesforce CRM - March 2026', 'billing@salesforce.com', 15200, 15200, '2026-03-02'],
      [ids[5], 'ADP Payroll - March 2026', 'billing@adp.com', 9600, 9600, '2026-03-01'],
      [ids[6], 'Oracle NetSuite - March 2026', 'ar@oracle.com', 22000, 22000, '2026-03-08'],
      [ids[2], 'CrowdStrike Falcon Q1 2026', 'billing@crowdstrike.com', 25200, 25200, '2026-01-15'],
      [ids[4], 'Adobe CC - March 2026', 'billing@adobe.com', 4800, 4800, '2026-03-01'],
    ].forEach((row) => ii.run(row[0], mkId(), row[1], row[2], row[3], row[4], row[5]))

    // ── Vendor Projects ──────────────────────────────────────────────────
    const pi = db.prepare('INSERT INTO vendor_projects (contract_id, name, status, start_date, end_date, description) VALUES (?,?,?,?,?,?)')
    pi.run(ids[0], 'Microsoft 365 Migration', 'active', '2026-01-15', '2026-06-30', 'Migrating all users from on-prem Exchange to M365 cloud')
    pi.run(ids[1], 'Network Refresh - Phase 2', 'active', '2025-11-01', '2026-04-30', 'Replacing legacy switches with Meraki across branches')
    pi.run(ids[9], 'Cloud Infrastructure Optimization', 'active', '2026-02-01', '2026-08-31', 'Right-sizing EC2 instances and implementing cost controls')
    pi.run(ids[2], 'Endpoint Protection Rollout', 'completed', '2025-09-01', '2026-01-31', 'Deploying CrowdStrike Falcon to all endpoints')
    pi.run(ids[3], 'Salesforce CPQ Implementation', 'active', '2026-01-01', '2026-07-31', 'Implementing Configure-Price-Quote module')
    pi.run(ids[5], 'HR System Integration', 'on_hold', '2026-02-01', '2026-09-30', 'Integrating ADP with internal timekeeping system')
    pi.run(ids[7], 'ITSM Process Automation', 'active', '2026-03-01', '2026-12-31', 'Automating incident and change management workflows')

    // ── Vendor Notes ─────────────────────────────────────────────────────
    const ni = db.prepare('INSERT INTO vendor_notes (contract_id, note, created_by) VALUES (?,?,?)')
    ni.run(ids[0], 'Negotiated 15% volume discount for 250+ licenses. Renewal locked at current rate for 2 years.', 'Sarah Mitchell')
    ni.run(ids[3], 'Salesforce rep offered 10% discount if we renew by April 15. Need to discuss with VP of Sales.', 'Admin User')
    ni.run(ids[6], 'Oracle pushing us to upgrade to SuiteAnalytics. Quoted additional $4,200/mo. Under review.', 'Sarah Mitchell')
    ni.run(ids[9], 'AWS costs trending 6% above forecast due to increased compute usage. Reviewing reserved instance coverage.', 'Admin User')
    ni.run(ids[1], 'Cisco account team changed. New SE is Robert Hayes - very responsive.', 'James Cooper')

    // ── Competitor Offerings ─────────────────────────────────────────────
    const ci = db.prepare('INSERT INTO competitor_offerings (contract_id, competitor_vendor, offering_name, price, notes) VALUES (?,?,?,?,?)')
    ci.run(ids[0], 'Google', 'Google Workspace Enterprise', 14400, 'Comparable feature set. Migration complexity is a concern.')
    ci.run(ids[2], 'SentinelOne', 'Singularity Complete', 7200, 'Slightly cheaper. Good detection rates but less threat intel.')
    ci.run(ids[3], 'HubSpot', 'HubSpot Enterprise CRM', 12000, 'Lower cost but would require significant data migration.')
    ci.run(ids[6], 'SAP', 'SAP Business ByDesign', 25000, 'More expensive but better manufacturing modules.')

    // ── Branch Assets ────────────────────────────────────────────────────
    const ba = db.prepare('INSERT OR IGNORE INTO branch_assets (branch_id, asset_type, count) VALUES (?,?,?)')
    branchRows.forEach((b, i) => {
      ba.run(b.id, 'computer', 8 + (i % 5) * 3)
      ba.run(b.id, 'thin_client', 4 + (i % 4) * 2)
      ba.run(b.id, 'printer', 2 + (i % 3))
      ba.run(b.id, 'ingenico', 3 + (i % 4))
      if (i < 5) ba.run(b.id, 'server', 1 + (i % 2))
    })

    // ── Renewal History ──────────────────────────────────────────────────
    const ri = db.prepare('INSERT INTO renewal_history (contract_id, renewal_date, prev_cost, new_cost, license_count_change, reason) VALUES (?,?,?,?,?,?)')
    ri.run(ids[0], '2025-07-01', 16200, 18500, 50, 'Added 50 licenses for new hires; negotiated volume discount')
    ri.run(ids[1], '2025-01-15', 11500, 12800, 0, 'Price increase per new Meraki licensing model')
    ri.run(ids[3], '2024-05-01', 13800, 15200, 20, 'Added 20 CRM seats for sales expansion')
  })()

  console.log('[seed] Demo data inserted successfully')
}
