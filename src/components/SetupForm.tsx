import { useEffect, useState } from 'react'
import type { FirmwareFamily } from '../types'
import { PasswordInput } from './PasswordInput'

export interface SetupFormValues {
  network: string
  packageName: string
  deviceName: string
  deviceDescription: string
  unitNamingMethod: string
  timeZone: string
  setupType: string
  appUrl: string
  // Network configuration
  includeNetworkConfiguration: boolean
  ethernetEnabled: boolean
  ethernetProto: string // 'dhcp' | 'static'
  ethernetIp: string
  ethernetSubnet: string
  ethernetGateway: string
  ethernetDns: string
  wifiEnabled: boolean
  wifiSsid: string
  wifiPassphrase: string
  wifiProto: string
  wifiIp: string
  wifiSubnet: string
  wifiGateway: string
  wifiDns: string
  interfacePriority: string // 'wired' | 'wireless'
  specifyHostname: boolean
  hostname: string
  timeServerUrl: string
  bsnCloudEnabled: boolean
  // Services & Monitoring
  dwsEnabled: boolean
  dwsPassword: string
  remoteDwsEnabled: boolean
  lwsEnabled: boolean
  lwsUserName: string
  lwsPassword: string
  lwsConfig: string
  lwsEnableUpdateNotifications: boolean
  // Diagnostics & Updates
  enableSerialDebugging: boolean
  enableSystemLogDebugging: boolean
  firmwareUpdateType: string
  // Remote Screenshots
  enableRemoteSnapshot: boolean
  remoteSnapshotInterval: number
  remoteSnapshotMaxImages: number
  remoteSnapshotJpegQualityLevel: number
  remoteSnapshotScreenOrientation: string
  // Per-family OS update matrix (firmwareUpdatesByFamily)
  firmwareFamilies: FirmwareFamily[]
}

// Model-prefix hints per family. Older families come from the published map
// (firmware-update-collection-entity-v3), which is accurate for older models.
// Newer SoCs are corrected from known facts: the doc lumps series-6 (HD6/XD6/XS6)
// under cobra, but those are actually Camaro; cobra is series-5 only, and Thor is
// the LGUV5N. (panther/lynx/cheetah/monaco from the doc aren't in current setups.)
export const FAMILY_MODELS: Record<string, string> = {
  Camaro: 'HD6, XD6, XS6 (series 6)',
  Cobra: 'HS5, HD5, LS5, XD5, XT5 (series 5)',
  Impala: 'XD3, XT3',
  Malibu: 'XD4, XT4',
  Pagani: 'LS4, HD4, HS4',
  Pantera: 'HD3, HS3, HO3, LS3',
  Raptor: 'XC5',
  Sebring: 'AU5',
  Thor: 'LGUV5N',
  Tiger: '4K2',
}

// firmwareUpdateSource enum — values confirmed against the live Sample-OS-Updater
// reference setup, not the self-contradictory v3 doc (which prose-says
// "MinimumCompatible"/"SpecificUrl" but the live setup uses `compatible`/`specificUrl`).
export const OS_UPDATE_SOURCES = [
  { value: 'none', label: 'Do not update' },
  { value: 'production', label: 'Latest released OS' },
  { value: 'beta', label: 'Beta OS' },
  { value: 'compatible', label: 'Minimum compatible OS' },
  { value: 'specificUrl', label: 'Update from URL' },
]

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

// firmwareUpdateType values per the official Device Setup Entity (v3) doc.
export const FIRMWARE_UPDATE_TYPES = [
  { value: 'standard', label: 'Standard (recommended)' },
  { value: 'newer', label: 'Only update to newer' },
  { value: 'different', label: 'Update to any different version' },
  { value: 'save', label: 'Download but do not auto-apply' },
]

// Only the values the canonical v3 Device Setup Entity sanctions. (The gopurple
// SDK reference also lists "diagnostic", but the official entity schema omits it,
// so we don't offer it — a stored value is still preserved on edit below.)
export const LWS_CONFIGS = [
  { value: 'status', label: 'Status only' },
  { value: 'content', label: 'Content' },
]

