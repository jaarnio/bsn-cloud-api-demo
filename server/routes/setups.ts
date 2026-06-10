import { Router } from 'express'
import { bsnFetch } from '../bsnClient.ts'
import { AuthError, getNetworks, selectNetwork } from '../auth.ts'
import { API_BASE, PROVISION_BASE } from '../config.ts'
import { withTrace } from '../trace.ts'

export const setupsRouter = Router()

interface CreateSetupBody {
  network?: string
  // Setup File Basics
  packageName?: string
  deviceName?: string
  deviceDescription?: string
  unitNamingMethod?: string
  timeZone?: string
  // Publishing Mode
  setupType?: string
  // Network
  inheritNetworkProperties?: boolean
  timeServerUrl?: string
  bsnCloudEnabled?: boolean
  // Services & Monitoring
  dwsEnabled?: boolean
  dwsPassword?: string
  lwsEnabled?: boolean
  lwsUserName?: string
  lwsPassword?: string
  lwsEnableUpdateNotifications?: boolean
}

/**
 * POST /api/setups
 *
 * Creates a B-Deploy setup definition (PRD feature 4). The v3 Device Setup
 * Entity has dozens of fields and is under-specified, so we start from a
 * known-good template — an existing setup in the target network (account-level
 * fields like bDeploy.client/username are constant) — override a few fields,
 * embed a fresh device registration token, and POST it.
 *
 * Flow: select network -> mint registration token -> clone template -> create.
 * Returns { created, setupId, packageName, network, basedOn, tokenValidTo }.
 */
setupsRouter.post('/', async (req, res) => {
  const body = (req.body ?? {}) as CreateSetupBody
  const network = String(body.network ?? '').trim()
  const packageName = String(body.packageName ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A target "network" is required.' })
  if (!packageName) return res.status(400).json({ error: 'A "packageName" is required.' })

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
            summarize: (b) => ({ result: (b as { result?: unknown })?.result ?? (b as { error?: unknown })?.error ?? 'ok' }),
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
      summarize: (b) => ({ scope: (b as RegistrationToken)?.scope, validTo: (b as RegistrationToken)?.validTo }),
    },
  })
  if (!tokenRes.ok) {
    throw new AuthError(tokenRes.status, `Failed to get a registration token (${tokenRes.status}).`)
  }
  const token = tokenRes.body as RegistrationToken

  // 2. Clone a known-good setup as the base entity.
  const template = await loadTemplate(network)
  if (!template) {
    throw new AuthError(
      422,
      'No existing setup is available to use as a template. Choose a network that already has at least one setup.',
    )
  }
  const inner = JSON.parse(String(template.setupJson)) as Record<string, unknown>
  delete inner._id

  // 3. Override the editable fields on the cloned entity + bind to the
  //    target network/token. Blank password fields are intentionally NOT
  //    applied, so the template's existing credentials are preserved and never
  //    round-tripped through the browser.
  inner.packageName = packageName
  inner.bDeploy = { ...(inner.bDeploy as object), networkName: network, packageName }
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
      summarize: (b) => ({ setupId: (b as { result?: string })?.result, error: (b as { error?: unknown })?.error }),
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
    basedOn: template.packageName,
    tokenValidTo: token.validTo,
  }
}

/** First setup in the target network, else any network (account fields are constant). */
async function loadTemplate(network: string): Promise<Record<string, unknown> | null> {
  const direct = await fetchFirstSetup(network)
  if (direct) return direct
  for (const n of await getNetworks()) {
    if (n.name === network) continue
    const t = await fetchFirstSetup(n.name)
    if (t) return t
  }
  return null
}

async function fetchFirstSetup(network: string): Promise<Record<string, unknown> | null> {
  const { ok, body } = await bsnFetch(
    `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`,
    {
      network,
      trace: {
        step: 'Load template setup',
        note: 'Clones a known-good setup as the base for the new v3 entity.',
        summarize: (b) => {
          const list = Array.isArray(b) ? b : ((b as { result?: unknown[] })?.result ?? [])
          return { setups: Array.isArray(list) ? list.length : 0 }
        },
      },
    },
  )
  if (!ok) return null
  const list = Array.isArray(body) ? body : ((body as { result?: unknown[] })?.result ?? [])
  return Array.isArray(list) && list.length > 0 ? (list[0] as Record<string, unknown>) : null
}

