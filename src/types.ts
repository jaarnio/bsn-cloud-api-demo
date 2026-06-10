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
  deviceName?: string
  deviceDescription?: string
  unitNamingMethod?: string
  timeZone?: string
  inheritNetworkProperties?: boolean
  timeServerUrl?: string
  bsnCloudEnabled?: boolean
  dwsEnabled?: boolean
  lwsEnabled?: boolean
  lwsUserName?: string
  lwsEnableUpdateNotifications?: boolean
  version?: string
  createdAt?: string
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
