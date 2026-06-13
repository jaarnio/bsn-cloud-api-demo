import { Router } from 'express'
import { bsnFetch } from '../bsnClient.ts'
import { AuthError, selectNetwork } from '../auth.ts'
import { PROVISION_BASE } from '../config.ts'
import { withTrace } from '../trace.ts'
import { getUsername } from '../account.ts'

export const provisionsRouter = Router()

interface ProvisionBody {
  network?: string
  serial?: string
  name?: string
  desc?: string
  setupId?: string
  setupName?: string
}

/**
 * POST /api/provisions
 * Creates a B-Deploy provision record binding a serial -> network -> setup
 * (PRD feature 5). Body: { network, serial, name?, desc?, setupId?, setupName }.
 */
provisionsRouter.post('/', async (req, res) => {
  const b = (req.body ?? {}) as ProvisionBody
  const network = String(b.network ?? '').trim()
  const serial = String(b.serial ?? '').trim()
  const setupName = String(b.setupName ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A target "network" is required.' })
  if (!serial) return res.status(400).json({ error: 'A "serial" is required.' })
  if (!/^[A-Za-z0-9_-]+$/.test(serial)) return res.status(400).json({ error: 'Serial contains invalid characters.' })
  if (!setupName) return res.status(400).json({ error: 'A setup must be selected.' })

  try {
    const { result, trace } = await withTrace(async () => {
      await selectNetwork(network)
      const username = await getUsername()
      const record = {
        username,
        serial,
        networkName: network,
        name: b.name ?? undefined,
        desc: b.desc ?? undefined,
        setupId: b.setupId ?? undefined,
        setupName,
      }
      const createRes = await bsnFetch(`${PROVISION_BASE}/rest-device/v2/device`, {
        method: 'POST',
        network,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        trace: {
          step: 'Create provision record',
          note: 'Binds the serial to the network + setup; returns the new record id.',
          reqBody: record,
          summarize: (x) => ({ id: (x as { result?: unknown })?.result, error: (x as { error?: unknown })?.error }),
        },
      })
      if (!createRes.ok) {
        const detail = (createRes.body as { error?: unknown })?.error
        throw new AuthError(
          createRes.status,
          `Create failed (${createRes.status})${detail ? `: ${detail}` : ''}. The serial may already be registered (in this or another network).`,
        )
      }
      return { created: true, id: (createRes.body as { result?: string })?.result ?? null, serial, network, setupName }
    })
    return res.json({ ...result, trace })
  } catch (err) {
    return handleError(res, err)
  }
})

/** GET /api/provisions?network=NAME — list provision records in a network. */
provisionsRouter.get('/', async (req, res) => {
  const network = String(req.query.network ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A "network" query parameter is required.' })
  try {
    const { result, trace } = await withTrace(async () => {
      await selectNetwork(network)
      const players = await fetchPlayers(network)
      return players.map((p) => ({
        id: p._id,
        serial: p.serial,
        name: p.name,
        desc: p.desc,
        setupName: p.setupName,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }))
    })
    return res.json({ network, provisions: result, trace })
  } catch (err) {
    return handleError(res, err)
  }
})

/** PUT /api/provisions/:id — edit a provision record's name/desc/setup. */
provisionsRouter.put('/:id', async (req, res) => {
  const id = String(req.params.id)
  const b = (req.body ?? {}) as ProvisionBody
  const network = String(b.network ?? '').trim()
  const serial = String(b.serial ?? '').trim()
  const setupName = String(b.setupName ?? '').trim()
  if (!network || !serial || !setupName) {
    return res.status(400).json({ error: 'network, serial and a setup are required.' })
  }
  try {
    const { result, trace } = await withTrace(async () => {
      await selectNetwork(network)
      const username = await getUsername()
      const record = {
        _id: id,
        username,
        serial,
        networkName: network,
        name: b.name ?? undefined,
        desc: b.desc ?? undefined,
        setupId: b.setupId ?? undefined,
        setupName,
      }
      const putRes = await bsnFetch(`${PROVISION_BASE}/rest-device/v2/device/`, {
        method: 'PUT',
        network,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        trace: {
          step: 'Update provision record',
          note: 'Modifies the record (same _id). A physical reprovision is needed to apply it to the player.',
          reqBody: record,
          summarize: (x) => ({ result: (x as { result?: unknown })?.result, error: (x as { error?: unknown })?.error }),
        },
      })
      if (!putRes.ok) {
        const detail = (putRes.body as { error?: unknown })?.error
        throw new AuthError(putRes.status, `Update failed (${putRes.status})${detail ? `: ${detail}` : ''}.`)
      }
      return { updated: true, id, serial, network, setupName }
    })
    return res.json({ ...result, trace })
  } catch (err) {
    return handleError(res, err)
  }
})

/** DELETE /api/provisions/:id?network=NAME — remove a provision record. */
provisionsRouter.delete('/:id', async (req, res) => {
  const id = String(req.params.id)
  const network = String(req.query.network ?? '').trim()
  if (!network) return res.status(400).json({ error: 'A "network" query parameter is required.' })
  try {
    const { result, trace } = await withTrace(async () => {
      await selectNetwork(network)
      const { ok, status } = await bsnFetch(
        `${PROVISION_BASE}/rest-device/v2/device/?_id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          network,
          trace: {
            step: 'Delete provision record',
            note: 'Removes the provision record by _id (only the owning network admin can).',
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

interface Player {
  _id?: string
  serial?: string
  name?: string
  desc?: string
  setupName?: string
  createdAt?: string
  updatedAt?: string
}

async function fetchPlayers(network: string): Promise<Player[]> {
  const url =
    `${PROVISION_BASE}/rest-device/v2/device/?query[networkname]=${encodeURIComponent(network)}` +
    `&sort[serial]=1&page[pagenum]=1&page[pagesize]=100`
  const { ok, status, body } = await bsnFetch(url, {
    network,
    trace: {
      step: 'List provision records',
      note: 'Lists the B-Deploy provision records in this network.',
      summarize: (b) => ({ total: (b as { result?: { total?: number } })?.result?.total }),
    },
  })
  if (!ok) throw new AuthError(status, `Failed to list provision records (${status}).`)
  const players = (body as { result?: { players?: Player[] } })?.result?.players
  return Array.isArray(players) ? players : []
}

function handleError(res: import('express').Response, err: unknown) {
  if (err instanceof AuthError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502
    return res.status(status).json({ error: err.message, status: err.status })
  }
  return res.status(500).json({ error: (err as Error).message || 'Unexpected server error.' })
}
