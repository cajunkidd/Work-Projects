import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'
import type Database from 'better-sqlite3'

/**
 * Encryption at rest for stored credentials.
 *
 * The SMTP password, Gmail refresh token, Documenso key, and Anthropic key all
 * used to sit in plaintext in a SQLite file the README tells teams to put on a
 * shared network drive — anyone who could read the drive could read them.
 *
 * The design has to survive that shared-database model, which rules out
 * Electron's `safeStorage` as the primary cipher: it keys off the OS user, so
 * a value encrypted on one workstation is undecryptable on the next. Instead a
 * Super Admin sets one passphrase; a key is derived from it with scrypt and
 * secrets are sealed with AES-256-GCM. The passphrase itself is never stored
 * in the database — each workstation caches it locally, encrypted with
 * `safeStorage`, so it is entered once per machine rather than once per launch.
 *
 * Copying the .db file off the network drive therefore yields ciphertext.
 */

const SECRET_KEYS = ['smtp_pass', 'gmail_token', 'documenso_api_key', 'anthropic_api_key'] as const

const PREFIX = 'enc:v1:'
const VERIFIER_PLAINTEXT = 'contract-manager-secret-verifier'
const SALT_SETTING = 'secret_salt'
const VERIFIER_SETTING = 'secret_verifier'
const CACHE_FILENAME = '.secret-passphrase'

/** scrypt cost. N=2^15 keeps unlock well under a second on ordinary hardware. */
const SCRYPT_N = 32768
const SCRYPT_KEYLEN = 32

/** Derived key for the current session. Null when locked. */
let sessionKey: Buffer | null = null

export function isSecretKey(key: string): boolean {
  return (SECRET_KEYS as readonly string[]).includes(key)
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function putSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

function deriveKey(passphrase: string, saltHex: string): Buffer {
  return crypto.scryptSync(passphrase, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: 8,
    p: 1,
    // scrypt needs memory proportional to N; raise the default cap to match.
    maxmem: 64 * 1024 * 1024
  })
}

function seal(key: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

function open(key: Buffer, stored: string): string {
  const [ivHex, tagHex, ctHex] = stored.slice(PREFIX.length).split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  // GCM verifies the tag on final(); a wrong key or tampered value throws here.
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final()
  ]).toString('utf-8')
}

// ─── Per-machine passphrase cache ────────────────────────────────────────────

function cachePath(): string {
  return path.join(app.getPath('userData'), CACHE_FILENAME)
}

function cachePassphrase(passphrase: string): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return
    fs.writeFileSync(cachePath(), safeStorage.encryptString(passphrase))
  } catch (err) {
    // Caching is a convenience; failing it only means re-entering on next launch.
    console.error('[secrets] could not cache passphrase:', err)
  }
}

function readCachedPassphrase(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const file = cachePath()
    if (!fs.existsSync(file)) return null
    return safeStorage.decryptString(fs.readFileSync(file))
  } catch {
    return null
  }
}

