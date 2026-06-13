/**
 * Phase 3 verification: create setups exercising services fill-in, debugging,
 * OS update, and remote screenshots; GET back and assert; then DELETE.
 * Also probes which remoteSnapshotScreenOrientation casing the API stores.
 *
 *   npx tsx scripts/verify-services.ts [networkName]
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

let pass = 0
let fail = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`)
  }
}

async function scenario(label: string, payload: Record<string, unknown>, assert: (inner: any) => void) {
  const packageName = `ZZSvc-${label}-${stamp}`
  console.log(`\n[${label}]`)
  const res = await fetch(`${base}/api/setups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network, packageName, setupType: 'bsn', ...payload }),
  })
  const created = await res.json()
  if (!res.ok) {
    fail++
    console.log(`  ✗ create FAILED (${res.status}): ${created.error}`)
    return
  }
  const raw = await rawGet(packageName)
  if (!raw) {
    fail++
    console.log('  ✗ GET-back failed')
    return
  }
  assert(JSON.parse(String(raw.setupJson)))
  const del = await fetch(
    `${base}/api/setups/${encodeURIComponent(String(raw._id))}?network=${encodeURIComponent(network)}`,
    { method: 'DELETE' },
  )
  check('cleanup deleted', del.ok)
}

async function main() {
  await selectNetwork(network)
  console.log(`Phase 3 services verification in "${network}"`)

  await scenario(
    'services',
    {
      dwsEnabled: true,
      dwsPassword: 'dws-secret',
      remoteDwsEnabled: true,
      lwsEnabled: true,
      lwsUserName: 'admin',
      lwsPassword: 'lws-secret',
      lwsConfig: 'content',
      lwsEnableUpdateNotifications: true,
      enableSerialDebugging: true,
      enableSystemLogDebugging: true,
      firmwareUpdateType: 'newer',
    },
    (inner) => {
      check('dwsEnabled', inner.dwsEnabled === true, inner.dwsEnabled)
      check('remoteDwsEnabled', inner.remoteDwsEnabled === true, inner.remoteDwsEnabled)
      check('lwsConfig=content', inner.lwsConfig === 'content', inner.lwsConfig)
      check('serial debugging', inner.enableSerialDebugging === true, inner.enableSerialDebugging)
      check('system log debugging', inner.enableSystemLogDebugging === true, inner.enableSystemLogDebugging)
      check('firmwareUpdateType=newer', inner.firmwareUpdateType === 'newer', inner.firmwareUpdateType)
      check('dws password stored (round-trips back, not blank)', Boolean(inner.dwsPassword), inner.dwsPassword)
    },
  )

  await scenario(
    'snapshots',
    {
      enableRemoteSnapshot: true,
      remoteSnapshotInterval: 30,
      remoteSnapshotMaxImages: 8,
      remoteSnapshotJpegQualityLevel: 70,
      remoteSnapshotScreenOrientation: 'Landscape',
    },
    (inner) => {
      check('enableRemoteSnapshot', inner.enableRemoteSnapshot === true, inner.enableRemoteSnapshot)
      check('interval=30', inner.remoteSnapshotInterval === 30, inner.remoteSnapshotInterval)
      check('maxImages=8', inner.remoteSnapshotMaxImages === 8, inner.remoteSnapshotMaxImages)
      check('jpegQuality=70', inner.remoteSnapshotJpegQualityLevel === 70, inner.remoteSnapshotJpegQualityLevel)
      check('orientation Landscape', inner.remoteSnapshotScreenOrientation === 'Landscape', inner.remoteSnapshotScreenOrientation)
    },
  )

  // Probe: does the API keep our portrait casing, or normalize it?
  await scenario(
    'orient-portrait',
    { enableRemoteSnapshot: true, remoteSnapshotScreenOrientation: 'PortraitBottomRight' },
    (inner) => {
      console.log(`    [probe] stored orientation = ${JSON.stringify(inner.remoteSnapshotScreenOrientation)}`)
    },
  )

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
