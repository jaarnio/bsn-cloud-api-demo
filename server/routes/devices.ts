import { Router } from 'express'
import { bsnFetch } from '../bsnClient.ts'
import { AuthError, getNetworks, selectNetwork } from '../auth.ts'
import { API_BASE, PROVISION_BASE } from '../config.ts'
import { withTrace } from '../trace.ts'

export const devicesRouter = Router()

/**
 * GET /api/devices?serial=XXXX
 *
 * Builds the COMPLETE status picture for a serial across the whole account by
 * combining two independent entities (PRD features 2 & 3):
 *
 *   1. Device record   — native /Devices resource. The registered/connected
 *      player: health, firmware, model, group. Session-scoped per network.
 *   2. Provision record — B-Deploy rest-device/v2. The deployment binding
 *      (serial -> network -> setup). May be ABSENT for a registered-but-not-
 *      provisioned device, or PRESENT without a matching device record.
 *   3. Setup definition — B-Deploy rest-setup/v3. Resolved from the provision
 *      record's setupName (matched to a setup packageName in the same network).
 *
 * Neither entity alone is the full story, so we surface all three. We enumerate
 * the account's networks and, per network, look up the device + provision
 * records in parallel; the first network with EITHER record wins.
 *
 * Responses:
 *   200 { found, network, serial, device, provision, setup, searchedNetworks }
 *   400/5xx { error, status }
 */
devicesRouter.get('/', async (req, res) => {
  const serial = String(req.query.serial ?? '').trim()
  if (!serial) {
    return res.status(400).json({ error: 'A "serial" query parameter is required.' })
  }
  if (!/^[A-Za-z0-9_-]+$/.test(serial)) {
    return res.status(400).json({ error: 'Serial contains invalid characters.' })
  }

  try {
    const { result, trace } = await withTrace(() => searchAllNetworks(serial))
    return res.json({ ...result, trace })
  } catch (err) {
    if (err instanceof AuthError) {
      return res
        .status(err.status === 401 ? 502 : err.status)
        .json({ error: friendlyMessage(err.status, err.message), status: err.status })
    }
    return res.status(500).json({ error: (err as Error).message || 'Unexpected server error.' })
  }
})

/**
 * Sweep every account network for the serial, returning the combined picture
 * for the first network with a device OR provision record. Each call is
 * annotated so the API-flow trace tells the story; the per-network repeats are
 * collapsed by the frontend.
 */
async function searchAllNetworks(serial: string) {
  const networks = await getNetworks()
  const deviceFilter = encodeURIComponent(`[Serial] IS '${serial}'`)

  for (const net of networks) {
    // Select once (idempotent); pass network to each call so a 401 re-auth
    // re-selects it. The two reads share session state, so run in parallel.
    await selectNetwork(net.name)
    const [devRes, provRes] = await Promise.all([
      bsnFetch(`${API_BASE}/Devices/?filter=${deviceFilter}&pageSize=1`, {
        network: net.name,
        trace: {
          step: 'Find device record',
          note: 'Native Devices resource, filtered by serial in the selected network.',
          summarize: (b) => ({ items: ((b as { items?: unknown[] })?.items ?? []).length }),
        },
      }),
      bsnFetch(`${PROVISION_BASE}/rest-device/v2/device/?serial=${encodeURIComponent(serial)}`, {
        network: net.name,
        trace: {
          step: 'Find provision record',
          note: 'B-Deploy provision record (deployment/setup binding) for the serial.',
          summarize: (b) => {
            const r = (b as { result?: { total?: number; players?: unknown[] } })?.result
            return { total: r?.total, players: (r?.players ?? []).length }
          },
        },
      }),
    ])

    const device = devRes.ok ? extractDevice(devRes.body) : null
    const provision = provRes.ok ? extractProvision(provRes.body) : null

    if (device || provision) {
      const setupName = provision?.setupName ?? provision?.setupname
      const setup = setupName ? await resolveSetup(net.name, String(setupName)) : null
      return {
        found: true as const,
        network: net.name,
        serial,
        device,
        provision,
        setup,
        searchedNetworks: networks.length,
      }
    }
  }

  return { found: false as const, serial, searchedNetworks: networks.length }
}

