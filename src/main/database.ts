import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database
let dbDirectory: string

export function getDb(): Database.Database {
  return db
}

/**
 * Directory holding the database file. Managed document storage lives beside
 * it so a team pointing at a shared network database also shares the documents.
 */
export function getDbDirectory(): string {
  return dbDirectory
}

export function initDatabase(customPath?: string): void {
  const dbPath = customPath
    ? path.join(customPath, 'contract-manager.db')
    : path.join(app.getPath('userData'), 'contract-manager.db')

  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  dbDirectory = dbDir

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
  runV7Migration()
  runV8Migration()
  runV9Migration()
  runV10Migration()

  // Auto-compute contract statuses
  updateContractStatuses()
}

function runV1Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 1) return

  // This migration rebuilds tables with the rename-copy-drop dance. Since
  // SQLite 3.25 a plain `ALTER TABLE x RENAME TO x_old` also rewrites every
  // *other* table's foreign key to point at the new name — so dropping x_old
  // afterwards leaves those tables referencing a table that no longer exists,
  // and any insert into them fails with "no such table: main.x_old".
  // legacy_alter_table restores the old rename-only-this-table behaviour.
  // runV10Migration repairs databases that already went through this.
  db.pragma('legacy_alter_table = ON')

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

  db.pragma('legacy_alter_table = OFF')

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

  // Recreate branch_assets with expanded asset_type CHECK to include printer and ingenico.
  // Same rename hazard as v1 — see the note there.
  db.pragma('legacy_alter_table = ON')
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
  db.pragma('legacy_alter_table = OFF')

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

