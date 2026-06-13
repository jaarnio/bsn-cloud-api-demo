import { Router } from 'express'
import type { Request, Response } from 'express'
import { bsnFetch } from '../bsnClient.ts'
import type { BsnFetchOptions } from '../bsnClient.ts'
import { AuthError, selectNetwork } from '../auth.ts'
import { withTrace } from '../trace.ts'

export const rdwsRouter = Router()

// Remote DWS calls go through the bsn.cloud WebSocket relay. Every call targets
// one player by serial via the destinationType/destinationName query params, and
// uses the same Bearer auth as the rest of the API (see bsnClient / players.ts).
const RDWS_BASE = 'https://ws.bsn.cloud/rest/v1'
// Offline players never answer; bound every call so the request can't hang.
const RDWS_TIMEOUT_MS = 25_000
const SERIAL_RE = /^[A-Za-z0-9_-]+$/

export interface RdwsCallOptions {
  /** HTTP method for the rDWS call (default GET). */
  method?: string
  /** Body object (sent as-is; rDWS expects an outer { data: {...} } wrapper). */
  body?: unknown
  /** Sanitized body to SHOW in the trace (defaults to `body`). Use to redact secrets. */
  traceReqBody?: unknown
  /** Extra query params beyond destinationType/destinationName. */
  query?: Record<string, string>
  /** Trace step label + annotation for the API-flow view. */
  step: string
  note?: string
  summarize?: (body: unknown) => unknown
}

/**
 * Make one authenticated Remote DWS call against a player and return its parsed
 * body. Builds the relay URL, selects the network, applies a timeout, and records
 * a sanitized trace entry. Throws AuthError on non-2xx so callers map status codes.
 */
export async function rdwsCall(
  endpoint: string,
  serial: string,
  network: string,
  opts: RdwsCallOptions,
): Promise<unknown> {
  await selectNetwork(network)
  const params = new URLSearchParams({
    destinationType: 'player',
    destinationName: serial,
    ...(opts.query ?? {}),
  })
  const url = `${RDWS_BASE}/${endpoint}/?${params.toString()}`

  const init: BsnFetchOptions = {
    network,
    method: opts.method ?? 'GET',
    signal: AbortSignal.timeout(RDWS_TIMEOUT_MS),
    trace: {
      step: opts.step,
      note: opts.note,
      summarize: opts.summarize,
      reqBody: opts.traceReqBody ?? opts.body,
    },
  }
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(opts.body)
  }

  const { ok, status, body } = await bsnFetch(url, init)
  if (!ok) {
    throw new AuthError(
      status,
      `rDWS ${endpoint} failed (${status}) — the player may be offline or unreachable.`,
    )
  }
  return body
}

/**
 * Validate the shared inputs every rDWS route needs: a clean serial (path param)
 * and a network (query param). Returns them, or writes a 400 and returns null.
 */
export function requireTarget(
  req: Request,
  res: Response,
): { serial: string; network: string } | null {
  const serial = String(req.params.serial)
  const network = String(req.query.network ?? '').trim()
  if (!network) {
    res.status(400).json({ error: 'A "network" query parameter is required.' })
    return null
  }
  if (!SERIAL_RE.test(serial)) {
    res.status(400).json({ error: 'Serial contains invalid characters.' })
    return null
  }
  return { serial, network }
}

export function handleError(res: Response, err: unknown) {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return res.status(504).json({ error: 'The player did not respond in time (likely offline).' })
  }
  if (err instanceof AuthError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502
    return res.status(status).json({ error: err.message, status: err.status })
  }
  return res.status(500).json({ error: (err as Error).message || 'Unexpected server error.' })
}

/** Coerce a request body into a plain object for safe field access. */
function asBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

/** rDWS responses wrap their payload in { data: { result } }; pull out the result. */
export function unwrap(body: unknown): unknown {
  const b = body as { data?: { result?: unknown } } | undefined
  return b?.data?.result ?? (b as { data?: unknown })?.data ?? body
}

// ─── Information ──────────────────────────────────────────────────────────────

