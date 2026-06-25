import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * A schema we own for the v3 Device Setup Entity, replacing the old
 * "clone whatever setup is first in the network" approach (see
 * docs/setup-builder-rebuild-plan.md).
 *
 * The canonical default is seeded from a real, known-good setup — `Sample-Default`
 * in alliancelab-sandbox-01 — captured + scrubbed via scripts/capture-setups.ts.
 * Seeding from a live capture (rather than hand-authoring 60+ fields) guarantees
 * the entity is structurally complete and correctly cased (camelCase `setupJson`,
 * confirmed live — NOT the lowercase shown in some docs). `buildSetupEntity`
 * normalizes the instance-specific bits (identity, credentials, token, the
 * authoring-tool's edit-tracking bookkeeping) so every create starts from the
 * same deterministic base.
 */
const here = dirname(fileURLToPath(import.meta.url))
const CANONICAL_DEFAULT = JSON.parse(
  readFileSync(join(here, 'fixtures', 'sample-default.json'), 'utf8'),
) as Record<string, unknown>

export interface BuildSetupOpts {
  network: string
  packageName: string
  /** Account login (GET /self) → bDeploy.username. */
  username: string
  /** Defaults to the form's default publishing mode. */
  setupType?: string
  /** Partner Application bundle URL → bDeploy.url (autorun.zip). */
  appUrl?: string
}

/**
 * Build a complete, deterministic v3 entity from the canonical default. The
 * caller (createSetup) then layers user choices via applyEditableFields and
 * embeds a freshly minted registration token. Returns the entity WITHOUT a
 * token — that is added last so it never lives in the template.
 */
export function buildSetupEntity(opts: BuildSetupOpts): Record<string, unknown> {
  const entity = structuredClone(CANONICAL_DEFAULT)

  // Drop instance identity + the captured token (a fresh one is embedded later).
  delete entity._id
  delete entity.bsnDeviceRegistrationTokenEntity

  // Reset credentials scrubbed out of the fixture — never ship the marker text.
  // Blank means "no password set"; the create path overrides when the user types one.
  entity.dwsPassword = ''
  entity.lwsPassword = ''

  // Authoring-tool bookkeeping we don't own (edit-tracking + UI error list).
  // Let BSN manage these rather than POSTing stale captured values.
  for (const k of [
    'dwsPasswordEdited',
    'lwsPasswordEdited',
    'lwsUsernameEdited',
    'dwsPasswordPreviousSavedTimeStamp',
    'uiDeviceSetupErrors',
  ]) {
    delete entity[k]
  }

  // Identity + publishing mode are always explicit choices.
  entity.setupType = opts.setupType ?? 'lfn'
  entity.packageName = opts.packageName
  entity.bDeploy = {
    client: 'bacon', // account-constant
    username: opts.username,
    networkName: opts.network,
    packageName: opts.packageName,
    url: opts.appUrl ?? '',
  }

  return entity
}

// ---------------------------------------------------------------------------
// Network configuration (v3 `network.interfaces[]`)
//
// Shapes captured live from Sample-Ethernet-Static / Sample-Wifi. Interface
// ORDER is priority (no separate priority field). Static IPs use CIDR in `ip[]`.
// The WiFi passphrase lives in `security.authentication.passphrase` (write-only,
// preserved on edit when the form leaves it blank).
// ---------------------------------------------------------------------------

export interface NetworkOpts {
  /** When false (default), the player keeps its current settings (inheritNetworkProperties=true). */
  includeNetworkConfiguration?: boolean
  ethernetEnabled?: boolean
  ethernetProto?: string // 'dhcp' | 'static'
  ethernetIp?: string // plain IP (e.g. 192.168.1.10); CIDR also accepted
  ethernetSubnet?: string // dotted mask (e.g. 255.255.255.0)
  ethernetGateway?: string
  ethernetDns?: string // comma/space separated
  wifiEnabled?: boolean
  wifiSsid?: string
  wifiPassphrase?: string // blank on edit = keep existing
  wifiProto?: string
  wifiIp?: string
  wifiSubnet?: string
  wifiGateway?: string
  wifiDns?: string
  interfacePriority?: string // 'wired' | 'wireless' (array order when both present)
  specifyHostname?: boolean
  hostname?: string
  timeServerUrl?: string
}

const DEFAULT_WPA = {
  peapUsername: '',
  peapPassphrase: '',
  caCertificateFile: null,
  eapCertificateFile: null,
  eapCertificateType: 'WPAEapTlsPKCS',
  eapPemOrDerKeyFile: null,
  wpaEnterpriseVariant: 'WPAEnterpriseEapTls',
  eapCertificatePassphrase: '',
  enableWPAEnterpriseAuthentication: false,
}

/** Per-interface data-type + rate-limit flags, at their captured defaults. */
const IFACE_FLAGS = {
  logsUploadEnabled: true,
  contentDownloadEnabled: true,
  healthReportingEnabled: true,
  textFeedsDownloadEnabled: true,
  mediaFeedsDownloadEnabled: true,
  rateLimitDuringInitialDownloads: null,
  rateLimitInsideContentDownloadWindow: null,
  rateLimitOutsideContentDownloadWindow: null,
}

function dnsList(s?: string): string[] {
  if (!s) return []
  return s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Dotted subnet mask → CIDR prefix length. Defaults to 24 if unparseable. */
function maskToPrefix(mask?: string): number {
  if (!mask) return 24
  const octets = mask.trim().split('.')
  if (octets.length !== 4) return 24
  let bits = 0
  for (const o of octets) {
    const n = Number(o)
    if (!Number.isInteger(n) || n < 0 || n > 255) return 24
    bits += n.toString(2).split('1').length - 1
  }
  return bits
}

/** CIDR prefix length → dotted subnet mask. */
function prefixToMask(prefix: number): string {
  const p = Math.max(0, Math.min(32, prefix))
  const octets = [0, 0, 0, 0]
  for (let i = 0; i < p; i++) octets[Math.floor(i / 8)] |= 1 << (7 - (i % 8))
  return octets.join('.')
}

/** Combine a plain IP + dotted mask into a single CIDR entry (passes through existing CIDR). */
function toCidr(ip?: string, mask?: string): string[] {
  const addr = ip?.trim()
  if (!addr) return []
  if (addr.includes('/')) return [addr] // already CIDR
  return [`${addr}/${maskToPrefix(mask)}`]
}

/** Split a CIDR entry back into a plain IP + dotted mask for the form. */
function fromCidr(entry: unknown): { ip: string; subnet: string } {
  if (typeof entry !== 'string' || !entry) return { ip: '', subnet: '255.255.255.0' }
  const [addr, prefix] = entry.split('/')
  return { ip: addr, subnet: prefix ? prefixToMask(Number(prefix)) : '255.255.255.0' }
}

function ethernetInterface(o: NetworkOpts): Record<string, unknown> {
  const isStatic = o.ethernetProto === 'static'
  return {
    id: 'wired_eth0',
    name: 'eth0',
    type: 'Ethernet',
    proto: isStatic ? 'Static' : 'DHCPv4',
    ip: isStatic ? toCidr(o.ethernetIp, o.ethernetSubnet) : [],
    dns: isStatic ? dnsList(o.ethernetDns) : [],
    gateway: isStatic && o.ethernetGateway ? o.ethernetGateway.trim() : null,
    wpaSettings: { ...DEFAULT_WPA },
    ...IFACE_FLAGS,
  }
}

function wifiInterface(o: NetworkOpts, existingPassphrase: string): Record<string, unknown> {
  const isStatic = o.wifiProto === 'static'
  const passphrase = o.wifiPassphrase ? o.wifiPassphrase : existingPassphrase
  return {
    id: 'wireless_wlan0',
    name: 'wlan0',
    type: 'WiFi',
    proto: isStatic ? 'Static' : 'DHCPv4',
    ip: isStatic ? toCidr(o.wifiIp, o.wifiSubnet) : [],
    dns: isStatic ? dnsList(o.wifiDns) : [],
    gateway: isStatic && o.wifiGateway ? o.wifiGateway.trim() : null,
    ssid: o.wifiSsid ?? '',
    passphrase: '',
    security: {
      encryption: { mode: 'TKIP, CCMP' },
      authentication: { mode: 'Shared', passphrase },
    },
    wpaSettings: { ...DEFAULT_WPA },
    ...IFACE_FLAGS,
  }
}

/** The WiFi passphrase already stored on the entity (so a blank form keeps it). */
function existingWifiPassphrase(entity: Record<string, unknown>): string {
  const ifaces = (entity.network as { interfaces?: unknown[] })?.interfaces
  if (!Array.isArray(ifaces)) return ''
  const wifi = ifaces.find((i) => (i as { type?: string })?.type === 'WiFi') as
    | { security?: { authentication?: { passphrase?: string } } }
    | undefined
  return wifi?.security?.authentication?.passphrase ?? ''
}

/**
 * Layer the user's network choices onto a setup entity (shared by create + edit).
 * When "Include Network Configuration" is off, the player keeps its current
 * settings and we only touch the time server. When on, we rebuild
 * `network.interfaces[]` in priority order.
 */
export function applyNetworkConfig(entity: Record<string, unknown>, o: NetworkOpts): void {
  const net = (
    entity.network && typeof entity.network === 'object' ? entity.network : {}
  ) as Record<string, unknown>

  if (o.timeServerUrl) net.timeServers = [o.timeServerUrl.trim()]

  const include = o.includeNetworkConfiguration === true
  entity.inheritNetworkProperties = !include

  if (include) {
    net.hostname = o.specifyHostname && o.hostname ? o.hostname.trim() : null
    const eth = o.ethernetEnabled !== false // default-on when including config
    const wifi = o.wifiEnabled === true
    const ethIf = eth ? ethernetInterface(o) : null
    const wifiIf = wifi ? wifiInterface(o, existingWifiPassphrase(entity)) : null

    const ifaces: unknown[] = []
    if (ethIf && wifiIf) {
      if (o.interfacePriority === 'wireless') ifaces.push(wifiIf, ethIf)
      else ifaces.push(ethIf, wifiIf)
    } else if (wifiIf) {
      ifaces.push(wifiIf)
    } else {
      ifaces.push(ethIf ?? ethernetInterface(o)) // always at least one interface
    }
    net.interfaces = ifaces
  }

  entity.network = net
}

// ---------------------------------------------------------------------------
// OS Update — per-family firmware policy (`firmwareUpdatesByFamily`)
//
// firmwareUpdateSource enum — values confirmed against the live Sample-OS-Updater
// reference setup (alliancelab-sandbox-01), the ground-truth authority:
//   production | beta | compatible | specificUrl | none | existing
// NOTE: the v3 doc (firmware-reference-entity-v3) is self-contradictory — its prose
// enum says "MinimumCompatible"/"SpecificUrl" but its code samples + the live setup
// use `compatible` and `specificUrl`. The live setup wins.
// The entity keys are SoC codenames (Thor, Cobra, …) carrying read-only version
// metadata; the only editable bits are the per-family source (+ url for specificUrl).
// ---------------------------------------------------------------------------

export interface FirmwareFamily {
  family: string
  source: string
  url?: string
  productionVersion?: string
  betaVersion?: string
  compatibleVersion?: string
}

/** Flatten firmwareUpdatesByFamily into UI-shaped rows (codename + source + versions). */
export function summarizeFirmwareFamilies(cfg: Record<string, unknown>): FirmwareFamily[] {
  const byFamily = cfg.firmwareUpdatesByFamily
  if (!byFamily || typeof byFamily !== 'object') return []
  return Object.entries(byFamily as Record<string, Record<string, unknown>>)
    .map(([family, f]) => ({
      family,
      // null/absent → "none" (do not update), matching how the UI presents it.
      source: (f?.firmwareUpdateSource as string) || 'none',
      url: (f?.firmwareUpdateSourceUrl as string) || '',
      productionVersion: f?.productionVersion as string | undefined,
      betaVersion: f?.betaVersion as string | undefined,
      compatibleVersion: f?.compatibleVersion as string | undefined,
    }))
    .sort((a, b) => a.family.localeCompare(b.family))
}

/** Apply per-family OS-update choices onto an entity's firmwareUpdatesByFamily. */
export function applyFirmwareFamilies(
  entity: Record<string, unknown>,
  families?: Array<{ family: string; source?: string; url?: string }>,
): void {
  if (!Array.isArray(families) || !families.length) return
  const byFamily = entity.firmwareUpdatesByFamily as Record<string, Record<string, unknown>> | undefined
  if (!byFamily || typeof byFamily !== 'object') return
  for (const choice of families) {
    const f = byFamily[choice.family]
    if (!f) continue // only touch families that exist in the entity
    if (choice.source) f.firmwareUpdateSource = choice.source
    f.firmwareUpdateSourceUrl = choice.source === 'specificUrl' ? choice.url ?? '' : ''
  }
}

/** The canonical default's families + current versions (for the create form). */
export function canonicalFirmwareFamilies(): FirmwareFamily[] {
  return summarizeFirmwareFamilies(CANONICAL_DEFAULT)
}

export interface NetworkSummary {
  includeNetworkConfiguration: boolean
  timeServerUrl?: string
  specifyHostname: boolean
  hostname: string
  ethernetEnabled: boolean
  ethernetProto: string
  ethernetIp: string
  ethernetSubnet: string
  ethernetGateway: string
  ethernetDns: string
  wifiEnabled: boolean
  wifiSsid: string
  wifiProto: string
  wifiIp: string
  wifiSubnet: string
  wifiGateway: string
  wifiDns: string
  interfacePriority: string
}

/** Flatten an entity's `network` block into form-shaped fields (never the WiFi passphrase). */
export function summarizeNetwork(cfg: Record<string, unknown>): NetworkSummary {
  const net = (cfg.network ?? {}) as {
    interfaces?: Array<Record<string, unknown>>
    timeServers?: string[]
    hostname?: string | null
  }
  const ifaces = Array.isArray(net.interfaces) ? net.interfaces : []
  const idxEth = ifaces.findIndex((i) => i?.type === 'Ethernet')
  const idxWifi = ifaces.findIndex((i) => i?.type === 'WiFi')
  const eth = idxEth >= 0 ? ifaces[idxEth] : undefined
  const wifi = idxWifi >= 0 ? ifaces[idxWifi] : undefined
  const arr = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : '')
  const ethAddr = fromCidr(Array.isArray(eth?.ip) ? eth?.ip[0] : undefined)
  const wifiAddr = fromCidr(Array.isArray(wifi?.ip) ? wifi?.ip[0] : undefined)

  return {
    includeNetworkConfiguration: cfg.inheritNetworkProperties === false,
    timeServerUrl: net.timeServers?.[0],
    specifyHostname: Boolean(net.hostname),
    hostname: net.hostname ?? '',
    ethernetEnabled: Boolean(eth),
    ethernetProto: eth?.proto === 'Static' ? 'static' : 'dhcp',
    ethernetIp: ethAddr.ip,
    ethernetSubnet: ethAddr.subnet,
    ethernetGateway: (eth?.gateway as string) ?? '',
    ethernetDns: arr(eth?.dns),
    wifiEnabled: Boolean(wifi),
    wifiSsid: (wifi?.ssid as string) ?? '',
    wifiProto: wifi?.proto === 'Static' ? 'static' : 'dhcp',
    wifiIp: wifiAddr.ip,
    wifiSubnet: wifiAddr.subnet,
    wifiGateway: (wifi?.gateway as string) ?? '',
    wifiDns: arr(wifi?.dns),
    interfacePriority: idxWifi >= 0 && idxEth >= 0 && idxWifi < idxEth ? 'wireless' : 'wired',
  }
}
