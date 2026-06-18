import { Router } from 'express'
import { bsnFetch } from '../bsnClient.ts'
import { AuthError, selectNetwork } from '../auth.ts'
import { API_BASE, PROVISION_BASE } from '../config.ts'
import { redactSecrets, withTrace } from '../trace.ts'
import { getUsername } from '../account.ts'
import {
  buildSetupEntity,
  applyNetworkConfig,
  summarizeNetwork,
  applyFirmwareFamilies,
  summarizeFirmwareFamilies,
  canonicalFirmwareFamilies,
  type NetworkOpts,
} from '../setupTemplate.ts'

export const setupsRouter = Router()

interface CreateSetupBody extends NetworkOpts {
  network?: string
  // Setup File Basics
  packageName?: string
  deviceName?: string
  deviceDescription?: string
  unitNamingMethod?: string
  timeZone?: string
  // Publishing Mode
  setupType?: string
  // Partner Application bundle URL (stored as bDeploy.url)
  appUrl?: string
  // Network: the full breakout (includeNetworkConfiguration, ethernet*, wifi*,
  // interfacePriority, specifyHostname, hostname, timeServerUrl) comes via NetworkOpts.
  bsnCloudEnabled?: boolean
  // Services & Monitoring
  dwsEnabled?: boolean
  dwsPassword?: string
  remoteDwsEnabled?: boolean
  lwsEnabled?: boolean
  lwsUserName?: string
  lwsPassword?: string
  lwsConfig?: string
  lwsEnableUpdateNotifications?: boolean
  // Diagnostics & Updates
  enableSerialDebugging?: boolean
  enableSystemLogDebugging?: boolean
  firmwareUpdateType?: string
  // Per-family OS update choices (firmwareUpdatesByFamily)
  firmwareFamilies?: Array<{ family: string; source?: string; url?: string }>
  // Remote Screenshots
  enableRemoteSnapshot?: boolean
  remoteSnapshotInterval?: number
  remoteSnapshotMaxImages?: number
  remoteSnapshotJpegQualityLevel?: number
  remoteSnapshotScreenOrientation?: string
}

/**
 * App-layer validations the BSN/B-Deploy APIs don't enforce themselves but a
 * real application would (mirrored client-side in src/components/SetupForm.tsx).
 * Returns the first failing rule's message, or null if the body is valid.
 */
function validateSetupBody(body: CreateSetupBody): string | null {
  if (body.setupType === 'partnerApplication' && !String(body.appUrl ?? '').trim())
    return 'A Partner App URL is required for Partner Application setups.'
  if (body.setupType === 'lfn' && !body.lwsEnabled)
    return 'Local Network publishing requires the Local Web Server (LWS) to be enabled.'
  if (body.dwsEnabled && !String(body.dwsPassword ?? '').trim())
    return 'A DWS password is required when the Diagnostic Web Server is enabled.'
  if (body.lwsEnabled && !String(body.lwsUserName ?? '').trim())
    return 'An LWS username is required when the Local Web Server is enabled.'
  if (body.lwsEnabled && !String(body.lwsPassword ?? '').trim())
    return 'An LWS password is required when the Local Web Server is enabled.'
  return null
}

/**
 * POST /api/setups
 *
 * Creates a B-Deploy setup definition (PRD feature 4). The v3 Device Setup
 * Entity is built from a schema we own (server/setupTemplate.ts) — a canonical
 * default seeded from a known-good setup — onto which we layer the user's choices
 * and a freshly minted registration token. This is deterministic: no inheritance
 * from "whichever setup happened to be first" (see setup-builder-rebuild-plan.md).
 *
 * Flow: select network -> mint registration token -> build entity -> create.
 * Returns { created, setupId, packageName, network, basedOn, tokenValidTo }.
 */
setupsRouter.post('/', async (req, res) => {
  const body = (req.body ?? {}) as CreateSetupBody
  const network = String(body.network ?? '').trim()
  const packageName = String(body.packageName ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A target "network" is required.' })
  if (!packageName) return res.status(400).json({ error: 'A "packageName" is required.' })
  const invalid = validateSetupBody(body)
  if (invalid) return res.status(400).json({ error: invalid })

  try {
    const { result, trace } = await withTrace(() => createSetup(network, packageName, body))
    return res.json({ ...result, trace })
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.status >= 400 && err.status < 600 ? err.status : 502
      return res.status(status).json({ error: err.message, status: err.status })
    }
    return res.status(500).json({ error: (err as Error).message || 'Unexpected server error.' })
  }
})

/**
 * GET /api/setups?network=NAME
 * Lists the setup packages in a network (PRD feature 4 list). Returns the
 * editable fields per setup — NEVER passwords.
 */
