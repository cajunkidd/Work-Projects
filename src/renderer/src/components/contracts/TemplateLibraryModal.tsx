import { useCallback, useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Badge from '../ui/Badge'
import type { ContractTemplate, ContractTemplateType } from '../../../../shared/types'

/**
 * The saved-template library.
 *
 * Templates could be created but never reopened — the list and delete handlers
 * existed in the main process with nothing calling them. This is that missing
 * half: reopen a saved draft, or delete one that has gone stale.
 *
 * `only` narrows the list to the kind the calling panel can actually use. The
 * built editor can't open an uploaded PDF, and the upload panel can't send a
 * TipTap document without rendering it first.
 */
interface Props {
  open: boolean
  onClose: () => void
  only?: ContractTemplateType
  onPick: (template: ContractTemplate) => void
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TemplateLibraryModal({ open, onClose, only, onPick }: Props) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.api.contractCreation.listTemplates()
    setLoading(false)
    if (res.success && res.data) {
      setTemplates(res.data)
      setError('')
    } else {
      setError(res.error ?? 'Could not load templates')
    }
  }, [])

  useEffect(() => {
    if (open) {
      setSearch('')
      setConfirmId(null)
      load()
    }
  }, [open, load])

  const handleDelete = async (id: number) => {
    const res = await window.api.contractCreation.deleteTemplate(id)
    if (res.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      setConfirmId(null)
    } else {
      setError(res.error ?? 'Could not delete that template')
    }
  }

  const term = search.trim().toLowerCase()
  const visible = templates
    .filter((t) => (only ? t.type === only : true))
    .filter((t) => (term ? t.title.toLowerCase().includes(term) : true))

  const hiddenByType = only ? templates.length - templates.filter((t) => t.type === only).length : 0

  return (
    <Modal open={open} onClose={onClose} title="Template Library">
      <div className="space-y-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates by title"
          className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 w-full placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {loading ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-slate-400 text-sm">
            {templates.length === 0
              ? 'No templates saved yet. Build a contract and choose Save as Template.'
              : 'Nothing matches that search.'}
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {visible.map((t) => (
              <div key={t.id} className="bg-slate-800 rounded-lg px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium truncate">{t.title}</p>
                      <Badge variant={t.type === 'built' ? 'info' : 'neutral'}>
                        {t.type === 'built' ? 'Built' : 'Uploaded'}
                      </Badge>
                    </div>
                    {t.file_path && (
                      <p className="text-slate-500 text-xs truncate">{t.file_path}</p>
                    )}
                    {t.created_at && (
                      <p className="text-slate-500 text-xs">Saved {fmtDate(t.created_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => { onPick(t); onClose() }}
                      className="text-sm text-[var(--brand-primary)] hover:underline"
                    >
                      Open
                    </button>
                    {confirmId === t.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-xs text-slate-500 hover:text-white"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmId(t.id)}
                        className="text-slate-500 hover:text-red-400 text-lg leading-none"
                        title="Delete template"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hiddenByType > 0 && (
          <p className="text-slate-500 text-xs">
            {hiddenByType} template{hiddenByType === 1 ? '' : 's'} of the other kind
            {hiddenByType === 1 ? ' is' : ' are'} hidden here — they live on the other tab.
          </p>
        )}
      </div>
    </Modal>
  )
}
