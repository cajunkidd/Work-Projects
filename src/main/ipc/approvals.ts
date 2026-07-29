import { ipcMain } from 'electron'
import { getDb, updateContractStatuses } from '../database'
import { recordAudit } from '../audit'
import { requireRole, denied } from '../authz'
import { notifyApprovalRequested, notifyApprovalDecided } from '../emailNotifier'
import { dispatchWebhook } from '../webhooks'
import type {
  Actor,
  ApprovalRequest,
  ApprovalRule,
  ApprovalStep,
  Contract,
  IpcResponse,
  PendingApproval,
  UserRole
} from '../../shared/types'

/**
 * Approval routing.
 *
 * A contract submitted for approval collects every active rule it matches
 * (scope + amount band + vendor pattern). Those become sequential steps; the
 * request advances one step at a time and any single rejection ends it.
 *
 * Unlike the rest of the app's role handling, the decision endpoint verifies
 * authority against the database rather than trusting the renderer — approving
 * a contract is the one action where a spoofed role would be materially costly.
 */

interface RuleRow extends ApprovalRule {
  approver_user_id: number | null
  approver_role: UserRole | null
}

/** Re-reads the acting user from the database. Never trust the renderer's copy. */
function resolveActor(actorId: number | null | undefined): {
  id: number
  name: string
  role: UserRole
} | null {
  if (!actorId) return null
  const row = getDb()
    .prepare('SELECT id, name, role FROM users WHERE id = ?')
    .get(actorId) as { id: number; name: string; role: UserRole } | undefined
  return row ?? null
}

/** Does this rule apply to this contract? */
function ruleMatches(rule: RuleRow, contract: Contract): boolean {
  // Scope: a rule with neither department nor branch set is company-wide.
  if (rule.department_id !== null && rule.department_id !== contract.department_id) return false
  if (rule.branch_id !== null && rule.branch_id !== contract.branch_id) return false

  // Amount band against the rule's chosen cost field.
  const amount = Number(contract[rule.amount_field] ?? 0)
  if (amount < rule.min_amount) return false
  if (rule.max_amount !== null && amount > rule.max_amount) return false

  // Optional vendor substring match.
  if (rule.vendor_pattern.trim()) {
    const pattern = rule.vendor_pattern.trim().toLowerCase()
    if (!contract.vendor_name.toLowerCase().includes(pattern)) return false
  }

  return true
}

function matchingRules(contract: Contract): RuleRow[] {
  const rules = getDb()
    .prepare('SELECT * FROM approval_rules WHERE active = 1 ORDER BY step_order ASC, id ASC')
    .all() as RuleRow[]
  return rules.filter((r) => ruleMatches(r, contract))
}

/** Email addresses for whoever can decide a given step. */
function approverEmails(step: {
  approver_user_id: number | null
  approver_role: string | null
}): string[] {
  const db = getDb()
  if (step.approver_user_id) {
    const row = db
      .prepare('SELECT email FROM users WHERE id = ?')
      .get(step.approver_user_id) as { email: string } | undefined
    return row ? [row.email] : []
  }
  if (step.approver_role) {
    const rows = db
      .prepare('SELECT email FROM users WHERE role = ?')
      .all(step.approver_role) as { email: string }[]
    return rows.map((r) => r.email)
  }
  return []
}

function loadContract(id: number): Contract | undefined {
  return getDb().prepare('SELECT * FROM contracts WHERE id = ?').get(id) as Contract | undefined
}

function stepsForRequest(request_id: number): ApprovalStep[] {
  return getDb()
    .prepare(
      `SELECT s.*, u.name as approver_name
       FROM approval_steps s
       LEFT JOIN users u ON s.approver_user_id = u.id
       WHERE s.request_id = ?
       ORDER BY s.step_order ASC`
    )
    .all(request_id) as ApprovalStep[]
}

