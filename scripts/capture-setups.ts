/**
 * One-off capture: pull raw v3 setupJson for the Sample* reference setups in a
 * network, scrub secrets, and write fixtures under server/fixtures/. Also prints
 * a casing/shape analysis so we can lock the canonical default's key style.
 *
 *   npx tsx scripts/capture-setups.ts [networkName]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { selectNetwork } from '../server/auth.ts'
import { bsnFetch } from '../server/bsnClient.ts'
import { PROVISION_BASE } from '../server/config.ts'

const network = process.argv[2] ?? 'alliancelab-sandbox-01'
const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(here, '..', 'server', 'fixtures')

/** Recursively blank password-ish values + drop the token entity, keep all keys. */
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase()
      if (lk === '_id') continue
      if (lk.includes('password') || lk.includes('passphrase')) {
        out[k] = v === '' || v == null ? v : '••scrubbed••'
      } else if (lk === 'bsndeviceregistrationtokenentity' || lk === 'token') {
        out[k] = '••scrubbed••'
      } else {
        out[k] = scrub(v)
      }
    }
    return out
  }
  return value
}

function topKeys(o: unknown): string[] {
  return o && typeof o === 'object' ? Object.keys(o as object).sort() : []
}

async function main() {
  await selectNetwork(network)
  const url = `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`
  const { ok, status, body } = await bsnFetch(url, { network })
  if (!ok) throw new Error(`list failed (${status})`)
  const list = Array.isArray(body) ? body : ((body as { result?: unknown[] })?.result ?? [])

  mkdirSync(fixturesDir, { recursive: true })
  const analysis: Record<string, unknown> = {}

  for (const raw of list as Array<Record<string, unknown>>) {
    const name = String(raw.packageName ?? raw.packagename ?? '')
    if (!name.toLowerCase().startsWith('sample')) continue
    const inner = JSON.parse(String(raw.setupJson)) as Record<string, unknown>
    const scrubbed = scrub(inner) as Record<string, unknown>
    const file = join(fixturesDir, `${name.toLowerCase()}.json`)
    writeFileSync(file, JSON.stringify(scrubbed, null, 2) + '\n')

    const bDeploy = (inner.bDeploy ?? (inner as Record<string, unknown>).bdeploy) as Record<string, unknown> | undefined
    const net = (inner.network ?? (inner as Record<string, unknown>).Network) as Record<string, unknown> | undefined
    const interfaces = (net?.interfaces ?? net?.Interfaces) as unknown[] | undefined
    analysis[name] = {
      setupType: inner.setupType ?? (inner as Record<string, unknown>).setuptype,
      bDeployUrl: bDeploy?.url ?? null,
      hasNetwork: Boolean(net),
      interfaceTypes: Array.isArray(interfaces)
        ? interfaces.map((i) => (i as Record<string, unknown>)?.type)
        : null,
      inheritNetworkProperties:
        inner.inheritNetworkProperties ?? (inner as Record<string, unknown>).inheritnetworkproperties,
      topLevelKeyCount: topKeys(inner).length,
    }
  }

  // Casing probe: are top-level keys camelCase or all-lowercase?
  const firstName = Object.keys(analysis)[0]
  const firstInner = JSON.parse(
    String((list as Array<Record<string, unknown>>).find((r) => String(r.packageName) === firstName)?.setupJson),
  )
  const keys = topKeys(firstInner)
  const camel = keys.filter((k) => /[A-Z]/.test(k))
  console.log(JSON.stringify({ network, captured: Object.keys(analysis), analysis }, null, 2))
  console.log('\n--- top-level keys (first sample) ---')
  console.log(keys.join(', '))
  console.log(`\ncamelCase keys present: ${camel.length}/${keys.length}`, camel.slice(0, 12))
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
