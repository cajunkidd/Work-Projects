import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import RoleGuard from '../components/layout/RoleGuard'
import { useActor } from '../lib/actor'
import type { Vendor, VendorStatus } from '../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n)
}

const EMPTY_FORM = {
  name: '',
  category: '',
  website: '',
  email: '',
  phone: '',
  address: '',
  account_number: '',
  tax_id: '',
  status: 'active' as VendorStatus,
  notes: ''
}

export default function VendorsPage() {
  const actor = useActor()
  const navigate = useNavigate()

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [duplicates, setDuplicates] = useState<{ normalized_name: string; vendors: Vendor[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [showDuplicates, setShowDuplicates] = useState(false)
  const [merging, setMerging] = useState<{ keep: number; merge: number } | null>(null)

  const load = useCallback(async () => {
    const [listRes, dupRes] = await Promise.all([
      window.api.vendors.list({
        search: search.trim() || undefined,
        include_inactive: includeInactive
      }),
      window.api.vendors.findDuplicates()
    ])
    if (listRes.success && listRes.data) setVendors(listRes.data)
    if (dupRes.success && dupRes.data) setDuplicates(dupRes.data)
    setLoading(false)
  }, [search, includeInactive])

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 5000)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await window.api.vendors.create({ ...form, actor })
    setSaving(false)
    if (res.success) {
      setShowForm(false)
      setForm(EMPTY_FORM)
      await load()
      flash('Vendor created.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const merge = async () => {
    if (!merging) return
    const res = await window.api.vendors.merge({
      keep_id: merging.keep,
      merge_id: merging.merge,
      actor
    })
    setMerging(null)
    if (res.success) {
      await load()
      flash(`Merged — ${res.data?.contracts_moved ?? 0} contract(s) moved.`)
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const totalSpend = vendors.reduce((sum, v) => sum + (v.total_annual_cost ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Vendors</h1>
          <p className="text-slate-400 text-sm mt-1">
            One record per supplier, with every contract, document, and contact attached to it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span
              className={`text-xs max-w-xs ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {message}
            </span>
          )}
          <RoleGuard minRole="director">
            <Button onClick={() => setShowForm(true)}>+ New Vendor</Button>
          </RoleGuard>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-slate-400 text-xs">Vendors</p>
          <p className="text-white font-semibold text-xl mt-0.5">{vendors.length}</p>
        </Card>
        <Card>
          <p className="text-slate-400 text-xs">Committed Annual Spend</p>
          <p className="text-white font-semibold text-xl mt-0.5">{fmt(totalSpend)}</p>
        </Card>
        <Card
          onClick={duplicates.length > 0 ? () => setShowDuplicates(true) : undefined}
          className={duplicates.length > 0 ? 'border-amber-500/40' : ''}
        >
          <p className="text-slate-400 text-xs">Possible Duplicates</p>
          <p
            className={`font-semibold text-xl mt-0.5 ${duplicates.length > 0 ? 'text-amber-400' : 'text-white'}`}
          >
            {duplicates.length}
          </p>
          {duplicates.length > 0 && (
            <p className="text-amber-400/70 text-xs mt-1">Click to review and merge</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-4 items-end">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, category, or email…"
          />
          <label className="flex items-center gap-2 text-slate-300 text-sm pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded"
            />
            Include inactive
          </label>
        </div>
      </Card>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : vendors.length === 0 ? (
        <Card>
          <p className="text-slate-400 text-sm text-center py-8">No vendors match this search.</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-800">
                  <th className="pb-2 font-medium">Vendor</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium text-right">Contracts</th>
                  <th className="pb-2 font-medium text-right">Annual Spend</th>
                  <th className="pb-2 font-medium">Next Renewal</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => navigate(`/vendors/${vendor.id}`)}
                  >
                    <td className="py-2.5 text-white font-medium">{vendor.name}</td>
                    <td className="py-2.5 text-slate-400">{vendor.category || '—'}</td>
                    <td className="py-2.5 text-right text-slate-300">
                      {vendor.active_contract_count ?? 0}
                      {(vendor.contract_count ?? 0) !== (vendor.active_contract_count ?? 0) && (
                        <span className="text-slate-500"> / {vendor.contract_count}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-white">
                      {fmt(vendor.total_annual_cost ?? 0)}
                    </td>
                    <td className="py-2.5 text-slate-400">{vendor.next_renewal ?? '—'}</td>
                    <td className="py-2.5">
                      <Badge
                        variant={
                          vendor.status === 'active'
                            ? 'success'
                            : vendor.status === 'do_not_use'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {vendor.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* New vendor */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Vendor" width="max-w-2xl">
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Software, Facilities"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <Input
            label="Website"
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Account #"
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
            />
            <Input
              label="Tax ID"
              value={form.tax_id}
              onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as VendorStatus }))}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'do_not_use', label: 'Do Not Use' }
              ]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Notes</label>
            <textarea
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-20 resize-none"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? 'Saving…' : 'Create Vendor'}
          </Button>
        </form>
      </Modal>

      {/* Duplicate review */}
      <Modal
        open={showDuplicates}
        onClose={() => setShowDuplicates(false)}
        title="Possible Duplicate Vendors"
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">
            These vendors have names that normalise to the same value — usually the same supplier
            typed differently. Merging moves the other record's contracts, documents, and contacts
            onto the one you keep.
          </p>
          {duplicates.map((group) => (
            <div key={group.normalized_name} className="border border-slate-800 rounded-lg p-3">
              <div className="space-y-2">
                {group.vendors.map((vendor) => (
                  <div key={vendor.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-white text-sm">{vendor.name}</p>
                      <p className="text-slate-400 text-xs">
                        {vendor.contract_count ?? 0} contract(s) ·{' '}
                        {fmt(vendor.total_annual_cost ?? 0)}/yr
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {group.vendors
                        .filter((other) => other.id !== vendor.id)
                        .map((other) => (
                          <Button
                            key={other.id}
                            size="sm"
                            variant="secondary"
                            onClick={() => setMerging({ keep: vendor.id, merge: other.id })}
                          >
                            Keep this, merge "{other.name}"
                          </Button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {merging && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-amber-200 text-sm mb-3">
                This permanently removes the merged vendor record. Contracts and documents are kept
                and re-pointed at the surviving vendor.
              </p>
              <div className="flex gap-2">
                <Button onClick={merge}>Confirm Merge</Button>
                <Button variant="secondary" onClick={() => setMerging(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
