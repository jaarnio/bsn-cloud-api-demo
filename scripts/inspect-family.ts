/**
 * Inspect a setup's per-family OS-update selections.
 *   npx tsx scripts/inspect-family.ts "<packageName>" [networkName]
 */
import { selectNetwork } from '../server/auth.ts'
import { bsnFetch } from '../server/bsnClient.ts'
import { PROVISION_BASE } from '../server/config.ts'

const pkg = process.argv[2] ?? 'Sample-OS-Updater'
const network = process.argv[3] ?? 'alliancelab-sandbox-01'

async function main() {
  await selectNetwork(network)
  const { body } = await bsnFetch(
    `${PROVISION_BASE}/rest-setup/v3/setup/?networkname=${encodeURIComponent(network)}`,
    { network },
  )
  const list = (Array.isArray(body) ? body : (body as { result?: unknown[] }).result ?? []) as Array<
    Record<string, unknown>
  >
  const raw = list.find((s) => String(s.packageName) === pkg)
  if (!raw) {
    console.log(`Setup "${pkg}" not found in ${network}. Available:`)
    console.log('  ' + list.map((s) => s.packageName).join('\n  '))
    process.exit(1)
  }
  const inner = JSON.parse(String(raw.setupJson))
  console.log(`"${pkg}"  firmwareUpdateType=${inner.firmwareUpdateType}\n`)
  const fam = inner.firmwareUpdatesByFamily as Record<string, Record<string, unknown>>
  const set: string[] = []
  for (const [k, f] of Object.entries(fam)) {
    const src = f.firmwareUpdateSource
    const flag = src && src !== 'none' ? ' ← SET' : ''
    console.log(
      `  ${k.padEnd(9)} source=${JSON.stringify(src)}${f.firmwareUpdateSourceUrl ? ` url=${JSON.stringify(f.firmwareUpdateSourceUrl)}` : ''}` +
        `  [prod ${f.productionVersion} / beta ${f.betaVersion} / min ${f.compatibleVersion}]${flag}`,
    )
    if (src && src !== 'none') set.push(`${k}=${src}`)
  }
  console.log(`\nFamilies with a real selection: ${set.length ? set.join(', ') : 'none'}`)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
