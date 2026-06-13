import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { downloadFirmware } from '../../api/client'
import type { TraceEntry } from '../../types'

type Target = { network: string; serial: string }

export function OsUpdatePanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setError(null)
    setNotice(null)
  }

  async function download() {
    if (!target || !url.trim()) return
    if (
      !window.confirm(
        `Download firmware to "${target.serial}" from:\n${url.trim()}\n\nThe player will apply it and reboot. This cannot be undone.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await downloadFirmware(target.serial, target.network, url.trim())
      onTrace(res.trace)
      setNotice('Firmware download command sent — the player will download, apply, and reboot.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-pane rdws">
      <h2>OS Update</h2>
      <p className="muted small">
        Tell the player to download a firmware file from a public URL and apply it, via Remote DWS.
      </p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <section>
          <label className="rdws-label">
            Firmware URL
            <input
              className="rdws-field"
              value={url}
              placeholder="https://…/update.bsfw"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div className="rdws-actions">
            <button className="btn-danger" onClick={download} disabled={busy || !url.trim()}>
              {busy ? 'Sending…' : 'Download & update'}
            </button>
          </div>
          <p className="muted tiny">
            The URL must be publicly reachable by the player. Applying firmware reboots it.
          </p>
        </section>
      )}
    </div>
  )
}
