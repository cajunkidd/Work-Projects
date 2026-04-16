import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'

export default function DeploymentSection() {
  const [releasesPath, setReleasesPath] = useState('')
  const [checkStatus, setCheckStatus] = useState('')

  useEffect(() => {
    ;(window.api as any).updater.getReleasesPath().then((res: any) => {
      if (res.success && res.data) setReleasesPath(res.data)
    })
  }, [])

  const pickFolder = async () => {
    const res = await (window.api as any).updater.setReleasesPath()
    if (res.success && res.data) {
      setReleasesPath(res.data)
    }
  }

  const checkNow = async () => {
    setCheckStatus('Checking…')
    const res = await (window.api as any).updater.checkNow()
    if (res.success) {
      setCheckStatus('Up to date (or update dialog was shown)')
    } else {
      setCheckStatus('Error: ' + (res.error ?? 'unknown'))
    }
    setTimeout(() => setCheckStatus(''), 4000)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
        Auto-Update
      </h2>
      <Card>
        <p className="text-slate-400 text-sm mb-4">
          Point the app to a shared folder on your network where new releases are published.
          On each launch the app checks for a newer version and prompts to install.
        </p>
        <p className="text-slate-400 text-xs mb-1">Expected folder layout:</p>
        <pre className="text-slate-500 text-xs bg-slate-800 rounded px-3 py-2 mb-4 overflow-x-auto">
{`\\\\server\\share\\releases\\
  latest.json                ← { "version": "1.2.0", "file": "Contract Manager Setup 1.2.0.exe" }
  Contract Manager Setup 1.2.0.exe`}
        </pre>

        <div className="space-y-3">
          <div>
            <p className="text-slate-400 text-xs font-medium mb-1">Releases Folder</p>
            {releasesPath ? (
              <p className="text-slate-300 text-sm break-all mb-2">{releasesPath}</p>
            ) : (
              <p className="text-slate-500 text-sm mb-2">Not configured — auto-update is disabled.</p>
            )}
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={pickFolder}>
                {releasesPath ? 'Change Folder' : 'Select Releases Folder'}
              </Button>
              {releasesPath && (
                <Button variant="secondary" onClick={checkNow}>
                  Check for Updates Now
                </Button>
              )}
              {checkStatus && (
                <span className={`text-sm ${checkStatus.startsWith('Error') ? 'text-red-400' : 'text-slate-400'}`}>
                  {checkStatus}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}
