import { useCallback, useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { useActor } from '../../lib/actor'
import type {
  ApprovalRequest,
  ApprovalRule,
  ApprovalStep,
  Contract
} from '../../../../shared/types'

interface Props {
  contract: Contract
  onContractChanged: () => void
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n)
}

function stepBadge(status: ApprovalStep['status']) {
  if (status === 'approved') return <Badge variant="success">Approved</Badge>
  if (status === 'rejected') return <Badge variant="danger">Rejected</Badge>
  if (status === 'skipped') return <Badge variant="neutral">Skipped</Badge>
  return <Badge variant="warning">Pending</Badge>
}

function requestBadge(status: ApprovalRequest['status']) {
  if (status === 'approved') return <Badge variant="success">Approved</Badge>
  if (status === 'rejected') return <Badge variant="danger">Rejected</Badge>
  if (status === 'cancelled') return <Badge variant="neutral">Withdrawn</Badge>
  return <Badge variant="warning">In progress</Badge>
}

/** Describes a rule's amount band in plain language. */
function bandLabel(rule: ApprovalRule): string {
  const field =
    rule.amount_field === 'annual_cost'
      ? 'annual'
      : rule.amount_field === 'monthly_cost'
        ? 'monthly'
        : 'total'
  if (rule.max_amount === null) return `${field} cost at or above ${fmt(rule.min_amount)}`
  return `${field} cost ${fmt(rule.min_amount)} – ${fmt(rule.max_amount)}`
}

