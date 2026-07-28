import { useCallback, useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { useActor } from '../../lib/actor'
import type {
  ApprovalAmountField,
  ApprovalRule,
  Branch,
  Department,
  User,
  UserRole
} from '../../../../shared/types'

interface Props {
  departments: Department[]
  branches: Branch[]
  users: User[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n)
}

const EMPTY_FORM = {
  id: 0,
  name: '',
  scope: 'company' as 'company' | 'department' | 'branch',
  scope_id: '' as number | '',
  min_amount: '0',
  max_amount: '',
  amount_field: 'annual_cost' as ApprovalAmountField,
  vendor_pattern: '',
  approver_kind: 'user' as 'user' | 'role',
  approver_user_id: '' as number | '',
  approver_role: 'super_admin' as UserRole,
  step_order: '1',
  active: true
}

/**
 * Configures the routing rules that decide who must sign off on a contract.
 * A contract submitted for approval picks up every rule it matches, in
 * step_order, and must clear each one in turn.
 */
export default function ApprovalRulesSection({ departments, branches, users }: Props) {
  const actor = useActor()
  const [rules, setRules] = useState<ApprovalRule[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const res = await window.api.approvalRules.list()
    if (res.success && res.data) setRules(res.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 4000)
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, step_order: String(rules.length + 1) })
    setShowForm(true)
  }

  const openEdit = (rule: ApprovalRule) => {
    setForm({
      id: rule.id,
      name: rule.name,
      scope:
        rule.department_id !== null ? 'department' : rule.branch_id !== null ? 'branch' : 'company',
      scope_id: rule.department_id ?? rule.branch_id ?? '',
      min_amount: String(rule.min_amount),
      max_amount: rule.max_amount === null ? '' : String(rule.max_amount),
      amount_field: rule.amount_field,
      vendor_pattern: rule.vendor_pattern,
      approver_kind: rule.approver_user_id !== null ? 'user' : 'role',
      approver_user_id: rule.approver_user_id ?? '',
      approver_role: (rule.approver_role ?? 'super_admin') as UserRole,
      step_order: String(rule.step_order),
      active: rule.active === 1
    })
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.approver_kind === 'user' && form.approver_user_id === '') {
      flash('Error: pick the user who approves this step.')
      return
    }
    if (form.scope !== 'company' && form.scope_id === '') {
      flash('Error: pick the department or branch this rule applies to.')
      return
    }

    setSaving(true)
    const payload = {
      name: form.name,
      department_id: form.scope === 'department' ? Number(form.scope_id) : null,
      branch_id: form.scope === 'branch' ? Number(form.scope_id) : null,
      min_amount: parseFloat(form.min_amount) || 0,
      max_amount: form.max_amount.trim() === '' ? null : parseFloat(form.max_amount),
      amount_field: form.amount_field,
      vendor_pattern: form.vendor_pattern.trim(),
      approver_user_id: form.approver_kind === 'user' ? Number(form.approver_user_id) : null,
      approver_role: form.approver_kind === 'role' ? form.approver_role : null,
      step_order: parseInt(form.step_order) || 1,
      active: form.active ? 1 : 0,
      actor
    }

    const res = form.id
      ? await window.api.approvalRules.update({ id: form.id, ...payload })
      : await window.api.approvalRules.create(payload as any)

    setSaving(false)
    if (res.success) {
      setShowForm(false)
      await load()
      flash(form.id ? 'Rule updated.' : 'Rule created.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const toggleActive = async (rule: ApprovalRule) => {
    const res = await window.api.approvalRules.update({
      id: rule.id,
      active: rule.active ? 0 : 1,
      actor
    })
    if (res.success) await load()
    else flash(`Error: ${res.error}`)
  }

  const remove = async (rule: ApprovalRule) => {
    const res = await window.api.approvalRules.delete({ id: rule.id, actor })
    if (res.success) {
      await load()
      flash('Rule deleted.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const scopeText = (rule: ApprovalRule) => {
    if (rule.department_id !== null) return rule.department_name ?? `Dept #${rule.department_id}`
    if (rule.branch_id !== null) return rule.branch_name ?? `Branch #${rule.branch_id}`
    return 'Company-wide'
  }

  const bandText = (rule: ApprovalRule) => {
    const field =
      rule.amount_field === 'annual_cost'
        ? 'annual'
        : rule.amount_field === 'monthly_cost'
          ? 'monthly'
          : 'total'
    if (rule.max_amount === null) return `${field} ≥ ${fmt(rule.min_amount)}`
    return `${field} ${fmt(rule.min_amount)}–${fmt(rule.max_amount)}`
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white font-semibold">Routing Rules</p>
          <p className="text-slate-400 text-xs mt-0.5">
            A contract submitted for approval must clear every rule it matches, in step order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span
              className={`text-xs ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {message}
            </span>
          )}
          <Button onClick={openCreate}>+ Add Rule</Button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="text-slate-400 text-sm">
          No approval rules yet. Without any rules, contracts can be activated without sign-off — add
          a rule such as "IT spend over $25,000 needs Director approval" to start routing.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-3 py-2.5 border-b border-slate-800 last:border-0 ${
                rule.active ? '' : 'opacity-50'
              }`}
            >
              <span className="h-6 w-6 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center flex-shrink-0">
                {rule.step_order}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white text-sm font-medium">{rule.name}</span>
                  {!rule.active && <Badge variant="neutral">Inactive</Badge>}
                </div>
                <p className="text-slate-400 text-xs mt-0.5">
                  {scopeText(rule)} · {bandText(rule)}
                  {rule.vendor_pattern ? ` · vendor contains "${rule.vendor_pattern}"` : ''} →{' '}
                  <span className="text-slate-300">
                    {rule.approver_name ?? `any ${rule.approver_role?.replace('_', ' ')}`}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => toggleActive(rule)}>
                  {rule.active ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                  Edit
                </Button>
                <button
                  onClick={() => remove(rule)}
                  className="text-slate-500 hover:text-red-400 text-lg leading-none px-1"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={form.id ? 'Edit Approval Rule' : 'New Approval Rule'}
        width="max-w-2xl"
      >
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Rule Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. IT spend over $25k — Director review"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Applies To"
              value={form.scope}
              onChange={(e) =>
                setForm((f) => ({ ...f, scope: e.target.value as typeof f.scope, scope_id: '' }))
              }
              options={[
                { value: 'company', label: 'All contracts (company-wide)' },
                { value: 'department', label: 'One department' },
                { value: 'branch', label: 'One branch' }
              ]}
            />
            {form.scope !== 'company' && (
              <Select
                label={form.scope === 'department' ? 'Department' : 'Branch'}
                value={form.scope_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    scope_id: e.target.value === '' ? '' : Number(e.target.value)
                  }))
                }
                options={[
                  { value: '', label: 'Select…' },
                  ...(form.scope === 'department'
                    ? departments.map((d) => ({ value: d.id, label: d.name }))
                    : branches.map((b) => ({ value: b.id, label: `#${b.number} – ${b.name}` })))
                ]}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Cost Measured On"
              value={form.amount_field}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount_field: e.target.value as ApprovalAmountField }))
              }
              options={[
                { value: 'annual_cost', label: 'Annual cost' },
                { value: 'monthly_cost', label: 'Monthly cost' },
                { value: 'total_cost', label: 'Total contract value' }
              ]}
            />
            <Input
              label="Minimum ($)"
              type="number"
              value={form.min_amount}
              onChange={(e) => setForm((f) => ({ ...f, min_amount: e.target.value }))}
            />
            <Input
              label="Maximum ($)"
              type="number"
              value={form.max_amount}
              onChange={(e) => setForm((f) => ({ ...f, max_amount: e.target.value }))}
              placeholder="No limit"
            />
          </div>

          <Input
            label="Vendor Name Contains (optional)"
            value={form.vendor_pattern}
            onChange={(e) => setForm((f) => ({ ...f, vendor_pattern: e.target.value }))}
            placeholder="Leave blank to match any vendor"
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Approver"
              value={form.approver_kind}
              onChange={(e) =>
                setForm((f) => ({ ...f, approver_kind: e.target.value as 'user' | 'role' }))
              }
              options={[
                { value: 'user', label: 'A specific person' },
                { value: 'role', label: 'Anyone with a role' }
              ]}
            />
            {form.approver_kind === 'user' ? (
              <Select
                label="Who Approves"
                value={form.approver_user_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    approver_user_id: e.target.value === '' ? '' : Number(e.target.value)
                  }))
                }
                options={[
                  { value: '', label: 'Select…' },
                  ...users.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${u.role.replace('_', ' ')})`
                  }))
                ]}
              />
            ) : (
              <Select
                label="Which Role"
                value={form.approver_role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, approver_role: e.target.value as UserRole }))
                }
                options={[
                  { value: 'super_admin', label: 'Super Admin' },
                  { value: 'director', label: 'Director' },
                  { value: 'store_manager', label: 'Store Manager' }
                ]}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 items-end">
            <Input
              label="Step Order"
              type="number"
              value={form.step_order}
              onChange={(e) => setForm((f) => ({ ...f, step_order: e.target.value }))}
            />
            <label className="flex items-center gap-2 text-slate-300 text-sm pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="rounded"
              />
              Rule is active
            </label>
          </div>

          <p className="text-slate-400 text-xs">
            Submitters cannot approve their own contracts unless a rule names them personally as the
            approver.
          </p>

          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Save Rule' : 'Create Rule'}
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
