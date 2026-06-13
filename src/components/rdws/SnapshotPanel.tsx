import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { captureSnapshot } from '../../api/client'
import type { SnapshotResponse, TraceEntry } from '../../types'

type Target = { network: string; serial: string }

/** The thumbnail already arrives as a data: URI; prefix only if it isn't one. */
function imgSrc(thumb: string): string {
  return thumb.startsWith('data:') ? thumb : `data:image/jpeg;base64,${thumb}`
}

export function SnapshotPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [snap, setSnap] = useState<SnapshotResponse['snapshot'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setSnap(null)
    setError(null)
  }

  async function capture() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const res = await captureSnapshot(target.serial, target.network)
      onTrace(res.trace)
      setSnap(res.snapshot)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-pane rdws">
      <h2>Snapshot</h2>
      <p className="muted small">Capture a screenshot of what the player is currently showing.</p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <section>
          <div className="rdws-actions">
            <button onClick={capture} disabled={busy}>
              {busy ? 'Capturing…' : snap ? 'Recapture' : 'Capture snapshot'}
            </button>
          </div>
          {snap &&
            (snap.remoteSnapshotThumbnail ? (
              <figure className="snapshot-frame">
                <img src={imgSrc(snap.remoteSnapshotThumbnail)} alt="Player snapshot" />
                <figcaption className="muted tiny">
                  {snap.width}×{snap.height} · {snap.timestamp}
                  {snap.filename ? ` · ${snap.filename}` : ''}
                </figcaption>
              </figure>
            ) : (
              <p className="muted">No image returned.</p>
            ))}
        </section>
      )}
    </div>
  )
}
