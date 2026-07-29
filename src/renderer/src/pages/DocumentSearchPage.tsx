import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import { useActor } from '../lib/actor'
import type { DocumentSearchHit, DocumentType } from '../../../shared/types'

/**
 * Renders a snippet from FTS5, which marks matches with [[…]]. Splitting on
 * those markers lets the matched terms be highlighted without dangerouslySetInnerHTML.
 */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[|\]\])/)
  let inMatch = false

  return (
    <p className="text-slate-300 text-sm leading-relaxed">
      {parts.map((part, index) => {
        if (part === '[[') {
          inMatch = true
          return null
        }
        if (part === ']]') {
          inMatch = false
          return null
        }
        return inMatch ? (
          <mark key={index} className="bg-amber-400/30 text-amber-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      })}
    </p>
  )
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DocumentSearchPage() {
  const navigate = useNavigate()
  const actor = useActor()

  const [query, setQuery] = useState('')
  const [docType, setDocType] = useState<'' | DocumentType>('')
  const [hits, setHits] = useState<DocumentSearchHit[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({ total: 0, indexed: 0, no_text_layer: 0, failed: 0 })
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const loadStats = useCallback(async () => {
    const res = await window.api.documents.indexStats()
    if (res.success && res.data) setStats(res.data)
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const runSearch = useCallback(async () => {
    if (query.trim().length < 2) {
      setHits([])
      setSearched(false)
      return
    }
    const res = await window.api.documents.search({
      query: query.trim(),
      doc_type: docType || undefined
    })
    setSearched(true)
    if (res.success && res.data) {
      setHits(res.data)
      setError('')
    } else {
      setHits([])
      setError(res.error ?? 'Search failed')
    }
  }, [query, docType])

  useEffect(() => {
    const timer = setTimeout(runSearch, 250)
    return () => clearTimeout(timer)
  }, [runSearch])

  const upload = async () => {
    setUploading(true)
    const res = await window.api.documents.upload({ actor })
    setUploading(false)
    if (res.success && res.data) {
      await loadStats()
      setMessage(
        res.data.extraction_status === 'extracted'
          ? `"${res.data.title}" uploaded and indexed.`
          : `"${res.data.title}" uploaded. ${res.data.extraction_note}`
      )
      setTimeout(() => setMessage(''), 6000)
    } else if (res.error !== 'Cancelled') {
      setMessage(`Error: ${res.error}`)
      setTimeout(() => setMessage(''), 5000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Document Search</h1>
          <p className="text-slate-400 text-sm mt-1">
            Searches inside every uploaded document, not just filenames.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span
              className={`text-xs max-w-md ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {message}
            </span>
          )}
          <Button onClick={upload} disabled={uploading}>
            {uploading ? 'Uploading…' : '+ Upload Document'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Documents', value: stats.total, tone: 'text-white' },
          { label: 'Text Indexed', value: stats.indexed, tone: 'text-emerald-400' },
          { label: 'No Text Layer', value: stats.no_text_layer, tone: 'text-amber-400' },
          { label: 'Failed', value: stats.failed, tone: 'text-red-400' }
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-slate-400 text-xs">{stat.label}</p>
            <p className={`font-semibold text-xl mt-0.5 ${stat.tone}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {stats.no_text_layer > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-amber-300 text-sm">
            {stats.no_text_layer} document{stats.no_text_layer === 1 ? ' has' : 's have'} no text
            layer — most likely scans. Their contents can't be indexed for text search, but AI
            extraction reads the pages directly and can pull the terms out.
          </p>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Input
              label="Search document contents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. limitation of liability, auto-renew, indemnify…"
              autoFocus
            />
          </div>
          <Select
            label="Document Type"
            value={docType}
            onChange={(e) => setDocType(e.target.value as '' | DocumentType)}
            options={[
              { value: '', label: 'All types' },
              { value: 'contract', label: 'Contract' },
              { value: 'amendment', label: 'Amendment' },
              { value: 'sow', label: 'SOW' },
              { value: 'invoice', label: 'Invoice' },
              { value: 'quote', label: 'Quote' },
              { value: 'correspondence', label: 'Correspondence' },
              { value: 'other', label: 'Other' }
            ]}
          />
        </div>
      </Card>

      {error && (
        <Card>
          <p className="text-red-400 text-sm">{error}</p>
        </Card>
      )}

      {searched && hits.length === 0 && !error && (
        <Card>
          <p className="text-slate-400 text-sm text-center py-8">
            Nothing found for "{query}".
          </p>
        </Card>
      )}

      {hits.length > 0 && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">
            {hits.length} match{hits.length === 1 ? '' : 'es'}
          </p>
          {hits.map((hit) => (
            <Card key={hit.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{hit.title}</span>
                    <Badge variant="neutral">{hit.doc_type}</Badge>
                    {hit.vendor_name && (
                      <span className="text-slate-400 text-sm">{hit.vendor_name}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <Snippet text={hit.snippet} />
                  </div>
                  <p className="text-slate-500 text-xs mt-2">
                    {fmtSize(hit.file_size)}
                    {hit.page_count ? ` · ${hit.page_count} pages` : ''} · uploaded {hit.created_at}
                  </p>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => window.api.documents.open(hit.id)}>
                    Open
                  </Button>
                  {hit.contract_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/contracts/${hit.contract_id}`)}
                    >
                      Contract
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
