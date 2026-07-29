import type Database from 'better-sqlite3'
import { normalizeVendorName } from './database'

/**
 * Keeps `contracts.vendor_id` in step with the free-text `vendor_name`.
 *
 * Contracts can still be created by typing a vendor name — from the form, a
 * bulk import, or a PDF parse — so rather than forcing every caller to pick a
 * vendor record first, this resolves the name to one (creating it when new)
 * and returns the id. Matching is on the normalised name, so "Acme, Inc." and
 * "Acme Inc" land on the same vendor instead of creating a duplicate.
 */
export function linkContractToVendor(
  db: Database.Database,
  contractId: number,
  vendorName: string
): number | null {
  const name = (vendorName ?? '').trim()
  if (!name) return null

  try {
    const normalized = normalizeVendorName(name) || name.toLowerCase()

    let vendor = db
      .prepare('SELECT id FROM vendors WHERE normalized_name = ? ORDER BY id LIMIT 1')
      .get(normalized) as { id: number } | undefined

    if (!vendor) {
      db.prepare(
        `INSERT INTO vendors (name, normalized_name) VALUES (?, ?)
         ON CONFLICT(name) DO NOTHING`
      ).run(name, normalized)
      vendor = db
        .prepare('SELECT id FROM vendors WHERE normalized_name = ? ORDER BY id LIMIT 1')
        .get(normalized) as { id: number } | undefined
    }

    if (!vendor) return null
    db.prepare('UPDATE contracts SET vendor_id = ? WHERE id = ?').run(vendor.id, contractId)
    return vendor.id
  } catch (err) {
    // A failure to link must never block saving the contract.
    console.error('[vendorLink] could not link contract to vendor:', err)
    return null
  }
}
