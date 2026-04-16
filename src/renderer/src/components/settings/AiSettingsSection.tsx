import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Input from '../ui/Input'

export default function AiSettingsSection() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState('')

  useEffect(() => {
    window.api.settings.get().then((res: any) => {
      if (res.success && res.data) {
        setApiKey(res.data.anthropic_api_key || '')
        setModel(res.data.anthropic_model || '')
      }
    })
  }, [])

  const save = async () => {
    setSaving(true)
    await window.api.settings.set({
      anthropic_api_key: apiKey,
      anthropic_model: model
    } as any)
    setSaving(false)
    setTestStatus('Saved.')
    setTimeout(() => setTestStatus(''), 2000)
  }

  const test = async () => {
    setTestStatus('Testing…')
    const res = await window.api.ai.testConnection()
    if (res.success) setTestStatus('✓ Connected to ' + (res.data as any)?.model)
    else setTestStatus('✗ ' + (res.error ?? 'failed'))
  }

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
        AI (Anthropic Claude)
      </h2>
      <Card>
        <p className="text-slate-400 text-sm mb-4">
          Used for contract clause extraction on the contract detail page. Get an API key at{' '}
          <span className="text-slate-300">console.anthropic.com</span>.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1">Anthropic API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none flex-1 placeholder-slate-500"
                placeholder="sk-ant-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="text-xs text-slate-400 hover:text-white px-2"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <Input
            label="Model (optional)"
            placeholder="claude-sonnet-4-6"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={test} disabled={!apiKey}>
              Test Connection
            </Button>
            {testStatus && (
              <span
                className={`text-sm ${
                  testStatus.startsWith('✓') || testStatus === 'Saved.'
                    ? 'text-emerald-400'
                    : testStatus.startsWith('✗')
                      ? 'text-red-400'
                      : 'text-slate-400'
                }`}
              >
                {testStatus}
              </span>
            )}
          </div>
        </div>
      </Card>
    </section>
  )
}