// "Landscape" confirmed live; portrait variants per the v3 doc.
export const SNAPSHOT_ORIENTATIONS = [
  { value: 'Landscape', label: 'Landscape' },
  { value: 'PortraitBottomRight', label: 'Portrait (bottom-right)' },
  { value: 'PortraitBottomLeft', label: 'Portrait (bottom-left)' },
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
  setupType: 'partnerApplication',
  appUrl: '',
  includeNetworkConfiguration: false,
  ethernetEnabled: true,
  ethernetProto: 'dhcp',
  ethernetIp: '',
  ethernetSubnet: '255.255.255.0',
  ethernetGateway: '',
  ethernetDns: '',
  wifiEnabled: false,
  wifiSsid: '',
  wifiPassphrase: '',
  wifiProto: 'dhcp',
  wifiIp: '',
  wifiSubnet: '255.255.255.0',
  wifiGateway: '',
  wifiDns: '',
  interfacePriority: 'wired',
  specifyHostname: false,
  hostname: '',
  timeServerUrl: 'http://time.brightsignnetwork.com',
  bsnCloudEnabled: true,
  dwsEnabled: false,
  dwsPassword: '',
  remoteDwsEnabled: true,
  lwsEnabled: false,
  lwsUserName: '',
  lwsPassword: '',
  // Switching to Local Network (lfn) defaults this to "content" (see the
  // Publishing Mode handler); "content" is a harmless default while LWS is off.
  lwsConfig: 'content',
  lwsEnableUpdateNotifications: true,
  enableSerialDebugging: false,
  enableSystemLogDebugging: false,
  firmwareUpdateType: 'standard',
  enableRemoteSnapshot: false,
  remoteSnapshotInterval: 15,
  remoteSnapshotMaxImages: 5,
  remoteSnapshotJpegQualityLevel: 85,
  remoteSnapshotScreenOrientation: 'Landscape',
  firmwareFamilies: [],
}

