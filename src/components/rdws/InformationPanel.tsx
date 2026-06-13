import { useState } from 'react'
import type { ReactNode } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { getPlayerInfo, getPlayerTime } from '../../api/client'
import type { TraceEntry } from '../../types'

type Target = { network: string; serial: string }

/** Render a scalar value as a string (used for the time text field). */
function fmt(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}

/** Coerce an unknown into a plain object for safe property access. */
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Coerce an unknown into an array. */
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** A non-empty string, or an em-dash placeholder. */
function txt(v: unknown): ReactNode {
  return typeof v === 'string' && v.trim() ? v : <span className="muted">—</span>
}

/** Keys of a feature map whose value is exactly true. */
function activeKeys(map: Record<string, unknown>): string[] {
  return Object.entries(map)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
}

/** A comma-joined list, or a muted "none". */
function listOrNone(items: string[]): ReactNode {
  return items.length ? items.join(', ') : <span className="muted">none</span>
}

/** Render ethernet/wireless interface arrays as readable network config. */
function Interfaces({ list }: { list: unknown[] }) {
  if (list.length === 0) return <span className="muted">none</span>
  return (
    <div className="rdws-nest">
      {list.map((raw, i) => {
        const nic = asObj(raw)
        const v4 = asObj(asArr(nic.IPv4)[0])
        const v6 = asObj(asArr(nic.IPv6)[0])
        return (
          <div className="rdws-nest-item" key={i}>
            <div>
              <strong>{fmt(nic.interfaceName)}</strong>
              {nic.interfaceType ? ` · ${nic.interfaceType}` : ''}
            </div>
            <table className="record record-nested">
              <tbody>
                <tr>
                  <th>IPv4</th>
                  <td>{txt(v4.cidr ?? v4.address)}</td>
                </tr>
                <tr>
                  <th>Netmask</th>
                  <td>{txt(v4.netmask)}</td>
                </tr>
                <tr>
                  <th>MAC</th>
                  <td>{txt(v4.mac)}</td>
                </tr>
                {v6.address ? (
                  <tr>
                    <th>IPv6</th>
                    <td>{txt(v6.cidr ?? v6.address)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

/** Curated, styled view of the rDWS /info payload (raw JSON shows in the flow panel). */
function InfoTable({ info }: { info: Record<string, unknown> }) {
  const net = asObj(asObj(info.networking).result)
  const power = asObj(asObj(info.power).result)
  const poe = asObj(asObj(info.poe).result)
  const extensions = asArr(asObj(asObj(info.extensions).result).extensions)
  const blessings = asObj(asObj(info.blessings).result)
  const hardware = asObj(info.hardware_features)

  const rows: Array<[string, ReactNode]> = [
    ['Serial', txt(info.serial)],
    ['Name', txt(net.name)],
    ['Description', txt(net.description)],
    ['Uptime', txt(info.upTime)],
    ['Model', txt(info.model)],
    ['Firmware', txt(info.FWVersion)],
    ['Boot version', txt(info.bootVersion)],
    ['Family', txt(info.family)],
    ['Power', txt(power.source)],
    ['PoE', txt(poe.status)],
    ['Extensions', listOrNone(extensions.map(String))],
    ['Blessings', listOrNone(activeKeys(blessings))],
    ['Hardware', listOrNone(activeKeys(hardware))],
    ['Connection', txt(info.connectionType)],
    ['Ethernet', <Interfaces list={asArr(info.ethernet)} />],
    ['Wireless', <Interfaces list={asArr(info.wireless)} />],
  ]

  return (
    <table className="record">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function InformationPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [info, setInfo] = useState<Record<string, unknown> | null>(null)
  const [time, setTime] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState<'info' | 'time' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setInfo(null)
    setTime(null)
    setError(null)
  }

  async function fetchInfo() {
    if (!target) return
    setBusy('info')
    setError(null)
    try {
      const res = await getPlayerInfo(target.serial, target.network)
      setInfo(res.info)
      onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function fetchTime() {
    if (!target) return
    setBusy('time')
    setError(null)
    try {
      const res = await getPlayerTime(target.serial, target.network)
      setTime(res.time)
      onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fn-pane rdws">
      <h2>Information</h2>
      <p className="muted small">Read general player info and date/time via Remote DWS.</p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <>
          <section>
            <h3>Player info</h3>
            <div className="rdws-actions">
              <button onClick={fetchInfo} disabled={busy !== null}>
                {busy === 'info' ? 'Loading…' : 'Get info'}
              </button>
            </div>
            {info && <InfoTable info={info} />}
          </section>

          <section>
            <h3>Date &amp; time</h3>
            <div className="rdws-actions">
              <button onClick={fetchTime} disabled={busy !== null}>
                {busy === 'time' ? 'Loading…' : 'Get time'}
              </button>
            </div>
            {time && (
              <>
                <input className="rdws-field" readOnly value={fmt(time['time'])} />
                <p className="muted tiny">
                  Time zone: {fmt(time['timezone_name'])} ({fmt(time['timezone_abbr'])})
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
