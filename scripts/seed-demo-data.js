// Demo seed script - run with: node scripts/seed-demo-data.js
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const path = require('path')
const os = require('os')
const fs = require('fs')

// Find DB path (Electron userData on Linux)
const dbDir = path.join(os.homedir(), '.config', 'contract-manager')
const dbPath = process.argv[2] || path.join(dbDir, 'contract-manager.db')

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

console.log('Seeding database at:', dbPath)
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Run all migrations inline
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'store_manager' CHECK(role IN ('super_admin','director','store_manager')),
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
  INSERT OR IGNORE INTO branches (number, name) VALUES
    (11,'Sulphur'),(12,'DeRidder'),(13,'Lake Charles'),(14,'Jennings'),
    (15,'Iowa'),(17,'Crowley'),(18,'Natchitoches'),(20,'Natchez'),
    (21,'Pineville'),(22,'Walker'),(23,'Broussard'),(24,'Eunice'),(25,'Bossier City');
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
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expiring_soon','expired','pending')),
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
  CREATE TABLE IF NOT EXISTS contract_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    allocation_type TEXT NOT NULL DEFAULT 'percentage' CHECK(allocation_type IN ('percentage','fixed')),
    value REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK((branch_id IS NOT NULL AND department_id IS NULL) OR (branch_id IS NULL AND department_id IS NOT NULL))
  );
  CREATE TABLE IF NOT EXISTS branch_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK(asset_type IN ('computer','thin_client','server','printer','ingenico')),
    count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(branch_id, asset_type)
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contract_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('built','uploaded')),
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
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','viewed','completed','declined')),
    document_path TEXT,
    sent_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const pw = bcrypt.hashSync('Demo1234!', 10)

// ── Departments ──
db.exec(`DELETE FROM departments`)
const depts = ['Information Technology','Human Resources','Finance','Operations','Marketing','Legal']
const insertDept = db.prepare(`INSERT OR IGNORE INTO departments (name) VALUES (?)`)
depts.forEach(d => insertDept.run(d))

const deptRows = db.prepare('SELECT id, name FROM departments').all()
const D = {}
deptRows.forEach(r => { D[r.name] = r.id })

// ── Users ──
db.exec(`DELETE FROM users`)
const insertUser = db.prepare(`INSERT OR REPLACE INTO users (name, email, password_hash, role, department_ids, branch_ids) VALUES (?,?,?,?,?,?)`)
insertUser.run('Admin User', 'admin@company.com', pw, 'super_admin', '[]', '[]')
insertUser.run('Sarah Johnson', 'sarah.johnson@company.com', pw, 'director', JSON.stringify([D['Information Technology'], D['Marketing']]), '[]')
insertUser.run('Mike Davis', 'mike.davis@company.com', pw, 'director', JSON.stringify([D['Human Resources'], D['Finance'], D['Legal']]), '[]')
insertUser.run('Jennifer Williams', 'jennifer.williams@company.com', pw, 'store_manager', '[]', '[1,2]')
insertUser.run('Carlos Rodriguez', 'carlos.rodriguez@company.com', pw, 'store_manager', '[]', '[3,4]')

// ── Budgets ──
db.exec(`DELETE FROM budget`)
const insertBudget = db.prepare(`INSERT OR REPLACE INTO budget (department_id, fiscal_year, total_amount) VALUES (?,?,?)`)
insertBudget.run(D['Information Technology'], 2026, 480000)
insertBudget.run(D['Human Resources'], 2026, 120000)
insertBudget.run(D['Finance'], 2026, 60000)
insertBudget.run(D['Operations'], 2026, 165000)
insertBudget.run(D['Marketing'], 2026, 90000)
insertBudget.run(D['Legal'], 2026, 50000)