setupsRouter.get('/', async (req, res) => {
  const network = String(req.query.network ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A "network" query parameter is required.' })
  try {
    const { result, trace } = await withTrace(() => listSetups(network))
    return res.json({ network, setups: result, trace })
  } catch (err) {
    return handleError(res, err)
  }
})

/**
 * GET /api/setups/firmware-defaults
 * The canonical default's per-family firmware versions + sources, so the create
 * form can render the OS-update matrix (create has no existing setup to read).
 */
setupsRouter.get('/firmware-defaults', (_req, res) => {
  res.json({ firmwareFamilies: canonicalFirmwareFamilies() })
})

/**
 * DELETE /api/setups/:id?network=NAME
 * Removes a setup package by _id (destructive).
 */
setupsRouter.delete('/:id', async (req, res) => {
  const id = String(req.params.id)
  const network = String(req.query.network ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A "network" query parameter is required.' })
  try {
    const { result, trace } = await withTrace(async () => {
      await selectNetwork(network)
      const { ok, status } = await bsnFetch(
        `${PROVISION_BASE}/rest-setup/v3/setup/?_id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          network,
          trace: {
            step: 'Delete setup',
            note: 'Removes the setup package by _id.',
          },
        },
      )
      if (!ok) throw new AuthError(status, `Delete failed (${status}).`)
      return { deleted: true, id }
    })
    return res.json({ ...result, trace })
  } catch (err) {
    return handleError(res, err)
  }
})

/**
 * PUT /api/setups/:id
 * Edits a setup: loads the current entity, applies the submitted fields
 * (blank passwords keep existing), and PUTs it back (PRD feature 4 modify).
 */
setupsRouter.put('/:id', async (req, res) => {
  const id = String(req.params.id)
  const body = (req.body ?? {}) as CreateSetupBody
  const network = String(body.network ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A target "network" is required.' })
  const invalid = validateSetupBody(body)
  if (invalid) return res.status(400).json({ error: invalid })
  try {
    const { result, trace } = await withTrace(() => updateSetup(network, id, body))
    return res.json({ ...result, trace })
  } catch (err) {
    return handleError(res, err)
  }
})

interface RegistrationToken {
  token: string
  scope: string
  validFrom: string
  validTo: string
}

async function createSetup(network: string, packageName: string, opts: CreateSetupBody) {
  await selectNetwork(network)

  // 1. Mint a device registration token (embedded in the setup).
  const tokenRes = await bsnFetch(`${API_BASE}/Provisioning/Setups/Tokens/`, {
    method: 'POST',
    network,
    trace: {
      step: 'Get registration token',
      note: 'Issues a player registration token (cert scope, ~2yr) to embed in the setup.',
    },
  })
  if (!tokenRes.ok) {
    throw new AuthError(tokenRes.status, `Failed to get a registration token (${tokenRes.status}).`)
  }
  const token = tokenRes.body as RegistrationToken

  // 2. Build the base entity from the schema we own (deterministic — no clone).
  const username = await getUsername()
  const inner = buildSetupEntity({
    network,
    packageName,
    username,
    setupType: opts.setupType,
    appUrl: opts.appUrl,
  })

  // 3. Layer the user's editable-field choices onto the owned base.
  applyEditableFields(inner, opts)

  inner.bsnDeviceRegistrationTokenEntity = {
    token: token.token,
    scope: token.scope,
    validFrom: token.validFrom,
    validTo: token.validTo,
  }

  // 4. Create. The trace body is a redacted summary — the real entity carries
  //    cloned DWS/LWS passwords + the token, which must not reach the browser.
  const createRes = await bsnFetch(`${PROVISION_BASE}/rest-setup/v3/setup`, {
    method: 'POST',
    network,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inner),
    trace: {
      step: 'Create setup',
      note: 'POST the v3 Device Setup Entity; returns the new setupId.',
      reqBody: {
        ...redactedBody(inner, network),
        bsnDeviceRegistrationTokenEntity: { token: '••••••••', scope: token.scope, validTo: token.validTo },
      },
    },
  })
  if (!createRes.ok) {
    const detail = (createRes.body as { error?: unknown })?.error
    throw new AuthError(
      createRes.status,
      `Create setup failed (${createRes.status})${detail ? `: ${detail}` : ''}. The package name may already be in use.`,
    )
  }

  return {
    created: true,
    setupId: (createRes.body as { result?: string })?.result ?? null,
    packageName,
    network,
    basedOn: 'schema-default',
    tokenValidTo: token.validTo,
  }
}

/** Apply the editable section fields onto a setup entity (shared by create + edit). */
function applyEditableFields(inner: Record<string, unknown>, opts: CreateSetupBody): void {
  if (opts.deviceName != null) inner.deviceName = String(opts.deviceName)
  if (opts.deviceDescription != null) inner.deviceDescription = String(opts.deviceDescription)
  if (opts.unitNamingMethod) inner.unitNamingMethod = String(opts.unitNamingMethod)
  if (opts.timeZone) inner.timeZone = String(opts.timeZone)
  if (opts.setupType) inner.setupType = String(opts.setupType)
  // Partner Application bundle URL lives at bDeploy.url (autorun.zip the player
  // downloads). Only set when provided so non-partner setups keep their value.
  if (opts.appUrl != null) {
    inner.bDeploy = { ...(inner.bDeploy as object), url: String(opts.appUrl) }
  }
  if (opts.bsnCloudEnabled != null) inner.bsnCloudEnabled = Boolean(opts.bsnCloudEnabled)
  // Network configuration (interfaces, hostname, time server, inherit flag).
  applyNetworkConfig(inner, opts)
  if (opts.dwsEnabled != null) inner.dwsEnabled = Boolean(opts.dwsEnabled)
  if (opts.dwsPassword) inner.dwsPassword = String(opts.dwsPassword)
  if (opts.remoteDwsEnabled != null) inner.remoteDwsEnabled = Boolean(opts.remoteDwsEnabled)
  if (opts.lwsEnabled != null) inner.lwsEnabled = Boolean(opts.lwsEnabled)
  if (opts.lwsUserName != null) inner.lwsUserName = String(opts.lwsUserName)
  if (opts.lwsPassword) inner.lwsPassword = String(opts.lwsPassword)
  if (opts.lwsConfig) inner.lwsConfig = String(opts.lwsConfig)
  if (opts.lwsEnableUpdateNotifications != null)
    inner.lwsEnableUpdateNotifications = Boolean(opts.lwsEnableUpdateNotifications)
  // Diagnostics & Updates
  if (opts.enableSerialDebugging != null) inner.enableSerialDebugging = Boolean(opts.enableSerialDebugging)
  if (opts.enableSystemLogDebugging != null)
    inner.enableSystemLogDebugging = Boolean(opts.enableSystemLogDebugging)
  if (opts.firmwareUpdateType) inner.firmwareUpdateType = String(opts.firmwareUpdateType)
  applyFirmwareFamilies(inner, opts.firmwareFamilies)
  // Remote Screenshots
  if (opts.enableRemoteSnapshot != null) inner.enableRemoteSnapshot = Boolean(opts.enableRemoteSnapshot)
  if (opts.remoteSnapshotInterval != null)
    inner.remoteSnapshotInterval = Number(opts.remoteSnapshotInterval)
  if (opts.remoteSnapshotMaxImages != null)
    inner.remoteSnapshotMaxImages = Number(opts.remoteSnapshotMaxImages)
  if (opts.remoteSnapshotJpegQualityLevel != null)
    inner.remoteSnapshotJpegQualityLevel = Number(opts.remoteSnapshotJpegQualityLevel)
  if (opts.remoteSnapshotScreenOrientation)
    inner.remoteSnapshotScreenOrientation = String(opts.remoteSnapshotScreenOrientation)
}

/** A sanitized request-body summary for the flow trace (passwords/token redacted). */
function redactedBody(inner: Record<string, unknown>, network: string): Record<string, unknown> {
  return {
    packageName: inner.packageName,
    networkName: network,
    setupType: inner.setupType,
    appUrl: (inner.bDeploy as { url?: string })?.url,
    deviceName: inner.deviceName,
    unitNamingMethod: inner.unitNamingMethod,
    timeZone: inner.timeZone,
    inheritNetworkProperties: inner.inheritNetworkProperties,
    network: summarizeNetwork(inner),
    bsnCloudEnabled: inner.bsnCloudEnabled,
    dwsEnabled: inner.dwsEnabled,
    dwsPassword: '••••••••',
    lwsEnabled: inner.lwsEnabled,
    lwsUserName: inner.lwsUserName,
    lwsPassword: '••••••••',
    '…': 'other fields preserved',
  }
}

/**
 * Trace summarizer for the raw setup-list response. Each item carries a
 * `setupJson` STRING holding the full Device Setup Entity — including the WiFi
 * passphrase (security.authentication.passphrase), dwsPassword, lwsPassword, and
 * the embedded registration token. Key-based redaction can't reach inside a
 * stringified blob, so parse it first, then redact; show the parsed object
 * (cleaner JSON than an escaped string). Unparseable blobs are masked whole.
 */
function maskSetupList(b: unknown): unknown {
  const list = Array.isArray(b) ? b : ((b as { result?: unknown[] })?.result ?? [])
  const masked = (Array.isArray(list) ? list : []).map((item) => {
    const copy = { ...(item as Record<string, unknown>) }
    if (typeof copy.setupJson === 'string') {
      try {
        copy.setupJson = redactSecrets(JSON.parse(copy.setupJson))
      } catch {
        copy.setupJson = '••••••••'
      }
    }
    return redactSecrets(copy)
  })
  return Array.isArray(b) ? masked : { ...(b as object), result: masked }
}

/** Raw setup list for a network (includes setupJson). */
async function fetchRawSetups(network: string, step: string): Promise<Array<Record<string, unknown>>> {
  const { ok, status, body } = await bsnFetch(
    `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`,
    {
      network,
      trace: {
        step,
        note: 'Lists the setup packages stored in this network.',
        summarize: maskSetupList,
      },
    },
  )
  if (!ok) throw new AuthError(status, `Failed to list setups (${status}).`)
  const list = Array.isArray(body) ? body : ((body as { result?: unknown[] })?.result ?? [])
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : []
}

/** Trimmed, password-free view of each setup for the management UI. */
async function listSetups(network: string) {
  await selectNetwork(network)
  const raw = await fetchRawSetups(network, 'List setups')
  return raw.map((item) => {
    let cfg: Record<string, unknown> = {}
    try {
      cfg = JSON.parse(String(item.setupJson))
    } catch {
      // ignore
    }
    const bDeploy = cfg.bDeploy as { url?: string } | undefined
    return {
      id: item._id,
      packageName: item.packageName,
      setupType: cfg.setupType ?? item.setupType,
      appUrl: bDeploy?.url,
      deviceName: cfg.deviceName,
      deviceDescription: cfg.deviceDescription,
      unitNamingMethod: cfg.unitNamingMethod,
      timeZone: cfg.timeZone,
      ...summarizeNetwork(cfg),
      bsnCloudEnabled: cfg.bsnCloudEnabled,
      dwsEnabled: cfg.dwsEnabled,
      remoteDwsEnabled: cfg.remoteDwsEnabled,
      lwsEnabled: cfg.lwsEnabled,
      lwsUserName: cfg.lwsUserName,
      lwsConfig: cfg.lwsConfig,
      lwsEnableUpdateNotifications: cfg.lwsEnableUpdateNotifications,
      enableSerialDebugging: cfg.enableSerialDebugging,
      enableSystemLogDebugging: cfg.enableSystemLogDebugging,
      firmwareUpdateType: cfg.firmwareUpdateType,
      enableRemoteSnapshot: cfg.enableRemoteSnapshot,
      remoteSnapshotInterval: cfg.remoteSnapshotInterval,
      remoteSnapshotMaxImages: cfg.remoteSnapshotMaxImages,
      remoteSnapshotJpegQualityLevel: cfg.remoteSnapshotJpegQualityLevel,
      remoteSnapshotScreenOrientation: cfg.remoteSnapshotScreenOrientation,
      firmwareFamilies: summarizeFirmwareFamilies(cfg),
      version: item.version,
      createdAt: item.createdAt,
    }
  })
}

/** Load the current entity, apply the submitted fields, and PUT it back. */
async function updateSetup(network: string, id: string, opts: CreateSetupBody) {
  await selectNetwork(network)
  const raw = await fetchRawSetups(network, 'Load setup')
  const item = raw.find((s) => String(s._id) === id)
  if (!item) throw new AuthError(404, `No setup with id ${id} in ${network}.`)

  const inner = JSON.parse(String(item.setupJson)) as Record<string, unknown>
  inner._id = item._id // keep the id so the PUT targets this record
  if (opts.packageName) {
    inner.packageName = String(opts.packageName)
    inner.bDeploy = { ...(inner.bDeploy as object), packageName: String(opts.packageName) }
  }
  applyEditableFields(inner, opts)

  const putRes = await bsnFetch(`${PROVISION_BASE}/rest-setup/v3/setup`, {
    method: 'PUT',
    network,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inner),
    trace: {
      step: 'Update setup',
      note: 'PUT the modified v3 Device Setup Entity (same _id).',
      reqBody: { _id: id, ...redactedBody(inner, network) },
    },
  })
  if (!putRes.ok) {
    const detail = (putRes.body as { error?: unknown })?.error
    throw new AuthError(putRes.status, `Update failed (${putRes.status})${detail ? `: ${detail}` : ''}.`)
  }
  return { updated: true, id, packageName: inner.packageName, network }
}

function handleError(res: import('express').Response, err: unknown) {
  if (err instanceof AuthError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502
    return res.status(status).json({ error: err.message, status: err.status })
  }
  return res.status(500).json({ error: (err as Error).message || 'Unexpected server error.' })
}
