import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { getPlayerLogs } from '../../api/client'
import type { TraceEntry } from '../../types'

type Target = { network: string; serial: string }

export function LogsPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [logs, setLogs] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setLogs(null)
    setError(null)
  }

  async function fetchLogs() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const res = await getPlayerLogs(target.serial, target.network)
      setLogs(res.logs)
      onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-pane rdws">
      <h2>Logs</h2>
      <p className="muted small">Fetch the player's current log output via Remote DWS.</p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <section>
          <div className="rdws-actions">
            <button onClick={fetchLogs} disabled={busy}>
              {busy ? 'Loading…' : logs === null ? 'Get logs' : 'Refresh'}
            </button>
            {logs !== null && (
              <span className="muted tiny">
                {logs ? `${logs.split('\n').length} lines · ${logs.length} chars` : 'empty'}
              </span>
            )}
          </div>
          {logs !== null &&
            (logs ? (
              <pre className="rdws-log">{logs}</pre>
            ) : (
              <p className="muted">No log output returned.</p>
            ))}
        </section>
      )}
    </div>
  )
}