export function registerApprovalHandlers(): void {
  // ─── Rule configuration ──────────────────────────────────────────────────

  ipcMain.handle('approvalRules:list', async (): Promise<IpcResponse<ApprovalRule[]>> => {
    try {
      const rows = getDb()
        .prepare(
          `SELECT r.*, d.name as department_name, b.name as branch_name, u.name as approver_name
           FROM approval_rules r
           LEFT JOIN departments d ON r.department_id = d.id
           LEFT JOIN branches b ON r.branch_id = b.id
           LEFT JOIN users u ON r.approver_user_id = u.id
           ORDER BY r.step_order ASC, r.id ASC`
        )
        .all() as ApprovalRule[]
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'approvalRules:create',
    async (
      _e,
      payload: Omit<ApprovalRule, 'id' | 'created_at'> & { actor?: Actor }
    ): Promise<IpcResponse<ApprovalRule>> => {
      try {
        const db = getDb()
        const gate = requireRole(db, payload.actor, 'super_admin')
        if (denied(gate)) return gate
        if (!payload.approver_user_id && !payload.approver_role) {
          return { success: false, error: 'A rule needs either a named approver or an approver role.' }
        }
        const result = db
          .prepare(
            `INSERT INTO approval_rules
              (name, department_id, branch_id, min_amount, max_amount, amount_field,
               vendor_pattern, approver_user_id, approver_role, step_order, active)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`
          )
          .run(
            payload.name,
            payload.department_id ?? null,
            payload.branch_id ?? null,
            payload.min_amount ?? 0,
            payload.max_amount ?? null,
            payload.amount_field ?? 'annual_cost',
            payload.vendor_pattern ?? '',
            payload.approver_user_id ?? null,
            payload.approver_role ?? null,
            payload.step_order ?? 1,
            payload.active ?? 1
          )
        const row = db
          .prepare('SELECT * FROM approval_rules WHERE id = ?')
          .get(result.lastInsertRowid) as ApprovalRule

        recordAudit(db, {
          entity_type: 'approval',
          entity_id: row.id,
          entity_label: row.name,
          action: 'create',
          summary: `Approval rule "${row.name}" created`,
          actor: payload.actor
        })

        return { success: true, data: row }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'approvalRules:update',
    async (
      _e,
      payload: Partial<ApprovalRule> & { id: number; actor?: Actor }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const { id, actor, ...rest } = payload
        const fields = Object.keys(rest).filter(
          (k) => !['department_name', 'branch_name', 'approver_name', 'created_at'].includes(k)
        )
        if (fields.length === 0) return { success: true }

        const sets = fields.map((f) => `${f} = ?`).join(', ')
        const values = fields.map((f) => (rest as any)[f])
        db.prepare(`UPDATE approval_rules SET ${sets} WHERE id = ?`).run(...values, id)

        const row = db.prepare('SELECT name FROM approval_rules WHERE id = ?').get(id) as
          | { name: string }
          | undefined
        recordAudit(db, {
          entity_type: 'approval',
          entity_id: id,
          entity_label: row?.name ?? `Rule #${id}`,
          action: 'update',
          summary: `Approval rule updated (${fields.join(', ')})`,
          actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle(
    'approvalRules:delete',
    async (_e, payload: { id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const row = db.prepare('SELECT name FROM approval_rules WHERE id = ?').get(payload.id) as
          | { name: string }
          | undefined
        db.prepare('DELETE FROM approval_rules WHERE id = ?').run(payload.id)

        recordAudit(db, {
          entity_type: 'approval',
          entity_id: payload.id,
          entity_label: row?.name ?? `Rule #${payload.id}`,
          action: 'delete',
          summary: `Approval rule "${row?.name ?? payload.id}" deleted`,
          actor: payload.actor
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Preview which rules a contract would trigger, without submitting it.
  ipcMain.handle(
    'approvals:preview',
    async (_e, contract_id: number): Promise<IpcResponse<ApprovalRule[]>> => {
      try {
        const contract = loadContract(contract_id)
        if (!contract) return { success: false, error: 'Contract not found' }
        return { success: true, data: matchingRules(contract) }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── Submitting for approval ─────────────────────────────────────────────

  ipcMain.handle(
    'approvals:submit',
    async (
      _e,
      payload: { contract_id: number; note?: string; actor?: Actor }
    ): Promise<IpcResponse<{ request_id: number | null; auto_approved: boolean; steps: number }>> => {
      try {
        const db = getDb()
        const contract = loadContract(payload.contract_id)
        if (!contract) return { success: false, error: 'Contract not found' }

        const open = db
          .prepare(
            `SELECT id FROM approval_requests WHERE contract_id = ? AND status = 'pending'`
          )
          .get(payload.contract_id) as { id: number } | undefined
        if (open) {
          return { success: false, error: 'This contract already has an approval in progress.' }
        }

        const rules = matchingRules(contract)

        // No rule matches: nothing to route, so the contract needs no approval.
        if (rules.length === 0) {
          db.prepare(
            `UPDATE contracts SET approval_state = 'not_required',
              updated_at = datetime('now'), updated_by = ? WHERE id = ?`
          ).run(payload.actor?.name ?? 'System', payload.contract_id)
          updateContractStatuses()

          recordAudit(db, {
            entity_type: 'contract',
            entity_id: contract.id,
            entity_label: contract.vendor_name,
            action: 'submit',
            summary: 'Submitted for approval — no matching approval rules, so none was required',
            actor: payload.actor
          })

          return { success: true, data: { request_id: null, auto_approved: true, steps: 0 } }
        }

        const create = db.transaction(() => {
          const req = db
            .prepare(
              `INSERT INTO approval_requests
                (contract_id, requested_by_user_id, requested_by_name, status, note, current_step)
               VALUES (?,?,?,'pending',?,1)`
            )
            .run(
              payload.contract_id,
              payload.actor?.id ?? null,
              payload.actor?.name ?? 'Unknown',
              payload.note ?? ''
            )
          const requestId = req.lastInsertRowid as number

          // Rules are renumbered into a dense 1..n sequence so the request can
          // advance step-by-step regardless of how rules were ordered.
          const insertStep = db.prepare(
            `INSERT INTO approval_steps
              (request_id, rule_id, rule_name, step_order, approver_user_id, approver_role, status)
             VALUES (?,?,?,?,?,?, 'pending')`
          )
          rules.forEach((rule, index) => {
            insertStep.run(
              requestId,
              rule.id,
              rule.name,
              index + 1,
              rule.approver_user_id,
              rule.approver_role
            )
          })

          db.prepare(
            `UPDATE contracts SET status = 'pending', approval_state = 'pending',
              updated_at = datetime('now'), updated_by = ? WHERE id = ?`
          ).run(payload.actor?.name ?? 'System', payload.contract_id)

          return requestId
        })

        const requestId = create()

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: contract.id,
          entity_label: contract.vendor_name,
          action: 'submit',
          summary: `Submitted for approval — ${rules.length} step(s): ${rules.map((r) => r.name).join(' → ')}`,
          actor: payload.actor
        })

        dispatchWebhook(db, 'contract.submitted', {
          contract_id: contract.id,
          vendor_name: contract.vendor_name,
          annual_cost: contract.annual_cost,
          submitted_by: payload.actor?.name ?? 'Unknown',
          steps: rules.map((r) => r.name)
        })

        // Notify the first step's approvers.
        const firstStep = rules[0]
        notifyApprovalRequested(db, {
          vendor_name: contract.vendor_name,
          annual_cost: contract.annual_cost,
          department_id: contract.department_id,
          branch_id: contract.branch_id,
          requested_by: payload.actor?.name ?? 'Unknown',
          step_name: firstStep.name,
          step_order: 1,
          total_steps: rules.length,
          note: payload.note ?? '',
          approver_emails: approverEmails(firstStep)
        }).catch(() => {})

        return {
          success: true,
          data: { request_id: requestId, auto_approved: false, steps: rules.length }
        }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── Deciding ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'approvals:decide',
    async (
      _e,
      payload: {
        step_id: number
        decision: 'approve' | 'reject'
        comment?: string
        actor?: Actor
      }
    ): Promise<IpcResponse<{ request_status: string; advanced_to: number | null }>> => {
      try {
        const db = getDb()

        const step = db
          .prepare('SELECT * FROM approval_steps WHERE id = ?')
          .get(payload.step_id) as ApprovalStep | undefined
        if (!step) return { success: false, error: 'Approval step not found' }

        const request = db
          .prepare('SELECT * FROM approval_requests WHERE id = ?')
          .get(step.request_id) as ApprovalRequest | undefined
        if (!request) return { success: false, error: 'Approval request not found' }

        if (request.status !== 'pending') {
          return { success: false, error: `This request is already ${request.status}.` }
        }
        if (step.status !== 'pending') {
          return { success: false, error: `This step is already ${step.status}.` }
        }
        if (step.step_order !== request.current_step) {
          return {
            success: false,
            error: `Step ${step.step_order} cannot be decided yet — the request is on step ${request.current_step}.`
          }
        }

        // Authority is checked against the database, not the renderer's claim.
        const actor = resolveActor(payload.actor?.id)
        if (!actor) return { success: false, error: 'Could not identify the acting user.' }

        const namedApprover = step.approver_user_id !== null && step.approver_user_id === actor.id
        const roleApprover = step.approver_role !== null && step.approver_role === actor.role
        const adminOverride = actor.role === 'super_admin'
        if (!namedApprover && !roleApprover && !adminOverride) {
          return { success: false, error: 'You are not an approver for this step.' }
        }

        // Separation of duties: the submitter can't clear their own request
        // unless a rule deliberately names them as the approver.
        if (request.requested_by_user_id === actor.id && !namedApprover) {
          return {
            success: false,
            error: 'You cannot approve a contract you submitted. Another approver must decide this step.'
          }
        }

        const contract = loadContract(request.contract_id)
        if (!contract) return { success: false, error: 'Contract not found' }

        const allSteps = stepsForRequest(request.id)
        const isLastStep = step.step_order >= allSteps.length
        const approving = payload.decision === 'approve'

        const apply = db.transaction(() => {
          db.prepare(
            `UPDATE approval_steps
             SET status = ?, decided_by_user_id = ?, decided_by_name = ?,
                 decided_at = datetime('now'), comment = ?
             WHERE id = ?`
          ).run(
            approving ? 'approved' : 'rejected',
            actor.id,
            actor.name,
            payload.comment ?? '',
            step.id
          )

          if (!approving) {
            // A rejection ends the request; later steps never get their turn.
            db.prepare(
              `UPDATE approval_steps SET status = 'skipped'
               WHERE request_id = ? AND status = 'pending'`
            ).run(request.id)
            db.prepare(
              `UPDATE approval_requests SET status = 'rejected', decided_at = datetime('now')
               WHERE id = ?`
            ).run(request.id)
            db.prepare(
              `UPDATE contracts SET approval_state = 'rejected', status = 'pending',
                updated_at = datetime('now'), updated_by = ? WHERE id = ?`
            ).run(actor.name, contract.id)
            return { request_status: 'rejected', advanced_to: null }
          }

          if (isLastStep) {
            db.prepare(
              `UPDATE approval_requests SET status = 'approved', decided_at = datetime('now')
               WHERE id = ?`
            ).run(request.id)
            db.prepare(
              `UPDATE contracts SET approval_state = 'approved', status = 'active',
                updated_at = datetime('now'), updated_by = ? WHERE id = ?`
            ).run(actor.name, contract.id)
            return { request_status: 'approved', advanced_to: null }
          }

          const next = step.step_order + 1
          db.prepare('UPDATE approval_requests SET current_step = ? WHERE id = ?').run(
            next,
            request.id
          )
          return { request_status: 'pending', advanced_to: next }
        })

        const outcome = apply()

        // Once fully approved the contract rejoins the normal date-driven
        // lifecycle, which may immediately move it to expiring_soon/expired.
        if (outcome.request_status === 'approved') updateContractStatuses()

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: contract.id,
          entity_label: contract.vendor_name,
          action: approving ? 'approve' : 'reject',
          summary: approving
            ? `Step ${step.step_order} (${step.rule_name}) approved by ${actor.name}${
                outcome.request_status === 'approved' ? ' — contract fully approved' : ''
              }${payload.comment ? `: ${payload.comment}` : ''}`
            : `Step ${step.step_order} (${step.rule_name}) rejected by ${actor.name}${
                payload.comment ? `: ${payload.comment}` : ''
              }`,
          actor: { id: actor.id, name: actor.name, role: actor.role }
        })

        if (outcome.request_status !== 'pending') {
          dispatchWebhook(
            db,
            outcome.request_status === 'approved' ? 'contract.approved' : 'contract.rejected',
            {
              contract_id: contract.id,
              vendor_name: contract.vendor_name,
              annual_cost: contract.annual_cost,
              decided_by: actor.name,
              comment: payload.comment ?? ''
            }
          )
        }

        if (outcome.advanced_to) {
          const nextStep = allSteps.find((s) => s.step_order === outcome.advanced_to)
          if (nextStep) {
            notifyApprovalRequested(db, {
              vendor_name: contract.vendor_name,
              annual_cost: contract.annual_cost,
              department_id: contract.department_id,
              branch_id: contract.branch_id,
              requested_by: request.requested_by_name,
              step_name: nextStep.rule_name,
              step_order: nextStep.step_order,
              total_steps: allSteps.length,
              note: request.note,
              approver_emails: approverEmails(nextStep)
            }).catch(() => {})
          }
        } else {
          const requester = request.requested_by_user_id
            ? (db
                .prepare('SELECT email FROM users WHERE id = ?')
                .get(request.requested_by_user_id) as { email: string } | undefined)
            : undefined
          notifyApprovalDecided(db, {
            vendor_name: contract.vendor_name,
            annual_cost: contract.annual_cost,
            department_id: contract.department_id,
            branch_id: contract.branch_id,
            decision: outcome.request_status as 'approved' | 'rejected',
            decided_by: actor.name,
            comment: payload.comment ?? '',
            requester_email: requester?.email ?? null
          }).catch(() => {})
        }

        return { success: true, data: outcome }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Withdraw a request; the contract returns to its date-driven status.
  ipcMain.handle(
    'approvals:cancel',
    async (_e, payload: { request_id: number; actor?: Actor }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const request = db
          .prepare('SELECT * FROM approval_requests WHERE id = ?')
          .get(payload.request_id) as ApprovalRequest | undefined
        if (!request) return { success: false, error: 'Approval request not found' }
        if (request.status !== 'pending') {
          return { success: false, error: `This request is already ${request.status}.` }
        }

        const actor = resolveActor(payload.actor?.id)
        if (!actor) return { success: false, error: 'Could not identify the acting user.' }
        if (request.requested_by_user_id !== actor.id && actor.role !== 'super_admin') {
          return {
            success: false,
            error: 'Only the submitter or a super admin can withdraw this request.'
          }
        }

        const contract = loadContract(request.contract_id)

        db.transaction(() => {
          db.prepare(
            `UPDATE approval_steps SET status = 'skipped' WHERE request_id = ? AND status = 'pending'`
          ).run(request.id)
          db.prepare(
            `UPDATE approval_requests SET status = 'cancelled', decided_at = datetime('now') WHERE id = ?`
          ).run(request.id)
          db.prepare(
            `UPDATE contracts SET approval_state = 'not_required', status = 'active',
              updated_at = datetime('now'), updated_by = ? WHERE id = ?`
          ).run(actor.name, request.contract_id)
        })()

        updateContractStatuses()

        recordAudit(db, {
          entity_type: 'contract',
          entity_id: request.contract_id,
          entity_label: contract?.vendor_name ?? `Contract #${request.contract_id}`,
          action: 'cancel',
          summary: `Approval request withdrawn by ${actor.name}`,
          actor: { id: actor.id, name: actor.name, role: actor.role }
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // ─── Reading ─────────────────────────────────────────────────────────────

  ipcMain.handle(
    'approvals:forContract',
    async (_e, contract_id: number): Promise<IpcResponse<ApprovalRequest[]>> => {
      try {
        const requests = getDb()
          .prepare(
            `SELECT * FROM approval_requests WHERE contract_id = ? ORDER BY created_at DESC, id DESC`
          )
          .all(contract_id) as ApprovalRequest[]
        for (const request of requests) {
          request.steps = stepsForRequest(request.id)
        }
        return { success: true, data: requests }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // A user's approval inbox: steps currently awaiting their decision.
  ipcMain.handle(
    'approvals:inbox',
    async (_e, opts: { user_id: number }): Promise<IpcResponse<PendingApproval[]>> => {
      try {
        const actor = resolveActor(opts?.user_id)
        if (!actor) return { success: true, data: [] }

        const rows = getDb()
          .prepare(
            `SELECT
               s.id as step_id, s.request_id, s.rule_name, s.step_order,
               r.contract_id, r.requested_by_name, r.created_at as requested_at, r.note,
               c.vendor_name, c.annual_cost,
               d.name as department_name, b.name as branch_name
             FROM approval_steps s
             JOIN approval_requests r ON s.request_id = r.id
             JOIN contracts c ON r.contract_id = c.id
             LEFT JOIN departments d ON c.department_id = d.id
             LEFT JOIN branches b ON c.branch_id = b.id
             WHERE r.status = 'pending'
               AND s.status = 'pending'
               AND s.step_order = r.current_step
               AND (s.approver_user_id = ? OR s.approver_role = ?)
               AND NOT (r.requested_by_user_id = ? AND s.approver_user_id IS NOT ?)
             ORDER BY r.created_at ASC`
          )
          .all(actor.id, actor.role, actor.id, actor.id) as PendingApproval[]

        return { success: true, data: rows }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Count only — used for the sidebar badge.
  ipcMain.handle(
    'approvals:inboxCount',
    async (_e, opts: { user_id: number }): Promise<IpcResponse<number>> => {
      try {
        const actor = resolveActor(opts?.user_id)
        if (!actor) return { success: true, data: 0 }

        const row = getDb()
          .prepare(
            `SELECT COUNT(*) as n
             FROM approval_steps s
             JOIN approval_requests r ON s.request_id = r.id
             WHERE r.status = 'pending'
               AND s.status = 'pending'
               AND s.step_order = r.current_step
               AND (s.approver_user_id = ? OR s.approver_role = ?)
               AND NOT (r.requested_by_user_id = ? AND s.approver_user_id IS NOT ?)`
          )
          .get(actor.id, actor.role, actor.id, actor.id) as { n: number }

        return { success: true, data: row.n }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