/**
 * The BrightSign "Edit a Setup File" form, used for both create and edit.
 * DWS and LWS passwords are required whenever their service is enabled (in
 * both create and edit) — the server never sends stored passwords to the
 * browser, so the user always re-enters them. The WiFi passphrase remains
 * write-only: blank means "keep existing" on edit.
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

  const setFamily = (family: string, patch: Partial<FirmwareFamily>) =>
    setV((prev) => ({
      ...prev,
      firmwareFamilies: prev.firmwareFamilies.map((f) =>
        f.family === family ? { ...f, ...patch } : f,
      ),
    }))

  // Default the network once the list loads (create mode only).
  useEffect(() => {
    if (!networkLocked && !v.network && networks.length) {
      setV((prev) => ({ ...prev, network: networks[0] }))
    }
  }, [networks, networkLocked, v.network])

  // The firmware-family matrix loads asynchronously on create; absorb it once.
  useEffect(() => {
    if (initial?.firmwareFamilies?.length && !v.firmwareFamilies.length) {
      setV((prev) => ({ ...prev, firmwareFamilies: initial.firmwareFamilies! }))
    }
  }, [initial?.firmwareFamilies, v.firmwareFamilies.length])

  // Implied validations a real app enforces before hitting the BSN/B-Deploy
  // APIs (mirrored server-side in server/routes/setups.ts).
  const errors: string[] = []
  if (!v.packageName.trim()) errors.push('Setup File Name is required.')
  // Partner Application setups are inert without the app bundle URL, so require it.
  if (v.setupType === 'partnerApplication' && !v.appUrl.trim())
    errors.push('A Partner App URL is required for Partner Application setups.')
  // Local Network publishing relies on the player's local web server.
  if (v.setupType === 'lfn' && !v.lwsEnabled)
    errors.push('Local Network publishing requires the Local Web Server (LWS) to be enabled.')
  if (v.dwsEnabled && !v.dwsPassword.trim())
    errors.push('A DWS password is required when the Diagnostic Web Server is enabled.')
  if (v.lwsEnabled && !v.lwsUserName.trim())
    errors.push('An LWS username is required when the Local Web Server is enabled.')
  if (v.lwsEnabled && !v.lwsPassword.trim())
    errors.push('An LWS password is required when the Local Web Server is enabled.')

  const canSubmit = Boolean(v.network) && errors.length === 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ ...v, packageName: v.packageName.trim(), appUrl: v.appUrl.trim() })
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
          <select
            value={v.setupType}
            onChange={(e) => {
              const next = e.target.value
              // Local Network serves content via LWS, so default the LWS mode
              // to "content" when the user switches to it.
              setV((prev) => ({
                ...prev,
                setupType: next,
                lwsConfig: next === 'lfn' ? 'content' : prev.lwsConfig,
              }))
            }}
          >
            {PUBLISHING_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {v.setupType === 'partnerApplication' && (
          <label>
            Partner App URL
            <input
              type="url"
              value={v.appUrl}
              placeholder="https://partner.example.com/brightsign/autorun.zip"
              onChange={(e) => set('appUrl', e.target.value)}
            />
            <span className="muted tiny">
              URL of the partner application bundle (autorun.zip) the player downloads. Stored as
              the setup's <code>bDeploy.url</code>. Required for Partner Application.
            </span>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Network</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={v.includeNetworkConfiguration}
            onChange={(e) => set('includeNetworkConfiguration', e.target.checked)}
          />
          Include network configuration in this setup
        </label>
        <span className="muted tiny">
          When unchecked, the player keeps its current network settings (the setup only manages the
          time server and services below).
        </span>

        {v.includeNetworkConfiguration && (
          <>
            {/* Ethernet */}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={v.ethernetEnabled}
                onChange={(e) => set('ethernetEnabled', e.target.checked)}
              />
              Ethernet (eth0)
            </label>
            {v.ethernetEnabled && (
              <div className="indent">
                <label>
                  Addressing
                  <select value={v.ethernetProto} onChange={(e) => set('ethernetProto', e.target.value)}>
                    <option value="dhcp">DHCP (automatic)</option>
                    <option value="static">Static IP</option>
                  </select>
                </label>
                {v.ethernetProto === 'static' && (
                  <>
                    <label>
                      IP address
                      <input
                        value={v.ethernetIp}
                        placeholder="192.168.1.10"
                        onChange={(e) => set('ethernetIp', e.target.value)}
                      />
                    </label>
                    <label>
                      Subnet mask
                      <input
                        value={v.ethernetSubnet}
                        placeholder="255.255.255.0"
                        onChange={(e) => set('ethernetSubnet', e.target.value)}
                      />
                    </label>
                    <label>
                      Gateway
                      <input
                        value={v.ethernetGateway}
                        placeholder="192.168.1.1"
                        onChange={(e) => set('ethernetGateway', e.target.value)}
                      />
                    </label>
                    <label>
                      DNS servers
                      <input
                        value={v.ethernetDns}
                        placeholder="8.8.8.8, 1.1.1.1"
                        onChange={(e) => set('ethernetDns', e.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            {/* WiFi */}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={v.wifiEnabled}
                onChange={(e) => set('wifiEnabled', e.target.checked)}
              />
              WiFi (wlan0)
            </label>
            {v.wifiEnabled && (
              <div className="indent">
                <label>
                  SSID
                  <input value={v.wifiSsid} onChange={(e) => set('wifiSsid', e.target.value)} />
                </label>
                <label>
                  Passphrase
                  <PasswordInput
                    value={v.wifiPassphrase}
                    placeholder={networkLocked ? '(unchanged)' : ''}
                    onChange={(val) => set('wifiPassphrase', val)}
                  />
                </label>
                <label>
                  Addressing
                  <select value={v.wifiProto} onChange={(e) => set('wifiProto', e.target.value)}>
                    <option value="dhcp">DHCP (automatic)</option>
                    <option value="static">Static IP</option>
                  </select>
                </label>
                {v.wifiProto === 'static' && (
                  <>
                    <label>
                      IP address
                      <input
                        value={v.wifiIp}
                        placeholder="192.168.1.20"
                        onChange={(e) => set('wifiIp', e.target.value)}
                      />
                    </label>
                    <label>
                      Subnet mask
                      <input
                        value={v.wifiSubnet}
                        placeholder="255.255.255.0"
                        onChange={(e) => set('wifiSubnet', e.target.value)}
                      />
                    </label>
                    <label>
                      Gateway
                      <input
                        value={v.wifiGateway}
                        placeholder="192.168.1.1"
                        onChange={(e) => set('wifiGateway', e.target.value)}
                      />
                    </label>
                    <label>
                      DNS servers
                      <input
                        value={v.wifiDns}
                        placeholder="8.8.8.8, 1.1.1.1"
                        onChange={(e) => set('wifiDns', e.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            {v.ethernetEnabled && v.wifiEnabled && (
              <label>
                Preferred interface
                <select
                  value={v.interfacePriority}
                  onChange={(e) => set('interfacePriority', e.target.value)}
                >
                  <option value="wired">Wired first, WiFi fallback</option>
                  <option value="wireless">WiFi first, wired fallback</option>
                </select>
              </label>
            )}

            <label className="checkbox">
              <input
                type="checkbox"
                checked={v.specifyHostname}
                onChange={(e) => set('specifyHostname', e.target.checked)}
              />
              Specify hostname
            </label>
            {v.specifyHostname && (
              <label className="indent">
                Hostname
                <input
                  value={v.hostname}
                  placeholder="lobby-display-1"
                  onChange={(e) => set('hostname', e.target.value)}
                />
              </label>
            )}
          </>
        )}

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
        {v.dwsEnabled && (
          <label className="indent">
            DWS Password
            <PasswordInput
              value={v.dwsPassword}
              placeholder="Required"
              onChange={(val) => set('dwsPassword', val)}
            />
          </label>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={v.remoteDwsEnabled}
            onChange={(e) => set('remoteDwsEnabled', e.target.checked)}
          />
          Enable Remote DWS (via BSN.cloud)
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={v.lwsEnabled} onChange={(e) => set('lwsEnabled', e.target.checked)} />
          Enable Local Web Server (LWS)
        </label>
        {v.lwsEnabled && (
          <div className="indent">
            <label>
              LWS Username
              <input
                value={v.lwsUserName}
                placeholder="Required"
                onChange={(e) => set('lwsUserName', e.target.value)}
              />
            </label>
            <label>
              LWS Password
              <PasswordInput
                value={v.lwsPassword}
                placeholder="Required"
                onChange={(val) => set('lwsPassword', val)}
              />
            </label>
            <label>
              LWS Mode
              <select value={v.lwsConfig} onChange={(e) => set('lwsConfig', e.target.value)}>
                {LWS_CONFIGS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                {/* preserve an unrecognized stored value (e.g. legacy "diagnostic") */}
                {!LWS_CONFIGS.some((c) => c.value === v.lwsConfig) && (
                  <option value={v.lwsConfig}>{v.lwsConfig}</option>
                )}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={v.lwsEnableUpdateNotifications}
                onChange={(e) => set('lwsEnableUpdateNotifications', e.target.checked)}
              />
              Enable Update Notifications
            </label>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Diagnostics &amp; Updates</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={v.enableSerialDebugging}
            onChange={(e) => set('enableSerialDebugging', e.target.checked)}
          />
          Enable serial debugging
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={v.enableSystemLogDebugging}
            onChange={(e) => set('enableSystemLogDebugging', e.target.checked)}
          />
          Enable system log debugging
        </label>
        <label>
          Update Type
          <select value={v.firmwareUpdateType} onChange={(e) => set('firmwareUpdateType', e.target.value)}>
            {FIRMWARE_UPDATE_TYPES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {v.firmwareFamilies.length > 0 && (
          <>
            <span className="muted tiny">
              Per player-family OS target. Families are BrightSign SoC codenames.
            </span>
            {v.firmwareFamilies.map((f) => (
              <div className="indent" key={f.family}>
                <label>
                  {FAMILY_MODELS[f.family] ? `${f.family} — ${FAMILY_MODELS[f.family]}` : f.family}
                  <select value={f.source} onChange={(e) => setFamily(f.family, { source: e.target.value })}>
                    {OS_UPDATE_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                    {/* preserve an unrecognized stored value (e.g. "existing") */}
                    {!OS_UPDATE_SOURCES.some((s) => s.value === f.source) && (
                      <option value={f.source}>{f.source}</option>
                    )}
                  </select>
                </label>
                <span className="muted tiny">
                  {[
                    f.productionVersion && `Latest ${f.productionVersion}`,
                    f.betaVersion && `Beta ${f.betaVersion}`,
                    f.compatibleVersion && `Min ${f.compatibleVersion}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {f.source === 'specificUrl' && (
                  <label>
                    Firmware URL
                    <input
                      type="url"
                      value={f.url ?? ''}
                      placeholder="https://firmware.example.com/update.bsfw"
                      onChange={(e) => setFamily(f.family, { url: e.target.value })}
                    />
                  </label>
                )}
              </div>
            ))}
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Remote Screenshots</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={v.enableRemoteSnapshot}
            onChange={(e) => set('enableRemoteSnapshot', e.target.checked)}
          />
          Enable remote screenshots
        </label>
        {v.enableRemoteSnapshot && (
          <div className="indent">
            <label>
              Interval (minutes)
              <input
                type="number"
                min={1}
                max={1440}
                value={v.remoteSnapshotInterval}
                onChange={(e) => set('remoteSnapshotInterval', Number(e.target.value))}
              />
            </label>
            <label>
              Max images
              <input
                type="number"
                min={1}
                max={100}
                value={v.remoteSnapshotMaxImages}
                onChange={(e) => set('remoteSnapshotMaxImages', Number(e.target.value))}
              />
            </label>
            <label>
              JPEG quality (1–100)
              <input
                type="number"
                min={1}
                max={100}
                value={v.remoteSnapshotJpegQualityLevel}
                onChange={(e) => set('remoteSnapshotJpegQualityLevel', Number(e.target.value))}
              />
            </label>
            <label>
              Screen orientation
              <select
                value={v.remoteSnapshotScreenOrientation}
                onChange={(e) => set('remoteSnapshotScreenOrientation', e.target.value)}
              >
                {SNAPSHOT_ORIENTATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </fieldset>

      {errors.length > 0 && (
        <ul className="field-errors">
          {errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button type="submit" disabled={busy || !canSubmit}>
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
