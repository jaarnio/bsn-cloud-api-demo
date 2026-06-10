import express from 'express'
import { config } from './config.ts'
import { getValidToken, getNetworks, getStatus, selectNetwork, invalidate } from './auth.ts'
import { withTrace } from './trace.ts'
import { devicesRouter } from './routes/devices.ts'
import { setupsRouter } from './routes/setups.ts'
import { provisionsRouter } from './routes/provisions.ts'
import { playersRouter } from './routes/players.ts'

const app = express()
app.use(express.json())

/**
 * Health check: confirms the proxy can acquire a token and enumerate the
 * account's networks. Returns { ok, tokenValid, networkCount, ... }.
 */
app.get('/api/health', async (_req, res) => {
  try {
    await getValidToken()
    const networks = await getNetworks()
    res.json({ ok: true, ...getStatus(), networkCount: networks.length })
  } catch (err) {
    res.status(502).json({ ok: false, error: (err as Error).message, ...getStatus() })
  }
})

/**
 * Demonstrates the full auth cycle live for the Authentication tab: forces a
 * fresh token (no refresh tokens exist), then selects the default network.
 * Returns token status + the sanitized API-flow trace of those two calls.
 */
app.post('/api/auth/run', async (_req, res) => {
  try {
    const { trace } = await withTrace(async () => {
      invalidate() // drop any cached token so the token POST is shown live
      await getValidToken()
      await selectNetwork(config.networkName)
    })
    res.json({ ...getStatus(), network: config.networkName, trace })
  } catch (err) {
    res.status(502).json({ error: (err as Error).message, ...getStatus() })
  }
})

/** Networks the account can access — for write-tab dropdowns. */
app.get('/api/networks', async (_req, res) => {
  try {
    const networks = await getNetworks()
    res.json({ networks: networks.map((n) => ({ id: n.id, name: n.name })) })
  } catch (err) {
    res.status(502).json({ error: (err as Error).message })
  }
})

app.use('/api/devices', devicesRouter)
app.use('/api/setups', setupsRouter)
app.use('/api/provisions', provisionsRouter)
app.use('/api/players', playersRouter)

app.listen(config.port, () => {
  console.log(`[bdeploy-demo] proxy listening on http://localhost:${config.port}`)
})
