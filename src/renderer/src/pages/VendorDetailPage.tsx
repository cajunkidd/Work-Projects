import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import RoleGuard from '../components/layout/RoleGuard'
import { useActor } from '../lib/actor'
import type { Contract, ContractDocument, Vendor, VendorStatus } from '../../../shared/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n)
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const actor = useActor()
  const vendorId = parseInt(id!)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [documents, setDocuments] = useState<ContractDocument[]>([])
  const [message, setMessage] = useState('')

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Vendor>>({})
  const [showContact, setShowContact] = useState(false)
  const [contactForm, setContactForm] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    is_primary: false
  })

  const load = useCallback(async () => {
    const [vendorRes, contractRes, docRes] = await Promise.all([
      window.api.vendors.get(vendorId),
      window.api.contracts.list({ actor }),
      window.api.documents.list({ vendor_id: vendorId })
    ])
    if (vendorRes.success && vendorRes.data) {
      setVendor(vendorRes.data)
      setForm(vendorRes.data)
    }
    if (contractRes.success && contractRes.data) {
      setContracts(contractRes.data.filter((c) => (c as any).vendor_id === vendorId))
    }
    if (docRes.success && docRes.data) setDocuments(docRes.data)
  }, [vendorId, actor?.id])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 4000)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await window.api.vendors.update({ id: vendorId, ...form, actor })
    if (res.success) {
      setEditing(false)
      await load()
      flash('Vendor updated.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await window.api.vendors.createContact({
      vendor_id: vendorId,
      ...contactForm,
      is_primary: contactForm.is_primary ? 1 : 0,
      actor
    })
    if (res.success) {
      setShowContact(false)
      setContactForm({ name: '', title: '', email: '', phone: '', is_primary: false })
      await load()
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  if (!vendor) return <div className="text-slate-400 text-center py-20">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/vendors')}
            className="text-slate-400 hover:text-white text-sm mb-2 flex items-center gap-1"
          >
            ← Back to Vendors
          </button>
          <h1 className="text-white text-2xl font-bold">{vendor.name}</h1>
          <div className="flex items-center gap-2 mt-1">
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
            {vendor.category && <span className="text-slate-400 text-sm">{vendor.category}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span
              className={`text-xs ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {message}
            </span>
          )}
          <RoleGuard minRole="director">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </RoleGuard>
        </div>
      </div>

      {/* Roll-ups */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Contracts', value: String(vendor.active_contract_count ?? 0) },
          { label: 'Total Contracts', value: String(vendor.contract_count ?? 0) },
          { label: 'Annual Spend', value: fmt(vendor.total_annual_cost ?? 0) },
          { label: 'Next Renewal', value: vendor.next_renewal ?? '—' }
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-slate-400 text-xs">{stat.label}</p>
            <p className="text-white font-semibold mt-0.5">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <p className="text-white font-semibold mb-3">Details</p>
          <div className="space-y-2 text-sm">
            {[
              ['Email', vendor.email],
              ['Phone', vendor.phone],
              ['Website', vendor.website],
              ['Address', vendor.address],
              ['Account #', vendor.account_number],
              ['Tax ID', vendor.tax_id]
            ].map(([label, value]) => (
              <div key={label}>
                <span className="text-slate-400">{label}: </span>
                <span className="text-white">{value || '—'}</span>
              </div>
            ))}
          </div>
          {vendor.notes && (
            <p className="text-slate-300 text-sm mt-3 pt-3 border-t border-slate-800 whitespace-pre-wrap">
              {vendor.notes}
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold">Contacts</p>
            <RoleGuard minRole="director">
              <Button size="sm" variant="secondary" onClick={() => setShowContact(true)}>
                + Add
              </Button>
            </RoleGuard>
          </div>
          {(vendor.contacts ?? []).length === 0 ? (
            <p className="text-slate-400 text-sm">No contacts recorded.</p>
          ) : (
            <div className="space-y-2">
              {(vendor.contacts ?? []).map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-start justify-between py-2 border-b border-slate-800 last:border-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">{contact.name}</span>
                      {contact.is_primary === 1 && <Badge variant="info">Primary</Badge>}
                    </div>
                    <p className="text-slate-400 text-xs">
                      {[contact.title, contact.email, contact.phone].filter(Boolean).join(' · ') ||
                        '—'}
                    </p>
                  </div>
                  <RoleGuard minRole="director">
                    <button
                      onClick={async () => {
                        await window.api.vendors.deleteContact(contact.id)
                        load()
                      }}
                      className="text-slate-500 hover:text-red-400 text-lg leading-none"
                    >
                      ×
                    </button>
                  </RoleGuard>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <p className="text-white font-semibold mb-3">Contracts</p>
        {contracts.length === 0 ? (
          <p className="text-slate-400 text-sm">No contracts linked to this vendor.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-800">
                <th className="pb-2 font-medium">Scope</th>
                <th className="pb-2 font-medium">Term</th>
                <th className="pb-2 font-medium text-right">Annual</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr
                  key={contract.id}
                  className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/40 cursor-pointer"
                  onClick={() => navigate(`/contracts/${contract.id}`)}
                >
                  <td className="py-2 text-white">
                    {contract.department_name ?? contract.branch_name ?? '—'}
                  </td>
                  <td className="py-2 text-slate-400">
                    {contract.start_date} → {contract.end_date}
                  </td>
                  <td className="py-2 text-right text-white">{fmt(contract.annual_cost)}</td>
                  <td className="py-2">
                    <Badge
                      variant={
                        contract.status === 'active'
                          ? 'success'
                          : contract.status === 'expiring_soon'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {contract.status.replace('_', ' ')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {documents.length > 0 && (
        <Card>
          <p className="text-white font-semibold mb-3">Documents</p>
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"
              >
                <span className="text-white text-sm">{doc.title}</span>
                <Button variant="ghost" size="sm" onClick={() => window.api.documents.open(doc.id)}>
                  Open
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Edit */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Vendor" width="max-w-2xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              value={form.name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Category"
              value={form.category ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              value={form.email ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Phone"
              value={form.phone ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <Input
            label="Website"
            value={form.website ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          />
          <Input
            label="Address"
            value={form.address ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Account #"
              value={form.account_number ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
            />
            <Input
              label="Tax ID"
              value={form.tax_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
            />
            <Select
              label="Status"
              value={form.status ?? 'active'}
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
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-24 resize-none"
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <p className="text-slate-400 text-xs">
            Renaming the vendor also updates the vendor name shown on all of its contracts.
          </p>
          <Button type="submit" className="w-full justify-center">
            Save Changes
          </Button>
        </form>
      </Modal>

      {/* Add contact */}
      <Modal open={showContact} onClose={() => setShowContact(false)} title="Add Contact">
        <form onSubmit={addContact} className="space-y-4">
          <Input
            label="Name"
            value={contactForm.name}
            onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Title"
            value={contactForm.title}
            onChange={(e) => setContactForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              value={contactForm.email}
              onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Phone"
              value={contactForm.phone}
              onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={contactForm.is_primary}
              onChange={(e) => setContactForm((f) => ({ ...f, is_primary: e.target.checked }))}
              className="rounded"
            />
            Primary contact
          </label>
          <Button type="submit" className="w-full justify-center">
            Add Contact
          </Button>
        </form>
      </Modal>
    </div>
  )
}
