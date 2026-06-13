import { useEffect, useState } from 'react'
import { getNetworks, listPlayers } from '../api/client'
import type { PlayerListItem, TraceEntry } from '../types'

/**
 * Shared Network → player picker used by every RDWS page. Loads the account's
 * networks (auto-selecting the first), then the players in the selected network.
 * Offline players are listed but disabled, since rDWS commands only reach players
 * bsn.cloud has heard from recently. Reports the chosen (network, serial) to the
 * parent; serial is null until a player is picked or when the network changes.
 */
export function PlayerSelect({
  onSelect,
  onTrace,
}: {
  onSelect: (network: string, serial: string | null) => void
  onTrace?: (trace: TraceEntry[]) => void
}) {
  const [networks, setNetworks] = useState<string[]>([])
  const [network, setNetwork] = useState('')
  const [players, setPlayers] = useState<PlayerListItem[] | null>(null)
  const [serial, setSerial] = useState('')
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

  // Reload players whenever the network changes; reset the current selection.
  useEffect(() => {
    if (!network) return
    let cancelled = false
    setBusy(true)
    setError(null)
    setPlayers(null)
    setSerial('')
    onSelect(network, null)
    listPlayers(network)
      .then((res) => {
        if (cancelled) return
        setPlayers(res.players)
        onTrace?.(res.trace)
      })
      .catch((err) => {
        if (cancelled) return
        setError((err as Error).message)
        setPlayers(null)
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  function choosePlayer(next: string) {
    setSerial(next)
    onSelect(network, next || null)
  }

  return (
    <div className="player-select">
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

      <label className="net-select">
        Player
        <select value={serial} onChange={(e) => choosePlayer(e.target.value)} disabled={busy || !players}>
          <option value="">{busy ? 'loading…' : 'Select a player…'}</option>
          {players?.map((p) => (
            <option key={p.serial} value={p.serial} disabled={!p.online}>
              {(p.name ?? p.serial)} · {p.serial}
              {p.online ? '' : ' (offline)'}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
