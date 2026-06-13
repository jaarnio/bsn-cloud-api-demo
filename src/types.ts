// Curated device summary returned by the proxy (derived from the native
// /Devices entity, with credentials stripped server-side).
export interface Device {
  id?: number
  serial?: string
  model?: string
  family?: string
  name?: string
  group?: string
  setupType?: string
  timezone?: string
  health?: string
  firmware?: string
  uptime?: string
  externalIp?: string
  registrationDate?: string
  lastContact?: string
}

// B-Deploy provision record (rest-device/v2). Field casing varies by endpoint.
export interface ProvisionRecord {
  _id?: string
  NetworkName?: string
  networkName?: string
  serial?: string
  name?: string
  desc?: string
  setupName?: string
  setupname?: string
  setupId?: string
  username?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// Trimmed setup definition (rest-setup/v3), resolved from the provision record.
export interface SetupSummary {
  packageName?: string
  setupType?: string
  bsnGroupName?: string
  version?: string
  createdAt?: string
  config?: {
    timeZone?: unknown
    firmwareUpdateType?: unknown
    dwsEnabled?: unknown
    lwsEnabled?: unknown
    bsnCloudEnabled?: unknown
  }
}

// One captured upstream bsn.cloud call, sanitized for display.
export interface TraceEntry {
  step: string
  method: string
  url: string
  note?: string
  reqHeaders?: Record<string, string>
  reqBody?: unknown
  status?: number
  ms?: number
  response?: unknown
}

export type DeviceLookupResponse =
  | {
      found: true
      network: string
      serial: string
      device: Device | null
      provision: ProvisionRecord | null
      setup: SetupSummary | null
      searchedNetworks: number
      trace?: TraceEntry[]
    }
  | { found: false; serial: string; searchedNetworks: number; trace?: TraceEntry[] }

export interface AuthRunResponse {
  tokenValid: boolean
  expiresInSeconds: number
  selectedNetwork: string | null
  network: string
  scope: string | null
  networkCount: number | null
  trace: TraceEntry[]
}

export interface CreateSetupResponse {
  created: boolean
  setupId: string | null
  packageName: string
  network: string
  basedOn?: string
  tokenValidTo?: string
  trace: TraceEntry[]
}

// One row in the per-network setup list (no passwords).
export interface SetupListItem {
  id: string
  packageName: string
  setupType?: string
  appUrl?: string
  deviceName?: string
  deviceDescription?: string
  unitNamingMethod?: string
  timeZone?: string
  // Network configuration breakout (never includes the WiFi passphrase).
  includeNetworkConfiguration?: boolean
  timeServerUrl?: string
  specifyHostname?: boolean
  hostname?: string
  ethernetEnabled?: boolean
  ethernetProto?: string
  ethernetIp?: string
  ethernetSubnet?: string
  ethernetGateway?: string
  ethernetDns?: string
  wifiEnabled?: boolean
  wifiSsid?: string
  wifiProto?: string
  wifiIp?: string
  wifiSubnet?: string
  wifiGateway?: string
  wifiDns?: string
  interfacePriority?: string
  bsnCloudEnabled?: boolean
  dwsEnabled?: boolean
  remoteDwsEnabled?: boolean
  lwsEnabled?: boolean
  lwsUserName?: string
  lwsConfig?: string
  lwsEnableUpdateNotifications?: boolean
  enableSerialDebugging?: boolean
  enableSystemLogDebugging?: boolean
  firmwareUpdateType?: string
  enableRemoteSnapshot?: boolean
  remoteSnapshotInterval?: number
  remoteSnapshotMaxImages?: number
  remoteSnapshotJpegQualityLevel?: number
  remoteSnapshotScreenOrientation?: string
  firmwareFamilies?: FirmwareFamily[]
  version?: string
  createdAt?: string
}

/** A row in the per-family OS-update matrix (firmwareUpdatesByFamily). */
export interface FirmwareFamily {
  family: string
  source: string
  url?: string
  productionVersion?: string
  betaVersion?: string
  compatibleVersion?: string
}

export interface ListSetupsResponse {
  network: string
  setups: SetupListItem[]
  trace: TraceEntry[]
}

export interface UpdateSetupResponse {
  updated: boolean
  id: string
  packageName: string
  network: string
  trace: TraceEntry[]
}

export interface DeleteSetupResponse {
  deleted: boolean
  id: string
  trace: TraceEntry[]
}

// Provision records
export interface ProvisionListItem {
  id: string
  serial: string
  name?: string
  desc?: string
  setupName?: string
  createdAt?: string
  updatedAt?: string
}

export interface ListProvisionsResponse {
  network: string
  provisions: ProvisionListItem[]
  trace: TraceEntry[]
}

export interface CreateProvisionResponse {
  created: boolean
  id: string | null
  serial: string
  network: string
  setupName: string
  trace: TraceEntry[]
}

export interface UpdateProvisionResponse {
  updated: boolean
  id: string
  serial: string
  network: string
  setupName: string
  trace: TraceEntry[]
}

export interface DeleteProvisionResponse {
  deleted: boolean
  id: string
  trace: TraceEntry[]
}

// Compact per-device summary for the "List devices" tab. A union by serial of
// registered device records and B-Deploy provision records in one network, so
// each row shows both Registered and Provisioned status (like Find device).
export interface DeviceSummaryItem {
  serial: string
  registered: boolean
  provisioned: boolean
  name?: string
  model?: string
  setupType?: string
  health?: string
  uptime?: string
  setupPackageName?: string
}

export interface ListDevicesResponse {
  network: string
  devices: DeviceSummaryItem[]
  trace: TraceEntry[]
}

// Players (Reprovision tab)
export interface PlayerListItem {
  serial: string
  name?: string
  model?: string
  family?: string
  health?: string
  online: boolean
  lastContact?: string
}

export interface ListPlayersResponse {
  network: string
  players: PlayerListItem[]
  trace: TraceEntry[]
}

export interface ReprovisionResponse {
  reprovisioned: boolean
  serial: string
  trace: TraceEntry[]
}

export interface ApiError {
  error: string
  status?: number
}

export interface HealthStatus {
  ok: boolean
  tokenValid: boolean
  networkCount: number | null
  error?: string
}
