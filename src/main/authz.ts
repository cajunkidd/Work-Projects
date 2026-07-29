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
