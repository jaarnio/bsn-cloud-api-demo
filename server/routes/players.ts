import { Router } from 'express'
import { bsnFetch } from '../bsnClient.ts'
import { AuthError, selectNetwork } from '../auth.ts'
import { API_BASE } from '../config.ts'
import { withTrace } from '../trace.ts'

export const playersRouter = Router()

const RDWS_BASE = 'https://ws.bsn.cloud/rest/v1'
// A player is "online" if bsn.cloud heard from it within this window. Players
// heartbeat every few minutes, so 15 min tolerates a missed beat or two.
const ONLINE_WINDOW_MS = 15 * 60 * 1000
const REPROVISION_TIMEOUT_MS = 25_000

interface RawDevice {
  serial?: string
  model?: string
  family?: string
  settings?: { name?: string }
  status?: { health?: string; lastModifiedDate?: string }
}

/**
 * GET /api/players?network=NAME
 * Enumerates registered players in a network (native Devices resource) with a
 * derived online/offline flag based on bsn.cloud's last-contact timestamp.
 */
playersRouter.get('/', async (req, res) => {
  const network = String(req.query.network ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A "network" query parameter is required.' })
  try {
    const { result, trace } = await withTrace(async () => {
      await selectNetwork(network)
      const { ok, status, body } = await bsnFetch(`${API_BASE}/Devices/?pageSize=100`, {
        network,
        trace: {
          step: 'List players',
          note: 'Native Devices resource — registered players in this network, with last-contact time.',
        },
      })
      if (!ok) throw new AuthError(status, `Failed to list players (${status}).`)
      const items = ((body as { items?: RawDevice[] })?.items ?? [])
      const now = Date.now()
      return items
        .map((d) => {
          const last = d.status?.lastModifiedDate
          const lastMs = last ? Date.parse(last) : NaN
          const online = Number.isFinite(lastMs) ? now - lastMs < ONLINE_WINDOW_MS : false
          return {
            serial: d.serial,
            name: d.settings?.name,
            model: d.model,
            family: d.family,
            health: d.status?.health,
            online,
            lastContact: last,
          }
        })
        .sort((a, b) => String(a.serial).localeCompare(String(b.serial)))
    })
    return res.json({ network, players: result, trace })
  } catch (err) {
    return handleError(res, err)
  }
})

/**
 * POST /api/players/:serial/reprovision?network=NAME
 * Instructs the player (via Remote DWS) to re-pull its provision record + setup
 * and reboot. DESTRUCTIVE: clears storage. Only reaches online players.
 */
playersRouter.post('/:serial/reprovision', async (req, res) => {
  const serial = String(req.params.serial)
  const network = String(req.query.network ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A "network" query parameter is required.' })
  if (!/^[A-Za-z0-9_-]+$/.test(serial)) {
    return res.status(400).json({ error: 'Serial contains invalid characters.' })
  }
  try {
    const { result, trace } = await withTrace(async () => {
      await selectNetwork(network)
      const url = `${RDWS_BASE}/re-provision/?destinationType=player&destinationName=${encodeURIComponent(serial)}`
      const { ok, status } = await bsnFetch(url, {
        network,
        signal: AbortSignal.timeout(REPROVISION_TIMEOUT_MS),
        trace: {
          step: 'Reprovision player (rDWS)',
          note: 'Remote DWS tells the player to re-pull its provision record + setup, then reboot (clears storage).',
        },
      })
      if (!ok) {
        throw new AuthError(status, `Reprovision failed (${status}) — the player may be offline or unreachable.`)
      }
      return { reprovisioned: true, serial }
    })
    return res.json({ ...result, trace })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Reprovision timed out — the player did not respond (likely offline).' })
    }
    return handleError(res, err)
  }
})

function handleError(res: import('express').Response, err: unknown) {
  if (err instanceof AuthError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502
    return res.status(status).json({ error: err.message, status: err.status })
  }
  return res.status(500).json({ error: (err as Error).message || 'Unexpected server error.' })
}
