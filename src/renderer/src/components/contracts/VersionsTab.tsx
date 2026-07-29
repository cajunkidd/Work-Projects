import { useCallback, useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import RoleGuard from '../layout/RoleGuard'
import DiffViewer from './DiffViewer'
import { useActor } from '../../lib/actor'
import type {
  ContractVersion,
  DiffLine,
  DiffStats,
  FieldChange
} from '../../../../shared/types'

interface Props {
  contractId: number
  onContractChanged: () => void
}

interface DiffResult {
  lines: DiffLine[]
  stats: DiffStats
  field_changes: FieldChange[]
  from: ContractVersion | null
  to: ContractVersion
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Typed',
  upload: 'Uploaded',
  template: 'From template',
  import: 'Imported'
}

export default function VersionsTab({ contractId, onContractChanged }: Props) {
  const actor = useActor()
  const [versions, setVersions] = useState<ContractVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', change_summary: '' })
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [viewing, setViewing] = useState<ContractVersion | null>(null)
  const [compareFrom, setCompareFrom] = useState<number | ''>('')
  const [compareTo, setCompareTo] = useState<number | ''>('')
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffing, setDiffing] = useState(false)

  const load = useCallback(async () => {
    const res = await window.api.versions.list({ contract_id: contractId, actor })
    if (res.success && res.data) {
      setVersions(res.data)
      // Default the comparison to the two most recent versions.
      if (res.data.length >= 2) {
        setCompareFrom(res.data[1].id)
        setCompareTo(res.data[0].id)
      } else if (res.data.length === 1) {
        setCompareFrom('')
        setCompareTo(res.data[0].id)
      }
    }
    setLoading(false)
  }, [contractId])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 4000)
  }

  const importFile = async () => {
    const res = await window.api.versions.importFile()
    if (res.success && res.data) {
      setForm((f) => ({
        ...f,
        body: res.data!.text,
        title: f.title || res.data!.path.split(/[\\/]/).pop() || ''
      }))
      setSourcePath(res.data.path)
    } else if (res.error && res.error !== 'Cancelled') {
      flash(`Error: ${res.error}`)
    }
  }

  const saveVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.body.trim()) {
      flash('Error: the version needs document text.')
      return
    }
    setSaving(true)
    const res = await window.api.versions.create({
      contract_id: contractId,
      title: form.title.trim() || undefined,
      body: form.body,
      change_summary: form.change_summary,
      source: sourcePath ? 'import' : 'manual',
      file_path: sourcePath,
      actor
    })
    setSaving(false)

    if (res.success) {
      setShowCreate(false)
      setForm({ title: '', body: '', change_summary: '' })
      setSourcePath(null)
      await load()
      flash('Version captured.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const runCompare = async () => {
    if (!compareTo) return
    setDiffing(true)
    const res = await window.api.versions.diff({
      from_id: compareFrom === '' ? 0 : Number(compareFrom),
      to_id: Number(compareTo)
    })
    setDiffing(false)
    if (res.success && res.data) {
      setDiff(res.data)
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const restore = async (version: ContractVersion) => {
    const res = await window.api.versions.restore({ version_id: version.id, actor })
    if (!res.success) {
      flash(`Error: ${res.error}`)
      return
    }
    const count = res.data?.restored_fields.length ?? 0
    flash(
      count === 0
        ? 'The contract already matches this version — nothing to restore.'
        : `Restored ${count} field${count === 1 ? '' : 's'} from version ${version.version_no}.`
    )
    if (count > 0) onContractChanged()
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading versions…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <RoleGuard minRole="director">
          <Button onClick={() => setShowCreate(true)}>+ Capture Version</Button>
        </RoleGuard>
        {message && (
          <span
            className={`text-xs ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {message}
          </span>
        )}
      </div>

      {versions.length === 0 ? (
        <Card>
          <p className="text-slate-400 text-sm">
            No versions captured yet. Capture the executed agreement as version 1, then capture each
            revision as negotiation proceeds — every pair can then be compared as a redline.
          </p>
        </Card>
      ) : (
        <>
          {/* Comparison controls */}
          {versions.length >= 1 && (
            <Card>
              <p className="text-white font-semibold mb-3">Compare Versions</p>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-300 text-sm font-medium">From</label>
                  <select
                    className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none cursor-pointer"
                    value={compareFrom}
                    onChange={(e) =>
                      setCompareFrom(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  >
                    <option value="">(empty document)</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version_no} — {v.title}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-slate-500 pb-2">→</span>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-300 text-sm font-medium">To</label>
                  <select
                    className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none cursor-pointer"
                    value={compareTo}
                    onChange={(e) =>
                      setCompareTo(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  >
                    <option value="">Select a version…</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version_no} — {v.title}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={runCompare} disabled={!compareTo || diffing}>
                  {diffing ? 'Comparing…' : 'Compare'}
                </Button>
              </div>

              {diff && (
                <div className="mt-5 pt-5 border-t border-slate-800">
                  <DiffViewer
                    lines={diff.lines}
                    stats={diff.stats}
                    fieldChanges={diff.field_changes}
                    fromLabel={diff.from ? `v${diff.from.version_no}` : 'Empty'}
                    toLabel={`v${diff.to.version_no}`}
                  />
                </div>
              )}
            </Card>
          )}

          {/* Version list */}
          <div className="space-y-2">
            {versions.map((version) => (
              <Card key={version.id}>
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold">v{version.version_no}</span>
                      <span className="text-white">{version.title}</span>
                      <Badge variant="neutral">
                        {SOURCE_LABELS[version.source] ?? version.source}
                      </Badge>
                    </div>
                    {version.change_summary && (
                      <p className="text-slate-300 text-sm mt-1">{version.change_summary}</p>
                    )}
                    <p className="text-slate-400 text-xs mt-1">
                      {version.created_by_name} · {version.created_at} ·{' '}
                      {version.body.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => setViewing(version)}>
                      View
                    </Button>
                    <RoleGuard minRole="director">
                      <Button variant="secondary" size="sm" onClick={() => restore(version)}>
                        Restore Terms
                      </Button>
                    </RoleGuard>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Capture version modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Capture Contract Version"
        width="max-w-3xl"
      >
        <form onSubmit={saveVersion} className="space-y-4">
          <Input
            label="Version Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Vendor's first markup"
          />
          <Input
            label="What changed?"
            value={form.change_summary}
            onChange={(e) => setForm((f) => ({ ...f, change_summary: e.target.value }))}
            placeholder="e.g. Vendor rejected the 3% price cap, proposed CPI"
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 text-sm font-medium">Document Text</label>
              <button
                type="button"
                onClick={importFile}
                className="text-xs px-3 py-1 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors"
              >
                Import from PDF / text file
              </button>
            </div>
            <textarea
              className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none h-64 resize-none font-mono"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Paste the contract text here, or import it from a file…"
              required
            />
            {sourcePath && (
              <p className="text-slate-400 text-xs truncate">Imported from {sourcePath}</p>
            )}
          </div>
          <p className="text-slate-400 text-xs">
            The contract's current terms (dates, costs, contacts) are snapshotted with this version,
            so a later comparison shows both wording and commercial changes.
          </p>
          <Button type="submit" className="w-full justify-center" disabled={saving}>
            {saving ? 'Saving…' : 'Capture Version'}
          </Button>
        </form>
      </Modal>

      {/* View version modal */}
      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `v${viewing.version_no} — ${viewing.title}` : ''}
        width="max-w-3xl"
      >
        {viewing && (
          <div className="space-y-3">
            <p className="text-slate-400 text-xs">
              Captured by {viewing.created_by_name} on {viewing.created_at}
            </p>
            <pre className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-slate-200 text-xs whitespace-pre-wrap max-h-[500px] overflow-y-auto font-mono">
              {viewing.body}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  )
}
