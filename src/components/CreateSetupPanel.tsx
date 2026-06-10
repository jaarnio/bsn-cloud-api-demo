import { useEffect, useState } from 'react'
import { createSetup, getNetworks } from '../api/client'
import { SetupForm, defaultSetupName, type SetupFormValues } from './SetupForm'
import type { CreateSetupResponse, TraceEntry } from '../types'

export function CreateSetupPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [networks, setNetworks] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CreateSetupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getNetworks()
      .then((r) => setNetworks(r.networks.map((n) => n.name)))
      .catch((err) => setError((err as Error).message))
  }, [])

  async function onSubmit(values: SetupFormValues) {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await createSetup({
        network: values.network,
        packageName: values.packageName,
        deviceName: values.deviceName || undefined,
        deviceDescription: values.deviceDescription,
        unitNamingMethod: values.unitNamingMethod,
        timeZone: values.timeZone,
        setupType: values.setupType,
        inheritNetworkProperties: values.inheritNetworkProperties,
        timeServerUrl: values.timeServerUrl || undefined,
        bsnCloudEnabled: values.bsnCloudEnabled,
        dwsEnabled: values.dwsEnabled,
        dwsPassword: values.dwsPassword || undefined,
        lwsEnabled: values.lwsEnabled,
        lwsUserName: values.lwsUserName,
        lwsPassword: values.lwsPassword || undefined,
        lwsEnableUpdateNotifications: values.lwsEnableUpdateNotifications,
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
      <h2>Create a setup</h2>
      <p className="muted small">
        Mirrors the BrightSign "Edit a Setup File" form. Starts from a known-good template,
        applies your changes, embeds a fresh registration token, and stores it in B-Deploy.
      </p>

      <SetupForm
        networks={networks}
        initial={{ network: networks[0] ?? '', packageName: defaultSetupName() }}
        submitLabel="Create setup"
        busy={busy}
        onSubmit={onSubmit}
      />

      {error && <p className="error">{error}</p>}

      {result?.created && (
        <table className="record">
          <tbody>
            <tr>
              <th>Setup ID</th>
              <td>{result.setupId}</td>
            </tr>
            <tr>
              <th>Package</th>
              <td>{result.packageName}</td>
            </tr>
            <tr>
              <th>Network</th>
              <td>{result.network}</td>
            </tr>
            <tr>
              <th>Based on</th>
              <td>{result.basedOn ?? '—'}</td>
            </tr>
            <tr>
              <th>Token valid to</th>
              <td>{result.tokenValidTo ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
