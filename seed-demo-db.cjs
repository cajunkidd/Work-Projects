#!/usr/bin/env node
/**
 * Standalone script to create and seed the demo database.
 * Run: node seed-demo-db.cjs
 * This creates the DB at ~/.config/contract-manager/contract-manager.db
 * (the default Electron userData path on Linux).
 */
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Determine the Electron userData path based on platform
let dbDir
if (process.platform === 'darwin') {
  dbDir = path.join(os.homedir(), 'Library', 'Application Support', 'contract-manager')
} else if (process.platform === 'win32') {
  dbDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'contract-manager')
} else {
  dbDir = path.join(os.homedir(), '.config', 'contract-manager')
}

const dbPath = path.join(dbDir, 'contract-manager.db')

// Delete old DB and companion WAL/SHM files for a clean seed
for (const ext of ['', '-wal', '-shm']) {
  const f = dbPath + ext
  if (fs.existsSync(f)) {
    fs.unlinkSync(f)
    console.log('[seed] Deleted', path.basename(f))
  }
}

fs.mkdirSync(dbDir, { recursive: true })
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

console.log(`[seed] Creating database at: ${dbPath}`)

// ── Schema (matches database.ts migrations) ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'store_manager'
      CHECK(role IN ('super_admin','director','store_manager')),
    department_ids TEXT NOT NULL DEFAULT '[]',
    branch_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(department_id, branch_id, fiscal_year)
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active','expiring_soon','expired','pending')),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_cost REAL NOT NULL DEFAULT 0,
    annual_cost REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0,
    poc_name TEXT NOT NULL DEFAULT '',
    poc_email TEXT NOT NULL DEFAULT '',
    poc_phone TEXT NOT NULL DEFAULT '',
    department_id INTEGER REFERENCES departments(id),
    branch_id INTEGER REFERENCES branches(id),
    file_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contract_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    total_price REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS renewal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    renewal_date TEXT NOT NULL,
    prev_cost REAL NOT NULL,
    new_cost REAL NOT NULL,
    license_count_change INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS competitor_offerings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    competitor_vendor TEXT NOT NULL,
    offering_name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    file_path TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
    gmail_message_id TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    sender TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    budgeted_amount REAL NOT NULL DEFAULT 0,
    received_date TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vendor_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','on_hold','completed')),
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS vendor_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contract_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    allocation_type TEXT NOT NULL DEFAULT 'percentage'
      CHECK(allocation_type IN ('percentage', 'fixed')),
    value REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(
      (branch_id IS NOT NULL AND department_id IS NULL) OR
      (branch_id IS NULL AND department_id IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS branch_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK(asset_type IN ('computer', 'thin_client', 'server', 'printer', 'ingenico')),
    count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(branch_id, asset_type)
  );

  CREATE TABLE IF NOT EXISTS contract_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('built', 'uploaded')),
    content TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS signing_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER REFERENCES contract_templates(id) ON DELETE SET NULL,
    contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
    document_title TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    documenso_document_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','sent','viewed','completed','declined')),
    document_path TEXT,
    sent_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Set migration version so the app doesn't re-run migrations
db.pragma('user_version = 5')

// ── Seed data ──────────────────────────────────────────────────────────────
db.transaction(() => {
  // Mark as seeded
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('demo_seeded', 'true')").run()

  // ── Branches ─────────────────────────────────────────────────────────
  db.exec(`
    INSERT OR IGNORE INTO branches (number, name) VALUES
      (11,'Sulphur'),(12,'DeRidder'),(13,'Lake Charles'),(14,'Jennings'),
      (15,'Iowa'),(17,'Crowley'),(18,'Natchitoches'),(20,'Natchez'),
      (21,'Pineville'),(22,'Walker'),(23,'Broussard'),(24,'Eunice'),(25,'Bossier City');
  `)

  // ── Departments ──────────────────────────────────────────────────────
  const deptInsert = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)')
  ;['Information Technology', 'Operations', 'Marketing', 'Human Resources', 'Finance'].forEach(d => deptInsert.run(d))

  const deptRows = db.prepare('SELECT id, name FROM departments').all()
  const D = {}
  deptRows.forEach(r => D[r.name] = r.id)

  const branchRows = db.prepare('SELECT id, number, name FROM branches ORDER BY number').all()

  // ── Users ────────────────────────────────────────────────────────────
  const hash = bcrypt.hashSync('demo123', 10)
  const uIns = db.prepare('INSERT OR IGNORE INTO users (name, email, password_hash, role, department_ids, branch_ids) VALUES (?,?,?,?,?,?)')
  uIns.run('Admin User', 'admin@demo.com', hash, 'super_admin', '[]', '[]')
  uIns.run('Sarah Mitchell', 'sarah@demo.com', hash, 'director',
    JSON.stringify([D['Information Technology'], D['Operations']]),
    JSON.stringify(branchRows.slice(0, 5).map(b => b.id)))
  uIns.run('James Cooper', 'james@demo.com', hash, 'store_manager', '[]',
    JSON.stringify([branchRows[0].id]))

  // ── Budget (FY 2026) ────────────────────────────────────────────────
  const bIns = db.prepare('INSERT OR IGNORE INTO budget (department_id, branch_id, fiscal_year, total_amount) VALUES (?,?,?,?)')
  bIns.run(null, null, 2026, 7500000) // Company-level
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

  const ids = []
  contracts.forEach(c => {
    const annual = c.m * 12
    const ms = Math.max(1, Math.round((new Date(c.ed).getTime() - new Date(c.sd).getTime()) / (1000*60*60*24*30)))
    const total = c.m * ms
    const dId = c.d ? D[c.d] || null : null
    const bId = c.b !== null ? (branchRows[c.b] ? branchRows[c.b].id : null) : null
    const r = cIns.run(c.v, c.s, c.sd, c.ed, c.m, annual, total, c.poc, c.pe, c.pp, dId, bId)
    ids.push(Number(r.lastInsertRowid))
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
  branchRows.slice(0, 5).forEach(b => ai.run(ids[0], b.id, null, 'percentage', 20))
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
  ].forEach(row => ii.run(row[0], mkId(), row[1], row[2], row[3], row[4], row[5]))

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

db.close()

console.log('[seed] Done! Database created at:', dbPath)
console.log('[seed] Login: admin@demo.com / demo123')
console.log('[seed] Other users: sarah@demo.com, james@demo.com (all password: demo123)')
