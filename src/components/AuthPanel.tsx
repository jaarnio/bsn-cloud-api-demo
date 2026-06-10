import { useEffect, useState } from 'react'
import { runAuth } from '../api/client'
import type { AuthRunResponse, TraceEntry } from '../types'

export function AuthPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AuthRunResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)

  // Count the token expiry down so the 5m30s lifetime is visible.
  useEffect(() => {
    if (!result?.tokenValid) return
    setRemaining(result.expiresInSeconds)
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [result])

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await runAuth()
      setResult(res)
      onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-pane">
      <h2>Authentication</h2>
      <p className="muted small">
        Client-credentials flow. The proxy holds the secret and acquires a token; the browser
        never sees it.
      </p>
      <button onClick={run} disabled={busy}>
        {busy ? 'Authenticating…' : 'Run authentication'}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <table className="record">
          <tbody>
            <tr>
              <th>Token</th>
              <td>{result.tokenValid ? 'valid' : 'invalid'}</td>
            </tr>
            <tr>
              <th>Expires in</th>
              <td>{result.tokenValid ? `${formatDuration(remaining)} (no refresh token)` : '—'}</td>
            </tr>
            <tr>
              <th>Network</th>
              <td>{result.selectedNetwork ?? result.network}</td>
            </tr>
            <tr>
              <th>Scopes</th>
              <td className="scope">{result.scope ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="muted small constraints">
        Access tokens live ~5m30s · refresh tokens are not supported · the network session has a
        24h ceiling. On a 401 the proxy silently re-auths and re-selects the network.
      </p>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}
