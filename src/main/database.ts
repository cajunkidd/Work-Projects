import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import bcrypt from 'bcryptjs'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDatabase(customPath?: string): void {
  const dbPath = customPath
    ? path.join(customPath, 'contract-manager.db')
    : path.join(app.getPath('userData'), 'contract-manager.db')

  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations()
}

export function switchDatabase(newPath: string): void {
  if (db) {
    db.close()
  }
  initDatabase(newPath)
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','editor','viewer')),
      department_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
      fiscal_year INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(department_id, fiscal_year)
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
      department_id INTEGER NOT NULL REFERENCES departments(id),
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
  `)

  // Run incremental migrations
  runV1Migration()
  runV2Migration()
  runV3Migration()
  runV4Migration()
  runV5Migration()

  // Auto-compute contract statuses
  updateContractStatuses()
}

function runV1Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 1) return

  // 1. Create branches table
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // 2. Seed the 13 branches
  db.exec(`
    INSERT OR IGNORE INTO branches (number, name) VALUES
      (11,'Sulphur'),(12,'DeRidder'),(13,'Lake Charles'),(14,'Jennings'),
      (15,'Iowa'),(17,'Crowley'),(18,'Natchitoches'),(20,'Natchez'),
      (21,'Pineville'),(22,'Walker'),(23,'Broussard'),(24,'Eunice'),(25,'Bossier City');
  `)

  // 3. Rebuild users table: new role constraint + branch_ids column
  db.exec(`
    ALTER TABLE users RENAME TO users_old;

    CREATE TABLE users (
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

    INSERT INTO users (id, name, email, password_hash, role, department_ids, branch_ids, created_at)
      SELECT id, name, email, password_hash,
        CASE role
          WHEN 'admin'   THEN 'super_admin'
          WHEN 'editor'  THEN 'director'
          ELSE                'store_manager'
        END,
        department_ids, '[]', created_at
      FROM users_old;

    DROP TABLE users_old;
  `)

  // 4. Rebuild contracts table: department_id nullable + branch_id
  db.exec(`
    ALTER TABLE contracts RENAME TO contracts_old;

    CREATE TABLE contracts (
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

    INSERT INTO contracts (id, vendor_name, status, start_date, end_date,
      monthly_cost, annual_cost, total_cost, poc_name, poc_email, poc_phone,
      department_id, branch_id, file_path, created_at)
    SELECT id, vendor_name, status, start_date, end_date,
      monthly_cost, annual_cost, total_cost, poc_name, poc_email, poc_phone,
      department_id, NULL, file_path, created_at
    FROM contracts_old;

    DROP TABLE contracts_old;
  `)

  // 5. Rebuild budget table: branch_id column + updated UNIQUE constraint
  db.exec(`
    ALTER TABLE budget RENAME TO budget_old;

    CREATE TABLE budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
      branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
      fiscal_year INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(department_id, branch_id, fiscal_year)
    );

    INSERT INTO budget (id, department_id, branch_id, fiscal_year, total_amount, created_at)
      SELECT id, department_id, NULL, fiscal_year, total_amount, created_at
      FROM budget_old;

    DROP TABLE budget_old;
  `)

  // Mark migration complete
  db.pragma('user_version = 1')
}

function runV2Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 2) return

  db.exec(`
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
  `)

  db.pragma('user_version = 2')
}

function runV4Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 4) return

  // Recreate branch_assets with expanded asset_type CHECK to include printer and ingenico
  db.exec(`
    ALTER TABLE branch_assets RENAME TO branch_assets_v3;

    CREATE TABLE branch_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('computer', 'thin_client', 'server', 'printer', 'ingenico')),
      count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(branch_id, asset_type)
    );

    INSERT INTO branch_assets (id, branch_id, asset_type, count, notes, updated_at)
      SELECT id, branch_id, asset_type, count, notes, updated_at FROM branch_assets_v3;

    DROP TABLE branch_assets_v3;
  `)

  db.pragma('user_version = 4')
}

function runV3Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 3) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS branch_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('computer', 'thin_client', 'server')),
      count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(branch_id, asset_type)
    );
  `)

  db.pragma('user_version = 3')
}

