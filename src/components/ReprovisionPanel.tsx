import { useEffect, useState } from 'react'
import { getNetworks, listPlayers, reprovisionPlayer } from '../api/client'
import type { PlayerListItem, TraceEntry } from '../types'

function lastContactLabel(iso?: string): string {
  if (!iso) return 'never'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function ReprovisionPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [networks, setNetworks] = useState<string[]>([])
  const [network, setNetwork] = useState('')
  const [players, setPlayers] = useState<PlayerListItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [reproving, setReproving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getNetworks()
      .then((r) => {
        const names = r.networks.map((n) => n.name)
        setNetworks(names)
        if (names.length) setNetwork(names[0])
      })
      .catch((err) => setError((err as Error).message))
  }, [])

  async function refresh(net: string, showTrace = true) {
    setBusy(true)
    setError(null)
    try {
      const res = await listPlayers(net)
      setPlayers(res.players)
      if (showTrace) onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
      setPlayers(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (network) refresh(network)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  async function onReprovision(p: PlayerListItem) {
    const ok = window.confirm(
      `Reprovision "${p.serial}" (${p.name ?? 'unnamed'})?\n\n` +
        `This sends a Remote DWS command that REBOOTS the player and CLEARS its storage, ` +
        `then re-applies its provision record + setup. This cannot be undone.`,
    )
    if (!ok) return
    setReproving(p.serial)
    setError(null)
    setNotice(null)
    try {
      const res = await reprovisionPlayer(p.serial, network)
      onTrace(res.trace)
      setNotice(`Reprovision command sent to "${p.serial}". The player will reboot and re-provision.`)
      await refresh(network, false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setReproving(null)
    }
  }

  return (
    <div className="fn-pane">
      <h2>Reprovision a player</h2>
      <p className="muted small">
        Lists registered players in a network with their live status. Reprovision sends a Remote
        DWS (rDWS) command instructing the player to re-pull its provision record + setup and
        reboot.
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
      {notice && <p className="notice">{notice}</p>}

      {busy && !players && <p className="muted">Loading…</p>}
      {players && players.length === 0 && <p className="muted">No players registered in this network.</p>}
      {players && players.length > 0 && (
        <table className="setup-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.serial}>
                <td>
                  <div className="pkg-name">{p.name ?? p.serial}</div>
                  <div className="muted tiny">
                    {p.serial} · {p.model}
                  </div>
                </td>
                <td>
                  <span className={`pill ${p.online ? 'pill-on' : 'pill-off'}`}>
                    {p.online ? 'Online' : 'Offline'}
                  </span>
                  <div className="muted tiny">last {lastContactLabel(p.lastContact)}</div>
                </td>
                <td className="row-actions">
                  <button
                    className="btn-danger"
                    disabled={!p.online || reproving === p.serial}
                    title={p.online ? 'Reboots the player and clears storage' : 'Player is offline'}
                    onClick={() => onReprovision(p)}
                  >
                    {reproving === p.serial ? 'Sending…' : 'Reprovision'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
