import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

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
  runV6Migration()

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

function runV6Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 6) return

  db.exec(`ALTER TABLE budget ADD COLUMN file_path TEXT;`)

  db.pragma('user_version = 6')
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
