import { useEffect, useState } from 'react'
import { getNetworks, listDevices } from '../api/client'
import type { DeviceSummaryItem, TraceEntry } from '../types'

/**
 * Map the device record's reported health to a colored pill. BSN.cloud's
 * `status.health` is a three-state roll-up: Normal (green), Warning (amber),
 * Error (red). Empty/unknown health renders a neutral dash.
 */
function healthPill(health?: string): { cls: string; label: string } {
  const h = (health ?? '').trim().toLowerCase()
  if (!h) return { cls: 'pill-muted', label: '—' }
  if (h === 'normal') return { cls: 'pill-on', label: 'Normal' }
  if (h === 'warning') return { cls: 'pill-warn', label: 'Warning' }
  if (h === 'error') return { cls: 'pill-off', label: 'Error' }
  return { cls: 'pill-muted', label: health! }
}

export function DeviceListPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [networks, setNetworks] = useState<string[]>([])
  const [network, setNetwork] = useState('')
  const [devices, setDevices] = useState<DeviceSummaryItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getNetworks()
      .then((r) => {
        const names = r.networks.map((n) => n.name)
        setNetworks(names)
        if (names.length) setNetwork(names[0])
      })
      .catch((err) => setError((err as Error).message))
  }, [])

  useEffect(() => {
    if (!network) return
    let cancelled = false
    setBusy(true)
    setError(null)
    listDevices(network)
      .then((res) => {
        if (cancelled) return
        setDevices(res.devices)
        onTrace(res.trace)
      })
      .catch((err) => {
        if (cancelled) return
        setError((err as Error).message)
        setDevices(null)
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  return (
    <div className="fn-pane">
      <h2>Devices in a network</h2>
      <p className="muted small">
        Compact inventory of every device in the network — its Registered and Provisioned
        status, health, and setup. Use Find device for the full per-serial detail.
      </p>

      <label className="net-select">
        Network
        <select value={network} onChange={(e) => setNetwork(e.target.value)}>
          {networks.length === 0 && <option>loading…</option>}
          {networks.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}

      {busy && !devices && <p className="muted">Loading…</p>}
      {devices && devices.length === 0 && (
        <p className="muted">No devices or provision records in this network.</p>
      )}
      {devices && devices.length > 0 && (
        <>
          <p className="muted tiny">{devices.length} device(s)</p>
          <table className="setup-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Health</th>
                <th>Setup</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const hp = healthPill(d.health)
                return (
                  <tr key={d.serial}>
                    <td>
                      <div className="pkg-name">{d.name ?? d.serial}</div>
                      <div className="muted tiny">
                        {d.serial}
                        {d.model ? ` · ${d.model}` : ''}
                      </div>
                    </td>
                    <td>
                      <div className="pill-stack">
                        <span className={`pill ${d.registered ? 'pill-on' : 'pill-off'}`}>
                          Registered
                        </span>
                        <span className={`pill ${d.provisioned ? 'pill-on' : 'pill-off'}`}>
                          Provisioned
                        </span>
                      </div>
                    </td>
                    <td>
                      {d.registered ? <span className={`pill ${hp.cls}`}>{hp.label}</span> : '—'}
                    </td>
                    <td>
                      <div>{d.setupPackageName ?? '—'}</div>
                      {d.setupType && <div className="muted tiny">{d.setupType}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
