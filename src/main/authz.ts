import type Database from 'better-sqlite3'
import type { Actor, UserRole } from '../shared/types'

/**
 * Main-process authorisation.
 *
 * The renderer sends an `actor` on every mutating call, but a renderer can
 * claim any role it likes — so nothing here trusts the claimed role. Each check
 * re-reads the user from the database by id and decides from the stored role.
 *
 * This closes the hole where a handler like `users:create` or `settings:set`
 * relied entirely on the UI hiding the button.
 */

const LEVELS: Record<UserRole, number> = {
  store_manager: 0,
  director: 1,
  super_admin: 2
}

export interface ResolvedActor {
  id: number
  name: string
  role: UserRole
  department_ids: number[]
  branch_ids: number[]
}

/** Loads the acting user from the database. Returns null if the id is unknown. */
export function resolveActor(
  db: Database.Database,
  actor: Actor | { id?: number } | null | undefined
): ResolvedActor | null {
  const id = actor?.id
  if (!id) return null

  const row = db
    .prepare('SELECT id, name, role, department_ids, branch_ids FROM users WHERE id = ?')
    .get(id) as
    | { id: number; name: string; role: UserRole; department_ids: string; branch_ids: string }
    | undefined
  if (!row) return null

  const parse = (json: string): number[] => {
    try {
      const parsed = JSON.parse(json)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    department_ids: parse(row.department_ids),
    branch_ids: parse(row.branch_ids)
  }
}

export interface AuthzFailure {
  success: false
  error: string
}

/**
 * Gate for a handler. Returns the resolved actor on success, or an IpcResponse
 * shaped failure the handler can return directly:
 *
 *   const gate = requireRole(db, payload.actor, 'super_admin')
 *   if ('error' in gate) return gate
 *   // gate is the trusted actor from here on
 */
export function requireRole(
  db: Database.Database,
  actor: Actor | { id?: number } | null | undefined,
  minRole: UserRole
): ResolvedActor | AuthzFailure {
  const resolved = resolveActor(db, actor)
  if (!resolved) {
    return {
      success: false,
      error: 'Could not identify the acting user. Sign out and back in, then try again.'
    }
  }

  if (LEVELS[resolved.role] < LEVELS[minRole]) {
    return {
      success: false,
      error: `This action requires the ${minRole.replace('_', ' ')} role.`
    }
  }

  return resolved
}

/** Narrowing helper so call sites read cleanly. */
export function denied(result: ResolvedActor | AuthzFailure): result is AuthzFailure {
  return (result as AuthzFailure).success === false
}

/**
 * SQL fragment restricting a query to the contracts an actor may see.
 *
 * Read paths previously filtered on a role and id list the *renderer* supplied,
 * so a modified renderer could ask for everything. Callers now pass only an
 * actor id; the scope is derived here from the stored role.
 *
 * `alias` is the contracts table alias in the calling query. The returned SQL
 * always begins with " AND " so it can be appended to a `WHERE 1=1` query.
 */
export function contractScopeClause(
  actor: ResolvedActor | null,
  alias = 'c'
): { sql: string; params: number[] } {
  // No identifiable user sees nothing. Failing closed matters more here than
  // being lenient to a caller that forgot to pass an actor.
  if (!actor) return { sql: ' AND 1=0', params: [] }

  if (actor.role === 'super_admin') return { sql: '', params: [] }

  if (actor.role === 'director') {
    const clauses: string[] = []
    const params: number[] = []

    if (actor.department_ids.length > 0) {
      clauses.push(`${alias}.department_id IN (${actor.department_ids.map(() => '?').join(',')})`)
      params.push(...actor.department_ids)
    }
    if (actor.branch_ids.length > 0) {
      clauses.push(`${alias}.branch_id IN (${actor.branch_ids.map(() => '?').join(',')})`)
      params.push(...actor.branch_ids)
    }

    if (clauses.length === 0) return { sql: ' AND 1=0', params: [] }
    return { sql: ` AND (${clauses.join(' OR ')})`, params }
  }

  // store_manager: only their own branches.
  if (actor.branch_ids.length === 0) return { sql: ' AND 1=0', params: [] }
  return {
    sql: ` AND ${alias}.branch_id IN (${actor.branch_ids.map(() => '?').join(',')})`,
    params: [...actor.branch_ids]
  }
}

/**
 * Gate for anything hanging off a contract — line items, notes, versions,
 * documents, obligations, renewals, competitor offerings, allocations.
 *
 * These handlers all take a bare `contract_id`. Without this check, being
 * unable to open a contract didn't stop you from reading its pricing, its
 * negotiation history, or the documents attached to it.
 *
 * Returns null when access is allowed, or an IpcResponse-shaped failure the
 * handler can return directly. A contract that is missing and one that is out
 * of scope give the same answer, so the refusal doesn't confirm it exists.
 */
export function requireContractAccess(
  db: Database.Database,
  contractId: number | null | undefined,
  actor: Actor | { id?: number } | null | undefined
): AuthzFailure | null {
  const resolved = resolveActor(db, actor)
  if (!resolved) {
    return {
      success: false,
      error: 'Could not identify the acting user. Sign out and back in, then try again.'
    }
  }
  if (resolved.role === 'super_admin') return null
  if (!contractId) return { success: false, error: 'Contract not found.' }

  const row = db
    .prepare('SELECT department_id, branch_id FROM contracts WHERE id = ?')
    .get(contractId) as { department_id: number | null; branch_id: number | null } | undefined
  if (!row) return { success: false, error: 'Contract not found.' }
  if (!canAccessScope(resolved, row.department_id, row.branch_id)) {
    return { success: false, error: 'Contract not found.' }
  }
  return null
}

/**
 * Tables whose rows belong to a contract. Used to resolve a bare row id back to
 * the contract that governs it.
 *
 * A whitelist rather than an interpolated caller-supplied name — the table goes
 * straight into SQL, where a parameter can't be used.
 */
const CONTRACT_CHILD_TABLES = {
  contract_line_items: 'contract_id',
  renewal_history: 'contract_id',
  vendor_notes: 'contract_id',
  competitor_offerings: 'contract_id',
  contract_allocations: 'contract_id',
  vendor_projects: 'contract_id',
  contract_versions: 'contract_id',
  obligations: 'contract_id',
  documents: 'contract_id',
  invoices: 'contract_id'
} as const

export type ContractChildTable = keyof typeof CONTRACT_CHILD_TABLES

/**
 * Gate for a mutation that identifies its target by row id alone —
 * `lineItems:delete`, `notes:delete`, `projects:update`, and friends.
 *
 * The read paths were closed first, but a delete taking a bare row id had the
 * same hole: nothing tied the row back to a contract the actor may touch. This
 * resolves the row's contract and applies the same check.
 *
 * A row that doesn't exist and one belonging to an unreachable contract give
 * the same answer.
 */
export function requireRowContractAccess(
  db: Database.Database,
  table: ContractChildTable,
  rowId: number | null | undefined,
  actor: Actor | { id?: number } | null | undefined
): AuthzFailure | null {
  const resolved = resolveActor(db, actor)
  if (!resolved) {
    return {
      success: false,
      error: 'Could not identify the acting user. Sign out and back in, then try again.'
    }
  }
  if (resolved.role === 'super_admin') return null
  if (!rowId) return { success: false, error: 'Item not found.' }

  const column = CONTRACT_CHILD_TABLES[table]
  const row = db.prepare(`SELECT ${column} AS contract_id FROM ${table} WHERE id = ?`).get(rowId) as
    | { contract_id: number | null }
    | undefined
  if (!row) return { success: false, error: 'Item not found.' }

  const failure = requireContractAccess(db, row.contract_id, actor)
  return failure ? { success: false, error: 'Item not found.' } : null
}

/**
 * Whether an actor may act on a contract in a given scope. Super admins see
 * everything; directors are limited to their assigned departments and
 * branches; store managers to their branches.
 */
export function canAccessScope(
  actor: ResolvedActor,
  department_id: number | null,
  branch_id: number | null
): boolean {
  if (actor.role === 'super_admin') return true

  if (actor.role === 'director') {
    if (department_id !== null && actor.department_ids.includes(department_id)) return true
    if (branch_id !== null && actor.branch_ids.includes(branch_id)) return true
    return false
  }

  // store_manager
  return branch_id !== null && actor.branch_ids.includes(branch_id)
}
