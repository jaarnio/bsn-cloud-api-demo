import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { JsonTable } from './JsonTable'
import { getRegistry, setRegistry } from '../../api/client'
import type { TraceEntry } from '../../types'

type Target = { network: string; serial: string }

export function RegistryPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [registry, setRegistryState] = useState<Record<string, unknown> | null>(null)
  const [section, setSection] = useState('')
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState<'get' | 'set' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setTarget(serial ? { network, serial } : null)
    setRegistryState(null)
    setError(null)
    setNotice(null)
  }

  async function fetchRegistry() {
    if (!target) return
    setBusy('get')
    setError(null)
    setNotice(null)
    try {
      const res = await getRegistry(target.serial, target.network)
      setRegistryState(res.registry)
      onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!target || !section.trim() || !key.trim()) return
    setBusy('set')
    setError(null)
    setNotice(null)
    try {
      const res = await setRegistry(target.serial, target.network, section.trim(), key.trim(), value)
      onTrace(res.trace)
      setNotice(`Set ${section.trim()}/${key.trim()} = "${value}".`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fn-pane rdws">
      <h2>Registry</h2>
      <p className="muted small">Dump the player registry and set section/key values, via Remote DWS.</p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <>
          <section>
            <h3>Read registry</h3>
            <div className="rdws-actions">
              <button onClick={fetchRegistry} disabled={busy !== null}>
                {busy === 'get' ? 'Loading…' : registry ? 'Refresh' : 'Get registry'}
              </button>
            </div>
            {registry && <JsonTable data={registry} />}
          </section>

          <section>
            <h3>Write a value</h3>
            <div className="rdws-actions">
              <input
                className="rdws-field rdws-field-sm"
                value={section}
                placeholder="section (e.g. brightscript)"
                onChange={(e) => setSection(e.target.value)}
              />
              <input
                className="rdws-field rdws-field-sm"
                value={key}
                placeholder="key (e.g. debug)"
                onChange={(e) => setKey(e.target.value)}
              />
              <input
                className="rdws-field rdws-field-sm"
                value={value}
                placeholder="value (e.g. 1)"
                onChange={(e) => setValue(e.target.value)}
              />
              <button onClick={save} disabled={busy !== null || !section.trim() || !key.trim()}>
                {busy === 'set' ? 'Setting…' : 'Set'}
              </button>
            </div>
            <p className="muted tiny">
              Writes one value, e.g. brightscript / debug / 1. Some keys need a reboot to take effect.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