function runV7Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 7) return

  // Evergreen renewal support on contracts
  db.exec(`
    ALTER TABLE contracts ADD COLUMN renewal_type
      TEXT NOT NULL DEFAULT 'fixed_term'
      CHECK(renewal_type IN ('fixed_term','evergreen'));

    ALTER TABLE contracts ADD COLUMN cancellation_notice_days
      INTEGER NOT NULL DEFAULT 0;
  `)

  // Per-month budget tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS monthly_budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
      branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
      fiscal_year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(department_id, branch_id, fiscal_year, month)
    );
  `)

  db.pragma('user_version = 7')
}

/**
 * Governance features: audit trail, approval routing, document versioning,
 * and the clause library.
 */
function runV8Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 8) return

  // ─── Audit trail ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      entity_label TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      summary TEXT NOT NULL DEFAULT '',
      user_id INTEGER,
      user_name TEXT NOT NULL DEFAULT 'System',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_entity
      ON audit_log(entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  `)

  // Who last touched a contract, and its governance state. `approval_state` is
  // deliberately separate from `status` so the date-driven lifecycle sweep and
  // the approval lifecycle can't overwrite one another.
  db.exec(`
    ALTER TABLE contracts ADD COLUMN updated_at TEXT;
    ALTER TABLE contracts ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE contracts ADD COLUMN approval_state TEXT NOT NULL DEFAULT 'not_required'
      CHECK(approval_state IN ('not_required','draft','pending','approved','rejected'));
  `)

  // Notes previously recorded only a free-text author name.
  db.exec(`ALTER TABLE vendor_notes ADD COLUMN created_by_user_id INTEGER;`)

  // ─── Approval workflows ────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
      branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
      min_amount REAL NOT NULL DEFAULT 0,
      max_amount REAL,
      amount_field TEXT NOT NULL DEFAULT 'annual_cost'
        CHECK(amount_field IN ('annual_cost','monthly_cost','total_cost')),
      vendor_pattern TEXT NOT NULL DEFAULT '',
      approver_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      approver_role TEXT,
      step_order INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(approver_user_id IS NOT NULL OR approver_role IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      requested_by_user_id INTEGER,
      requested_by_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','cancelled')),
      note TEXT NOT NULL DEFAULT '',
      current_step INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS approval_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
      rule_id INTEGER REFERENCES approval_rules(id) ON DELETE SET NULL,
      rule_name TEXT NOT NULL DEFAULT '',
      step_order INTEGER NOT NULL DEFAULT 1,
      approver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approver_role TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','skipped')),
      decided_by_user_id INTEGER,
      decided_by_name TEXT NOT NULL DEFAULT '',
      decided_at TEXT,
      comment TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_approval_requests_contract
      ON approval_requests(contract_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_approval_steps_request
      ON approval_steps(request_id, step_order);
  `)

  // ─── Contract versions ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      version_no INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual'
        CHECK(source IN ('manual','upload','template','import')),
      file_path TEXT,
      fields_snapshot TEXT NOT NULL DEFAULT '{}',
      change_summary TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER,
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(contract_id, version_no)
    );

    CREATE INDEX IF NOT EXISTS idx_versions_contract
      ON contract_versions(contract_id, version_no DESC);
  `)

  // ─── Clause library ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS clauses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      body TEXT NOT NULL,
      clause_type TEXT NOT NULL DEFAULT 'standard'
        CHECK(clause_type IN ('standard','fallback','alternative')),
      parent_id INTEGER REFERENCES clauses(id) ON DELETE CASCADE,
      risk_level TEXT NOT NULL DEFAULT 'medium'
        CHECK(risk_level IN ('low','medium','high')),
      tags TEXT NOT NULL DEFAULT '',
      guidance TEXT NOT NULL DEFAULT '',
      is_archived INTEGER NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clauses_category ON clauses(category, is_archived);
  `)

  seedStarterClauses()

  db.pragma('user_version = 8')
}

/**
 * Ships the library with a usable starting set: each standard clause is paired
 * with the fallback position teams actually negotiate down to, so the
 * standard/fallback relationship is visible from first launch.
 */
function seedStarterClauses(): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM clauses').get() as { n: number }
  if (existing.n > 0) return

  const insert = db.prepare(`
    INSERT INTO clauses (title, category, body, clause_type, parent_id, risk_level, tags, guidance, created_by_name)
    VALUES (@title, @category, @body, @clause_type, @parent_id, @risk_level, @tags, @guidance, 'System')
  `)

  const seed = db.transaction(() => {
    const standards = [
      {
        title: 'Confidentiality',
        category: 'Confidentiality',
        risk_level: 'medium',
        tags: 'nda, confidential, proprietary',
        body: 'Each party shall hold in strict confidence all Confidential Information disclosed by the other party and shall not disclose such information to any third party without the prior written consent of the disclosing party. This obligation shall survive termination of this Agreement for a period of five (5) years.',
        guidance: 'Preferred position. Use for all vendor agreements involving access to business data.',
        fallback: {
          title: 'Confidentiality — 3 Year Survival',
          body: 'Each party shall hold in confidence all Confidential Information disclosed by the other party and shall not disclose such information to any third party without prior written consent. This obligation shall survive termination of this Agreement for a period of three (3) years.',
          risk_level: 'medium',
          guidance: 'Acceptable fallback when the vendor will not agree to a five-year survival period.'
        }
      },
      {
        title: 'Limitation of Liability',
        category: 'Risk & Liability',
        risk_level: 'high',
        tags: 'liability, cap, damages',
        body: "Except for breaches of confidentiality, indemnification obligations, or gross negligence, neither party's aggregate liability under this Agreement shall exceed the total fees paid by Customer in the twelve (12) months preceding the event giving rise to the claim.",
        guidance: 'Preferred position: 12-month fee cap with standard carve-outs. Escalate to Legal before agreeing to a lower cap.',
        fallback: {
          title: 'Limitation of Liability — Fees Paid Cap',
          body: "Neither party's aggregate liability under this Agreement shall exceed the total fees paid by Customer under this Agreement. Neither party shall be liable for indirect, incidental, or consequential damages.",
          risk_level: 'high',
          guidance: 'Fallback only. Removes the carve-outs — requires Director sign-off before use.'
        }
      },
      {
        title: 'Termination for Convenience',
        category: 'Term & Termination',
        risk_level: 'medium',
        tags: 'termination, exit, notice',
        body: 'Customer may terminate this Agreement, in whole or in part, for any reason upon thirty (30) days prior written notice to Vendor. Upon such termination, Customer shall pay only for services rendered through the effective date of termination.',
        guidance: 'Preferred position. Always seek a convenience-termination right on multi-year commitments.',
        fallback: {
          title: 'Termination for Convenience — 90 Day Notice',
          body: 'Customer may terminate this Agreement for any reason upon ninety (90) days prior written notice to Vendor. Customer shall remain responsible for fees accrued through the effective date of termination.',
          risk_level: 'medium',
          guidance: 'Fallback when the vendor requires a longer runway. Do not accept beyond 90 days.'
        }
      },
      {
        title: 'Automatic Renewal',
        category: 'Term & Termination',
        risk_level: 'high',
        tags: 'evergreen, auto-renew, renewal',
        body: 'This Agreement shall automatically renew for successive one (1) year terms unless either party provides written notice of non-renewal at least sixty (60) days prior to the end of the then-current term. Vendor shall provide Customer written notice of the upcoming renewal no less than ninety (90) days before the renewal date.',
        guidance: 'If auto-renewal cannot be removed, insist on the vendor-notice requirement and record the notice period on the contract record.',
        fallback: {
          title: 'Automatic Renewal — Mutual Written Consent',
          body: 'This Agreement shall not renew automatically. Any renewal shall require the mutual written agreement of both parties, executed prior to the expiration of the then-current term.',
          risk_level: 'low',
          guidance: 'Preferred alternative: eliminates evergreen risk entirely. Propose this first.'
        }
      },
      {
        title: 'Payment Terms — Net 30',
        category: 'Commercial',
        risk_level: 'low',
        tags: 'payment, invoice, net30',
        body: 'Customer shall pay all undisputed invoices within thirty (30) days of receipt. Customer may withhold payment of any disputed amount pending resolution, provided Customer notifies Vendor of the dispute within fifteen (15) days of invoice receipt.',
        guidance: 'Standard commercial terms. The dispute-withholding right is required on all agreements.',
        fallback: null
      },
      {
        title: 'Price Increase Cap',
        category: 'Commercial',
        risk_level: 'medium',
        tags: 'pricing, increase, cap, renewal',
        body: 'Vendor shall not increase fees during the Initial Term. For any renewal term, fees shall not increase by more than three percent (3%) over the fees in effect during the prior term, and Vendor shall provide at least ninety (90) days written notice of any such increase.',
        guidance: 'Preferred position on any renewable agreement. Pairs with the renewal price-trend tracking on the contract record.',
        fallback: {
          title: 'Price Increase Cap — CPI Linked',
          body: 'For any renewal term, fees shall not increase by more than the lesser of five percent (5%) or the increase in the Consumer Price Index (CPI-U) over the preceding twelve months, with ninety (90) days written notice.',
          risk_level: 'medium',
          guidance: 'Fallback when the vendor rejects a flat percentage cap.'
        }
      },
      {
        title: 'Data Protection & Security',
        category: 'Data & Privacy',
        risk_level: 'high',
        tags: 'security, data, breach, pii',
        body: 'Vendor shall implement and maintain administrative, physical, and technical safeguards consistent with industry standards to protect Customer Data. Vendor shall notify Customer without undue delay, and in no event later than seventy-two (72) hours, after becoming aware of any security incident affecting Customer Data.',
        guidance: 'Required for any vendor that stores, processes, or can access company or customer data.',
        fallback: null
      },
      {
        title: 'Indemnification',
        category: 'Risk & Liability',
        risk_level: 'high',
        tags: 'indemnity, ip, third party',
        body: 'Vendor shall defend, indemnify, and hold harmless Customer from and against any third-party claims arising out of (a) Vendor\'s breach of this Agreement, (b) Vendor\'s negligence or willful misconduct, or (c) any allegation that the Services infringe a third party\'s intellectual property rights.',
        guidance: 'Preferred position. The IP infringement limb is non-negotiable for software and SaaS agreements.',
        fallback: null
      },
      {
        title: 'Service Level Agreement — 99.9% Uptime',
        category: 'Service Levels',
        risk_level: 'medium',
        tags: 'sla, uptime, credits',
        body: 'Vendor shall maintain availability of the Services at no less than 99.9% measured monthly, excluding scheduled maintenance. Failure to meet this level shall entitle Customer to service credits of 10% of the monthly fee for each full percentage point below the committed level.',
        guidance: 'Use for any business-critical hosted service. Confirm the credits are meaningful relative to the contract value.',
        fallback: null
      },
      {
        title: 'Governing Law — Louisiana',
        category: 'General',
        risk_level: 'low',
        tags: 'governing law, venue, jurisdiction',
        body: 'This Agreement shall be governed by and construed in accordance with the laws of the State of Louisiana, without regard to its conflict of laws principles. The parties consent to the exclusive jurisdiction of the state and federal courts located in Louisiana.',
        guidance: 'Preferred venue. Escalate to Legal if the vendor insists on their home jurisdiction.',
        fallback: null
      }
    ]

    for (const std of standards) {
      const result = insert.run({
        title: std.title,
        category: std.category,
        body: std.body,
        clause_type: 'standard',
        parent_id: null,
        risk_level: std.risk_level,
        tags: std.tags,
        guidance: std.guidance
      })

      if (std.fallback) {
        insert.run({
          title: std.fallback.title,
          category: std.category,
          body: std.fallback.body,
          clause_type: 'fallback',
          parent_id: result.lastInsertRowid as number,
          risk_level: std.fallback.risk_level,
          tags: std.tags,
          guidance: std.fallback.guidance
        })
      }
    }
  })

  seed()
}

/**
 * Vendor records, managed document storage with full-text search, obligation
 * tracking, AI extraction history, and outbound webhooks.
 */
function runV9Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 9) return

  // ─── Vendors as first-class records ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      normalized_name TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL DEFAULT '',
      tax_id TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active','inactive','do_not_use')),
      rating INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS vendor_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      is_primary INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vendor_contacts ON vendor_contacts(vendor_id);
  `)

  db.exec(`ALTER TABLE contracts ADD COLUMN vendor_id INTEGER REFERENCES vendors(id);`)

  // Promote every distinct free-text vendor_name to a real vendor record and
  // link the contracts to it. vendor_name stays on the contract as a
  // denormalised label so existing queries, exports, and Gmail matching keep
  // working untouched.
  backfillVendors()

  // ─── Managed document storage + full-text search ──────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'contract'
        CHECK(doc_type IN ('contract','amendment','sow','invoice','quote','correspondence','other')),
      original_path TEXT,
      stored_path TEXT NOT NULL,
      file_hash TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT '',
      page_count INTEGER,
      extracted_text TEXT NOT NULL DEFAULT '',
      extraction_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(extraction_status IN ('pending','extracted','no_text_layer','failed')),
      extraction_note TEXT NOT NULL DEFAULT '',
      uploaded_by_user_id INTEGER,
      uploaded_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_contract ON documents(contract_id);
    CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);
  `)

  // External-content FTS5 index over the extracted text. The triggers keep it
  // in step with the documents table.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      title, extracted_text, content='documents', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS documents_fts_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, title, extracted_text)
        VALUES (new.id, new.title, new.extracted_text);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_fts_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, extracted_text)
        VALUES ('delete', old.id, old.title, old.extracted_text);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_fts_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, extracted_text)
        VALUES ('delete', old.id, old.title, old.extracted_text);
      INSERT INTO documents_fts(rowid, title, extracted_text)
        VALUES (new.id, new.title, new.extracted_text);
    END;
  `)

  // ─── Obligations, milestones, and SLAs ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS obligations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      obligation_type TEXT NOT NULL DEFAULT 'deliverable'
        CHECK(obligation_type IN ('deliverable','milestone','sla','payment','compliance','renewal_task','other')),
      responsible_party TEXT NOT NULL DEFAULT 'vendor'
        CHECK(responsible_party IN ('us','vendor','both')),
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      owner_name TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      recurrence TEXT NOT NULL DEFAULT 'none'
        CHECK(recurrence IN ('none','monthly','quarterly','semiannual','annual')),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open','in_progress','completed','waived')),
      completed_at TEXT,
      completed_by_name TEXT NOT NULL DEFAULT '',
      reminder_days INTEGER NOT NULL DEFAULT 7,
      critical INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ai_extracted')),
      source_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_obligations_contract ON obligations(contract_id);
    CREATE INDEX IF NOT EXISTS idx_obligations_due ON obligations(status, due_date);
  `)

  // ─── AI extraction history ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
      contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','completed','failed','refused')),
      model TEXT NOT NULL DEFAULT '',
      effort TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_extraction_document ON extraction_runs(document_id);
  `)

  // ─── Outbound webhooks ────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL DEFAULT '',
      events TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      last_status INTEGER,
      last_error TEXT NOT NULL DEFAULT '',
      last_fired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '',
      status_code INTEGER,
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries
      ON webhook_deliveries(webhook_id, created_at DESC);
  `)

  db.pragma('user_version = 9')
}

/**
 * Repairs foreign keys left pointing at a dropped `*_old` table.
 *
 * Earlier migrations rebuilt `users`, `contracts`, `budget`, and `branch_assets`
 * by renaming the original aside, recreating it, copying rows, and dropping the
 * rename. Since SQLite 3.25 that rename also rewrites every other table's
 * foreign key to follow it, so once the `_old` table was dropped, tables like
 * `invoices` and `contract_line_items` referenced a table that no longer
 * existed. With foreign keys on, every insert into them failed with
 * "no such table: main.contracts_old" — line items, renewal history,
 * competitor offerings, invoices, projects, and notes were all unwritable on any
 * upgraded database.
 *
 * The migrations no longer cause this (they set legacy_alter_table). This
 * repairs databases that already went through the broken path, by recreating
 * each affected table from its own stored schema with the reference corrected.
 */
function runV10Migration(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version >= 10) return

  const existing = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string
    }[]).map((r) => r.name)
  )

  const tables = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL")
    .all() as { name: string; sql: string }[]

  // Collect the tables whose CREATE statement names a table that isn't there.
  const broken: { name: string; sql: string }[] = []
  for (const t of tables) {
    let fixed = t.sql
    for (const m of t.sql.matchAll(/REFERENCES\s+"([^"]+)"/g)) {
      const target = m[1]
      if (existing.has(target)) continue
      // "contracts_old" → contracts, "branch_assets_v3" → branch_assets
      const base = target.replace(/_(old|v\d+)$/, '')
      if (base === target || !existing.has(base)) continue
      fixed = fixed.split(`REFERENCES "${target}"`).join(`REFERENCES "${base}"`)
    }
    if (fixed !== t.sql) broken.push({ name: t.name, sql: fixed })
  }

  if (broken.length === 0) {
    db.pragma('user_version = 10')
    return
  }

  // Foreign keys must be off: the temporary rename below would otherwise be
  // policed against the very constraints being repaired. legacy_alter_table
  // keeps the rename from rewriting anything else on the way through.
  db.pragma('foreign_keys = OFF')
  db.pragma('legacy_alter_table = ON')

  try {
    db.transaction(() => {
      for (const t of broken) {
        // A rename carries indexes and triggers with it, and dropping the
        // renamed copy would take them along — so re-create them afterwards.
        const attached = db
          .prepare(
            `SELECT type, sql FROM sqlite_master
             WHERE tbl_name = ? AND type IN ('index','trigger') AND sql IS NOT NULL`
          )
          .all(t.name) as { type: string; sql: string }[]

        const tmp = `${t.name}__fk_repair`
        db.exec(`ALTER TABLE "${t.name}" RENAME TO "${tmp}"`)
        db.exec(t.sql)
        db.exec(`INSERT INTO "${t.name}" SELECT * FROM "${tmp}"`)
        db.exec(`DROP TABLE "${tmp}"`)
        for (const a of attached) db.exec(a.sql)
      }
    })()
  } finally {
    db.pragma('legacy_alter_table = OFF')
    db.pragma('foreign_keys = ON')
  }

  db.pragma('user_version = 10')
}

/** Normalises a vendor name for duplicate detection ("Acme, Inc." → "acme"). */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|plc|gmbh|limited)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Creates a vendor record per distinct contract vendor_name and links contracts
 * to it. Names that normalise to the same value collapse into one record, so
 * "Acme Inc." and "Acme, Inc" stop being two different vendors.
 */
function backfillVendors(): void {
  const rows = db
    .prepare(`SELECT DISTINCT vendor_name FROM contracts WHERE TRIM(vendor_name) != ''`)
    .all() as { vendor_name: string }[]
  if (rows.length === 0) return

  const insertVendor = db.prepare(
    `INSERT INTO vendors (name, normalized_name) VALUES (?, ?)
     ON CONFLICT(name) DO NOTHING`
  )
  const findByNormalized = db.prepare(
    'SELECT id FROM vendors WHERE normalized_name = ? ORDER BY id LIMIT 1'
  )
  const linkContracts = db.prepare('UPDATE contracts SET vendor_id = ? WHERE vendor_name = ?')

  const run = db.transaction(() => {
    for (const row of rows) {
      const name = row.vendor_name.trim()
      const normalized = normalizeVendorName(name) || name.toLowerCase()

      // Reuse an existing vendor when the normalised names collide.
      let existing = findByNormalized.get(normalized) as { id: number } | undefined
      if (!existing) {
        insertVendor.run(name, normalized)
        existing = findByNormalized.get(normalized) as { id: number } | undefined
      }
      if (existing) linkContracts.run(existing.id, row.vendor_name)
    }
  })

  run()
}

/**
 * Recomputes the date-driven lifecycle status.
 *
 * Contracts sitting in the approval pipeline are excluded: a contract awaiting
 * or refused sign-off keeps status 'pending' regardless of its dates, so this
 * sweep must not promote it to active/expiring_soon behind the approver's back.
 */
export function updateContractStatuses(): void {
  db.exec(`
    -- Fixed-term: expire when past end_date
    UPDATE contracts SET status = 'expired'
    WHERE renewal_type = 'fixed_term'
      AND approval_state NOT IN ('draft','pending','rejected')
      AND date(end_date) < date('now') AND status != 'expired';

    -- Evergreen: auto-renew — advance end_date by 1-year cycles until it's in the future
    UPDATE contracts SET
      end_date = date(end_date, '+' ||
        (CAST((julianday('now') - julianday(end_date)) / 365.25 AS INTEGER) + 1) || ' years'),
      status = 'active'
    WHERE renewal_type = 'evergreen'
      AND approval_state NOT IN ('draft','pending','rejected')
      AND date(end_date) < date('now');

    -- Fixed-term: expiring soon within 120 days of end_date
    UPDATE contracts SET status = 'expiring_soon'
    WHERE renewal_type = 'fixed_term'
      AND approval_state NOT IN ('draft','pending','rejected')
      AND date(end_date) BETWEEN date('now') AND date('now', '+120 days')
      AND status = 'active';

    -- Evergreen: expiring soon within 120 days of the next renewal cycle
    UPDATE contracts SET status = 'expiring_soon'
    WHERE renewal_type = 'evergreen'
      AND approval_state NOT IN ('draft','pending','rejected')
      AND date(end_date) BETWEEN date('now') AND date('now', '+120 days')
      AND status = 'active';
  `)
}
