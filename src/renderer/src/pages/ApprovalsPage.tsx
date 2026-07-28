import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { useActor } from '../lib/actor'
import type { PendingApproval } from '../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n)
}

export default function ApprovalsPage() {
  const actor = useActor()
  const navigate = useNavigate()

  const [pending, setPending] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [deciding, setDeciding] = useState<{
    item: PendingApproval
    decision: 'approve' | 'reject'
  } | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!actor) return
    const res = await window.api.approvals.inbox({ user_id: actor.id })
    if (res.success && res.data) setPending(res.data)
    setLoading(false)
  }, [actor])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 5000)
  }

  const decide = async () => {
    if (!deciding) return
    setBusy(true)
    const res = await window.api.approvals.decide({
      step_id: deciding.item.step_id,
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
          ? 'Rejected. The submitter has been notified.'
          : `Approved. The request moved to step ${res.data?.advanced_to}.`
    )
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">My Approvals</h1>
          <p className="text-slate-400 text-sm mt-1">
            Contracts waiting on your decision. Each one blocks until you approve or reject it.
          </p>
        </div>
        {message && (
          <span
            className={`text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {message}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : pending.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-white font-medium">Nothing waiting on you</p>
            <p className="text-slate-400 text-sm mt-1">
              Contracts routed to you for sign-off will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((item) => (
            <Card key={item.step_id}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => navigate(`/contracts/${item.contract_id}`)}
                      className="text-white font-semibold hover:underline"
                    >
                      {item.vendor_name}
                    </button>
                    <Badge variant="warning">Step {item.step_order}</Badge>
                    <span className="text-slate-400 text-sm">{item.rule_name}</span>
                  </div>
                  <p className="text-slate-400 text-sm mt-1">
                    {fmt(item.annual_cost)}/yr ·{' '}
                    {item.department_name ?? item.branch_name ?? 'Company-wide'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    Submitted by {item.requested_by_name} on {item.requested_at}
                  </p>
                  {item.note && (
                    <p className="text-slate-300 text-sm mt-2 italic">"{item.note}"</p>
                  )}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/contracts/${item.contract_id}`)}
                  >
                    Review
                  </Button>
                  <Button onClick={() => setDeciding({ item, decision: 'approve' })}>
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setDeciding({ item, decision: 'reject' })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding?.decision === 'approve' ? 'Approve Contract' : 'Reject Contract'}
      >
        <div className="space-y-4">
          <p className="text-slate-300 text-sm">
            {deciding?.decision === 'approve'
              ? `Approving step ${deciding?.item.step_order} (${deciding?.item.rule_name}) for ${deciding?.item.vendor_name}.`
              : `Rejecting ${deciding?.item.vendor_name}. Remaining approval steps are skipped and the contract stays pending.`}
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Comment</label>
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
            {busy ? 'Saving…' : deciding?.decision === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
