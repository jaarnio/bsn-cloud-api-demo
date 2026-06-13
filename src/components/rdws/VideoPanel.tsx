import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { JsonTable } from './JsonTable'
import { getVideoMode } from '../../api/client'
import type { TraceEntry } from '../../types'

type Target = { network: string; serial: string }

export function VideoPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [mode, setMode] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setMode(null)
    setError(null)
  }

  async function fetchMode() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const res = await getVideoMode(target.serial, target.network)
      setMode(res.mode)
      onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-pane rdws">
      <h2>Video</h2>
      <p className="muted small">Read the player's currently active video mode, via Remote DWS.</p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <section>
          <div className="rdws-actions">
            <button onClick={fetchMode} disabled={busy}>
              {busy ? 'Loading…' : mode ? 'Refresh' : 'Get video mode'}
            </button>
          </div>
          {mode && <JsonTable data={mode} />}
        </section>
      )}
    </div>
  )
}
