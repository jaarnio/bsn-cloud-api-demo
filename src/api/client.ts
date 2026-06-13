import type {
  ApiError,
  AuthRunResponse,
  CreateProvisionResponse,
  CreateSetupResponse,
  FirmwareFamily,
  DeleteProvisionResponse,
  DeleteSetupResponse,
  DeviceLookupResponse,
  HealthStatus,
  ListDevicesResponse,
  ListPlayersResponse,
  ListProvisionsResponse,
  ListSetupsResponse,
  ReprovisionResponse,
  UpdateProvisionResponse,
  UpdateSetupResponse,
} from '../types'

export interface CreateSetupPayload {
  network: string
  packageName: string
  deviceName?: string
  deviceDescription?: string
  unitNamingMethod?: string
  timeZone?: string
  setupType?: string
  appUrl?: string
  // Network configuration breakout.
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
  wifiPassphrase?: string
  wifiProto?: string
  wifiIp?: string
  wifiSubnet?: string
  wifiGateway?: string
  wifiDns?: string
  interfacePriority?: string
  bsnCloudEnabled?: boolean
  dwsEnabled?: boolean
  dwsPassword?: string
  remoteDwsEnabled?: boolean
  lwsEnabled?: boolean
  lwsUserName?: string
  lwsPassword?: string
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
  firmwareFamilies?: Array<{ family: string; source?: string; url?: string }>
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = body as ApiError
    throw new Error(err.error || `Request failed (${res.status})`)
  }
  return body as T
}

export function getHealth(): Promise<HealthStatus> {
  return fetch('/api/health').then((r) => r.json())
}

export function lookupDevice(serial: string): Promise<DeviceLookupResponse> {
  return fetch(`/api/devices?serial=${encodeURIComponent(serial)}`).then((r) =>
    parse<DeviceLookupResponse>(r),
  )
}

export function listDevices(network: string): Promise<ListDevicesResponse> {
  return fetch(`/api/devices/list?network=${encodeURIComponent(network)}`).then((r) =>
    parse<ListDevicesResponse>(r),
  )
}

export function runAuth(): Promise<AuthRunResponse> {
  return fetch('/api/auth/run', { method: 'POST' }).then((r) => parse<AuthRunResponse>(r))
}

export function getNetworks(): Promise<{ networks: Array<{ id: number; name: string }> }> {
  return fetch('/api/networks').then((r) => parse<{ networks: Array<{ id: number; name: string }> }>(r))
}

export function getFirmwareDefaults(): Promise<{ firmwareFamilies: FirmwareFamily[] }> {
  return fetch('/api/setups/firmware-defaults').then((r) =>
    parse<{ firmwareFamilies: FirmwareFamily[] }>(r),
  )
}

export function createSetup(payload: CreateSetupPayload): Promise<CreateSetupResponse> {
  return fetch('/api/setups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => parse<CreateSetupResponse>(r))
}

export function listSetups(network: string): Promise<ListSetupsResponse> {
  return fetch(`/api/setups?network=${encodeURIComponent(network)}`).then((r) =>
    parse<ListSetupsResponse>(r),
  )
}

export function updateSetup(id: string, payload: CreateSetupPayload): Promise<UpdateSetupResponse> {
  return fetch(`/api/setups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => parse<UpdateSetupResponse>(r))
}

export function deleteSetup(id: string, network: string): Promise<DeleteSetupResponse> {
  return fetch(`/api/setups/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`, {
    method: 'DELETE',
  }).then((r) => parse<DeleteSetupResponse>(r))
}

export interface ProvisionPayload {
  network: string
  serial: string
  name?: string
  desc?: string
  setupId?: string
  setupName: string
}

export function listProvisions(network: string): Promise<ListProvisionsResponse> {
  return fetch(`/api/provisions?network=${encodeURIComponent(network)}`).then((r) =>
    parse<ListProvisionsResponse>(r),
  )
}

export function createProvision(payload: ProvisionPayload): Promise<CreateProvisionResponse> {
  return fetch('/api/provisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => parse<CreateProvisionResponse>(r))
}

export function updateProvision(id: string, payload: ProvisionPayload): Promise<UpdateProvisionResponse> {
  return fetch(`/api/provisions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => parse<UpdateProvisionResponse>(r))
}

export function deleteProvision(id: string, network: string): Promise<DeleteProvisionResponse> {
  return fetch(`/api/provisions/${encodeURIComponent(id)}?network=${encodeURIComponent(network)}`, {
    method: 'DELETE',
  }).then((r) => parse<DeleteProvisionResponse>(r))
}

export function listPlayers(network: string): Promise<ListPlayersResponse> {
  return fetch(`/api/players?network=${encodeURIComponent(network)}`).then((r) =>
    parse<ListPlayersResponse>(r),
  )
}

export function reprovisionPlayer(serial: string, network: string): Promise<ReprovisionResponse> {
  return fetch(
    `/api/players/${encodeURIComponent(serial)}/reprovision?network=${encodeURIComponent(network)}`,
    { method: 'POST' },
  ).then((r) => parse<ReprovisionResponse>(r))
}
