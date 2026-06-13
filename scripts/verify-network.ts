/**
 * Phase 2 verification: create setups exercising the network breakout, GET them
 * back, assert the interfaces materialized correctly, then DELETE.
 *
 *   npx tsx scripts/verify-network.ts [networkName]
 *
 * Requires the proxy running on :3001.
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
  const packageName = `ZZNet-${label}-${stamp}`
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
  const inner = JSON.parse(String(raw.setupJson))
  assert(inner)
  const del = await fetch(
    `${base}/api/setups/${encodeURIComponent(String(raw._id))}?network=${encodeURIComponent(network)}`,
    { method: 'DELETE' },
  )
  check('cleanup deleted', del.ok)
}

async function main() {
  await selectNetwork(network)
  console.log(`Phase 2 network verification in "${network}"`)

  // 1. No network config → player keeps its settings (inherit = true).
  await scenario('inherit', { includeNetworkConfiguration: false }, (inner) => {
    check('inheritNetworkProperties = true', inner.inheritNetworkProperties === true, inner.inheritNetworkProperties)
  })

  // 2. Ethernet static — plain IP + dotted subnet mask should combine to CIDR.
  await scenario(
    'eth-static',
    {
      includeNetworkConfiguration: true,
      ethernetEnabled: true,
      ethernetProto: 'static',
      ethernetIp: '192.168.1.10',
      ethernetSubnet: '255.255.255.0',
      ethernetGateway: '192.168.1.1',
      ethernetDns: '8.8.8.8, 1.1.1.1',
      specifyHostname: true,
      hostname: 'lobby-display-1',
    },
    (inner) => {
      const ifs = inner.network?.interfaces ?? []
      const eth = ifs.find((i: any) => i.type === 'Ethernet')
      check('inherit = false', inner.inheritNetworkProperties === false, inner.inheritNetworkProperties)
      check('single interface', ifs.length === 1, ifs.length)
      check('eth proto Static', eth?.proto === 'Static', eth?.proto)
      check('IP + /24 mask → CIDR', JSON.stringify(eth?.ip) === '["192.168.1.10/24"]', eth?.ip)
      check('eth gateway', eth?.gateway === '192.168.1.1', eth?.gateway)
      check('eth dns', JSON.stringify(eth?.dns) === '["8.8.8.8","1.1.1.1"]', eth?.dns)
      check('hostname set', inner.network?.hostname === 'lobby-display-1', inner.network?.hostname)
    },
  )

  // 2b. A /25 mask must produce the right prefix.
  await scenario(
    'eth-static-25',
    {
      includeNetworkConfiguration: true,
      ethernetProto: 'static',
      ethernetIp: '10.0.0.5',
      ethernetSubnet: '255.255.255.128',
    },
    (inner) => {
      const eth = (inner.network?.interfaces ?? []).find((i: any) => i.type === 'Ethernet')
      check('255.255.255.128 → /25', JSON.stringify(eth?.ip) === '["10.0.0.5/25"]', eth?.ip)
    },
  )

  // 3. Dual interface, WiFi-first priority, WiFi DHCP with passphrase.
  await scenario(
    'dual-wifi-first',
    {
      includeNetworkConfiguration: true,
      ethernetEnabled: true,
      ethernetProto: 'dhcp',
      wifiEnabled: true,
      wifiSsid: 'SampleWifi',
      wifiPassphrase: 'secret-pass-123',
      wifiProto: 'dhcp',
      interfacePriority: 'wireless',
    },
    (inner) => {
      const ifs = inner.network?.interfaces ?? []
      check('two interfaces', ifs.length === 2, ifs.length)
      check('WiFi first (priority)', ifs[0]?.type === 'WiFi', ifs[0]?.type)
      check('Ethernet second', ifs[1]?.type === 'Ethernet', ifs[1]?.type)
      const wifi = ifs.find((i: any) => i.type === 'WiFi')
      check('wifi ssid', wifi?.ssid === 'SampleWifi', wifi?.ssid)
      check(
        'wifi passphrase in security.authentication',
        wifi?.security?.authentication?.passphrase === 'secret-pass-123',
        wifi?.security?.authentication?.passphrase,
      )
    },
  )

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
