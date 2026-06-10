import { useEffect, useState } from 'react'
import { createProvision, getNetworks } from '../api/client'
import { ProvisionForm, type ProvisionFormValues } from './ProvisionForm'
import type { CreateProvisionResponse, TraceEntry } from '../types'

export function CreateProvisionPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [networks, setNetworks] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CreateProvisionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getNetworks()
      .then((r) => setNetworks(r.networks.map((n) => n.name)))
      .catch((err) => setError((err as Error).message))
  }, [])

  async function onSubmit(values: ProvisionFormValues) {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await createProvision({
        network: values.network,
        serial: values.serial,
        name: values.name || undefined,
        desc: values.desc || undefined,
        setupId: values.setupId || undefined,
        setupName: values.setupName,
      })
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
      <h2>Create a provision record</h2>
      <p className="muted small">
        Binds a player serial to a network and a setup. The player adopts it on its next
        provisioning cycle (or an explicit reprovision).
      </p>

      <ProvisionForm
        networks={networks}
        initial={{ network: networks[0] ?? '' }}
        submitLabel="Create provision record"
        busy={busy}
        onSubmit={onSubmit}
        onTrace={onTrace}
      />

      {error && <p className="error">{error}</p>}

      {result?.created && (
        <table className="record">
          <tbody>
            <tr>
              <th>Record ID</th>
              <td>{result.id}</td>
            </tr>
            <tr>
              <th>Serial</th>
              <td>{result.serial}</td>
            </tr>
            <tr>
              <th>Network</th>
              <td>{result.network}</td>
            </tr>
            <tr>
              <th>Setup</th>
              <td>{result.setupName}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