/** GET /api/rdws/:serial/info?network=NAME — general player info. */
rdwsRouter.get('/:serial/info', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('info', t.serial, t.network, {
        step: 'Get player info (rDWS)',
        note: 'Remote DWS reads the player’s general info (model, firmware, network, uptime).',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ info: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

/** GET /api/rdws/:serial/time?network=NAME — the player's configured date/time. */
rdwsRouter.get('/:serial/time', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('time', t.serial, t.network, {
        step: 'Get player time (rDWS)',
        note: 'Remote DWS reads the player’s current date, time, and configured time zone.',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ time: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── Control ──────────────────────────────────────────────────────────────────

/** POST /api/rdws/:serial/reboot?network=NAME — reboot the player (PUT /control/reboot). */
rdwsRouter.post('/:serial/reboot', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('control/reboot', t.serial, t.network, {
        method: 'PUT',
        body: { data: {} },
        step: 'Reboot player (rDWS)',
        note: 'Remote DWS instructs the player to reboot now.',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

/** GET /api/rdws/:serial/dws-password?network=NAME — DWS password metadata (never the password). */
rdwsRouter.get('/:serial/dws-password', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('control/dws-password', t.serial, t.network, {
        step: 'Get DWS password status (rDWS)',
        note: 'Remote DWS reports whether a DWS password is set — it never returns the password.',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

/**
 * PUT /api/rdws/:serial/dws-password?network=NAME  body: { password, previousPassword? }
 * Sets the local DWS password. The password is redacted from the API-flow trace.
 */
rdwsRouter.put('/:serial/dws-password', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  const body = asBody(req.body)
  const password = String(body.password ?? '')
  const previousPassword = String(body.previousPassword ?? '')
  if (!password) return res.status(400).json({ error: 'A "password" is required.' })

  const reqBody = { data: { password, previous_password: previousPassword } }
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('control/dws-password', t.serial, t.network, {
        method: 'PUT',
        body: reqBody,
        traceReqBody: { data: { password: '••••••••', previous_password: '••••••••' } },
        step: 'Set DWS password (rDWS)',
        note: 'Remote DWS sets the local DWS password (redacted from this trace).',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

/** GET /api/rdws/:serial/local-dws?network=NAME — whether the local DWS is enabled. */
rdwsRouter.get('/:serial/local-dws', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('control/local-dws', t.serial, t.network, {
        step: 'Get local DWS state (rDWS)',
        note: 'Remote DWS reports whether the player’s local Diagnostic Web Server is enabled.',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

/** PUT /api/rdws/:serial/local-dws?network=NAME  body: { enable } — enable/disable local DWS. */
rdwsRouter.put('/:serial/local-dws', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  const enable = Boolean(asBody(req.body).enable)
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('control/local-dws', t.serial, t.network, {
        method: 'PUT',
        body: { data: { enable } },
        step: `${enable ? 'Enable' : 'Disable'} local DWS (rDWS)`,
        note: `Remote DWS ${enable ? 'enables' : 'disables'} the player’s local Diagnostic Web Server.`,
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ enable, result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── Logs ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/rdws/:serial/logs?network=NAME — the player's current log output.
 * `result` is one large newline-delimited string; the flow panel gets a size
 * summary (not the whole blob) while the panel shows the full text.
 */
rdwsRouter.get('/:serial/logs', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('logs', t.serial, t.network, {
        step: 'Get player logs (rDWS)',
        note: 'Remote DWS returns the player’s current log output as raw text.',
        summarize: (b) => {
          const s = typeof unwrap(b) === 'string' ? (unwrap(b) as string) : ''
          return { chars: s.length, lines: s ? s.split('\n').length : 0 }
        },
      }),
    )
    const logs = typeof unwrap(result) === 'string' ? (unwrap(result) as string) : ''
    res.json({ logs, trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── Storage ──────────────────────────────────────────────────────────────────

/** Normalize a storage path to URL-encoded segments (rejects ".." traversal). */
function encodePath(raw: string): string {
  const parts = raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.some((p) => p === '..')) throw new AuthError(400, 'Path may not contain "..".')
  return parts.map(encodeURIComponent).join('/')
}

/**
 * GET /api/rdws/:serial/files?network=NAME&path=sd
 * Lists a directory on the player's storage (read-only). Defaults to the SD card.
 */
rdwsRouter.get('/:serial/files', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  const path = String(req.query.path ?? 'sd').trim() || 'sd'
  let encoded: string
  try {
    encoded = encodePath(path)
  } catch (err) {
    return handleError(res, err)
  }
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall(`files/${encoded}`, t.serial, t.network, {
        step: 'List storage (rDWS)',
        note: `Remote DWS lists the directory "${path}" on the player's storage.`,
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ listing: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── Custom ───────────────────────────────────────────────────────────────────

/**
 * PUT /api/rdws/:serial/custom?network=NAME  body: { command }
 * Sends a custom command to the player (received by the autorun on UDP port 5000).
 */
rdwsRouter.put('/:serial/custom', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  const command = String(asBody(req.body).command ?? '')
  if (!command) return res.status(400).json({ error: 'A "command" is required.' })
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('custom', t.serial, t.network, {
        method: 'PUT',
        body: { data: { command, returnimmediately: true } },
        step: 'Send custom command (rDWS)',
        note: 'Remote DWS delivers a custom command to the player’s autorun (UDP port 5000).',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── Video ────────────────────────────────────────────────────────────────────

/** GET /api/rdws/:serial/video-mode?network=NAME — the currently active video mode. */
rdwsRouter.get('/:serial/video-mode', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('video-mode', t.serial, t.network, {
        step: 'Get video mode (rDWS)',
        note: 'Remote DWS reports the player’s currently active video output mode.',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ mode: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/** Shallow copy of an object with long strings (base64) replaced by a size marker. */
function stripBase64(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = typeof v === 'string' && v.length > 200 ? `[base64 ${v.length} chars]` : v
  }
  return out
}

/**
 * POST /api/rdws/:serial/snapshot?network=NAME — capture a screenshot of the player.
 * The base64 image is returned to the panel but stripped from the API-flow summary.
 */
rdwsRouter.post('/:serial/snapshot', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('snapshot', t.serial, t.network, {
        method: 'POST',
        body: { data: {} },
        step: 'Capture snapshot (rDWS)',
        note: 'Remote DWS captures a screenshot of what the player is currently showing.',
        summarize: (b) => stripBase64(unwrap(b)),
      }),
    )
    res.json({ snapshot: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── OS Update ────────────────────────────────────────────────────────────────

/**
 * GET /api/rdws/:serial/download-firmware?network=NAME&url=...
 * Instructs the player to download a firmware file from a public URL and apply it
 * (the player reboots into the update). Destructive — confirm in the UI first.
 */
rdwsRouter.get('/:serial/download-firmware', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  const url = String(req.query.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'A valid http(s) firmware "url" is required.' })
  }
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('download-firmware', t.serial, t.network, {
        query: { url },
        step: 'Download firmware (rDWS)',
        note: 'Remote DWS tells the player to download a firmware file and apply it (reboots).',
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})

// ─── Registry ─────────────────────────────────────────────────────────────────

/** GET /api/rdws/:serial/registry?network=NAME — the full player registry dump. */
rdwsRouter.get('/:serial/registry', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall('registry', t.serial, t.network, {
        step: 'Get registry (rDWS)',
        note: 'Remote DWS returns the player’s complete registry (all sections).',
        summarize: (b) => unwrap(b),
      }),
    )
    const value = (unwrap(result) as { value?: unknown })?.value ?? unwrap(result)
    res.json({ registry: value, trace })
  } catch (err) {
    handleError(res, err)
  }
})

/**
 * PUT /api/rdws/:serial/registry?network=NAME&section=..&key=..  body: { value }
 * Writes a single registry value, e.g. brightscript / debug / 1.
 */
rdwsRouter.put('/:serial/registry', async (req, res) => {
  const t = requireTarget(req, res)
  if (!t) return
  const section = String(req.query.section ?? '').trim()
  const key = String(req.query.key ?? '').trim()
  const value = String(asBody(req.body).value ?? '')
  if (!section || !key) {
    return res.status(400).json({ error: 'Both "section" and "key" are required.' })
  }
  const path = `registry/${encodeURIComponent(section)}/${encodeURIComponent(key)}`
  try {
    const { result, trace } = await withTrace(() =>
      rdwsCall(path, t.serial, t.network, {
        method: 'PUT',
        body: { data: { value } },
        step: 'Set registry value (rDWS)',
        note: `Remote DWS sets registry ${section}/${key} = "${value}".`,
        summarize: (b) => unwrap(b),
      }),
    )
    res.json({ result: unwrap(result), trace })
  } catch (err) {
    handleError(res, err)
  }
})
