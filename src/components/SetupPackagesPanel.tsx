import { useEffect, useState } from 'react'
import { deleteSetup, getNetworks, listSetups, updateSetup } from '../api/client'
import { SetupForm, type SetupFormValues } from './SetupForm'
import type { SetupListItem, TraceEntry } from '../types'

const SETUP_TYPE_LABELS: Record<string, string> = {
  lfn: 'Local Network',
  bsn: 'BSN.cloud',
  standalone: 'Standalone',
  partnerApplication: 'Partner Application',
}

export function SetupPackagesPanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [networks, setNetworks] = useState<string[]>([])
  const [network, setNetwork] = useState('')
  const [setups, setSetups] = useState<SetupListItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SetupListItem | null>(null)
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

  // showTrace=false keeps a preceding mutation's flow visible (so an edit/delete
  // shows its PUT/DELETE, not the silent list refresh that follows it).
  async function refresh(net: string, showTrace = true) {
    setBusy(true)
    setError(null)
    setEditing(null)
    try {
      const res = await listSetups(net)
      setSetups(res.setups)
      if (showTrace) onTrace(res.trace)
    } catch (err) {
      setError((err as Error).message)
      setSetups(null)
    } finally {
      setBusy(false)
    }
  }

  // Load whenever the selected network changes.
  useEffect(() => {
    if (network) refresh(network)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  async function onDelete(item: SetupListItem) {
    if (!window.confirm(`Delete setup "${item.packageName}"? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await deleteSetup(item.id, network)
      onTrace(res.trace)
      setNotice(`Deleted "${item.packageName}".`)
      await refresh(network, false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onSaveEdit(values: SetupFormValues) {
    if (!editing) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await updateSetup(editing.id, {
        network,
        packageName: values.packageName,
        deviceName: values.deviceName,
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
      onTrace(res.trace)
      setNotice(`Updated "${res.packageName}".`)
      await refresh(network, false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function editInitial(item: SetupListItem): Partial<SetupFormValues> {
    return {
      network,
      packageName: item.packageName,
      deviceName: item.deviceName ?? '',
      deviceDescription: item.deviceDescription ?? '',
      unitNamingMethod: item.unitNamingMethod ?? 'appendUnitIDToUnitName',
      timeZone: item.timeZone ?? 'PST',
      setupType: item.setupType ?? 'lfn',
      appUrl: item.appUrl ?? '',
      includeNetworkConfiguration: item.includeNetworkConfiguration ?? false,
      ethernetEnabled: item.ethernetEnabled ?? true,
      ethernetProto: item.ethernetProto ?? 'dhcp',
      ethernetIp: item.ethernetIp ?? '',
      ethernetSubnet: item.ethernetSubnet ?? '255.255.255.0',
      ethernetGateway: item.ethernetGateway ?? '',
      ethernetDns: item.ethernetDns ?? '',
      wifiEnabled: item.wifiEnabled ?? false,
      wifiSsid: item.wifiSsid ?? '',
      wifiPassphrase: '',
      wifiProto: item.wifiProto ?? 'dhcp',
      wifiIp: item.wifiIp ?? '',
      wifiSubnet: item.wifiSubnet ?? '255.255.255.0',
      wifiGateway: item.wifiGateway ?? '',
      wifiDns: item.wifiDns ?? '',
      interfacePriority: item.interfacePriority ?? 'wired',
      specifyHostname: item.specifyHostname ?? false,
      hostname: item.hostname ?? '',
      timeServerUrl: item.timeServerUrl ?? '',
      bsnCloudEnabled: item.bsnCloudEnabled ?? true,
      dwsEnabled: item.dwsEnabled ?? true,
      dwsPassword: '',
      remoteDwsEnabled: item.remoteDwsEnabled ?? true,
      lwsEnabled: item.lwsEnabled ?? true,
      lwsUserName: item.lwsUserName ?? '',
      lwsPassword: '',
      lwsConfig: item.lwsConfig ?? 'status',
      lwsEnableUpdateNotifications: item.lwsEnableUpdateNotifications ?? true,
      enableSerialDebugging: item.enableSerialDebugging ?? false,
      enableSystemLogDebugging: item.enableSystemLogDebugging ?? false,
      firmwareUpdateType: item.firmwareUpdateType ?? 'standard',
      enableRemoteSnapshot: item.enableRemoteSnapshot ?? false,
      remoteSnapshotInterval: item.remoteSnapshotInterval ?? 15,
      remoteSnapshotMaxImages: item.remoteSnapshotMaxImages ?? 5,
      remoteSnapshotJpegQualityLevel: item.remoteSnapshotJpegQualityLevel ?? 85,
      remoteSnapshotScreenOrientation: item.remoteSnapshotScreenOrientation ?? 'Landscape',
      firmwareFamilies: item.firmwareFamilies ?? [],
    }
  }

  return (
    <div className="fn-pane">
      <h2>Setup packages</h2>
      <p className="muted small">List, edit, and delete the setup definitions stored per network.</p>

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
          <h3>Edit "{editing.packageName}"</h3>
          <SetupForm
            networks={networks}
            networkLocked
            initial={editInitial(editing)}
            submitLabel="Save changes"
            busy={busy}
            onSubmit={onSaveEdit}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <>
          {busy && !setups && <p className="muted">Loading…</p>}
          {setups && setups.length === 0 && <p className="muted">No setups in this network.</p>}
          {setups && setups.length > 0 && (
            <table className="setup-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Type</th>
                  <th>Player</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {setups.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="pkg-name">{s.packageName}</div>
                      <div className="muted tiny">{s.createdAt?.slice(0, 10)}</div>
                    </td>
                    <td>{SETUP_TYPE_LABELS[s.setupType ?? ''] ?? s.setupType ?? '—'}</td>
                    <td>{s.deviceName ?? '—'}</td>
                    <td className="row-actions">
                      <button className="btn-secondary" disabled={busy} onClick={() => setEditing(s)}>
                        Edit
                      </button>
                      <button className="btn-danger" disabled={busy} onClick={() => onDelete(s)}>
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
