import { useEffect, useState } from 'react'

export interface SetupFormValues {
  network: string
  packageName: string
  deviceName: string
  deviceDescription: string
  unitNamingMethod: string
  timeZone: string
  setupType: string
  inheritNetworkProperties: boolean
  timeServerUrl: string
  bsnCloudEnabled: boolean
  dwsEnabled: boolean
  dwsPassword: string
  lwsEnabled: boolean
  lwsUserName: string
  lwsPassword: string
  lwsEnableUpdateNotifications: boolean
}

// Confirmed setupType enum values (probed from live setups) with display labels.
export const PUBLISHING_MODES = [
  { value: 'lfn', label: 'Local Network' },
  { value: 'bsn', label: 'BSN.cloud' },
  { value: 'standalone', label: 'Standalone' },
  { value: 'partnerApplication', label: 'Partner Application' },
]

// appendUnitIDToUnitName is confirmed live; the alternate is best-effort (a
// rejected value surfaces a friendly error rather than corrupting anything).
export const NAMING_METHODS = [
  { value: 'appendUnitIDToUnitName', label: 'Append serial number to player name' },
  { value: 'doNotAppendUnitID', label: 'Use player name only' },
]

export const TIMEZONES = [
  { value: 'PST', label: 'PST: US Pacific Time' },
  { value: 'MST', label: 'MST: US Mountain Time' },
  { value: 'CST', label: 'CST: US Central Time' },
  { value: 'EST', label: 'EST: US Eastern Time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'GMT', label: 'GMT' },
  { value: 'CET', label: 'CET: Central European Time' },
]

export function defaultSetupName(): string {
  const t = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return `Demo Setup ${t}`
}

const DEFAULTS: SetupFormValues = {
  network: '',
  packageName: '',
  deviceName: 'demo-device',
  deviceDescription: '',
  unitNamingMethod: NAMING_METHODS[0].value,
  timeZone: 'PST',
  setupType: 'lfn',
  inheritNetworkProperties: true,
  timeServerUrl: 'http://time.brightsignnetwork.com',
  bsnCloudEnabled: true,
  dwsEnabled: true,
  dwsPassword: '',
  lwsEnabled: true,
  lwsUserName: 'admin',
  lwsPassword: '',
  lwsEnableUpdateNotifications: true,
}

/**
 * The BrightSign "Edit a Setup File" form, used for both create and edit.
 * Passwords are write-only: blank means "keep existing" (the server never
 * sends stored passwords to the browser).
 */
export function SetupForm({
  initial,
  networks,
  networkLocked,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<SetupFormValues>
  networks: string[]
  networkLocked?: boolean
  submitLabel: string
  busy: boolean
  onSubmit: (values: SetupFormValues) => void
  onCancel?: () => void
}) {
  const [v, setV] = useState<SetupFormValues>({ ...DEFAULTS, ...initial })
  const set = <K extends keyof SetupFormValues>(key: K, value: SetupFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }))

  // Default the network once the list loads (create mode only).
  useEffect(() => {
    if (!networkLocked && !v.network && networks.length) {
      setV((prev) => ({ ...prev, network: networks[0] }))
    }
  }, [networks, networkLocked, v.network])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!v.network || !v.packageName.trim()) return
    onSubmit({ ...v, packageName: v.packageName.trim() })
  }

  return (
    <form onSubmit={submit} className="setup-form">
      <fieldset>
        <legend>Setup File Basics</legend>
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
          Setup File Name
          <input value={v.packageName} onChange={(e) => set('packageName', e.target.value)} />
        </label>
        <label>
          Player Name
          <input value={v.deviceName} onChange={(e) => set('deviceName', e.target.value)} />
        </label>
        <label>
          Player Description
          <input
            value={v.deviceDescription}
            placeholder="optional"
            onChange={(e) => set('deviceDescription', e.target.value)}
          />
        </label>
        <label>
          Player Naming Method
          <select value={v.unitNamingMethod} onChange={(e) => set('unitNamingMethod', e.target.value)}>
            {NAMING_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Time Zone
          <select value={v.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Publishing Mode</legend>
        <label>
          Publishing Mode
          <select value={v.setupType} onChange={(e) => set('setupType', e.target.value)}>
            {PUBLISHING_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Network</legend>
        <label>
          Network Configuration
          <select
            value={v.inheritNetworkProperties ? 'inherit' : 'specify'}
            onChange={(e) => set('inheritNetworkProperties', e.target.value === 'inherit')}
          >
            <option value="inherit">Use current player settings</option>
            <option value="specify">Specify in this setup</option>
          </select>
        </label>
        <label>
          Time Server URL
          <input value={v.timeServerUrl} onChange={(e) => set('timeServerUrl', e.target.value)} />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={v.bsnCloudEnabled}
            onChange={(e) => set('bsnCloudEnabled', e.target.checked)}
          />
          Enable BrightSign Control, Control Plus, or Author Plus
        </label>
      </fieldset>

      <fieldset>
        <legend>Services and Monitoring</legend>
        <label className="checkbox">
          <input type="checkbox" checked={v.dwsEnabled} onChange={(e) => set('dwsEnabled', e.target.checked)} />
          Enable Local Diagnostic Web Server (DWS)
        </label>
        <label>
          DWS Password
          <input
            type="password"
            value={v.dwsPassword}
            placeholder="(unchanged)"
            onChange={(e) => set('dwsPassword', e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={v.lwsEnabled} onChange={(e) => set('lwsEnabled', e.target.checked)} />
          Enable Local Web Server (LWS)
        </label>
        <label>
          LWS Username
          <input value={v.lwsUserName} onChange={(e) => set('lwsUserName', e.target.value)} />
        </label>
        <label>
          LWS Password
          <input
            type="password"
            value={v.lwsPassword}
            placeholder="(unchanged)"
            onChange={(e) => set('lwsPassword', e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={v.lwsEnableUpdateNotifications}
            onChange={(e) => set('lwsEnableUpdateNotifications', e.target.checked)}
          />
          Enable Update Notifications
        </label>
      </fieldset>

      <div className="form-actions">
        <button type="submit" disabled={busy || !v.network || !v.packageName.trim()}>
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
