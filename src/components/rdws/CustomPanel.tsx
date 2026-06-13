import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { sendCustomCommand } from '../../api/client'
import type { TraceEntry } from '../../types'

type Target = { network: string; serial: string }

export function CustomPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [command, setCommand] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setError(null)
    setNotice(null)
  }

  async function send() {
    if (!target || !command.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await sendCustomCommand(target.serial, target.network, command.trim())
      onTrace(res.trace)
      setNotice(`Sent "${command.trim()}" to "${target.serial}".`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-pane rdws">
      <h2>Custom</h2>
      <p className="muted small">
        Send a custom command to the player; its autorun receives it on UDP port 5000.
      </p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <section>
          <label className="rdws-label">
            Command
            <input
              className="rdws-field"
              value={command}
              placeholder="e.g. reboot, or any string your autorun listens for"
              onChange={(e) => setCommand(e.target.value)}
            />
          </label>
          <div className="rdws-actions">
            <button onClick={send} disabled={busy || !command.trim()}>
              {busy ? 'Sending…' : 'Send command'}
            </button>
          </div>
          <p className="muted tiny">
            The player only acts on this if its autorun is written to handle the command.
          </p>
        </section>
      )}
    </div>
  )
}