export function clearCachedPassphrase(): void {
  try {
    const file = cachePath()
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch {
    /* nothing actionable */
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

/** True once a Super Admin has set a passphrase for this database. */
export function isConfigured(db: Database.Database): boolean {
  return getSetting(db, VERIFIER_SETTING) !== null
}

/** True when this session holds the key and can read/write secrets. */
export function isUnlocked(): boolean {
  return sessionKey !== null
}

export function lock(): void {
  sessionKey = null
}

/**
 * Verifies a passphrase and holds the derived key for this session.
 * `remember` caches it on this machine via the OS keystore.
 */
export function unlock(
  db: Database.Database,
  passphrase: string,
  remember = true
): { ok: boolean; error?: string } {
  const salt = getSetting(db, SALT_SETTING)
  const verifier = getSetting(db, VERIFIER_SETTING)
  if (!salt || !verifier) return { ok: false, error: 'No passphrase has been set for this database.' }

  try {
    const key = deriveKey(passphrase, salt)
    if (open(key, verifier) !== VERIFIER_PLAINTEXT) {
      return { ok: false, error: 'That passphrase is incorrect.' }
    }
    sessionKey = key
    if (remember) cachePassphrase(passphrase)
    return { ok: true }
  } catch {
    return { ok: false, error: 'That passphrase is incorrect.' }
  }
}

/** Called at startup: unlocks silently when this machine has the passphrase cached. */
export function tryAutoUnlock(db: Database.Database): boolean {
  if (!isConfigured(db)) return false
  const cached = readCachedPassphrase()
  if (!cached) return false
  return unlock(db, cached, false).ok
}

/**
 * Sets the passphrase for the first time, or rotates it.
 *
 * Rotation re-seals every stored secret under the new key, so an old passphrase
 * stops working everywhere at once. Rotating requires the session to be
 * unlocked, since the existing values must be read first.
 */
export function setPassphrase(
  db: Database.Database,
  newPassphrase: string,
  currentPassphrase?: string
): { ok: boolean; error?: string; resealed?: number } {
  if (newPassphrase.length < 8) {
    return { ok: false, error: 'The passphrase must be at least 8 characters.' }
  }

  const alreadyConfigured = isConfigured(db)

  // Rotating: prove the old passphrase, then read every secret in the clear.
  const plaintextSecrets: Record<string, string> = {}
  if (alreadyConfigured) {
    if (currentPassphrase) {
      const check = unlock(db, currentPassphrase, false)
      if (!check.ok) return { ok: false, error: check.error }
    } else if (!isUnlocked()) {
      return { ok: false, error: 'Unlock with the current passphrase before changing it.' }
    }

    for (const key of SECRET_KEYS) {
      const stored = getSetting(db, key)
      if (stored === null) continue
      const value = isEncrypted(stored) ? safeDecrypt(stored) : stored
      if (value !== null) plaintextSecrets[key] = value
    }
  } else {
    // First run: anything already stored is plaintext and gets sealed as-is.
    for (const key of SECRET_KEYS) {
      const stored = getSetting(db, key)
      if (stored !== null && stored !== '' && !isEncrypted(stored)) plaintextSecrets[key] = stored
    }
  }

  const saltHex = crypto.randomBytes(16).toString('hex')
  const key = deriveKey(newPassphrase, saltHex)

  const apply = db.transaction(() => {
    putSetting(db, SALT_SETTING, saltHex)
    putSetting(db, VERIFIER_SETTING, seal(key, VERIFIER_PLAINTEXT))
    for (const [name, value] of Object.entries(plaintextSecrets)) {
      putSetting(db, name, seal(key, value))
    }
  })
  apply()

  sessionKey = key
  cachePassphrase(newPassphrase)

  return { ok: true, resealed: Object.keys(plaintextSecrets).length }
}

// ─── Read / write ────────────────────────────────────────────────────────────

/**
 * Seals a value for storage. Returns it unchanged when encryption isn't
 * configured, so the app keeps working before a passphrase is set.
 */
export function encryptForStorage(db: Database.Database, value: string): string {
  if (!isConfigured(db) || !sessionKey || value === '') return value
  return seal(sessionKey, value)
}

/**
 * Unseals a stored value. Returns null when the value is encrypted but this
 * session is locked — callers treat that as "credential unavailable" rather
 * than passing ciphertext to an SMTP server or an API.
 */
export function decryptFromStorage(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null
  if (!isEncrypted(stored)) return stored
  return safeDecrypt(stored)
}

function safeDecrypt(stored: string): string | null {
  if (!sessionKey) return null
  try {
    return open(sessionKey, stored)
  } catch (err) {
    console.error('[secrets] could not decrypt a stored value:', err)
    return null
  }
}

/** Reads one credential in the clear, or null when locked/absent. */
export function readSecret(db: Database.Database, key: string): string | null {
  return decryptFromStorage(getSetting(db, key))
}

/** Which secrets exist, and whether any are still stored in plaintext. */
export function secretStatus(db: Database.Database): {
  configured: boolean
  unlocked: boolean
  encryption_available: boolean
  stored: number
  plaintext: number
} {
  let stored = 0
  let plaintext = 0
  for (const key of SECRET_KEYS) {
    const value = getSetting(db, key)
    if (value === null || value === '') continue
    stored++
    if (!isEncrypted(value)) plaintext++
  }

  let encryptionAvailable = false
  try {
    encryptionAvailable = safeStorage.isEncryptionAvailable()
  } catch {
    encryptionAvailable = false
  }

  return {
    configured: isConfigured(db),
    unlocked: isUnlocked(),
    encryption_available: encryptionAvailable,
    stored,
    plaintext
  }
}

export { SECRET_KEYS }