/** Apply the editable section fields onto a setup entity (shared by create + edit). */
function applyEditableFields(inner: Record<string, unknown>, opts: CreateSetupBody): void {
  if (opts.deviceName != null) inner.deviceName = String(opts.deviceName)
  if (opts.deviceDescription != null) inner.deviceDescription = String(opts.deviceDescription)
  if (opts.unitNamingMethod) inner.unitNamingMethod = String(opts.unitNamingMethod)
  if (opts.timeZone) inner.timeZone = String(opts.timeZone)
  if (opts.setupType) inner.setupType = String(opts.setupType)
  if (opts.inheritNetworkProperties != null)
    inner.inheritNetworkProperties = Boolean(opts.inheritNetworkProperties)
  if (opts.bsnCloudEnabled != null) inner.bsnCloudEnabled = Boolean(opts.bsnCloudEnabled)
  if (opts.timeServerUrl && inner.network && typeof inner.network === 'object') {
    ;(inner.network as { timeServers?: string[] }).timeServers = [String(opts.timeServerUrl)]
  }
  if (opts.dwsEnabled != null) inner.dwsEnabled = Boolean(opts.dwsEnabled)
  if (opts.dwsPassword) inner.dwsPassword = String(opts.dwsPassword)
  if (opts.lwsEnabled != null) inner.lwsEnabled = Boolean(opts.lwsEnabled)
  if (opts.lwsUserName != null) inner.lwsUserName = String(opts.lwsUserName)
  if (opts.lwsPassword) inner.lwsPassword = String(opts.lwsPassword)
  if (opts.lwsEnableUpdateNotifications != null)
    inner.lwsEnableUpdateNotifications = Boolean(opts.lwsEnableUpdateNotifications)
}

/** A sanitized request-body summary for the flow trace (passwords/token redacted). */
function redactedBody(inner: Record<string, unknown>, network: string): Record<string, unknown> {
  return {
    packageName: inner.packageName,
    networkName: network,
    setupType: inner.setupType,
    deviceName: inner.deviceName,
    unitNamingMethod: inner.unitNamingMethod,
    timeZone: inner.timeZone,
    inheritNetworkProperties: inner.inheritNetworkProperties,
    bsnCloudEnabled: inner.bsnCloudEnabled,
    dwsEnabled: inner.dwsEnabled,
    dwsPassword: '••••••••',
    lwsEnabled: inner.lwsEnabled,
    lwsUserName: inner.lwsUserName,
    lwsPassword: '••••••••',
    '…': 'other fields preserved',
  }
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
        summarize: (b) => {
          const list = Array.isArray(b) ? b : ((b as { result?: unknown[] })?.result ?? [])
          return { setups: Array.isArray(list) ? list.length : 0 }
        },
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
    const net = cfg.network as { timeServers?: string[] } | undefined
    return {
      id: item._id,
      packageName: item.packageName,
      setupType: cfg.setupType ?? item.setupType,
      deviceName: cfg.deviceName,
      deviceDescription: cfg.deviceDescription,
      unitNamingMethod: cfg.unitNamingMethod,
      timeZone: cfg.timeZone,
      inheritNetworkProperties: cfg.inheritNetworkProperties,
      timeServerUrl: net?.timeServers?.[0],
      bsnCloudEnabled: cfg.bsnCloudEnabled,
      dwsEnabled: cfg.dwsEnabled,
      lwsEnabled: cfg.lwsEnabled,
      lwsUserName: cfg.lwsUserName,
      lwsEnableUpdateNotifications: cfg.lwsEnableUpdateNotifications,
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
      summarize: (b) => ({ result: (b as { result?: unknown })?.result, error: (b as { error?: unknown })?.error }),
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
