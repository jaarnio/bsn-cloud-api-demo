import { AUTH_URL, API_BASE, config } from './config.ts'
import { record, shortUrl } from './trace.ts'

/**
 * Token lifecycle for the client-credentials flow (see bdeploy-prd.md):
 *   - access tokens live ~5 min 30 s; we refresh early using a safety margin
 *   - refresh tokens are NOT supported — re-POST credentials on expiry
 *   - the network session has a hard 24 h ceiling
 *
 * Network selection is SESSION state on the token: selecting a network applies
 * to subsequent calls until another is selected (or the token is replaced).
 * The credentials have account-wide scope, so the app can select any network
 * returned by GET /self/networks. Device lookup sweeps all of them, so network
 * selection is decoupled from token acquisition here.
 */
interface TokenCache {
  accessToken: string | null
  expiresAt: number // epoch ms; refresh before this
  sessionStartedAt: number // epoch ms of first auth in the current 24h session
  selectedNetwork: string | null // network currently selected on this token
  lastScope: string | null // scope string from the last token response
}

export interface Network {
  id: number
  name: string
  displayName?: string
}

const TOKEN_SAFETY_MARGIN_MS = 30_000 // refresh 30s before the live expires_in
const SESSION_CEILING_MS = 24 * 60 * 60 * 1000 // 24h network session ceiling

const cache: TokenCache = {
  accessToken: null,
  expiresAt: 0,
  sessionStartedAt: 0,
  selectedNetwork: null,
  lastScope: null,
}

let networksCache: Network[] | null = null

function basicAuthHeader(): string {
  const raw = `${config.clientId}:${config.clientSecret}`
  return `Basic ${Buffer.from(raw).toString('base64')}`
}

/** Force a fresh token (and therefore a fresh network selection) next call. */
export function invalidate(): void {
  cache.accessToken = null
  cache.expiresAt = 0
  cache.selectedNetwork = null
}

async function fetchToken(): Promise<void> {
  const started = Date.now()
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    record({
      step: 'Authenticate',
      method: 'POST',
      url: shortUrl(AUTH_URL),
      note: 'Client-credentials token request failed',
      status: res.status,
      ms: Date.now() - started,
    })
    throw new AuthError(res.status, `Token request failed (${res.status}). ${detail}`.trim())
  }

  const data = (await res.json()) as { access_token: string; expires_in: number; scope?: string }
  const now = Date.now()
  cache.accessToken = data.access_token
  cache.lastScope = data.scope ?? null
  // Read expires_in from the live response rather than hard-coding 5m30s.
  cache.expiresAt = now + data.expires_in * 1000 - TOKEN_SAFETY_MARGIN_MS
  cache.selectedNetwork = null // a new token has no network selected
  if (!cache.sessionStartedAt || now - cache.sessionStartedAt >= SESSION_CEILING_MS) {
    cache.sessionStartedAt = now
  }

  // Sanitized: client_id + secret go via the Basic header (obscured); the
  // response summary deliberately omits access_token.
  record({
    step: 'Authenticate',
    method: 'POST',
    url: shortUrl(AUTH_URL),
    note: 'Sends client_id + secret via HTTP Basic (obscured). No refresh token — re-auth on expiry.',
    reqHeaders: { Authorization: 'Basic ••••••••', 'Content-Type': 'application/x-www-form-urlencoded' },
    reqBody: 'grant_type=client_credentials',
    status: res.status,
    ms: now - started,
    response: { access_token: '••••••••', expires_in: data.expires_in, scope: data.scope },
  })
}

/**
 * Returns a valid bearer token, refreshing as needed. Honors the 24h session
 * ceiling by forcing a full re-auth past it. Does NOT select a network — call
 * selectNetwork() for that.
 */
export async function getValidToken(): Promise<string> {
  const now = Date.now()
  const sessionExpired =
    cache.sessionStartedAt && now - cache.sessionStartedAt >= SESSION_CEILING_MS

  if (!cache.accessToken || now >= cache.expiresAt || sessionExpired) {
    if (sessionExpired) cache.sessionStartedAt = 0
    await fetchToken()
  }
  return cache.accessToken as string
}

/**
 * PUT self/session/network to select a network for subsequent calls. No-op if
 * that network is already selected on the current token. Expects 204.
 */
export async function selectNetwork(name: string): Promise<void> {
  if (cache.selectedNetwork === name) return
  const token = await getValidToken()
  const started = Date.now()
  const url = `${API_BASE}/self/session/network`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  record({
    step: 'Select network',
    method: 'PUT',
    url: shortUrl(url),
    note: 'Required after every new token. Scopes the session to one network; expects 204.',
    reqHeaders: { Authorization: 'Bearer ••••••••', 'Content-Type': 'application/json' },
    reqBody: { name },
    status: res.status,
    ms: Date.now() - started,
  })
  if (res.status === 204) {
    cache.selectedNetwork = name
    return
  }
  const detail = await res.text().catch(() => '')
  throw new AuthError(
    res.status,
    `Network selection failed (${res.status}) for "${name}". ${detail}`.trim(),
  )
}

/** The network currently selected on the live token (null if none / re-authed). */
export function currentNetwork(): string | null {
  return cache.selectedNetwork
}

/** List the networks the account can access (GET /self/networks). Cached per session. */
export async function getNetworks(force = false): Promise<Network[]> {
  if (networksCache && !force) {
    record({
      step: 'List networks',
      method: 'GET',
      url: shortUrl(`${API_BASE}/self/networks`),
      note: 'Networks the account can access (cached this session). The lookup searches all of them.',
      response: { count: networksCache.length, cached: true },
    })
    return networksCache
  }
  const token = await getValidToken()
  const started = Date.now()
  const url = `${API_BASE}/self/networks`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    record({
      step: 'List networks',
      method: 'GET',
      url: shortUrl(url),
      status: res.status,
      ms: Date.now() - started,
    })
    throw new AuthError(res.status, `Failed to list networks (${res.status}). ${detail}`.trim())
  }
  const raw = (await res.json()) as Array<{ id: number; name: string; displayName?: string }>
  networksCache = raw.map((n) => ({ id: n.id, name: n.name, displayName: n.displayName }))
  record({
    step: 'List networks',
    method: 'GET',
    url: shortUrl(url),
    note: 'Lists every network the account can access — the lookup searches all of them.',
    reqHeaders: { Authorization: 'Bearer ••••••••' },
    status: res.status,
    ms: Date.now() - started,
    response: { count: networksCache.length },
  })
  return networksCache
}

export function getStatus() {
  const now = Date.now()
  const tokenValid = Boolean(cache.accessToken) && now < cache.expiresAt
  return {
    tokenValid,
    networkCount: networksCache?.length ?? null,
    expiresInSeconds: tokenValid ? Math.max(0, Math.round((cache.expiresAt - now) / 1000)) : 0,
    selectedNetwork: cache.selectedNetwork,
    scope: cache.lastScope,
  }
}

/** Carries the upstream HTTP status so routes can map it to friendly messages. */
export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}