function runV5Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 5) return

  db.exec(`
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

  db.pragma('user_version = 5')
}

export function updateContractStatuses(): void {
  db.exec(`
    UPDATE contracts SET status = 'expired'
    WHERE date(end_date) < date('now') AND status != 'expired';

    UPDATE contracts SET status = 'expiring_soon'
    WHERE date(end_date) BETWEEN date('now') AND date('now', '+120 days')
    AND status = 'active';
  `)
}

export function seedDemoData(): void {
  const hash = bcrypt.hashSync('demo123', 10)

  db.transaction(() => {
    // Clear existing data (order matters for foreign keys)
    db.exec(`
      DELETE FROM signing_requests;
      DELETE FROM contract_templates;
      DELETE FROM branch_assets;
      DELETE FROM contract_allocations;
      DELETE FROM vendor_notes;
      DELETE FROM vendor_projects;
      DELETE FROM invoices;
      DELETE FROM competitor_offerings;
      DELETE FROM renewal_history;
      DELETE FROM contract_line_items;
      DELETE FROM contracts;
      DELETE FROM budget;
      DELETE FROM users;
      DELETE FROM departments;
    `)

    // ── Departments ──
    db.exec(`
      INSERT INTO departments (id, name) VALUES
        (1, 'IT'),
        (2, 'Operations'),
        (3, 'Marketing'),
        (4, 'Finance'),
        (5, 'Human Resources');
    `)

    // ── Users ──
    const insertUser = db.prepare(
      `INSERT INTO users (name, email, password_hash, role, department_ids, branch_ids) VALUES (?,?,?,?,?,?)`
    )
    insertUser.run('Admin User', 'admin@company.com', hash, 'super_admin', '[]', '[]')
    insertUser.run('Sarah Mitchell', 'director@company.com', hash, 'director', '[1,2]', '[1,3,5]')
    insertUser.run('James Cooper', 'manager@company.com', hash, 'store_manager', '[]', '[1,3]')
    insertUser.run('Lisa Turner', 'manager2@company.com', hash, 'store_manager', '[]', '[4]')

    // ── Contracts ──
    // Branch IDs from V1 migration: 1=Sulphur(11), 2=DeRidder(12), 3=Lake Charles(13),
    // 4=Jennings(14), 5=Iowa(15), 6=Crowley(17), 7=Natchitoches(18), 8=Natchez(20),
    // 9=Pineville(21), 10=Walker(22), 11=Broussard(23), 12=Eunice(24), 13=Bossier City(25)
    db.exec(`
      INSERT INTO contracts (id, vendor_name, status, start_date, end_date, monthly_cost, annual_cost, total_cost, poc_name, poc_email, poc_phone, department_id, branch_id) VALUES
        (1,  'Microsoft 365',        'active',        '2025-01-01', '2027-12-31', 4500.00,  54000.00,  162000.00, 'John Davis',     'jdavis@microsoft.com',    '(800) 555-1234', 1, NULL),
        (2,  'Cisco Meraki',         'active',        '2025-06-01', '2027-05-31', 2800.00,  33600.00,  67200.00,  'Amy Chen',       'achen@cisco.com',         '(800) 555-2345', 1, NULL),
        (3,  'ADP Payroll',          'active',        '2025-03-01', '2027-02-28', 3200.00,  38400.00,  76800.00,  'Robert Kim',     'rkim@adp.com',            '(800) 555-3456', 5, NULL),
        (4,  'Adobe Creative Cloud', 'expiring_soon', '2024-07-01', '2026-06-30', 1200.00,  14400.00,  28800.00,  'Maria Lopez',    'mlopez@adobe.com',        '(800) 555-4567', 3, NULL),
        (5,  'Comcast Business',     'active',        '2025-01-15', '2028-01-14', 850.00,   10200.00,  30600.00,  'Steve Brown',    'sbrown@comcast.com',      '(800) 555-5678', 2, 1),
        (6,  'Dell Technologies',    'active',        '2025-04-01', '2027-03-31', 1650.00,  19800.00,  39600.00,  'Karen White',    'kwhite@dell.com',         '(800) 555-6789', 1, NULL),
        (7,  'Waste Management',     'active',        '2025-02-01', '2027-01-31', 475.00,   5700.00,   11400.00,  'Tom Green',      'tgreen@wm.com',           '(800) 555-7890', 2, 3),
        (8,  'Salesforce CRM',       'active',        '2025-09-01', '2027-08-31', 2100.00,  25200.00,  50400.00,  'Nina Patel',     'npatel@salesforce.com',   '(800) 555-8901', 3, NULL),
        (9,  'Cintas Uniforms',      'expiring_soon', '2024-04-01', '2026-03-31', 680.00,   8160.00,   16320.00,  'Dave Harris',    'dharris@cintas.com',      '(800) 555-9012', 2, NULL),
        (10, 'Iron Mountain',        'active',        '2025-07-01', '2028-06-30', 390.00,   4680.00,   14040.00,  'Emily Clark',    'eclark@ironmountain.com', '(800) 555-0123', 4, NULL),
        (11, 'AT&T Business',        'active',        '2025-05-01', '2027-04-30', 1100.00,  13200.00,  26400.00,  'Brian Lee',      'blee@att.com',            '(800) 555-1111', 2, 2),
        (12, 'Ricoh Printers',       'expired',       '2023-01-01', '2025-12-31', 520.00,   6240.00,   18720.00,  'Diane Foster',   'dfoster@ricoh.com',       '(800) 555-2222', 1, NULL),
        (13, 'Grainger Supplies',    'active',        '2025-08-01', '2027-07-31', 310.00,   3720.00,   7440.00,   'Frank Moore',    'fmoore@grainger.com',     '(800) 555-3333', 2, 5),
        (14, 'HVAC Solutions Inc',   'pending',       '2026-04-01', '2028-03-31', 950.00,   11400.00,  22800.00,  'Pat Sullivan',   'psullivan@hvacsol.com',   '(800) 555-4444', 2, NULL),
        (15, 'Sophos Cybersecurity', 'active',        '2025-11-01', '2027-10-31', 1800.00,  21600.00,  43200.00,  'Rachel Adams',   'radams@sophos.com',       '(800) 555-5555', 1, NULL);
    `)

    // ── Contract Line Items ──
    db.exec(`
      INSERT INTO contract_line_items (contract_id, description, quantity, unit_price, total_price) VALUES
        (1, 'Microsoft 365 E3 Licenses',          150, 36.00,  5400.00),
        (1, 'Microsoft 365 E5 Security Add-on',    25, 57.00,  1425.00),
        (1, 'Azure AD Premium P2',                 50, 9.00,    450.00),
        (2, 'Meraki MR Access Points',             45, 150.00, 6750.00),
        (2, 'Meraki MX Security Appliances',        8, 350.00, 2800.00),
        (2, 'Meraki Cloud Licensing',               1, 24050.00, 24050.00),
        (3, 'Payroll Processing (per employee)',   320, 8.50,   2720.00),
        (3, 'Time & Attendance Module',              1, 480.00,  480.00),
        (4, 'Creative Cloud All Apps License',      15, 80.00,  1200.00),
        (5, 'Business Internet 500Mbps',             1, 650.00,  650.00),
        (5, 'Static IP Block',                       1, 200.00,  200.00),
        (6, 'OptiPlex 7020 Desktops',              30, 45.00,  1350.00),
        (6, 'PowerEdge R760 Server Lease',           2, 150.00,  300.00),
        (8, 'Sales Cloud Enterprise Licenses',      25, 75.00,  1875.00),
        (8, 'Pardot Marketing Automation',           1, 225.00,  225.00),
        (10, 'Secure Document Shredding',            1, 190.00,  190.00),
        (10, 'Offsite Records Storage (boxes)',    120, 1.50,    180.00),
        (15, 'Sophos XGS Firewall Licensing',        8, 125.00, 1000.00),
        (15, 'Sophos Intercept X Endpoints',       150, 3.50,    525.00),
        (15, 'Sophos Managed Detection & Response',  1, 275.00,  275.00);
    `)

    // ── Budgets (FY 2026) ──
    db.exec(`
      INSERT INTO budget (department_id, branch_id, fiscal_year, total_amount) VALUES
        (NULL, NULL, 2026, 500000.00),
        (1,    NULL, 2026, 175000.00),
        (2,    NULL, 2026, 120000.00),
        (3,    NULL, 2026, 60000.00),
        (4,    NULL, 2026, 45000.00),
        (5,    NULL, 2026, 55000.00),
        (NULL, 1,    2026, 35000.00),
        (NULL, 2,    2026, 28000.00),
        (NULL, 3,    2026, 42000.00),
        (NULL, 4,    2026, 22000.00),
        (NULL, 5,    2026, 25000.00),
        (NULL, 6,    2026, 20000.00),
        (NULL, 7,    2026, 18000.00),
        (NULL, 8,    2026, 15000.00),
        (NULL, 9,    2026, 30000.00),
        (NULL, 10,   2026, 22000.00),
        (NULL, 11,   2026, 26000.00),
        (NULL, 12,   2026, 19000.00),
        (NULL, 13,   2026, 32000.00);
    `)

    // ── Contract Allocations (shared contracts split across branches) ──
    db.exec(`
      INSERT INTO contract_allocations (contract_id, branch_id, department_id, allocation_type, value) VALUES
        (1, 1,    NULL, 'percentage', 15.0),
        (1, 3,    NULL, 'percentage', 20.0),
        (1, 9,    NULL, 'percentage', 12.0),
        (1, 13,   NULL, 'percentage', 10.0),
        (2, 1,    NULL, 'percentage', 25.0),
        (2, 3,    NULL, 'percentage', 25.0),
        (2, 9,    NULL, 'percentage', 20.0),
        (2, 13,   NULL, 'percentage', 15.0),
        (3, NULL,  5,   'percentage', 100.0),
        (6, NULL,  1,   'fixed',      19800.00);
    `)

    // ── Renewal History ──
    db.exec(`
      INSERT INTO renewal_history (contract_id, renewal_date, prev_cost, new_cost, license_count_change, reason) VALUES
        (1, '2025-01-01', 48000.00, 54000.00,  25, 'Added 25 E3 licenses for new hires; annual price increase 3%'),
        (1, '2024-01-01', 42000.00, 48000.00,   0, 'Standard annual renewal with 14% price adjustment'),
        (2, '2025-06-01', 30000.00, 33600.00,   5, 'Added 5 access points for new branch; 12% increase'),
        (3, '2025-03-01', 36000.00, 38400.00,  15, 'Headcount increase of 15 employees'),
        (4, '2024-07-01', 12000.00, 14400.00,   5, 'Added 5 Creative Cloud seats for marketing team expansion'),
        (12, '2024-01-01', 5400.00,  6240.00,   0, 'Annual renewal — model upgrade surcharge');
    `)

    // ── Competitor Offerings ──
    db.exec(`
      INSERT INTO competitor_offerings (contract_id, competitor_vendor, offering_name, price, notes) VALUES
        (1, 'Google Workspace', 'Business Plus Plan',           42000.00, 'Comparable feature set; lower per-user cost but migration effort is significant'),
        (1, 'Zoho One',        'Enterprise Suite',              28000.00, 'Budget option; lacks advanced compliance features we require'),
        (2, 'Ubiquiti UniFi',  'UniFi Enterprise Wireless',    18000.00, 'Much cheaper but no cloud management dashboard — would need on-prem controller'),
        (2, 'Aruba Networks',  'Aruba Instant On AP25',        29000.00, 'Similar cloud-managed approach; slightly cheaper'),
        (4, 'Canva Enterprise','Canva Teams Plan',              8400.00, 'Good for social/web; lacks print production capabilities'),
        (15, 'CrowdStrike',    'Falcon Go + Firewall Mgmt',   26000.00, 'Best-in-class EDR but 20% more expensive'),
        (15, 'Palo Alto',      'Cortex XDR Pro',              30000.00, 'Premium option; overkill for current needs');
    `)

    // ── Invoices ──
    db.exec(`
      INSERT INTO invoices (contract_id, gmail_message_id, subject, sender, amount, budgeted_amount, received_date) VALUES
        (1,  'msg_demo_001', 'Invoice #MS-2026-0301 - Microsoft 365 March',   'billing@microsoft.com',    4500.00, 4500.00, '2026-03-01'),
        (1,  'msg_demo_002', 'Invoice #MS-2026-0201 - Microsoft 365 February','billing@microsoft.com',    4500.00, 4500.00, '2026-02-01'),
        (2,  'msg_demo_003', 'Invoice #CM-2026-0301 - Meraki Cloud License',  'billing@cisco.com',        2800.00, 2800.00, '2026-03-01'),
        (3,  'msg_demo_004', 'Invoice #ADP-2026-0301 - Payroll Processing',   'invoices@adp.com',         3200.00, 3200.00, '2026-03-01'),
        (5,  'msg_demo_005', 'Invoice #CB-2026-0301 - Business Internet',     'billing@comcast.com',       850.00,  850.00, '2026-03-01'),
        (6,  'msg_demo_006', 'Invoice #DT-2026-0301 - Dell Lease Payment',    'billing@dell.com',         1650.00, 1650.00, '2026-03-01'),
        (7,  'msg_demo_007', 'Invoice #WM-2026-0215 - Waste Mgmt Feb',       'billing@wm.com',            475.00,  475.00, '2026-02-15'),
        (8,  'msg_demo_008', 'Invoice #SF-2026-0301 - Salesforce March',      'billing@salesforce.com',   2100.00, 2100.00, '2026-03-01'),
        (10, 'msg_demo_009', 'Invoice #IM-2026-0301 - Iron Mountain',        'billing@ironmountain.com',   390.00,  390.00, '2026-03-01'),
        (15, 'msg_demo_010', 'Invoice #SP-2026-0301 - Sophos March',         'billing@sophos.com',        1800.00, 1800.00, '2026-03-01'),
        (1,  'msg_demo_011', 'Invoice #MS-2026-0101 - Microsoft 365 January', 'billing@microsoft.com',    4500.00, 4500.00, '2026-01-01'),
        (9,  'msg_demo_012', 'Invoice #CI-2026-0201 - Cintas Uniforms Feb',  'billing@cintas.com',         680.00,  680.00, '2026-02-01');
    `)

    // ── Vendor Projects ──
    db.exec(`
      INSERT INTO vendor_projects (contract_id, name, status, start_date, end_date, description) VALUES
        (1, 'Microsoft 365 Tenant Migration',      'completed',  '2025-01-15', '2025-04-30', 'Migrate from legacy on-prem Exchange to M365 cloud tenant'),
        (2, 'Branch Network Refresh',              'active',     '2025-08-01', '2026-06-30', 'Replace aging Meraki hardware across all 13 branches'),
        (6, 'Desktop Replacement Rollout',         'active',     '2025-10-01', '2026-08-31', 'Phase out 5-year-old desktops with new OptiPlex 7020s'),
        (15, 'Zero Trust Network Implementation',  'active',     '2026-01-15', '2026-09-30', 'Deploy Sophos ZTNA agents and segment network access'),
        (8, 'Salesforce Lightning Migration',      'on_hold',    '2026-02-01', '2026-07-31', 'Upgrade from Classic to Lightning Experience — paused for staffing'),
        (3, 'Payroll System Integration',          'completed',  '2025-03-15', '2025-06-30', 'Integrate ADP with internal HR portal for automated onboarding');
    `)

    // ── Vendor Notes ──
    db.exec(`
      INSERT INTO vendor_notes (contract_id, note, created_by) VALUES
        (1,  'Negotiated 8% volume discount on E3 licenses at last renewal. Push for 10% next time.', 'Admin User'),
        (1,  'Microsoft TAM assigned: Jennifer Walsh (jwelsh@microsoft.com). Very responsive.', 'Sarah Mitchell'),
        (2,  'Cisco offering free AP upgrade program for customers renewing 3-year terms.', 'Admin User'),
        (4,  'Adobe offered 15% discount if we commit to 3-year term. Currently on 2-year.', 'Admin User'),
        (5,  'Comcast SLA guarantees 99.9% uptime. Had 2 outages in Q4 2025 — document for negotiation.', 'James Cooper'),
        (9,  'Cintas rep mentioned they can match pricing from UniFirst. Get competing quote before renewal.', 'Sarah Mitchell'),
        (12, 'Ricoh contract expired. Evaluating HP and Canon as replacements. Decision needed by Q2 2026.', 'Admin User'),
        (14, 'HVAC Solutions pending final approval from CFO. Expected signature by mid-April.', 'Admin User'),
        (15, 'Sophos MDR saved us during the January phishing incident. Document ROI for budget justification.', 'Sarah Mitchell');
    `)

    // ── Branch Assets ──
    db.exec(`
      INSERT INTO branch_assets (branch_id, asset_type, count) VALUES
        (1, 'computer', 12), (1, 'thin_client', 8),  (1, 'server', 2), (1, 'printer', 3), (1, 'ingenico', 4),
        (2, 'computer', 8),  (2, 'thin_client', 6),  (2, 'server', 1), (2, 'printer', 2), (2, 'ingenico', 3),
        (3, 'computer', 18), (3, 'thin_client', 12), (3, 'server', 3), (3, 'printer', 5), (3, 'ingenico', 6),
        (4, 'computer', 7),  (4, 'thin_client', 5),  (4, 'server', 1), (4, 'printer', 2), (4, 'ingenico', 3),
        (5, 'computer', 9),  (5, 'thin_client', 6),  (5, 'server', 1), (5, 'printer', 2), (5, 'ingenico', 3),
        (6, 'computer', 8),  (6, 'thin_client', 5),  (6, 'server', 1), (6, 'printer', 2), (6, 'ingenico', 3),
        (7, 'computer', 6),  (7, 'thin_client', 4),  (7, 'server', 1), (7, 'printer', 2), (7, 'ingenico', 2),
        (8, 'computer', 5),  (8, 'thin_client', 4),  (8, 'server', 1), (8, 'printer', 1), (8, 'ingenico', 2),
        (9, 'computer', 14), (9, 'thin_client', 10), (9, 'server', 2), (9, 'printer', 4), (9, 'ingenico', 5),
        (10,'computer', 10), (10,'thin_client', 7),  (10,'server', 1), (10,'printer', 3), (10,'ingenico', 4),
        (11,'computer', 11), (11,'thin_client', 8),  (11,'server', 2), (11,'printer', 3), (11,'ingenico', 4),
        (12,'computer', 7),  (12,'thin_client', 5),  (12,'server', 1), (12,'printer', 2), (12,'ingenico', 2),
        (13,'computer', 15), (13,'thin_client', 10), (13,'server', 2), (13,'printer', 4), (13,'ingenico', 5);
    `)
  })()

  // Update statuses based on dates
  updateContractStatuses()
}