export default function ApprovalTab({ contract, onContractChanged }: Props) {
  const actor = useActor()
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [matchingRules, setMatchingRules] = useState<ApprovalRule[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [showSubmit, setShowSubmit] = useState(false)
  const [submitNote, setSubmitNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [deciding, setDeciding] = useState<{ step: ApprovalStep; decision: 'approve' | 'reject' } | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [reqRes, ruleRes] = await Promise.all([
      window.api.approvals.forContract(contract.id),
      window.api.approvals.preview(contract.id)
    ])
    if (reqRes.success && reqRes.data) setRequests(reqRes.data)
    if (ruleRes.success && ruleRes.data) setMatchingRules(ruleRes.data)
    setLoading(false)
  }, [contract.id])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 5000)
  }

  const activeRequest = requests.find((r) => r.status === 'pending')

  const submit = async () => {
    setSubmitting(true)
    const res = await window.api.approvals.submit({
      contract_id: contract.id,
      note: submitNote,
      actor
    })
    setSubmitting(false)
    setShowSubmit(false)
    setSubmitNote('')

    if (!res.success) {
      flash(`Error: ${res.error}`)
      return
    }
    if (res.data?.auto_approved) {
      flash('No approval rules matched this contract, so no approval was required.')
    } else {
      flash(`Submitted for approval across ${res.data?.steps} step(s).`)
    }
    await load()
    onContractChanged()
  }

  const decide = async () => {
    if (!deciding) return
    setBusy(true)
    const res = await window.api.approvals.decide({
      step_id: deciding.step.id,
      decision: deciding.decision,
      comment,
      actor
    })
    setBusy(false)
    setDeciding(null)
    setComment('')

    if (!res.success) {
      flash(`Error: ${res.error}`)
      return
    }
    flash(
      res.data?.request_status === 'approved'
        ? 'Approved — the contract is now fully approved.'
        : res.data?.request_status === 'rejected'
          ? 'Rejected. The contract stays pending until it is revised and resubmitted.'
          : `Approved. Moved to step ${res.data?.advanced_to}.`
    )
    await load()
    onContractChanged()
  }

  const withdraw = async (request: ApprovalRequest) => {
    const res = await window.api.approvals.cancel({ request_id: request.id, actor })
    if (!res.success) {
      flash(`Error: ${res.error}`)
      return
    }
    flash('Approval request withdrawn.')
    await load()
    onContractChanged()
  }

  /** Can the signed-in user decide this step right now? */
  const canDecide = (request: ApprovalRequest, step: ApprovalStep): boolean => {
    if (!actor) return false
    if (request.status !== 'pending' || step.status !== 'pending') return false
    if (step.step_order !== request.current_step) return false

    const named = step.approver_user_id !== null && step.approver_user_id === actor.id
    // The submitter can't clear their own request unless a rule names them.
    if (request.requested_by_user_id === actor.id && !named) return false

    return named || step.approver_role === actor.role || actor.role === 'super_admin'
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading approvals…</p>

  return (
    <div className="space-y-4">
      {/* Current state */}
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-white font-semibold">Approval Status</p>
            <div className="flex items-center gap-2 mt-2">
              {contract.approval_state === 'approved' && <Badge variant="success">Approved</Badge>}
              {contract.approval_state === 'pending' && (
                <Badge variant="warning">Awaiting approval</Badge>
              )}
              {contract.approval_state === 'rejected' && <Badge variant="danger">Rejected</Badge>}
              {(contract.approval_state === 'not_required' ||
                contract.approval_state === 'draft') && (
                <Badge variant="neutral">Not submitted</Badge>
              )}
              {activeRequest && (
                <span className="text-slate-400 text-sm">
                  Step {activeRequest.current_step} of {activeRequest.steps?.length ?? 0}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {message && (
              <span
                className={`text-xs max-w-xs ${
                  message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {message}
              </span>
            )}
            {!activeRequest && (
              <Button onClick={() => setShowSubmit(true)}>Submit for Approval</Button>
            )}
            {activeRequest &&
              (activeRequest.requested_by_user_id === actor?.id ||
                actor?.role === 'super_admin') && (
                <Button variant="secondary" onClick={() => withdraw(activeRequest)}>
                  Withdraw
                </Button>
              )}
          </div>
        </div>
      </Card>

      {/* Which rules apply */}
      <Card>
        <p className="text-white font-semibold mb-1">Routing</p>
        <p className="text-slate-400 text-xs mb-3">
          Rules that match this contract's scope, cost, and vendor. Configure them in Settings →
          Approval Rules.
        </p>
        {matchingRules.length === 0 ? (
          <p className="text-slate-400 text-sm">
            No approval rules match this contract — it can be activated without sign-off.
          </p>
        ) : (
          <div className="space-y-2">
            {matchingRules.map((rule, index) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0"
              >
                <span className="h-6 w-6 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center flex-shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm">{rule.name}</p>
                  <p className="text-slate-400 text-xs">
                    {rule.approver_name
                      ? `Approver: ${rule.approver_name}`
                      : `Any ${rule.approver_role?.replace('_', ' ')}`}{' '}
                    · {bandLabel(rule)}
                    {rule.vendor_pattern ? ` · vendor contains "${rule.vendor_pattern}"` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Request history */}
      {requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    {requestBadge(request.status)}
                    <span className="text-slate-400 text-sm">
                      Submitted by {request.requested_by_name} on {request.created_at}
                    </span>
                  </div>
                  {request.note && (
                    <p className="text-slate-300 text-sm mt-2 italic">"{request.note}"</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {(request.steps ?? []).map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      step.step_order === request.current_step && request.status === 'pending'
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-slate-800'
                    }`}
                  >
                    <span className="h-6 w-6 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center flex-shrink-0">
                      {step.step_order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{step.rule_name}</span>
                        {stepBadge(step.status)}
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {step.approver_name
                          ? `Approver: ${step.approver_name}`
                          : `Any ${step.approver_role?.replace('_', ' ')}`}
                        {step.decided_by_name &&
                          ` · decided by ${step.decided_by_name} on ${step.decided_at}`}
                      </p>
                      {step.comment && (
                        <p className="text-slate-300 text-sm mt-1 italic">"{step.comment}"</p>
                      )}
                    </div>
                    {canDecide(request, step) && (
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          onClick={() => setDeciding({ step, decision: 'approve' })}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setDeciding({ step, decision: 'reject' })}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Submit modal */}
      <Modal
        open={showSubmit}
        onClose={() => setShowSubmit(false)}
        title="Submit for Approval"
      >
        <div className="space-y-4">
          {matchingRules.length === 0 ? (
            <p className="text-slate-300 text-sm">
              No approval rules match this contract. Submitting will simply record that no approval
              was required.
            </p>
          ) : (
            <div>
              <p className="text-slate-300 text-sm mb-2">
                This will route to {matchingRules.length} approver
                {matchingRules.length === 1 ? '' : 's'} in order:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {matchingRules.map((rule) => (
                  <li key={rule.id} className="text-slate-400 text-sm">
                    {rule.name} —{' '}
                    {rule.approver_name ?? `any ${rule.approver_role?.replace('_', ' ')}`}
                  </li>
                ))}
              </ol>
              <p className="text-slate-400 text-xs mt-3">
                The contract's status becomes <span className="text-white">pending</span> until every
                step approves. It will not appear as active on dashboards while it waits.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Note for approvers</label>
            <textarea
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-24 resize-none"
              value={submitNote}
              onChange={(e) => setSubmitNote(e.target.value)}
              placeholder="Anything the approvers should know…"
            />
          </div>
          <Button onClick={submit} className="w-full justify-center" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </div>
      </Modal>

      {/* Decision modal */}
      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding?.decision === 'approve' ? 'Approve Contract' : 'Reject Contract'}
      >
        <div className="space-y-4">
          <p className="text-slate-300 text-sm">
            {deciding?.decision === 'approve'
              ? `Approving step ${deciding?.step.step_order} (${deciding?.step.rule_name}) for ${contract.vendor_name}.`
              : `Rejecting ${contract.vendor_name}. This ends the approval request — remaining steps are skipped and the contract stays pending.`}
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">
              Comment {deciding?.decision === 'reject' && <span className="text-slate-500">(recommended)</span>}
            </label>
            <textarea
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-24 resize-none"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                deciding?.decision === 'approve'
                  ? 'Optional note recorded on the audit trail…'
                  : 'Explain what needs to change before resubmission…'
              }
            />
          </div>
          <Button
            onClick={decide}
            variant={deciding?.decision === 'reject' ? 'danger' : 'primary'}
            className="w-full justify-center"
            disabled={busy}
          >
            {busy
              ? 'Saving…'
              : deciding?.decision === 'approve'
                ? 'Confirm Approval'
                : 'Confirm Rejection'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
