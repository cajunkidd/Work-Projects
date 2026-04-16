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

  console.log('[db] Opening database at:', dbPath)

  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // Clean up orphaned WAL/SHM files if main DB doesn't exist
  // (prevents stale recovery from a deleted database)
  if (!fs.existsSync(dbPath)) {
    for (const ext of ['-wal', '-shm']) {
      const companion = dbPath + ext
      if (fs.existsSync(companion)) {
        fs.unlinkSync(companion)
        console.log('[db] Removed orphaned', companion)
      }
    }
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // legacy_alter_table prevents SQLite 3.26+ from rewriting FK references
  // in other tables when ALTER TABLE RENAME is used during migrations
  db.pragma('foreign_keys = OFF')
  db.pragma('legacy_alter_table = ON')
  runMigrations()
  db.pragma('legacy_alter_table = OFF')
  db.pragma('foreign_keys = ON')
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
  runV7Migration()
  runV8Migration()
  runV9Migration()
  runV10Migration()
  runV11Migration()
  runV12Migration()
  runV13Migration()
  runV14Migration()

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

// V7: Full-text search over contract content (vendor_name, poc, notes, extracted PDF text)
function runV7Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 7) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_extracted_text (
      contract_id INTEGER PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
      text TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS contracts_fts USING fts5(
      vendor_name,
      poc_name,
      poc_email,
      notes,
      extracted_text,
      tokenize='porter'
    );
  `)

  db.pragma('user_version = 7')
}

// V8: Contract obligations (SLAs, payment milestones, reporting duties, etc.)
function runV8Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 8) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_obligations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL,
      responsible_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','completed','overdue','cancelled')),
      recurrence TEXT NOT NULL DEFAULT 'none'
        CHECK(recurrence IN ('none','monthly','quarterly','annual')),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_obligations_due_date ON contract_obligations(due_date);
    CREATE INDEX IF NOT EXISTS idx_obligations_contract ON contract_obligations(contract_id);
    CREATE INDEX IF NOT EXISTS idx_obligations_status ON contract_obligations(status);
  `)

  db.pragma('user_version = 8')
}

// V9: Audit log of user-driven mutations across key entities
function runV9Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 9) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL DEFAULT 'system',
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('create','update','delete')),
      diff_json TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
  `)

  db.pragma('user_version = 9')
}

// V10: Custom fields + tags attachable to contracts
function runV10Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 10) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL DEFAULT 'contract' CHECK(entity_type IN ('contract')),
      name TEXT NOT NULL,
      field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','select','boolean')),
      options_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, name)
    );

    CREATE TABLE IF NOT EXISTS custom_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      UNIQUE(field_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cfv_entity ON custom_field_values(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entity_tags (
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      PRIMARY KEY (tag_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_entity_tags ON entity_tags(entity_type, entity_id);
  `)

  db.pragma('user_version = 10')
}

// V11: Approval workflow — requests + steps with configurable approver ordering
function runV11Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 11) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_by_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','cancelled')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_approval_contract ON approval_requests(contract_id);
    CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status);

    CREATE TABLE IF NOT EXISTS approval_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
      approver_user_id INTEGER NOT NULL REFERENCES users(id),
      step_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','skipped')),
      comment TEXT NOT NULL DEFAULT '',
      acted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_approval_steps_request ON approval_steps(request_id);
  `)

  db.pragma('user_version = 11')
}

// V12: Reusable clause library for the contract builder
function runV12Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 12) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS clause_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      body_html TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      approved INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clause_library_category ON clause_library(category);
  `)

  db.pragma('user_version = 12')
}

// V13: Multi-currency — add optional currency column to contracts
function runV13Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 13) return
  db.exec(`ALTER TABLE contracts ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';`)
  db.pragma('user_version = 13')
}

// V14: Savings log — tracks cost reductions from renewals
function runV14Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 14) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS savings_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      renewal_id INTEGER REFERENCES renewal_history(id) ON DELETE SET NULL,
      renewal_date TEXT NOT NULL,
      amount REAL NOT NULL,
      fiscal_year INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_savings_log_fy ON savings_log(fiscal_year);
  `)
  db.pragma('user_version = 14')
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

// ─── Full-text search helpers ───────────────────────────────────────────────
// The contracts_fts virtual table is keyed by rowid = contracts.id. We
// maintain it manually (no triggers) so the sync points are explicit and
// we can include derived fields (concatenated vendor notes, extracted PDF
// text) that don't live directly on contracts.

function collectContractFtsFields(
  contractId: number
): { vendor_name: string; poc_name: string; poc_email: string; notes: string; extracted_text: string } | null {
  const row = db
    .prepare(
      'SELECT vendor_name, poc_name, poc_email FROM contracts WHERE id = ?'
    )
    .get(contractId) as
    | { vendor_name: string; poc_name: string; poc_email: string }
    | undefined
  if (!row) return null

  const notesRow = db
    .prepare(
      `SELECT COALESCE(GROUP_CONCAT(note, ' '), '') as notes
       FROM vendor_notes WHERE contract_id = ?`
    )
    .get(contractId) as { notes: string }

  const textRow = db
    .prepare('SELECT text FROM contract_extracted_text WHERE contract_id = ?')
    .get(contractId) as { text: string } | undefined

  return {
    vendor_name: row.vendor_name,
    poc_name: row.poc_name,
    poc_email: row.poc_email,
    notes: notesRow.notes,
    extracted_text: textRow?.text ?? ''
  }
}

export function refreshContractFts(contractId: number): void {
  const fields = collectContractFtsFields(contractId)
  db.prepare('DELETE FROM contracts_fts WHERE rowid = ?').run(contractId)
  if (!fields) return
  db.prepare(
    `INSERT INTO contracts_fts (rowid, vendor_name, poc_name, poc_email, notes, extracted_text)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    contractId,
    fields.vendor_name,
    fields.poc_name,
    fields.poc_email,
    fields.notes,
    fields.extracted_text
  )
}

export function removeContractFromFts(contractId: number): void {
  db.prepare('DELETE FROM contracts_fts WHERE rowid = ?').run(contractId)
  db.prepare('DELETE FROM contract_extracted_text WHERE contract_id = ?').run(contractId)
}

export function setContractExtractedText(contractId: number, text: string): void {
  db.prepare(
    `INSERT INTO contract_extracted_text (contract_id, text, extracted_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(contract_id) DO UPDATE SET
       text = excluded.text,
       extracted_at = excluded.extracted_at`
  ).run(contractId, text)
  refreshContractFts(contractId)
}

// One-time rebuild for existing contracts after the V7 migration runs
// (so search works on pre-existing data without requiring manual re-upload).
export function rebuildContractFtsIfEmpty(): void {
  const count = db.prepare('SELECT COUNT(*) as c FROM contracts_fts').get() as { c: number }
  if (count.c > 0) return
  const ids = db.prepare('SELECT id FROM contracts').all() as { id: number }[]
  for (const { id } of ids) refreshContractFts(id)
}
