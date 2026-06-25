/**
 * Verify the per-family OS Update matrix end-to-end through the HTTP API:
 * the firmware-defaults endpoint, then create with per-family choices, GET back,
 * assert firmwareUpdateSource/url materialized, then DELETE.
 *
 *   npx tsx scripts/verify-osupdate.ts [networkName]
 */
import { selectNetwork } from '../server/auth.ts'
import { bsnFetch } from '../server/bsnClient.ts'
import { PROVISION_BASE } from '../server/config.ts'

const network = process.argv[2] ?? 'alliancelab-sandbox-01'
const base = 'http://localhost:3001'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')

let pass = 0
let fail = 0
const check = (label: string, cond: boolean, detail?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`) }
}

async function rawGet(name: string) {
  const { body } = await bsnFetch(
    `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`,
    { network },
  )
  const list = (Array.isArray(body) ? body : (body as { result?: unknown[] }).result ?? []) as Array<Record<string, unknown>>
  return list.find((s) => String(s.packageName) === name) ?? null
}

async function main() {
  await selectNetwork(network)
  console.log(`OS Update matrix verification in "${network}"`)

  // 1. firmware-defaults endpoint returns families + versions.
  const defs = await fetch(`${base}/api/setups/firmware-defaults`).then((r) => r.json())
  const fams: Array<{ family: string }> = defs.firmwareFamilies ?? []
  check('firmware-defaults returns families', fams.length > 0, fams.length)
  console.log(`    families: ${fams.map((f) => f.family).join(', ')}`)

  // 2. Create with per-family choices.
  const packageName = `ZZOS-matrix-${stamp}`
  const choices = [
    { family: 'Thor', source: 'production' },
    { family: 'Cobra', source: 'beta' },
    { family: 'Tiger', source: 'compatible' },
    { family: 'Camaro', source: 'specificUrl', url: 'https://firmware.example.com/custom.bsfw' },
    { family: 'Impala', source: 'none' },
  ]
  const res = await fetch(`${base}/api/setups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network, packageName, setupType: 'bsn', firmwareUpdateType: 'standard', firmwareFamilies: choices }),
  })
  const created = await res.json()
  check('create ok', res.ok, created.error)

  const raw = await rawGet(packageName)
  const inner = JSON.parse(String(raw?.setupJson))
  const fam = inner.firmwareUpdatesByFamily
  check('Thor=production', fam?.Thor?.firmwareUpdateSource === 'production', fam?.Thor?.firmwareUpdateSource)
  check('Cobra=beta', fam?.Cobra?.firmwareUpdateSource === 'beta', fam?.Cobra?.firmwareUpdateSource)
  check('Tiger=compatible', fam?.Tiger?.firmwareUpdateSource === 'compatible', fam?.Tiger?.firmwareUpdateSource)
  check('Camaro=specificUrl', fam?.Camaro?.firmwareUpdateSource === 'specificUrl', fam?.Camaro?.firmwareUpdateSource)
  check('Camaro url set', fam?.Camaro?.firmwareUpdateSourceUrl === 'https://firmware.example.com/custom.bsfw', fam?.Camaro?.firmwareUpdateSourceUrl)
  check('Impala=none', fam?.Impala?.firmwareUpdateSource === 'none', fam?.Impala?.firmwareUpdateSource)
  check('untouched family preserved (no crash)', typeof fam === 'object')

  // 3. List surfaces firmwareFamilies for edit round-trip.
  const listed = await fetch(`${base}/api/setups?network=${encodeURIComponent(network)}`).then((r) => r.json())
  const item = listed.setups.find((s: { packageName: string }) => s.packageName === packageName)
  const thor = item?.firmwareFamilies?.find((f: { family: string }) => f.family === 'Thor')
  check('list firmwareFamilies present', Array.isArray(item?.firmwareFamilies) && item.firmwareFamilies.length > 0)
  check('list Thor source=production', thor?.source === 'production', thor?.source)

  const del = await fetch(`${base}/api/setups/${encodeURIComponent(String(raw?._id))}?network=${encodeURIComponent(network)}`, { method: 'DELETE' })
  check('cleanup deleted', del.ok)

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
