import { useCallback, useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { useActor, currentActor } from '../../lib/actor'
import type { AiSettings, CalendarFeedOptions, Webhook, WebhookEvent } from '../../../../shared/types'

const MODEL_OPTIONS = [
  { value: 'claude-opus-5', label: 'Claude Opus 5 (recommended)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (faster, lower cost)' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest, lowest cost)' }
]

const EFFORT_OPTIONS = [
  { value: 'low', label: 'Low — fastest, cheapest' },
  { value: 'medium', label: 'Medium — balanced' },
  { value: 'high', label: 'High — recommended' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max — most thorough' }
]

const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: 'contract.created', label: 'Contract created' },
  { value: 'contract.updated', label: 'Contract updated' },
  { value: 'contract.deleted', label: 'Contract deleted' },
  { value: 'contract.submitted', label: 'Submitted for approval' },
  { value: 'contract.approved', label: 'Contract approved' },
  { value: 'contract.rejected', label: 'Contract rejected' },
  { value: 'renewal.upcoming', label: 'Renewal / cancellation deadline' },
  { value: 'obligation.due', label: 'Obligation due or overdue' },
  { value: 'obligation.completed', label: 'Obligation completed' },
  { value: 'vendor.created', label: 'Vendor created' }
]

/** AI extraction, calendar feed, and outbound webhooks. */
export default function IntegrationsSection() {
  const actor = useActor()

  // AI
  const [ai, setAi] = useState<AiSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('claude-opus-5')
  const [effort, setEffort] = useState('high')
  const [aiMessage, setAiMessage] = useState('')
  const [testing, setTesting] = useState(false)

  // Calendar
  const [calendarOptions, setCalendarOptions] = useState<CalendarFeedOptions>({
    include_renewals: true,
    include_cancellation_deadlines: true,
    include_obligations: true,
    reminder_minutes: 0
  })
  const [feedPath, setFeedPath] = useState('')
  const [calendarMessage, setCalendarMessage] = useState('')

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    events: [] as WebhookEvent[]
  })
  const [webhookMessage, setWebhookMessage] = useState('')
  const [revealed, setRevealed] = useState<number | null>(null)

  const load = useCallback(async () => {
    const [aiRes, settingsRes, hookRes] = await Promise.all([
      window.api.ai.settings(),
      window.api.settings.get(),
      window.api.webhooks.list()
    ])
    if (aiRes.success && aiRes.data) {
      setAi(aiRes.data)
      setModel(aiRes.data.model)
      setEffort(aiRes.data.effort)
    }
    if (settingsRes.success && settingsRes.data) {
      setFeedPath((settingsRes.data as any).calendar_feed_path ?? '')
    }
    if (hookRes.success && hookRes.data) setWebhooks(hookRes.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (setter: (v: string) => void, text: string) => {
    setter(text)
    setTimeout(() => setter(''), 5000)
  }

  const saveAi = async () => {
    const payload: Record<string, string> = { anthropic_model: model, anthropic_effort: effort }
    if (apiKey.trim()) payload.anthropic_api_key = apiKey.trim()

    const res = await window.api.settings.set({ ...payload, actor } as any)
    if (res.success) {
      setApiKey('')
      await load()
      flash(setAiMessage, 'AI settings saved.')
    } else {
      flash(setAiMessage, `Error: ${res.error}`)
    }
  }

  const testAi = async () => {
    setTesting(true)
    const res = await window.api.ai.test()
    setTesting(false)
    flash(setAiMessage, res.success ? (res.data ?? 'Connected.') : `Error: ${res.error}`)
  }

  const exportCalendar = async () => {
    const res = await window.api.calendar.export(calendarOptions)
    if (res.success && res.data) {
      // Remembering the path lets the daily scheduler keep the feed current.
      await window.api.settings.set({ calendar_feed_path: res.data.path, actor } as any)
      setFeedPath(res.data.path)
      flash(
        setCalendarMessage,
        `Wrote ${res.data.events} event(s). The daily sweep will keep this file up to date.`
      )
    } else if (res.error !== 'Cancelled') {
      flash(setCalendarMessage, `Error: ${res.error}`)
    }
  }

  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await window.api.webhooks.create({ ...webhookForm, actor })
    if (res.success) {
      setShowWebhookForm(false)
      setWebhookForm({ name: '', url: '', events: [] })
      await load()
      flash(setWebhookMessage, 'Webhook created — reveal its secret to configure the receiver.')
    } else {
      flash(setWebhookMessage, `Error: ${res.error}`)
    }
  }

  const testWebhook = async (id: number) => {
    const res = await window.api.webhooks.test(id)
    await load()
    flash(setWebhookMessage, res.success ? (res.data ?? 'Delivered.') : `Error: ${res.error}`)
  }

  return (
    <div className="space-y-8">
      {/* ─── AI Extraction ─── */}
      <section className="space-y-4">
        <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
          AI Extraction
        </h2>
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-white font-semibold">Anthropic API</p>
              <p className="text-slate-400 text-xs mt-0.5">
                Reads uploaded agreements and pulls out terms, obligations, and risk flags. Scanned
                PDFs with no text layer are read from the page images.
              </p>
            </div>
            {ai?.configured ? (
              <Badge variant="success">Configured</Badge>
            ) : (
              <Badge variant="neutral">Not configured</Badge>
            )}
          </div>

          <div className="space-y-4">
            <Input
              label="API Key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={ai?.configured ? '•••••••• (leave blank to keep current)' : 'sk-ant-…'}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                options={MODEL_OPTIONS}
              />
              <Select
                label="Effort"
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                options={EFFORT_OPTIONS}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={saveAi}>Save</Button>
              <Button variant="secondary" onClick={testAi} disabled={testing || !ai?.configured}>
                {testing ? 'Testing…' : 'Test Connection'}
              </Button>
              {aiMessage && (
                <span
                  className={`text-xs ${aiMessage.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {aiMessage}
                </span>
              )}
            </div>

            <p className="text-slate-500 text-xs">
              Extraction is billed by Anthropic per token. The key is stored in the app database
              alongside the SMTP and e-signature credentials — if that database sits on a shared
              network drive, everyone with access to the drive can read it. You can instead set an
              ANTHROPIC_API_KEY environment variable, which takes precedence and is not stored.
            </p>
          </div>
        </Card>
      </section>

      {/* ─── Calendar ─── */}
      <section className="space-y-4">
        <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
          Calendar Feed
        </h2>
        <Card>
          <p className="text-slate-400 text-xs mb-4">
            Writes an .ics file of contract dates. Save it to a shared network path and subscribe
            from Outlook, Google Calendar, or Apple Calendar — the daily sweep rewrites it so the
            calendar stays current.
          </p>

          <div className="space-y-2 mb-4">
            {[
              ['include_renewals', 'Renewal and expiry dates'],
              ['include_cancellation_deadlines', 'Evergreen cancellation deadlines'],
              ['include_obligations', 'Open obligation due dates']
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={(calendarOptions as any)[key]}
                  onChange={(e) =>
                    setCalendarOptions((o) => ({ ...o, [key]: e.target.checked }))
                  }
                  className="rounded"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <Select
              label="Calendar reminder"
              value={String(calendarOptions.reminder_minutes)}
              onChange={(e) =>
                setCalendarOptions((o) => ({ ...o, reminder_minutes: Number(e.target.value) }))
              }
              options={[
                { value: '0', label: 'No reminder' },
                { value: '1440', label: '1 day before' },
                { value: '10080', label: '1 week before' },
                { value: '43200', label: '30 days before' }
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={exportCalendar}>Export .ics</Button>
            {calendarMessage && (
              <span
                className={`text-xs ${calendarMessage.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
              >
                {calendarMessage}
              </span>
            )}
          </div>

          {feedPath && (
            <p className="text-slate-400 text-xs mt-3">
              Auto-refreshing: <span className="text-slate-300">{feedPath}</span>
            </p>
          )}
        </Card>
      </section>

      {/* ─── Webhooks ─── */}
      <section className="space-y-4">
        <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
          Webhooks
        </h2>
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-white font-semibold">Outbound Events</p>
              <p className="text-slate-400 text-xs mt-0.5">
                POSTs a signed JSON payload when something happens. Point one at Zapier, Power
                Automate, a Salesforce flow, or any internal endpoint.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {webhookMessage && (
                <span
                  className={`text-xs max-w-xs ${webhookMessage.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {webhookMessage}
                </span>
              )}
              <Button onClick={() => setShowWebhookForm(true)}>+ Add Webhook</Button>
            </div>
          </div>

          {webhooks.length === 0 ? (
            <p className="text-slate-400 text-sm">No webhooks configured.</p>
          ) : (
            <div className="space-y-2">
              {webhooks.map((hook) => {
                let events: string[] = []
                try {
                  events = JSON.parse(hook.events)
                } catch {
                  events = []
                }

                return (
                  <div
                    key={hook.id}
                    className="py-3 border-b border-slate-800 last:border-0 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-medium">{hook.name}</span>
                          {hook.active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="neutral">Disabled</Badge>
                          )}
                          {hook.last_status !== null && (
                            <Badge variant={hook.last_status < 400 ? 'success' : 'danger'}>
                              Last: {hook.last_status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-slate-400 text-xs mt-0.5 truncate">{hook.url}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {events.length === 0 ? 'All events' : `${events.length} event(s)`}
                          {hook.last_fired_at && ` · last fired ${hook.last_fired_at}`}
                          {hook.last_error && ` · ${hook.last_error}`}
                        </p>
                        {revealed === hook.id && (
                          <p className="text-xs mt-1 font-mono bg-slate-800 rounded p-2 break-all text-amber-300">
                            {hook.secret}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevealed(revealed === hook.id ? null : hook.id)}
                        >
                          {revealed === hook.id ? 'Hide' : 'Secret'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => testWebhook(hook.id)}>
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await window.api.webhooks.update({
                              id: hook.id,
                              active: hook.active ? 0 : 1,
                              actor
                            })
                            load()
                          }}
                        >
                          {hook.active ? 'Disable' : 'Enable'}
                        </Button>
                        <button
                          onClick={async () => {
                            await window.api.webhooks.delete({ id: hook.id, actor })
                            load()
                          }}
                          className="text-slate-500 hover:text-red-400 text-lg leading-none px-1"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-slate-500 text-xs mt-4">
            Each request carries an <span className="text-slate-300">X-CM-Signature</span> header —
            an HMAC-SHA256 of the body keyed with the webhook's secret. Verify it on the receiving
            end before trusting a payload.
          </p>
        </Card>
      </section>

      <Modal
        open={showWebhookForm}
        onClose={() => setShowWebhookForm(false)}
        title="New Webhook"
        width="max-w-2xl"
      >
        <form onSubmit={createWebhook} className="space-y-4">
          <Input
            label="Name"
            value={webhookForm.name}
            onChange={(e) => setWebhookForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Salesforce contract sync"
            required
          />
          <Input
            label="Endpoint URL"
            value={webhookForm.url}
            onChange={(e) => setWebhookForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://…"
            required
          />
          <div>
            <label className="text-slate-300 text-sm font-medium">Events</label>
            <p className="text-slate-500 text-xs mb-2">
              Leave everything unticked to receive all events.
            </p>
            <div className="grid grid-cols-2 gap-1 max-h-56 overflow-y-auto">
              {WEBHOOK_EVENTS.map((event) => (
                <label
                  key={event.value}
                  className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer p-1"
                >
                  <input
                    type="checkbox"
                    checked={webhookForm.events.includes(event.value)}
                    onChange={(e) =>
                      setWebhookForm((f) => ({
                        ...f,
                        events: e.target.checked
                          ? [...f.events, event.value]
                          : f.events.filter((v) => v !== event.value)
                      }))
                    }
                    className="rounded"
                  />
                  {event.label}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full justify-center">
            Create Webhook
          </Button>
        </form>
      </Modal>
    </div>
  )
}
