import { useCallback, useEffect, useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'
import { useActor } from '../../lib/actor'

interface SecretStatus {
  configured: boolean
  unlocked: boolean
  encryption_available: boolean
  stored: number
  plaintext: number
}

/**
 * Credential encryption.
 *
 * One passphrase protects the stored SMTP password, Gmail token, Documenso key,
 * and Anthropic key. It is never written to the database — each workstation
 * caches it in the OS keystore, so it is entered once per machine.
 */
export default function SecuritySection() {
  const actor = useActor()

  const [status, setStatus] = useState<SecretStatus | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [unlockPass, setUnlockPass] = useState('')

  const load = useCallback(async () => {
    const res = await window.api.secrets.status()
    if (res.success && res.data) setStatus(res.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 6000)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) {
      flash('Error: the two passphrases do not match.')
      return
    }
    setBusy(true)
    const res = await window.api.secrets.setPassphrase({
      passphrase: next,
      current: current || undefined,
      actor
    })
    setBusy(false)

    if (res.success) {
      setCurrent('')
      setNext('')
      setConfirm('')
      await load()
      flash(
        `Passphrase set. ${res.data?.resealed ?? 0} stored credential(s) encrypted. Every other workstation will need this passphrase once.`
      )
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const res = await window.api.secrets.unlock({ passphrase: unlockPass })
    setBusy(false)
    if (res.success) {
      setUnlockPass('')
      await load()
      flash('Unlocked. Credentials are available on this machine.')
    } else {
      flash(`Error: ${res.error}`)
    }
  }

  const lock = async (forget: boolean) => {
    await window.api.secrets.lock({ forget })
    await load()
    flash(forget ? 'Locked and cleared from this machine.' : 'Locked for this session.')
  }

  if (!status) return null

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
        Credential Encryption
      </h2>

      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-white font-semibold">Stored Credentials</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Protects the SMTP password, Gmail token, Documenso key, and Anthropic key with
              AES-256-GCM. Without this, they sit in plain text in the database file — which the
              shared-network setup makes readable by anyone with access to the drive.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {status.configured ? (
              <Badge variant="success">Encrypted</Badge>
            ) : (
              <Badge variant="danger">Plain text</Badge>
            )}
            {status.configured &&
              (status.unlocked ? (
                <Badge variant="success">Unlocked</Badge>
              ) : (
                <Badge variant="warning">Locked</Badge>
              ))}
          </div>
        </div>

        <div className="flex gap-4 text-sm mb-4">
          <span className="text-slate-400">
            Credentials stored: <span className="text-white">{status.stored}</span>
          </span>
          {status.plaintext > 0 && (
            <span className="text-amber-400">Still in plain text: {status.plaintext}</span>
          )}
        </div>

        {!status.encryption_available && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 mb-4">
            <p className="text-amber-200 text-sm">
              This machine's OS keystore isn't available, so the passphrase can't be remembered
              here. Encryption still works — it just has to be entered after each launch.
            </p>
          </div>
        )}

        {/* Locked: offer unlock */}
        {status.configured && !status.unlocked && (
          <form onSubmit={unlock} className="space-y-3 mb-6">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-amber-200 text-sm">
                Credentials are encrypted but this machine is locked. Email sending, Gmail sync,
                e-signature, and AI extraction stay disabled until it's unlocked.
              </p>
            </div>
            <Input
              label="Passphrase"
              type="password"
              value={unlockPass}
              onChange={(e) => setUnlockPass(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Unlocking…' : 'Unlock This Machine'}
            </Button>
          </form>
        )}

        {/* Set or rotate */}
        <form onSubmit={save} className="space-y-3">
          <p className="text-white text-sm font-medium">
            {status.configured ? 'Change Passphrase' : 'Set a Passphrase'}
          </p>

          {status.configured && (
            <Input
              label="Current Passphrase"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={status.unlocked ? 'Not needed — this machine is unlocked' : ''}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={status.configured ? 'New Passphrase' : 'Passphrase'}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <Input
              label="Confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : status.configured ? 'Change Passphrase' : 'Encrypt Credentials'}
            </Button>
            {status.configured && status.unlocked && (
              <>
                <Button type="button" variant="secondary" onClick={() => lock(false)}>
                  Lock Session
                </Button>
                <Button type="button" variant="ghost" onClick={() => lock(true)}>
                  Forget on This Machine
                </Button>
              </>
            )}
            {message && (
              <span
                className={`text-xs max-w-lg ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}
              >
                {message}
              </span>
            )}
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-800 space-y-1">
          <p className="text-slate-500 text-xs">
            The passphrase is never stored in the database — only a verifier that proves a given
            passphrase is correct. Copying the database file off the network drive therefore yields
            ciphertext, not credentials.
          </p>
          <p className="text-slate-500 text-xs">
            <span className="text-amber-400">There is no recovery.</span> If the passphrase is lost,
            the stored credentials cannot be decrypted and must be re-entered from scratch.
          </p>
          <p className="text-slate-500 text-xs">
            Changing it re-encrypts every stored credential, so the old passphrase stops working
            everywhere at once — each workstation will be prompted for the new one.
          </p>
        </div>
      </Card>
    </section>
  )
}
