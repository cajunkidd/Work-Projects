import { ipcMain } from 'electron'
import { getDb } from '../database'
import { logChange } from '../audit'
import { sendEmail, emailTemplate } from '../emailNotifier'
import type { IpcResponse } from '../../shared/types'

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped'

export interface ApprovalRequest {
  id: number
  contract_id: number
  requested_by: number | null
  requested_by_name: string
  status: ApprovalRequestStatus
  note: string
  created_at: string
  resolved_at: string | null
}

export interface ApprovalStep {
  id: number
  request_id: number
  approver_user_id: number
  step_order: number
  status: ApprovalStepStatus
  comment: string
  acted_at: string | null
}

export interface ApprovalRequestWithSteps extends ApprovalRequest {
  steps: (ApprovalStep & { approver_name: string; approver_email: string })[]
  vendor_name?: string
}

function loadRequestWithSteps(id: number): ApprovalRequestWithSteps | null {
  const db = getDb()
  const req = db
    .prepare(
      `SELECT ar.*, c.vendor_name
       FROM approval_requests ar
       JOIN contracts c ON c.id = ar.contract_id
       WHERE ar.id = ?`
    )
    .get(id) as ApprovalRequestWithSteps | undefined
  if (!req) return null
  const steps = db
    .prepare(
      `SELECT s.*, u.name as approver_name, u.email as approver_email
       FROM approval_steps s
       JOIN users u ON u.id = s.approver_user_id
       WHERE s.request_id = ?
       ORDER BY s.step_order ASC, s.id ASC`
    )
    .all(id) as (ApprovalStep & { approver_name: string; approver_email: string })[]
  return { ...req, steps }
}

function activeStep(
  steps: (ApprovalStep & { approver_name: string; approver_email: string })[]
): (ApprovalStep & { approver_name: string; approver_email: string }) | undefined {
  return steps.find((s) => s.status === 'pending')
}

async function emailApproverForActiveStep(
  request: ApprovalRequestWithSteps
): Promise<void> {
  const step = activeStep(request.steps)
  if (!step?.approver_email) return
  const db = getDb()
  const html = emailTemplate(`Approval needed: ${request.vendor_name ?? 'Contract'}`, [
    { label: 'Requested by', value: request.requested_by_name || 'System' },
    { label: 'Vendor', value: request.vendor_name ?? '—' },
    { label: 'Note', value: request.note || '—' },
    { label: 'Your action', value: `Open Contract Manager → Contract #${request.contract_id} → Approvals tab` }
  ])
  await sendEmail(db, [step.approver_email], `Approval needed: ${request.vendor_name ?? 'Contract'}`, html).catch(() => {})
}

function finalize(
  requestId: number,
  status: 'approved' | 'rejected' | 'cancelled'
): void {
  const db = getDb()
  db.prepare(
    `UPDATE approval_requests
     SET status = ?, resolved_at = datetime('now')
     WHERE id = ?`
  ).run(status, requestId)
}

