import { useEffect, useState } from 'react'
import { deleteProvision, getNetworks, listProvisions, updateProvision } from '../api/client'
import { ProvisionForm, type ProvisionFormValues } from './ProvisionForm'
import type { ProvisionListItem, TraceEntry } from '../types'

export function ProvisionRecordsPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [networks, setNetworks] = useState<string[]>([])
  const [network, setNetwork] = useState('')
  const [records, setRecords] = useState<ProvisionListItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProvisionListItem | null>(null)
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
    setEditing(null)
    try {
      const res = await listProvisions(net)
      setRecords(res.provisions)
      if (showTrace) onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
      setRecords(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (network) refresh(network)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  async function onDelete(item: ProvisionListItem) {
    if (!window.confirm(`Delete provision record for "${item.serial}"? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await deleteProvision(item.id, network)
      onTrace(res.trace)
      setNotice(`Deleted provision record for "${item.serial}".`)
      await refresh(network, false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onSaveEdit(values: ProvisionFormValues) {
    if (!editing) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await updateProvision(editing.id, {
        network,
        serial: values.serial,
        name: values.name || undefined,
        desc: values.desc || undefined,
        setupId: values.setupId || undefined,
        setupName: values.setupName,
      })
      onTrace(res.trace)
      setNotice(`Updated provision record for "${res.serial}".`)
      await refresh(network, false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fn-pane">
      <h2>Provision records</h2>
      <p className="muted small">List, edit, and delete the provision records stored per network.</p>

      <label className="net-select">
        Network
        <select value={network} onChange={(e) => setNetwork(e.target.value)} disabled={!!editing}>
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

      {editing ? (
        <div className="edit-block">
          <h3>Edit record for "{editing.serial}"</h3>
          <ProvisionForm
            networks={networks}
            networkLocked
            serialLocked
            initial={{
              network,
              serial: editing.serial,
              name: editing.name ?? '',
              desc: editing.desc ?? '',
              setupName: editing.setupName ?? '',
            }}
            submitLabel="Save changes"
            busy={busy}
            onSubmit={onSaveEdit}
            onCancel={() => setEditing(null)}
            onTrace={onTrace}
          />
        </div>
      ) : (
        <>
          {busy && !records && <p className="muted">Loading…</p>}
          {records && records.length === 0 && <p className="muted">No provision records in this network.</p>}
          {records && records.length > 0 && (
            <table className="setup-table">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Name</th>
                  <th>Setup</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="pkg-name">{r.serial}</div>
                      <div className="muted tiny">{r.createdAt?.slice(0, 10)}</div>
                    </td>
                    <td>{r.name ?? '—'}</td>
                    <td>{r.setupName ?? '—'}</td>
                    <td className="row-actions">
                      <button className="btn-secondary" disabled={busy} onClick={() => setEditing(r)}>
                        Edit
                      </button>
                      <button className="btn-danger" disabled={busy} onClick={() => onDelete(r)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
