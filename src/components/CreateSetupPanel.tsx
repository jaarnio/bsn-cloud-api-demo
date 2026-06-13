import { useEffect, useState } from 'react'
import { createSetup, getFirmwareDefaults, getNetworks } from '../api/client'
import { SetupForm, defaultSetupName, type SetupFormValues } from './SetupForm'
import type { CreateSetupResponse, FirmwareFamily, TraceEntry } from '../types'

export function CreateSetupPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [networks, setNetworks] = useState<string[]>([])
  const [firmwareFamilies, setFirmwareFamilies] = useState<FirmwareFamily[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CreateSetupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getNetworks()
      .then((r) => setNetworks(r.networks.map((n) => n.name)))
      .catch((err) => setError((err as Error).message))
    // Per-family OS-update versions for the matrix (create has no existing setup).
    getFirmwareDefaults()
      .then((r) => setFirmwareFamilies(r.firmwareFamilies))
      .catch(() => setFirmwareFamilies([]))
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
        appUrl: values.appUrl || undefined,
        includeNetworkConfiguration: values.includeNetworkConfiguration,
        ethernetEnabled: values.ethernetEnabled,
        ethernetProto: values.ethernetProto,
        ethernetIp: values.ethernetIp,
        ethernetSubnet: values.ethernetSubnet,
        ethernetGateway: values.ethernetGateway,
        ethernetDns: values.ethernetDns,
        wifiEnabled: values.wifiEnabled,
        wifiSsid: values.wifiSsid,
        wifiPassphrase: values.wifiPassphrase || undefined,
        wifiProto: values.wifiProto,
        wifiIp: values.wifiIp,
        wifiSubnet: values.wifiSubnet,
        wifiGateway: values.wifiGateway,
        wifiDns: values.wifiDns,
        interfacePriority: values.interfacePriority,
        specifyHostname: values.specifyHostname,
        hostname: values.hostname,
        timeServerUrl: values.timeServerUrl || undefined,
        bsnCloudEnabled: values.bsnCloudEnabled,
        dwsEnabled: values.dwsEnabled,
        dwsPassword: values.dwsPassword || undefined,
        remoteDwsEnabled: values.remoteDwsEnabled,
        lwsEnabled: values.lwsEnabled,
        lwsUserName: values.lwsUserName,
        lwsPassword: values.lwsPassword || undefined,
        lwsConfig: values.lwsConfig,
        lwsEnableUpdateNotifications: values.lwsEnableUpdateNotifications,
        enableSerialDebugging: values.enableSerialDebugging,
        enableSystemLogDebugging: values.enableSystemLogDebugging,
        firmwareUpdateType: values.firmwareUpdateType,
        enableRemoteSnapshot: values.enableRemoteSnapshot,
        remoteSnapshotInterval: values.remoteSnapshotInterval,
        remoteSnapshotMaxImages: values.remoteSnapshotMaxImages,
        remoteSnapshotJpegQualityLevel: values.remoteSnapshotJpegQualityLevel,
        remoteSnapshotScreenOrientation: values.remoteSnapshotScreenOrientation,
        firmwareFamilies: values.firmwareFamilies.map((f) => ({
          family: f.family,
          source: f.source,
          url: f.url,
        })),
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
        Mirrors the BrightSign "Edit a Setup File" form. Builds the v3 setup from B-Deploy
        defaults, applies your changes, embeds a fresh registration token, and stores it in B-Deploy.
      </p>

      <SetupForm
        networks={networks}
        initial={{ network: networks[0] ?? '', packageName: defaultSetupName(), firmwareFamilies }}
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
