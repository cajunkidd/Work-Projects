import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import type { User } from '../../../../shared/types'

interface ApprovalStep {
  id: number
  request_id: number
  approver_user_id: number
  step_order: number
  status: 'pending' | 'approved' | 'rejected' | 'skipped'
  comment: string
  acted_at: string | null
  approver_name: string
  approver_email: string
}

interface ApprovalRequest {
  id: number
  contract_id: number
  requested_by: number | null
  requested_by_name: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  note: string
  created_at: string
  resolved_at: string | null
  steps: ApprovalStep[]
  vendor_name?: string
}

interface Props {
  contractId: number
}

function statusVariant(
  status: string
): 'success' | 'danger' | 'neutral' | 'warning' | 'info' {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  if (status === 'cancelled') return 'neutral'
  if (status === 'pending') return 'warning'
  return 'info'
}

export default function ApprovalsTab({ contractId }: Props) {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedApprovers, setSelectedApprovers] = useState<number[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Decision modal
  const [decideTarget, setDecideTarget] = useState<ApprovalRequest | null>(null)
  const [decideComment, setDecideComment] = useState('')
  const [decideAction, setDecideAction] = useState<'approved' | 'rejected'>('approved')

  const load = () => {
    window.api.approvals.forContract(contractId).then((res: any) => {
      if (res.success && res.data) setRequests(res.data)
    })
  }

  useEffect(() => {
    load()
    window.api.users.list().then((res: any) => {
      if (res.success && res.data) setUsers(res.data)
    })
  }, [contractId])

  const activeRequest = requests.find((r) => r.status === 'pending')

  const activeStep = (req: ApprovalRequest): ApprovalStep | undefined =>
    req.steps.find((s) => s.status === 'pending')

  const createRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (selectedApprovers.length === 0) {
      setError('Pick at least one approver.')
      return
    }
    setSaving(true)
    setError('')
    const res = await window.api.approvals.create({
      contract_id: contractId,
      requested_by: user.id,
      requested_by_name: user.name,
      approver_user_ids: selectedApprovers,
      note
    })
    setSaving(false)
    if (res.success) {
      setShowNewModal(false)
      setSelectedApprovers([])
      setNote('')
      load()
    } else {
      setError(res.error ?? 'Failed to create request')
    }
  }

  const submitDecision = async () => {
    if (!decideTarget || !user) return
    setSaving(true)
    const res = await window.api.approvals.decide({
      request_id: decideTarget.id,
      user_id: user.id,
      decision: decideAction,
      comment: decideComment
    })
    setSaving(false)
    if (res.success) {
      setDecideTarget(null)
      setDecideComment('')
      load()
    } else {
      alert(res.error ?? 'Failed to submit decision')
    }
  }

  const cancelRequest = async (id: number) => {
    if (!confirm('Cancel this approval request?')) return
    const res = await window.api.approvals.cancel({ request_id: id })
    if (res.success) load()
  }

  const toggleApprover = (id: number) =>
    setSelectedApprovers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const moveApprover = (id: number, direction: -1 | 1) => {
    setSelectedApprovers((prev) => {
      const idx = prev.indexOf(id)
      const target = idx + direction
      if (idx < 0 || target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[target]] = [copy[target], copy[idx]]
      return copy
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-semibold">Approvals</p>
          <p className="text-slate-400 text-xs">
            Route contracts through one or more approvers before marking them active.
          </p>
        </div>
        {!activeRequest && (
          <Button onClick={() => setShowNewModal(true)}>+ Request Approval</Button>
        )}
      </div>

      {requests.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-slate-400 text-sm">No approval requests for this contract.</p>
        </Card>
      ) : (
        requests.map((req) => {
          const current = activeStep(req)
          const isMyTurn = current?.approver_user_id === user?.id && req.status === 'pending'
          return (
            <Card key={req.id}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold">Request #{req.id}</p>
                    <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
                    {isMyTurn && <Badge variant="warning">Your turn</Badge>}
                  </div>
                  <p className="text-slate-400 text-xs">
                    Requested by {req.requested_by_name || '—'} · {req.created_at}
                  </p>
                  {req.note && <p className="text-slate-300 text-sm mt-2">{req.note}</p>}
                </div>
                <div className="flex gap-2">
                  {isMyTurn && (
                    <>
                      <Button
                        onClick={() => {
                          setDecideTarget(req)
                          setDecideAction('approved')
                          setDecideComment('')
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDecideTarget(req)
                          setDecideAction('rejected')
                          setDecideComment('')
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {req.status === 'pending' && req.requested_by === user?.id && (
                    <Button variant="secondary" onClick={() => cancelRequest(req.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                {req.steps.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-500 w-6 text-right">{i + 1}.</span>
                    <div className="flex-1">
                      <span className="text-white">{s.approver_name}</span>
                      <span className="text-slate-500 text-xs ml-2">{s.approver_email}</span>
                      {s.comment && (
                        <p className="text-slate-400 text-xs italic mt-0.5">"{s.comment}"</p>
                      )}
                    </div>
                    <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                    {s.acted_at && (
                      <span className="text-slate-500 text-xs">{s.acted_at}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )
        })
      )}

      <Modal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); setSelectedApprovers([]); setNote(''); setError('') }}
        title="Request Approval"
        width="max-w-lg"
      >
        <form onSubmit={createRequest} className="space-y-4">
          <Input
            label="Note (optional)"
            placeholder="Why does this need approval?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-2">
              Approvers (in order)
            </label>
            {users.length === 0 ? (
              <p className="text-slate-500 text-sm">No users available.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto border border-slate-700 rounded-lg divide-y divide-slate-800">
                {users
                  .filter((u) => u.id !== user?.id)
                  .map((u) => {
                    const orderIdx = selectedApprovers.indexOf(u.id)
                    const selected = orderIdx >= 0
                    return (
                      <div
                        key={u.id}
                        className={`flex items-center gap-2 px-3 py-2 text-sm ${
                          selected ? 'bg-slate-800/50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleApprover(u.id)}
                          className="rounded accent-[var(--brand-primary)] cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white truncate">{u.name}</p>
                          <p className="text-slate-500 text-xs truncate">{u.email} · {u.role}</p>
                        </div>
                        {selected && (
                          <>
                            <span className="text-slate-400 text-xs w-6 text-right">{orderIdx + 1}</span>
                            <button
                              type="button"
                              onClick={() => moveApprover(u.id, -1)}
                              className="text-slate-500 hover:text-white text-xs px-1"
                              disabled={orderIdx === 0}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveApprover(u.id, 1)}
                              className="text-slate-500 hover:text-white text-xs px-1"
                              disabled={orderIdx === selectedApprovers.length - 1}
                              title="Move down"
                            >
                              ↓
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-2">
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1 justify-center">
              {saving ? 'Sending...' : 'Submit Request'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowNewModal(false); setSelectedApprovers([]); setNote(''); setError('') }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={decideTarget !== null}
        onClose={() => setDecideTarget(null)}
        title={decideAction === 'approved' ? 'Approve Request' : 'Reject Request'}
        width="max-w-md"
      >
        <div className="space-y-4">
          <Input
            label={decideAction === 'rejected' ? 'Reason' : 'Comment (optional)'}
            placeholder={
              decideAction === 'rejected' ? 'Why are you rejecting?' : 'Any notes for the record?'
            }
            value={decideComment}
            onChange={(e) => setDecideComment(e.target.value)}
            required={decideAction === 'rejected'}
          />
          <div className="flex gap-3">
            <Button onClick={submitDecision} disabled={saving} className="flex-1 justify-center">
              {saving ? 'Submitting...' : `Confirm ${decideAction === 'approved' ? 'Approval' : 'Rejection'}`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDecideTarget(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
