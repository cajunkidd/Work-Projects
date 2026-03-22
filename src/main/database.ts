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

  // Auto-compute contract statuses
  updateContractStatuses()
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