/**
 * Native Devices response: { items: [...] }. Return a CURATED summary, not the
 * raw entity — the raw device record embeds plaintext credentials
 * (settings.lws.password, ldws) that must not be shipped to the browser.
 */
function extractDevice(body: unknown): Record<string, unknown> | null {
  const items = (body as { items?: unknown[] })?.items
  if (!Array.isArray(items) || items.length === 0) return null
  const d = items[0] as {
    id?: number
    serial?: string
    model?: string
    family?: string
    registrationDate?: string
    settings?: { name?: string; setupType?: string; timezone?: string; group?: { name?: string } }
    status?: {
      health?: string
      uptime?: string
      lastModifiedDate?: string
      firmware?: { version?: string }
      network?: { externalIp?: string }
    }
  }
  return {
    id: d.id,
    serial: d.serial,
    model: d.model,
    family: d.family,
    name: d.settings?.name,
    group: d.settings?.group?.name,
    setupType: d.settings?.setupType,
    timezone: d.settings?.timezone,
    health: d.status?.health,
    firmware: d.status?.firmware?.version,
    uptime: d.status?.uptime,
    externalIp: d.status?.network?.externalIp,
    registrationDate: d.registrationDate,
    lastContact: d.status?.lastModifiedDate,
  }
}

/** B-Deploy provision response: { error, result: { players: [...] } }. */
function extractProvision(body: unknown): Record<string, unknown> | null {
  const result = (body as { result?: { players?: unknown[] } })?.result
  const players = result?.players
  return Array.isArray(players) && players.length > 0
    ? (players[0] as Record<string, unknown>)
    : null
}

/**
 * Resolve the setup definition a provision record points at. The provision
 * record carries setupName (no setupId here), and the rest-setup/v3 list isn't
 * reliably filterable by packagename, so we list and match packageName.
 * Returns a trimmed summary (headline fields + a few parsed setupJson values).
 */
async function resolveSetup(network: string, setupName: string) {
  const { ok, body } = await bsnFetch(
    `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`,
    {
      network,
      trace: {
        step: 'Resolve setup definition',
        note: `Lists setups in the network and matches packageName to the provision record's "${setupName}".`,
        summarize: (b) => {
          const list = Array.isArray(b) ? b : ((b as { result?: unknown[] })?.result ?? [])
          return { setups: Array.isArray(list) ? list.length : 0 }
        },
      },
    },
  )
  if (!ok) return null
  const list = Array.isArray(body)
    ? body
    : ((body as { result?: unknown[] })?.result ?? [])
  if (!Array.isArray(list)) return null

  const match = list.find(
    (s) =>
      (s as { packageName?: string }).packageName === setupName ||
      (s as { packagename?: string }).packagename === setupName,
  ) as Record<string, unknown> | undefined
  if (!match) return null

  let cfg: Record<string, unknown> = {}
  const raw = match.setupJson ?? match.setupjson
  if (typeof raw === 'string') {
    try {
      cfg = JSON.parse(raw)
    } catch {
      // ignore unparseable setupJson
    }
  }

  return {
    packageName: match.packageName ?? match.packagename ?? setupName,
    setupType: match.setupType ?? cfg.setupType,
    bsnGroupName: match.bsnGroupName ?? cfg.bsnGroupName,
    version: match.version,
    createdAt: match.createdAt,
    config: {
      timeZone: cfg.timeZone,
      firmwareUpdateType: cfg.firmwareUpdateType,
      dwsEnabled: cfg.dwsEnabled,
      lwsEnabled: cfg.lwsEnabled,
      bsnCloudEnabled: cfg.bsnCloudEnabled,
    },
  }
}

function friendlyMessage(status: number, body: unknown): string {
  const detail =
    body && typeof body === 'object' && 'error' in body && (body as { error: unknown }).error
      ? String((body as { error: unknown }).error)
      : typeof body === 'string'
        ? body
        : ''
  switch (status) {
    case 400:
      return `Bad request${detail ? `: ${detail}` : '.'}`
    case 403:
      return 'Permission denied — the application may be missing the required scope/feature.'
    case 404:
      return 'Not found.'
    default:
      return status >= 500
        ? `Upstream BSN.cloud error (${status}).`
        : `Request failed (${status})${detail ? `: ${detail}` : '.'}`
  }
}