// ── Contracts ──
db.exec(`DELETE FROM contracts`)
const ic = db.prepare(`INSERT INTO contracts (vendor_name, status, start_date, end_date, monthly_cost, annual_cost, total_cost, poc_name, poc_email, poc_phone, department_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)

const contracts = [
  ['Microsoft 365',       'active',        '2024-01-01','2026-12-31', 3500,  42000,  126000, 'Tom Briggs',      'tom.briggs@microsoft.com',    '(800) 642-7676', D['Information Technology']],
  ['Salesforce CRM',      'active',        '2024-03-01','2026-02-28', 2100,  25200,   50400, 'Lisa Park',       'lisa.park@salesforce.com',    '(800) 667-6389', D['Marketing']],
  ['ADP Payroll',         'active',        '2023-07-01','2026-06-30', 1800,  21600,   64800, 'Dana Morris',     'dana.morris@adp.com',         '(844) 237-5070', D['Human Resources']],
  ['AWS Cloud Services',  'expiring_soon', '2023-01-15','2026-04-15', 5200,  62400,  196200, 'James Carter',    'james.carter@aws.amazon.com', '(206) 266-4064', D['Information Technology']],
  ['Cisco Networking',    'active',        '2024-05-01','2027-04-30', 4100,  49200,  147600, 'Brenda Walsh',    'brenda.walsh@cisco.com',      '(408) 526-4000', D['Information Technology']],
  ['Workday HCM',         'expiring_soon', '2023-04-01','2026-06-01', 2900,  34800,  104400, 'Kevin Shaw',      'kevin.shaw@workday.com',      '(925) 951-9000', D['Human Resources']],
  ['QuickBooks Enterprise','expired',      '2022-01-01','2025-01-01',  890,  10680,   32040, 'Amy Chen',        'amy.chen@intuit.com',         '(800) 446-8848', D['Finance']],
  ['DocuSign Business',   'active',        '2024-02-15','2027-02-14',  450,   5400,   16200, 'Robert Nguyen',   'r.nguyen@docusign.com',       '(800) 379-9973', D['Legal']],
  ['Zoom Business',       'active',        '2024-06-01','2026-11-30',  780,   9360,   14040, 'Megan Torres',    'megan.torres@zoom.us',        '(888) 799-9666', D['Operations']],
  ['Comcast Business',    'active',        '2023-11-01','2026-10-31', 1200,  14400,   43200, 'Paul Henderson',  'p.henderson@comcast.com',     '(800) 391-3000', D['Operations']],
  ['CrowdStrike Falcon',  'active',        '2024-01-20','2027-01-19', 3750,  45000,  135000, 'Sandra Lee',      's.lee@crowdstrike.com',       '(888) 512-8906', D['Information Technology']],
  ['Adobe Creative Cloud','pending',       '2026-04-01','2028-03-31', 1350,  16200,   32400, 'Derek Mills',     'd.mills@adobe.com',           '(800) 833-6687', D['Marketing']],
  ['Oracle Database',     'active',        '2022-06-01','2026-12-01', 6800,  81600,  244800, 'Helen Grant',     'h.grant@oracle.com',          '(800) 392-2999', D['Information Technology']],
  ['ServiceNow ITSM',     'expiring_soon', '2024-01-01','2026-06-30', 4500,  54000,  135000, 'Ethan Brooks',    'e.brooks@servicenow.com',     '(408) 501-8550', D['Information Technology']],
  ['Verizon Enterprise',  'active',        '2023-09-15','2026-09-14', 2200,  26400,   79200, 'Nina Patel',      'n.patel@verizon.com',         '(800) 837-4966', D['Operations']],
]
contracts.forEach(c => ic.run(...c))

const contractRows = db.prepare('SELECT id, vendor_name FROM contracts').all()
const C = {}
contractRows.forEach(r => { C[r.vendor_name] = r.id })

// ── Line Items ──
const ili = db.prepare(`INSERT INTO contract_line_items (contract_id, description, quantity, unit_price, total_price) VALUES (?,?,?,?,?)`)
ili.run(C['Microsoft 365'], 'Microsoft 365 Business Premium licenses', 250, 12.50, 3125)
ili.run(C['Microsoft 365'], 'Azure Active Directory P2', 250, 1.50, 375)
ili.run(C['Salesforce CRM'], 'Salesforce Sales Cloud Enterprise', 30, 60.00, 1800)
ili.run(C['Salesforce CRM'], 'Salesforce Marketing Cloud Addon', 1, 300.00, 300)
ili.run(C['AWS Cloud Services'], 'EC2 Reserved Instances (3yr)', 1, 2800.00, 2800)
ili.run(C['AWS Cloud Services'], 'RDS Multi-AZ Database', 1, 1400.00, 1400)
ili.run(C['AWS Cloud Services'], 'S3 Storage & Data Transfer', 1, 1000.00, 1000)
ili.run(C['CrowdStrike Falcon'], 'Falcon Prevent (Endpoint Protection)', 500, 5.50, 2750)
ili.run(C['CrowdStrike Falcon'], 'Falcon Insight (EDR)', 500, 2.00, 1000)
ili.run(C['Oracle Database'], 'Oracle DB Enterprise Edition', 4, 1700.00, 6800)

// ── Renewal History ──
const irh = db.prepare(`INSERT INTO renewal_history (contract_id, renewal_date, prev_cost, new_cost, license_count_change, reason) VALUES (?,?,?,?,?,?)`)
irh.run(C['Microsoft 365'], '2025-01-01', 3100, 3500, 25, 'Annual renewal - added 25 licenses for new hires')
irh.run(C['Microsoft 365'], '2024-01-01', 2800, 3100, 0, 'Price increase per Microsoft licensing agreement')
irh.run(C['ADP Payroll'], '2025-07-01', 1650, 1800, 0, 'Annual rate adjustment + new onboarding module')
irh.run(C['AWS Cloud Services'], '2025-01-15', 4700, 5200, 0, 'Increased compute capacity for Q1 growth')
irh.run(C['CrowdStrike Falcon'], '2025-01-20', 3200, 3750, 50, 'Expanded coverage to 500 endpoints')

// ── Invoices ──
const inv = db.prepare(`INSERT INTO invoices (contract_id, gmail_message_id, subject, sender, amount, budgeted_amount, received_date) VALUES (?,?,?,?,?,?,?)`)
inv.run(C['Microsoft 365'],       'msg_ms365_mar26',   'Invoice #MS-2026-03 - Microsoft 365',         'billing@microsoft.com',    3500, 3500, '2026-03-01')
inv.run(C['AWS Cloud Services'],  'msg_aws_mar26',     'AWS Invoice March 2026',                       'aws-billing@amazon.com',   5312, 5200, '2026-03-03')
inv.run(C['ADP Payroll'],         'msg_adp_mar26',     'ADP Payroll Services - March Invoice',         'invoices@adp.com',         1800, 1800, '2026-03-05')
inv.run(C['CrowdStrike Falcon'],  'msg_cs_mar26',      'CrowdStrike Monthly Invoice - March 2026',     'billing@crowdstrike.com',  3750, 3750, '2026-03-07')
inv.run(C['Salesforce CRM'],      'msg_sf_mar26',      'Salesforce Invoice - March 2026',              'billing@salesforce.com',   2100, 2100, '2026-03-08')
inv.run(C['Zoom Business'],       'msg_zoom_mar26',    'Zoom Business - Monthly Invoice',              'billing@zoom.us',           780,  780, '2026-03-10')
inv.run(C['Comcast Business'],    'msg_comcast_mar26', 'Comcast Business Internet - March 2026',       'billing@comcast.com',      1200, 1200, '2026-03-12')
inv.run(C['Oracle Database'],     'msg_oracle_mar26',  'Oracle Technology License Invoice Q1 2026',    'oracle-billing@oracle.com',6800, 6800, '2026-03-01')
inv.run(C['Microsoft 365'],       'msg_ms365_feb26',   'Invoice #MS-2026-02 - Microsoft 365',         'billing@microsoft.com',    3500, 3500, '2026-02-01')
inv.run(C['AWS Cloud Services'],  'msg_aws_feb26',     'AWS Invoice February 2026',                    'aws-billing@amazon.com',   4980, 5200, '2026-02-03')
inv.run(C['ServiceNow ITSM'],     'msg_snow_mar26',    'ServiceNow Subscription Invoice - March 2026','billing@servicenow.com',   4500, 4500, '2026-03-15')
inv.run(C['Verizon Enterprise'],  'msg_vz_mar26',      'Verizon Enterprise Services - March 2026',    'billing@verizon.com',      2200, 2200, '2026-03-02')

// ── Vendor Projects ──
const ivp = db.prepare(`INSERT INTO vendor_projects (contract_id, name, status, start_date, end_date, description) VALUES (?,?,?,?,?,?)`)
ivp.run(C['Microsoft 365'],      'M365 Tenant Migration',          'completed', '2024-01-15','2024-06-30', 'Full migration of 250 users from on-prem Exchange to Microsoft 365.')
ivp.run(C['AWS Cloud Services'], 'Cloud Infrastructure Expansion',  'active',   '2025-10-01','2026-05-30', 'Expand AWS footprint to support new retail analytics platform.')
ivp.run(C['AWS Cloud Services'], 'DR Failover Implementation',      'completed','2024-03-01','2024-09-15', 'Set up multi-region disaster recovery with automated failover.')
ivp.run(C['Salesforce CRM'],     'CRM Phase 2 Rollout',             'active',   '2025-11-01','2026-07-31', 'Expand Salesforce to Marketing Cloud and Service Cloud modules.')
ivp.run(C['Cisco Networking'],   'Branch Network Refresh',          'active',   '2025-08-01','2026-08-31', 'Replace aging network equipment across all 13 branch locations.')
ivp.run(C['CrowdStrike Falcon'], 'Endpoint Security Hardening',     'completed','2024-02-01','2024-05-31', 'Deploy CrowdStrike to all 500 endpoints and tune detection policies.')
ivp.run(C['ServiceNow ITSM'],    'ITSM Self-Service Portal',        'on_hold',  '2025-09-01','2026-06-30', 'Build employee self-service IT portal. On hold pending budget approval.')
ivp.run(C['Workday HCM'],        'Workday Payroll Go-Live',         'active',   '2026-01-01','2026-06-30', 'Transition payroll processing from ADP to Workday.')

// ── Vendor Notes ──
const ivn = db.prepare(`INSERT INTO vendor_notes (contract_id, note, created_by) VALUES (?,?,?)`)
ivn.run(C['AWS Cloud Services'],  'Discussed renewal options with James Carter. He indicated AWS can offer a 5% discount if we commit to a 3-year reserved instance plan. Follow up before April 15th deadline.', 'Sarah Johnson')
ivn.run(C['Microsoft 365'],       'Microsoft rep confirmed licensing will increase by ~8% on next renewal. Should budget accordingly for FY2027.', 'Sarah Johnson')
ivn.run(C['Workday HCM'],         'Workday is pushing for early renewal. Current contract expires June 1st. They are offering a 10% loyalty discount if we renew by April 1st.', 'Mike Davis')
ivn.run(C['QuickBooks Enterprise'],'Contract expired Jan 2025. Finance team has been running on legacy access. Need to decide on renewal or migration to NetSuite before Q3.', 'Mike Davis')
ivn.run(C['CrowdStrike Falcon'],  'Annual health check meeting completed 2026-02-10. CrowdStrike confirmed all 500 endpoints reporting clean. Recommended upgrading to Falcon Complete for managed detection.', 'Sarah Johnson')
ivn.run(C['ServiceNow ITSM'],     'ServiceNow account team reached out about upgrading to Washington DC release. Included in renewal discussion.', 'Sarah Johnson')

// ── Competitor Offerings ──
const ico = db.prepare(`INSERT INTO competitor_offerings (contract_id, competitor_vendor, offering_name, price, notes) VALUES (?,?,?,?,?)`)
ico.run(C['Microsoft 365'],       'Google',      'Google Workspace Business Plus', 2250, 'Google quoted $9/user/mo for 250 users. Missing Teams equivalent and advanced compliance tools.')
ico.run(C['AWS Cloud Services'],  'Microsoft',   'Azure Enterprise Agreement',      4800, 'Azure matched feature set at $4,800/mo. Migration cost estimated at $85K one-time.')
ico.run(C['AWS Cloud Services'],  'Google',      'Google Cloud Platform',           4600, 'GCP offered lowest price but engineering team lacks GCP expertise.')
ico.run(C['Salesforce CRM'],      'HubSpot',     'HubSpot Sales Hub Enterprise',    1400, 'HubSpot is $700/mo cheaper but missing advanced reporting needed by marketing ops.')
ico.run(C['CrowdStrike Falcon'],  'SentinelOne', 'SentinelOne Singularity Complete', 3200,'SentinelOne is $550/mo less. CrowdStrike has better threat intel feeds per security team review.')
ico.run(C['Workday HCM'],         'SAP',         'SAP SuccessFactors HXM Suite',    3100, 'SAP quote included implementation fees not shown. True cost likely $3,800+/mo.')

// ── Branch Assets ──
const iba = db.prepare(`INSERT OR REPLACE INTO branch_assets (branch_id, asset_type, count, notes) VALUES (?,?,?,?)`)
const branchRows = db.prepare('SELECT id FROM branches ORDER BY id').all()
const assetData = [
  // [computers, thin_clients, servers, printers, ingenicos]
  [45, 12, 2, 8, 6],   // Sulphur
  [38, 10, 1, 6, 5],   // DeRidder
  [62, 18, 3, 10, 8],  // Lake Charles
  [29,  8, 1, 5, 4],   // Jennings
  [33,  9, 1, 5, 4],   // Iowa
  [41, 11, 2, 7, 6],   // Crowley
  [35, 10, 1, 6, 5],   // Natchitoches
  [27,  7, 1, 4, 4],   // Natchez
  [40, 11, 2, 7, 5],   // Pineville
  [44, 12, 2, 8, 6],   // Walker
  [36, 10, 1, 6, 5],   // Broussard
  [31,  8, 1, 5, 4],   // Eunice
  [55, 15, 2, 9, 7],   // Bossier City
]
const assetTypes = ['computer','thin_client','server','printer','ingenico']
branchRows.forEach((branch, i) => {
  const counts = assetData[i] || [20, 5, 1, 3, 2]
  assetTypes.forEach((type, ti) => {
    iba.run(branch.id, type, counts[ti], null)
  })
})

// ── Set user_version to 5 ──
db.pragma('user_version = 5')

console.log('✓ Demo data seeded successfully!')
console.log('  Login: admin@company.com / Demo1234!')
console.log('  Login: sarah.johnson@company.com / Demo1234!')
console.log('  Login: mike.davis@company.com / Demo1234!')
