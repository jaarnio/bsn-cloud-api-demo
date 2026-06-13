/**
 * Phase 1 verification: drive the real create path (POST /api/setups, which now
 * uses the owned buildSetupEntity) against a sandbox network, GET the entity
 * back to confirm it materialized, then DELETE it. Cleans up after itself.
 *
 *   npx tsx scripts/verify-create.ts [networkName]
 *
 * Requires the proxy running on :3001 (npm run dev:server).
 */
import { selectNetwork } from '../server/auth.ts'
import { bsnFetch } from '../server/bsnClient.ts'
import { PROVISION_BASE } from '../server/config.ts'

const network = process.argv[2] ?? 'alliancelab-sandbox-01'
const base = 'http://localhost:3001'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')

async function rawGet(name: string): Promise<Record<string, unknown> | null> {
  const { body } = await bsnFetch(
    `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`,
    { network },
  )
  const list = (Array.isArray(body) ? body : (body as { result?: unknown[] })?.result ?? []) as Array<
    Record<string, unknown>
  >
  return list.find((s) => String(s.packageName) === name) ?? null
}

async function createOne(setupType: string) {
  const packageName = `ZZVerify-${setupType}-${stamp}`
  const createRes = await fetch(`${base}/api/setups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network,
      packageName,
      setupType,
      deviceName: 'verify-device',
      timeZone: 'PST',
      appUrl: setupType === 'partnerApplication' ? 'http://verify.partner.com/autorun.zip' : undefined,
    }),
  })
  const created = await createRes.json()
  if (!createRes.ok) {
    console.log(`  ❌ create ${setupType} FAILED (${createRes.status}): ${created.error}`)
    return
  }
  console.log(`  ✓ create ${setupType}: setupId=${created.setupId} basedOn=${created.basedOn}`)

  // GET it back and inspect the materialized entity.
  const raw = await rawGet(packageName)
  if (!raw) {
    console.log('  ❌ could not GET the new setup back')
    return
  }
  const inner = JSON.parse(String(raw.setupJson)) as Record<string, unknown>
  const bDeploy = inner.bDeploy as Record<string, unknown>
  const fw = inner.firmwareUpdatesByFamily as Record<string, unknown> | undefined
  console.log(
    `    round-trip: setupType=${inner.setupType} bDeploy.username=${bDeploy?.username} ` +
      `client=${bDeploy?.client} url=${JSON.stringify(bDeploy?.url)} ` +
      `bsnGroupName=${inner.bsnGroupName} version=${inner.version} ` +
      `topKeys=${Object.keys(inner).length} hasNetwork=${Boolean(inner.network)} ` +
      `fwFamilies=${fw ? Object.keys(fw).length : 0} ` +
      `token=${Boolean(inner.bsnDeviceRegistrationTokenEntity)}`,
  )

  // DELETE (cleanup).
  const delRes = await fetch(
    `${base}/api/setups/${encodeURIComponent(String(raw._id))}?network=${encodeURIComponent(network)}`,
    { method: 'DELETE' },
  )
  console.log(`    ${delRes.ok ? '✓ deleted' : '❌ delete FAILED ' + delRes.status} (id ${raw._id})`)
}

async function main() {
  await selectNetwork(network)
  console.log(`Verifying owned-schema create in "${network}"\n`)
  for (const t of ['lfn', 'bsn', 'standalone', 'partnerApplication']) {
    await createOne(t)
  }
  console.log('\nDone.')
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
