import { useState } from 'react'
import { lookupDevice } from '../api/client'
import type { Device, ProvisionRecord, SetupSummary, TraceEntry } from '../types'

interface Found {
  network: string
  device: Device | null
  provision: ProvisionRecord | null
  setup: SetupSummary | null
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; data: Found }
  | { kind: 'notFound'; searchedNetworks: number }
  | { kind: 'error'; message: string }

export function DeviceLookup({ onTrace }: { onTrace?: (trace: TraceEntry[]) => void }) {
  const [serial, setSerial] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = serial.trim()
    if (!trimmed) return
    setState({ kind: 'loading' })
    try {
      const res = await lookupDevice(trimmed)
      onTrace?.(res.trace ?? [])
      if (res.found) {
        setState({
          kind: 'found',
          data: { network: res.network, device: res.device, provision: res.provision, setup: res.setup },
        })
      } else {
        setState({ kind: 'notFound', searchedNetworks: res.searchedNetworks })
      }
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message })
    }
  }

  return (
    <div className="fn-pane">
      <h2>Find a device by serial</h2>
      <p className="muted small">Searches every network in the account.</p>
      <form onSubmit={onSubmit} className="lookup-form">
        <input
          type="text"
          placeholder="Player serial number"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={state.kind === 'loading' || !serial.trim()}>
          {state.kind === 'loading' ? 'Searching…' : 'Lookup'}
        </button>
      </form>

      {state.kind === 'found' && <DeviceStatus data={state.data} />}

      {state.kind === 'notFound' && (
        <p className="muted">
          No device record or provision record with that serial was found in any of the{' '}
          {state.searchedNetworks} networks in this account.
        </p>
      )}

      {state.kind === 'error' && <p className="error">{state.message}</p>}
    </div>
  )
}

function DeviceStatus({ data }: { data: Found }) {
  const { network, device, provision, setup } = data
  const registered = Boolean(device)
  const provisioned = Boolean(provision)

  return (
    <div className="status">
      <div className="status-head">
        <span className="net-chip">{network}</span>
        <span className={`pill ${registered ? 'pill-on' : 'pill-off'}`}>
          {registered ? 'Registered' : 'Not registered'}
        </span>
        <span className={`pill ${provisioned ? 'pill-on' : 'pill-warn'}`}>
          {provisioned ? 'Provisioned' : 'Not provisioned'}
        </span>
      </div>

      <Panel title="Device record" present={registered} absentNote="No registered device record (not connected to BSN.cloud).">
        {device && (
          <Rows
            rows={[
              ['Name', device.name],
              ['Model', device.model],
              ['Family', device.family],
              ['Group', device.group],
              ['Setup type', device.setupType],
              ['Health', device.health],
              ['Firmware', device.firmware],
              ['Uptime', device.uptime],
              ['External IP', device.externalIp],
              ['Registered', device.registrationDate],
              ['Last contact', device.lastContact],
              ['Serial', device.serial],
            ]}
          />
        )}
      </Panel>

      <Panel
        title="Provision record"
        present={provisioned}
        absentNote="No B-Deploy provision record — this device is registered but has no deployment/setup binding."
      >
        {provision && (
          <Rows
            rows={[
              ['Setup', provision.setupName ?? provision.setupname],
              ['Setup ID', provision.setupId],
              ['Owner', provision.username],
              ['Created', provision.createdAt],
              ['Updated', provision.updatedAt],
            ]}
          />
        )}
      </Panel>

      {setup && (
        <Panel title="Setup definition" present>
          <Rows
            rows={[
              ['Package', setup.packageName],
              ['Type', setup.setupType],
              ['Group', setup.bsnGroupName],
              ['Version', setup.version],
              ['Timezone', setup.config?.timeZone],
              ['Firmware policy', setup.config?.firmwareUpdateType],
              ['DWS enabled', fmtBool(setup.config?.dwsEnabled)],
              ['LWS enabled', fmtBool(setup.config?.lwsEnabled)],
              ['BSN cloud', fmtBool(setup.config?.bsnCloudEnabled)],
            ]}
          />
        </Panel>
      )}
    </div>
  )
}

function Panel({
  title,
  present,
  absentNote,
  children,
}: {
  title: string
  present: boolean
  absentNote?: string
  children?: React.ReactNode
}) {
  return (
    <div className={`panel ${present ? '' : 'panel-absent'}`}>
      <h3>{title}</h3>
      {present ? children : <p className="muted">{absentNote}</p>}
    </div>
  )
}

function Rows({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <table className="record">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{formatValue(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function fmtBool(value: unknown): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return formatValue(value)
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return '—'
  return String(value)
}
