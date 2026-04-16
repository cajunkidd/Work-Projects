import { useEffect, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import type { ContractTemplate, SigningRequest, SigningRequestStatus } from '../../../../shared/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColors: Record<SigningRequestStatus, string> = {
  pending: 'bg-slate-600 text-slate-200',
  sent: 'bg-blue-600/30 text-blue-300',
  viewed: 'bg-yellow-600/30 text-yellow-300',
  completed: 'bg-emerald-600/30 text-emerald-300',
  declined: 'bg-red-600/30 text-red-300'
}

function StatusBadge({ status }: { status: SigningRequestStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColors[status]}`}>
      {status}
    </span>
  )
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  active,
  title,
  children
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--brand-primary)] text-white'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Recipient Form ───────────────────────────────────────────────────────────

function RecipientForm({
  recipientName,
  recipientEmail,
  setRecipientName,
  setRecipientEmail
}: {
  recipientName: string
  recipientEmail: string
  setRecipientName: (v: string) => void
  setRecipientEmail: (v: string) => void
}) {
  const cls = 'bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] w-full placeholder-slate-500'
  return (
    <div className="space-y-3">
      <p className="text-white text-sm font-semibold">Recipient</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-slate-400 text-xs mb-1">Full Name</label>
          <input
            className={cls}
            placeholder="John Smith"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Email Address</label>
          <input
            className={cls}
            type="email"
            placeholder="john@example.com"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Signing Requests Table ───────────────────────────────────────────────────

function SigningRequestsTable() {
  const [requests, setRequests] = useState<SigningRequest[]>([])
  const [refreshingId, setRefreshingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const res = await window.api.contractCreation.listRequests()
    if (res.success && res.data) setRequests(res.data)
  }, [])

  useEffect(() => { load() }, [load])

  const handleRefresh = async (id: number) => {
    setRefreshingId(id)
    await window.api.contractCreation.refreshStatus(id)
    await load()
    setRefreshingId(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white font-semibold">Signing Requests</p>
        <button
          onClick={load}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          ↻ Refresh All
        </button>
      </div>

      {requests.length === 0 ? (
        <p className="text-slate-500 text-sm py-4 text-center">No signing requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs border-b border-slate-700">
                <th className="pb-2 font-medium">Document</th>
                <th className="pb-2 font-medium">Recipient</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Sent</th>
                <th className="pb-2 font-medium">Completed</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {requests.map((r) => (
                <tr key={r.id} className="text-slate-300">
                  <td className="py-2.5 pr-4 max-w-[200px] truncate font-medium text-white">
                    {r.document_title}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div>{r.recipient_name}</div>
                    <div className="text-slate-500 text-xs">{r.recipient_email}</div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400 text-xs">
                    {r.sent_at ? fmt(r.sent_at) : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400 text-xs">
                    {r.completed_at ? fmt(r.completed_at) : '—'}
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => handleRefresh(r.id)}
                      disabled={refreshingId === r.id}
                      title="Refresh status from Documenso"
                      className="text-slate-500 hover:text-white transition-colors disabled:opacity-40 text-base"
                    >
                      {refreshingId === r.id ? '⏳' : '↻'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Build from Scratch Panel ─────────────────────────────────────────────────

function BuildPanel({ onSent }: { onSent: () => void }) {
  const [title, setTitle] = useState('Untitled Contract')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [savedTemplateId, setSavedTemplateId] = useState<number | undefined>()

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: true })
    ],
    content: '<p>Enter your contract text here...</p>',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[360px] text-slate-200 leading-relaxed'
      }
    }
  })

  const insertSignatureField = () => {
    editor
      ?.chain()
      .focus()
      .insertContent(
        `<div class="signature-field" data-type="signature-field">
          <div class="signature-field-line"></div>
          <div class="signature-field-label">Signature Required</div>
        </div>`
      )
      .run()
  }

  const handleInsertImage = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        editor?.chain().focus().setImage({ src }).run()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleSaveTemplate = async () => {
    if (!title.trim()) { setMsg('Please enter a document title.'); return }
    setSaving(true)
    setMsg('')
    const content = JSON.stringify(editor?.getJSON() ?? {})
    const res = await window.api.contractCreation.saveTemplate({
      id: savedTemplateId,
      title,
      content
    })
    setSaving(false)
    if (res.success && res.data) {
      setSavedTemplateId(res.data.id)
      setMsg('✓ Template saved')
      setTimeout(() => setMsg(''), 3000)
    } else {
      setMsg(`Error: ${res.error}`)
    }
  }

  const handleSend = async () => {
    if (!title.trim()) { setMsg('Please enter a document title.'); return }
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setMsg('Please enter recipient name and email.')
      return
    }
    setSending(true)
    setMsg('Generating PDF...')

    // Generate PDF from TipTap HTML output
    const html = editor?.getHTML() ?? ''
    const pdfRes = await window.api.contractCreation.generatePdf(html, title)
    if (!pdfRes.success || !pdfRes.data) {
      setSending(false)
      setMsg(`PDF error: ${pdfRes.error}`)
      return
    }

    setMsg('Sending to Documenso...')
    const sendRes = await window.api.contractCreation.send({
      templateId: savedTemplateId,
      documentTitle: title,
      recipientName,
      recipientEmail,
      // TipTap builder PDFs are generated locally; no Drive involvement.
      documentPath: pdfRes.data.path
    })

    setSending(false)
    if (sendRes.success) {
      setMsg('✓ Sent for signing! The recipient will receive an email from Documenso.')
      setRecipientName('')
      setRecipientEmail('')
      onSent()
      setTimeout(() => setMsg(''), 6000)
    } else {
      setMsg(`Error: ${sendRes.error}`)
    }
  }

  const cls = 'bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] w-full placeholder-slate-500'

  return (
    <div className="space-y-5">
      {/* Document title */}
      <div>
        <label className="block text-slate-400 text-xs mb-1.5">Document Title</label>
        <input
          className={cls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Software License Agreement"
        />
      </div>

      {/* Editor toolbar */}
      <div className="border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 px-2 py-2 bg-slate-800/80 border-b border-slate-700">
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive('bold')}
            title="Bold"
          ><strong>B</strong></ToolbarBtn>

          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive('italic')}
            title="Italic"
          ><em>I</em></ToolbarBtn>

          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive('underline')}
            title="Underline"
          ><u>U</u></ToolbarBtn>

          <span className="w-px h-5 bg-slate-600 mx-1" />

          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor?.isActive('heading', { level: 1 })}
            title="Heading 1"
          >H1</ToolbarBtn>

          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive('heading', { level: 2 })}
            title="Heading 2"
          >H2</ToolbarBtn>

          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive('heading', { level: 3 })}
            title="Heading 3"
          >H3</ToolbarBtn>

          <span className="w-px h-5 bg-slate-600 mx-1" />

          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive('bulletList')}
            title="Bullet list"
          >• List</ToolbarBtn>

          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive('orderedList')}
            title="Numbered list"
          >1. List</ToolbarBtn>

          <span className="w-px h-5 bg-slate-600 mx-1" />

          <ToolbarBtn onClick={insertSignatureField} title="Insert signature field">
            ✍ Signature Field
          </ToolbarBtn>

          <ToolbarBtn onClick={handleInsertImage} title="Insert image">
            🖼 Image
          </ToolbarBtn>
        </div>

        {/* Editor content area */}
        <div className="bg-slate-900 px-6 py-4">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Recipient */}
      <RecipientForm
        recipientName={recipientName}
        recipientEmail={recipientEmail}
        setRecipientName={setRecipientName}
        setRecipientEmail={setRecipientEmail}
      />

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSaveTemplate}
          disabled={saving}
          className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : '💾 Save as Template'}
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="px-5 py-2 text-sm rounded-lg font-semibold bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {sending ? 'Processing...' : '✉ Send for Signing'}
        </button>

        {msg && (
          <span
            className={`text-sm ${
              msg.startsWith('✓') ? 'text-emerald-400' : msg.startsWith('Error') ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Upload Template Panel ────────────────────────────────────────────────────

function UploadPanel({ onSent }: { onSent: () => void }) {
  const [template, setTemplate] = useState<ContractTemplate | null>(null)
  const [title, setTitle] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  const handleUpload = async () => {
    setUploading(true)
    setMsg('Uploading to Google Drive...')
    const res = await window.api.contractCreation.uploadTemplate()
    setUploading(false)
    if (res.success && res.data) {
      setTemplate(res.data)
      setTitle(res.data.title)
      setMsg('')
    } else if (res.error !== 'Cancelled') {
      setMsg(`Upload error: ${res.error}`)
    }
  }

  const handleSend = async () => {
    if (!template) { setMsg('Please upload a document first.'); return }
    if (!title.trim()) { setMsg('Please enter a document title.'); return }
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setMsg('Please enter recipient name and email.')
      return
    }
    setSending(true)
    setMsg('Sending to Documenso...')

    const res = await window.api.contractCreation.send({
      templateId: template.id,
      documentTitle: title,
      recipientName,
      recipientEmail,
      // New Drive-hosted templates pass a fileId; legacy templates fall
      // back to the local file_path for back-compat.
      driveFileId: template.drive_file_id,
      driveWebViewLink: template.drive_web_view_link,
      documentPath: template.drive_file_id ? undefined : template.file_path
    })

    setSending(false)
    if (res.success) {
      setMsg('✓ Sent for signing! The recipient will receive an email from Documenso.')
      setTemplate(null)
      setTitle('')
      setRecipientName('')
      setRecipientEmail('')
      onSent()
      setTimeout(() => setMsg(''), 6000)
    } else {
      setMsg(`Error: ${res.error}`)
    }
  }

  const cls = 'bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] w-full placeholder-slate-500'

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onClick={handleUpload}
        className="border-2 border-dashed border-slate-600 hover:border-[var(--brand-primary)] rounded-xl p-10 text-center cursor-pointer transition-colors"
      >
        {template ? (
          <div className="space-y-1">
            <p className="text-2xl">📄</p>
            <p className="text-white font-medium">{template.title}</p>
            {template.drive_web_view_link ? (
              <p className="text-emerald-400 text-xs">✓ Stored in Google Drive</p>
            ) : template.file_path ? (
              <p className="text-amber-400 text-xs">legacy file — requires VPN</p>
            ) : null}
            <p className="text-slate-500 text-xs mt-2">Click to replace</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-3xl">📁</p>
            <p className="text-slate-300 font-medium">
              {uploading ? 'Uploading to Google Drive...' : 'Click to upload a contract template'}
            </p>
            <p className="text-slate-500 text-xs">Supported formats: PDF, DOCX, DOC</p>
          </div>
        )}
      </div>

      {/* Title override */}
      {template && (
        <div>
          <label className="block text-slate-400 text-xs mb-1.5">Document Title</label>
          <input
            className={cls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Vendor Services Agreement"
          />
        </div>
      )}

      {/* Recipient */}
      <RecipientForm
        recipientName={recipientName}
        recipientEmail={recipientEmail}
        setRecipientName={setRecipientName}
        setRecipientEmail={setRecipientEmail}
      />

      {/* Send button */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !template}
          className="px-5 py-2 text-sm rounded-lg font-semibold bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {sending ? 'Processing...' : '✉ Send for Signing'}
        </button>

        {msg && (
          <span
            className={`text-sm ${
              msg.startsWith('✓') ? 'text-emerald-400' : msg.startsWith('Error') ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main ContractCreationTab ─────────────────────────────────────────────────

export default function ContractCreationTab() {
  const [innerTab, setInnerTab] = useState<'build' | 'upload'>('build')
  const [requestsKey, setRequestsKey] = useState(0)
  const [documensoWarning, setDocumensoWarning] = useState(false)

  useEffect(() => {
    window.api.settings.get().then((res) => {
      if (res.success && res.data) {
        const hasDocumenso = res.data.documenso_url && res.data.documenso_api_key
        setDocumensoWarning(!hasDocumenso)
      }
    })
  }, [])

  const handleSent = () => setRequestsKey((k) => k + 1)

  const innerTabs: { key: 'build' | 'upload'; label: string }[] = [
    { key: 'build', label: '✏ Build from Scratch' },
    { key: 'upload', label: '📤 Upload Template' }
  ]

  return (
    <div className="space-y-8">
      {/* Documenso warning banner */}
      {documensoWarning && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-400 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-amber-300 text-sm font-medium">Documenso not configured</p>
            <p className="text-amber-400/80 text-xs mt-0.5">
              Go to <strong>Settings → E-Signature (Documenso)</strong> to add your API URL and key
              before sending contracts for signing.
            </p>
          </div>
        </div>
      )}

      {/* Inner tab bar */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-700">
          {innerTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setInnerTab(t.key)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                innerTab === t.key
                  ? 'bg-slate-900 text-white border-b-2 border-[var(--brand-primary)] -mb-px'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {innerTab === 'build' ? (
            <BuildPanel onSent={handleSent} />
          ) : (
            <UploadPanel onSent={handleSent} />
          )}
        </div>
      </div>

      {/* Signing requests table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <SigningRequestsTable key={requestsKey} />
      </div>
    </div>
  )
}
