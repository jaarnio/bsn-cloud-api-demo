/**
 * Probe: how does the API persist per-family OS-update choices? Create a setup
 * with firmwareUpdatesByFamily[*].firmwareUpdateSource set to candidate values,
 * read it back, and report what stuck. Data-gathering only; deletes after.
 *
 *   npx tsx scripts/probe-osupdate.ts [networkName]
 */
import { selectNetwork } from '../server/auth.ts'
import { bsnFetch } from '../server/bsnClient.ts'
import { getUsername } from '../server/account.ts'
import { buildSetupEntity } from '../server/setupTemplate.ts'
import { API_BASE, PROVISION_BASE } from '../server/config.ts'

const network = process.argv[2] ?? 'alliancelab-sandbox-01'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const packageName = `ZZOS-probe-${stamp}`

async function main() {
  await selectNetwork(network)
  const username = await getUsername()
  const entity = buildSetupEntity({ network, packageName, username, setupType: 'bsn' })

  // Candidate source values per family.
  const fam = entity.firmwareUpdatesByFamily as Record<string, Record<string, unknown>>
  const candidates: Record<string, { source: string; url?: string }> = {
    Thor: { source: 'production' },
    Cobra: { source: 'beta' },
    Tiger: { source: 'compatible' },
    Camaro: { source: 'url', url: 'https://firmware.example.com/custom.bsfw' },
    Impala: { source: 'none' },
  }
  for (const [k, v] of Object.entries(candidates)) {
    if (!fam[k]) continue
    fam[k].firmwareUpdateSource = v.source
    if (v.url) fam[k].firmwareUpdateSourceUrl = v.url
  }

  // Mint token + embed (mirrors createSetup).
  const tokenRes = await bsnFetch(`${API_BASE}/Provisioning/Setups/Tokens/`, { method: 'POST', network })
  const token = tokenRes.body as Record<string, unknown>
  entity.bsnDeviceRegistrationTokenEntity = token

  const createRes = await bsnFetch(`${PROVISION_BASE}/rest-setup/v3/setup`, {
    method: 'POST',
    network,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entity),
  })
  if (!createRes.ok) {
    console.log('create failed', createRes.status, createRes.body)
    process.exit(1)
  }
  const id = (createRes.body as { result?: string }).result
  console.log('created', id)

  // Read back.
  const { body } = await bsnFetch(
    `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`,
    { network },
  )
  const list = (Array.isArray(body) ? body : (body as { result?: unknown[] }).result ?? []) as Array<
    Record<string, unknown>
  >
  const raw = list.find((s) => String(s.packageName) === packageName)
  const inner = JSON.parse(String(raw?.setupJson))
  const back = inner.firmwareUpdatesByFamily as Record<string, Record<string, unknown>>
  console.log('\nPer-family after round-trip:')
  for (const k of Object.keys(candidates)) {
    const f = back[k] ?? {}
    console.log(
      `  ${k}: source=${JSON.stringify(f.firmwareUpdateSource)} ` +
        `version=${JSON.stringify(f.firmwareUpdateVersion)} ` +
        `url=${JSON.stringify(f.firmwareUpdateSourceUrl)}`,
    )
  }

  // Cleanup.
  await bsnFetch(`${PROVISION_BASE}/rest-setup/v3/setup/?_id=${encodeURIComponent(String(raw?._id))}`, {
    method: 'DELETE',
    network,
  })
  console.log('\ndeleted', raw?._id)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
