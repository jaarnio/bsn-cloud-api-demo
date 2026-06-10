import { useEffect, useState } from 'react'
import { listSetups } from '../api/client'
import type { SetupListItem, TraceEntry } from '../types'

export interface ProvisionFormValues {
  network: string
  serial: string
  name: string
  desc: string
  setupName: string
  setupId: string
}

const DEFAULTS: ProvisionFormValues = {
  network: '',
  serial: '',
  name: '',
  desc: '',
  setupName: '',
  setupId: '',
}

/**
 * Shared create/edit form for a provision record. The Setup dropdown is scoped
 * to the selected network's setup packages (loaded on demand). On edit the
 * network + serial are locked (they identify the record).
 */
export function ProvisionForm({
  initial,
  networks,
  networkLocked,
  serialLocked,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  onTrace,
}: {
  initial?: Partial<ProvisionFormValues>
  networks: string[]
  networkLocked?: boolean
  serialLocked?: boolean
  submitLabel: string
  busy: boolean
  onSubmit: (values: ProvisionFormValues) => void
  onCancel?: () => void
  /** Surfaces the setup-enumeration call (populating the Setup dropdown) in the flow. */
  onTrace?: (trace: TraceEntry[]) => void
}) {
  const [v, setV] = useState<ProvisionFormValues>({ ...DEFAULTS, ...initial })
  const [setups, setSetups] = useState<SetupListItem[]>([])
  const [loadingSetups, setLoadingSetups] = useState(false)
  const set = <K extends keyof ProvisionFormValues>(key: K, value: ProvisionFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }))

  // Default the network once the list loads (create mode).
  useEffect(() => {
    if (!networkLocked && !v.network && networks.length) {
      setV((prev) => ({ ...prev, network: networks[0] }))
    }
  }, [networks, networkLocked, v.network])

  // Load the network's setups for the Setup dropdown. This is a SEPARATE
  // bsn.cloud call (GET rest-setup/v3/setup) from listing provision records, so
  // surface it in the flow for transparency.
  useEffect(() => {
    if (!v.network) return
    setLoadingSetups(true)
    listSetups(v.network)
      .then((r) => {
        setSetups(r.setups)
        onTrace?.(r.trace)
      })
      .catch(() => setSetups([]))
      .finally(() => setLoadingSetups(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.network])

  function onPickSetup(name: string) {
    const match = setups.find((s) => s.packageName === name)
    setV((prev) => ({ ...prev, setupName: name, setupId: match?.id ?? '' }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!v.network || !v.serial.trim() || !v.setupName) return
    onSubmit({ ...v, serial: v.serial.trim() })
  }

  return (
    <form onSubmit={submit} className="setup-form">
      <fieldset>
        <legend>Provision Record</legend>
        <label>
          Network
          {networkLocked ? (
            <input value={v.network} disabled />
          ) : (
            <select value={v.network} onChange={(e) => set('network', e.target.value)}>
              {networks.length === 0 && <option>loading…</option>}
              {networks.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </label>
        <label>
          Player Serial
          <input
            value={v.serial}
            disabled={serialLocked}
            placeholder="e.g. F4E5A1000033"
            onChange={(e) => set('serial', e.target.value)}
          />
        </label>
        <label>
          Player Name
          <input value={v.name} placeholder="optional" onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          Player Description
          <input value={v.desc} placeholder="optional" onChange={(e) => set('desc', e.target.value)} />
        </label>
        <label>
          Setup
          <select
            value={v.setupName}
            disabled={loadingSetups || setups.length === 0}
            onChange={(e) => onPickSetup(e.target.value)}
          >
            <option value="">{loadingSetups ? 'loading setups…' : 'Select a setup…'}</option>
            {setups.map((s) => (
              <option key={s.id} value={s.packageName}>
                {s.packageName}
              </option>
            ))}
          </select>
        </label>
        {!loadingSetups && setups.length === 0 && v.network && (
          <p className="muted tiny">No setups in this network — create one first.</p>
        )}
      </fieldset>

      <div className="form-actions">
        <button type="submit" disabled={busy || !v.network || !v.serial.trim() || !v.setupName}>
          {busy ? 'Working…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