export function registerApprovalHandlers(): void {
  // Create a new approval request for a contract with an ordered list of approvers
  ipcMain.handle(
    'approvals:create',
    async (
      _e,
      payload: {
        contract_id: number
        requested_by: number | null
        requested_by_name: string
        approver_user_ids: number[]
        note?: string
      }
    ): Promise<IpcResponse<ApprovalRequestWithSteps>> => {
      try {
        const db = getDb()
        if (!payload.approver_user_ids || payload.approver_user_ids.length === 0) {
          return { success: false, error: 'At least one approver is required' }
        }

        // Block if there is already an active pending request for this contract
        const existing = db
          .prepare(
            `SELECT id FROM approval_requests WHERE contract_id = ? AND status = 'pending' LIMIT 1`
          )
          .get(payload.contract_id) as { id: number } | undefined
        if (existing) {
          return { success: false, error: 'An approval request is already pending for this contract.' }
        }

        const result = db
          .prepare(
            `INSERT INTO approval_requests (contract_id, requested_by, requested_by_name, note)
             VALUES (?, ?, ?, ?)`
          )
          .run(
            payload.contract_id,
            payload.requested_by ?? null,
            payload.requested_by_name || '',
            payload.note ?? ''
          )
        const requestId = result.lastInsertRowid as number
        const insertStep = db.prepare(
          `INSERT INTO approval_steps (request_id, approver_user_id, step_order)
           VALUES (?, ?, ?)`
        )
        const tx = db.transaction((ids: number[]) => {
          ids.forEach((uid, i) => insertStep.run(requestId, uid, i))
        })
        tx(payload.approver_user_ids)

        const loaded = loadRequestWithSteps(requestId)!
        logChange(null, 'approval_request', requestId, 'create', {
          contract_id: payload.contract_id,
          approvers: payload.approver_user_ids.length
        })
        logChange(null, 'contract', payload.contract_id, 'update', {
          approval_requested: {
            request_id: requestId,
            approvers: loaded.steps.map((s) => s.approver_name)
          }
        })

        await emailApproverForActiveStep(loaded)
        return { success: true, data: loaded }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Decision on the current step — approve or reject with an optional comment
  ipcMain.handle(
    'approvals:decide',
    async (
      _e,
      payload: {
        request_id: number
        user_id: number
        decision: 'approved' | 'rejected'
        comment?: string
      }
    ): Promise<IpcResponse<ApprovalRequestWithSteps>> => {
      try {
        const db = getDb()
        const loaded = loadRequestWithSteps(payload.request_id)
        if (!loaded) return { success: false, error: 'Request not found' }
        if (loaded.status !== 'pending') {
          return { success: false, error: `Request is already ${loaded.status}` }
        }
        const step = activeStep(loaded.steps)
        if (!step) return { success: false, error: 'No pending step' }
        if (step.approver_user_id !== payload.user_id) {
          return { success: false, error: 'It is not your turn to approve this request.' }
        }

        db.prepare(
          `UPDATE approval_steps
           SET status = ?, comment = ?, acted_at = datetime('now')
           WHERE id = ?`
        ).run(payload.decision, payload.comment ?? '', step.id)

        logChange(null, 'approval_request', payload.request_id, 'update', {
          step_decision: {
            step_id: step.id,
            approver_user_id: payload.user_id,
            decision: payload.decision
          }
        })

        if (payload.decision === 'rejected') {
          finalize(payload.request_id, 'rejected')
          logChange(null, 'contract', loaded.contract_id, 'update', {
            approval_rejected: {
              request_id: payload.request_id,
              by: step.approver_name,
              comment: payload.comment
            }
          })
        } else {
          const updated = loadRequestWithSteps(payload.request_id)!
          const stillPending = activeStep(updated.steps)
          if (!stillPending) {
            // All steps approved — mark request approved and promote contract to active.
            finalize(payload.request_id, 'approved')
            db.prepare(`UPDATE contracts SET status = 'active' WHERE id = ? AND status = 'pending'`).run(
              loaded.contract_id
            )
            logChange(null, 'contract', loaded.contract_id, 'update', {
              approval_completed: { request_id: payload.request_id }
            })
          } else {
            await emailApproverForActiveStep(updated)
          }
        }

        return { success: true, data: loadRequestWithSteps(payload.request_id)! }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Cancel a pending request (requester or super_admin)
  ipcMain.handle(
    'approvals:cancel',
    async (
      _e,
      payload: { request_id: number }
    ): Promise<IpcResponse<void>> => {
      try {
        const loaded = loadRequestWithSteps(payload.request_id)
        if (!loaded) return { success: false, error: 'Request not found' }
        if (loaded.status !== 'pending') return { success: false, error: `Already ${loaded.status}` }
        finalize(payload.request_id, 'cancelled')
        logChange(null, 'approval_request', payload.request_id, 'update', {
          status: { from: 'pending', to: 'cancelled' }
        })
        logChange(null, 'contract', loaded.contract_id, 'update', {
          approval_cancelled: { request_id: payload.request_id }
        })
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Get approval history for a contract
  ipcMain.handle(
    'approvals:forContract',
    async (_e, contract_id: number): Promise<IpcResponse<ApprovalRequestWithSteps[]>> => {
      try {
        const db = getDb()
        const reqs = db
          .prepare(
            `SELECT id FROM approval_requests WHERE contract_id = ? ORDER BY id DESC`
          )
          .all(contract_id) as { id: number }[]
        const data = reqs
          .map((r) => loadRequestWithSteps(r.id))
          .filter((r): r is ApprovalRequestWithSteps => r !== null)
        return { success: true, data }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Pending requests where the given user is the current approver — "my queue"
  ipcMain.handle(
    'approvals:myQueue',
    async (_e, user_id: number): Promise<IpcResponse<ApprovalRequestWithSteps[]>> => {
      try {
        const db = getDb()
        // A user's turn is "the lowest-order pending step in a pending request has them as approver"
        const rows = db
          .prepare(
            `SELECT ar.id FROM approval_requests ar
             WHERE ar.status = 'pending'
               AND ar.id IN (
                 SELECT request_id FROM approval_steps
                 WHERE status = 'pending' AND approver_user_id = ?
                   AND step_order = (
                     SELECT MIN(step_order) FROM approval_steps
                     WHERE request_id = approval_steps.request_id AND status = 'pending'
                   )
               )`
          )
          .all(user_id) as { id: number }[]
        const data = rows
          .map((r) => loadRequestWithSteps(r.id))
          .filter((r): r is ApprovalRequestWithSteps => r !== null)
        return { success: true, data }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )
}
