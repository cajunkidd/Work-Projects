import { useCallback, useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import RoleGuard from '../layout/RoleGuard'
import { useActor } from '../../lib/actor'
import type {
  AiSettings,
  Contract,
  ContractDocument,
  ExtractedObligation,
  ExtractionResult
} from '../../../../shared/types'

interface Props {
  contract: Contract
  onContractChanged: () => void
}

/** Extraction fields, and which contract column each one writes to. */
const FIELD_MAP: { key: keyof ExtractionResult; label: string; column: string; kind: 'text' | 'number' }[] = [
  { key: 'vendor_name', label: 'Vendor', column: 'vendor_name', kind: 'text' },
  { key: 'effective_date', label: 'Start Date', column: 'start_date', kind: 'text' },
  { key: 'expiration_date', label: 'End Date', column: 'end_date', kind: 'text' },
  { key: 'annual_value', label: 'Annual Cost', column: 'annual_cost', kind: 'number' },
  { key: 'monthly_value', label: 'Monthly Cost', column: 'monthly_cost', kind: 'number' },
  { key: 'total_value', label: 'Total Value', column: 'total_cost', kind: 'number' },
  { key: 'renewal_type', label: 'Renewal Type', column: 'renewal_type', kind: 'text' },
  {
    key: 'cancellation_notice_days',
    label: 'Cancellation Notice (days)',
    column: 'cancellation_notice_days',
    kind: 'number'
  },
  { key: 'contact_name', label: 'Contact Name', column: 'poc_name', kind: 'text' },
  { key: 'contact_email', label: 'Contact Email', column: 'poc_email', kind: 'text' },
  { key: 'contact_phone', label: 'Contact Phone', column: 'poc_phone', kind: 'text' }
]

const CONFIDENCE_VARIANT = { high: 'success', medium: 'warning', low: 'danger' } as const

export default function DocumentsTab({ contract, onContractChanged }: Props) {
  const actor = useActor()

  const [documents, setDocuments] = useState<ContractDocument[]>([])
  const [ai, setAi] = useState<AiSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)

  const [extracting, setExtracting] = useState<number | null>(null)
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [sourceDocId, setSourceDocId] = useState<number | null>(null)
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set())
  const [selectedObligations, setSelectedObligations] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    const [docRes, aiRes] = await Promise.all([
      window.api.documents.list({ contract_id: contract.id, actor }),
      window.api.ai.settings()
    ])
    if (docRes.success && docRes.data) setDocuments(docRes.data)
    if (aiRes.success && aiRes.data) setAi(aiRes.data)
    setLoading(false)
  }, [contract.id])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 6000)
  }

  const upload = async () => {
    setUploading(true)
    const res = await window.api.documents.upload({
      contract_id: contract.id,
      vendor_id: (contract as any).vendor_id ?? null,
      actor
    })
    setUploading(false)
    if (res.success && res.data) {
      await load()
      flash(
        res.data.extraction_status === 'extracted'
          ? `"${res.data.title}" uploaded and indexed for search.`
          : `"${res.data.title}" uploaded. ${res.data.extraction_note}`
      )
    } else if (res.error !== 'Cancelled') {
      flash(`Error: ${res.error}`)
    }
  }

  const runExtraction = async (document: ContractDocument) => {
    setExtracting(document.id)
    const res = await window.api.extraction.run({ document_id: document.id, actor })
    setExtracting(null)

    if (!res.success || !res.data) {
      flash(`Error: ${res.error}`)
      return
    }

    setResult(res.data.result)
    setSourceDocId(document.id)
    // Pre-tick the values the model was confident about.
    const preselected = new Set<string>()
    for (const field of FIELD_MAP) {
      const term = res.data.result[field.key] as { value: unknown; confidence: string } | undefined
      if (term?.value !== null && term?.value !== undefined && term.confidence !== 'low') {
        preselected.add(field.column)
      }
    }
    setSelectedFields(preselected)
    setSelectedObligations(new Set(res.data.result.obligations.map((_, index) => index)))
  }

  const apply = async () => {
    if (!result) return
    setApplying(true)

    const fields: Record<string, string | number> = {}
    for (const field of FIELD_MAP) {
      if (!selectedFields.has(field.column)) continue
      const term = result[field.key] as { value: unknown } | undefined
      if (term?.value === null || term?.value === undefined) continue
      fields[field.column] = term.value as string | number
    }

    const obligations = result.obligations
      .filter((_, index) => selectedObligations.has(index))
      .map((o: ExtractedObligation) => ({
        title: o.title,
        description: o.description,
        obligation_type: o.obligation_type,
        responsible_party: o.responsible_party,
        due_date: o.due_date,
        recurrence: o.recurrence,
        critical: o.critical
      }))

    const res = await window.api.extraction.apply({
      contract_id: contract.id,
      fields,
      obligations,
      source_document_id: sourceDocId,
      actor
    })
    setApplying(false)

    if (res.success) {
      setResult(null)
      onContractChanged()
      flash(
        `Applied ${res.data?.fields_applied ?? 0} field(s) and created ${res.data?.obligations_created ?? 0} obligation(s).`
      )
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const toggle = <T,>(set: Set<T>, value: T, setter: (next: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading documents…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <RoleGuard minRole="director">
          <Button onClick={upload} disabled={uploading}>
            {uploading ? 'Uploading…' : '+ Upload Document'}
          </Button>
        </RoleGuard>
        {message && (
          <span
            className={`text-xs max-w-lg ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {message}
          </span>
        )}
      </div>

      {ai && !ai.configured && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <p className="text-slate-300 text-sm">
            AI extraction is not configured. Add an Anthropic API key in{' '}
            <span className="text-white">Settings → AI Extraction</span> to pull terms and
            obligations out of uploaded documents automatically.
          </p>
        </div>
      )}

      {documents.length === 0 ? (
        <Card>
          <p className="text-slate-400 text-sm">
            No documents attached. Upload the signed agreement to make its contents searchable and
            to enable AI extraction of its terms.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{doc.title}</span>
                    <Badge variant="neutral">{doc.doc_type}</Badge>
                    {doc.extraction_status === 'extracted' && (
                      <Badge variant="success">Searchable</Badge>
                    )}
                    {doc.extraction_status === 'no_text_layer' && (
                      <Badge variant="warning">No text layer</Badge>
                    )}
                    {doc.extraction_status === 'failed' && <Badge variant="danger">Parse failed</Badge>}
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    {(doc.file_size / 1024).toFixed(0)} KB
                    {doc.page_count ? ` · ${doc.page_count} pages` : ''} · {doc.uploaded_by_name} ·{' '}
                    {doc.created_at}
                  </p>
                  {doc.extraction_note && (
                    <p className="text-amber-300/80 text-xs mt-1">{doc.extraction_note}</p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => window.api.documents.open(doc.id)}>
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.api.documents.saveAs(doc.id)}
                  >
                    Save As
                  </Button>
                  <RoleGuard minRole="director">
                    <Button
                      size="sm"
                      onClick={() => runExtraction(doc)}
                      disabled={extracting !== null || !ai?.configured}
                      title={ai?.configured ? 'Extract terms with AI' : 'Configure an API key first'}
                    >
                      {extracting === doc.id ? 'Extracting…' : 'Extract Terms'}
                    </Button>
                  </RoleGuard>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {extracting !== null && (
        <Card>
          <p className="text-slate-300 text-sm">
            Reading the document and extracting terms. This can take a minute on a long agreement.
          </p>
        </Card>
      )}

      {/* Review and apply */}
      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title="Review Extracted Terms"
        width="max-w-3xl"
      >
        {result && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
              <p className="text-slate-300 text-sm">{result.summary}</p>
            </div>

            <p className="text-slate-400 text-xs">
              Nothing is written to the contract until you apply it. Values the model was unsure
              about are left unticked — check each one against the evidence before accepting.
            </p>

            <div>
              <p className="text-white font-semibold text-sm mb-2">Contract Terms</p>
              <div className="space-y-1">
                {FIELD_MAP.map((field) => {
                  const term = result[field.key] as
                    | { value: unknown; confidence: 'high' | 'medium' | 'low'; evidence: string }
                    | undefined
                  if (!term || term.value === null || term.value === undefined) return null

                  return (
                    <label
                      key={field.column}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.has(field.column)}
                        onChange={() =>
                          toggle(selectedFields, field.column, setSelectedFields)
                        }
                        className="rounded mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-400 text-sm">{field.label}:</span>
                          <span className="text-white text-sm font-medium">
                            {String(term.value)}
                          </span>
                          <Badge variant={CONFIDENCE_VARIANT[term.confidence]}>
                            {term.confidence}
                          </Badge>
                        </div>
                        {term.evidence && (
                          <p className="text-slate-500 text-xs mt-0.5 italic">"{term.evidence}"</p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {result.obligations.length > 0 && (
              <div>
                <p className="text-white font-semibold text-sm mb-2">
                  Obligations ({result.obligations.length})
                </p>
                <div className="space-y-1">
                  {result.obligations.map((obligation, index) => (
                    <label
                      key={index}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedObligations.has(index)}
                        onChange={() => toggle(selectedObligations, index, setSelectedObligations)}
                        className="rounded mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm">{obligation.title}</span>
                          <Badge variant="neutral">{obligation.obligation_type}</Badge>
                          {obligation.critical && <Badge variant="danger">Critical</Badge>}
                        </div>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {obligation.responsible_party} responsibility
                          {obligation.due_date ? ` · due ${obligation.due_date}` : ''}
                          {obligation.recurrence !== 'none'
                            ? ` · repeats ${obligation.recurrence}`
                            : ''}
                        </p>
                        {obligation.description && (
                          <p className="text-slate-300 text-xs mt-0.5">{obligation.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {result.risk_flags.length > 0 && (
              <div>
                <p className="text-white font-semibold text-sm mb-2">Risk Flags</p>
                <div className="space-y-2">
                  {result.risk_flags.map((flag, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-slate-800 p-2 flex items-start gap-2"
                    >
                      <Badge
                        variant={
                          flag.severity === 'high'
                            ? 'danger'
                            : flag.severity === 'medium'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {flag.severity}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-slate-200 text-sm">{flag.issue}</p>
                        {flag.evidence && (
                          <p className="text-slate-500 text-xs mt-0.5 italic">"{flag.evidence}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-slate-500 text-xs mt-2">
                  Risk flags are informational — they are not written to the contract record.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={apply} className="flex-1 justify-center" disabled={applying}>
                {applying
                  ? 'Applying…'
                  : `Apply ${selectedFields.size} field(s) and ${selectedObligations.size} obligation(s)`}
              </Button>
              <Button variant="secondary" onClick={() => setResult(null)}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
