import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { getHealth } from './api/client'
import { DeviceLookup } from './components/DeviceLookup'
import { DeviceListPanel } from './components/DeviceListPanel'
import { AuthPanel } from './components/AuthPanel'
import { CreateSetupPanel } from './components/CreateSetupPanel'
import { SetupPackagesPanel } from './components/SetupPackagesPanel'
import { CreateProvisionPanel } from './components/CreateProvisionPanel'
import { ProvisionRecordsPanel } from './components/ProvisionRecordsPanel'
import { ReprovisionPanel } from './components/ReprovisionPanel'
import { FlowPanel } from './components/FlowPanel'
import type { HealthStatus, TraceEntry } from './types'

type TabId =
  | 'auth'
  | 'deviceList'
  | 'device'
  | 'setup'
  | 'packages'
  | 'provision'
  | 'provisions'
  | 'reprovision'

type PanelProps = { onTrace: (trace: TraceEntry[]) => void }
type TabDef = { id: TabId; label: string; Component: ComponentType<PanelProps> }
type NavGroup = { title: string; tabs: TabDef[] }

// Grouped navigation registry: nav and content both derive from this. Add a feature by
// dropping an entry into the appropriate group.
const NAV: NavGroup[] = [
  { title: 'Account', tabs: [{ id: 'auth', label: 'Authentication', Component: AuthPanel }] },
  {
    title: 'Devices',
    tabs: [
      { id: 'deviceList', label: 'List devices', Component: DeviceListPanel },
      { id: 'device', label: 'Find device', Component: DeviceLookup },
      { id: 'reprovision', label: 'Reprovision', Component: ReprovisionPanel },
    ],
  },
  {
    title: 'Setup',
    tabs: [
      { id: 'setup', label: 'Create setup', Component: CreateSetupPanel },
      { id: 'packages', label: 'Setup packages', Component: SetupPackagesPanel },
    ],
  },
  {
    title: 'Provisioning',
    tabs: [
      { id: 'provision', label: 'Create provision', Component: CreateProvisionPanel },
      { id: 'provisions', label: 'Provision records', Component: ProvisionRecordsPanel },
    ],
  },
]

const ALL_TABS: TabDef[] = NAV.flatMap((g) => g.tabs)

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [tab, setTab] = useState<TabId>('auth')

  // Each tab keeps its own latest trace so switching tabs preserves context.
  const [traces, setTraces] = useState<Partial<Record<TabId, TraceEntry[]>>>({})
  const setTrace = (id: TabId) => (trace: TraceEntry[]) =>
    setTraces((prev) => ({ ...prev, [id]: trace }))

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err) =>
        setHealth({ ok: false, tokenValid: false, networkCount: null, error: (err as Error).message }),
      )
  }, [])

  const active = ALL_TABS.find((t) => t.id === tab) ?? ALL_TABS[0]

  return (
    <main className="app">
      <header>
        <h1>BSN.cloud Provisioning Demo</h1>
        <HealthBadge health={health} />
      </header>

      <div className="shell">
        <nav className="sidebar">
          {NAV.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-group-title">{group.title}</div>
              {group.tabs.map((t) => (
                <button
                  key={t.id}
                  className={`nav-item ${tab === t.id ? 'nav-item-active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="content">
          <div className="card">
            <div className="split">
              <active.Component onTrace={setTrace(active.id)} />
              <FlowPanel trace={traces[active.id] ?? null} />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function HealthBadge({ health }: { health: HealthStatus | null }) {
  if (!health) return <span className="badge badge-pending">connecting…</span>
  const ok = health.ok && health.tokenValid
  return (
    <span className={`badge ${ok ? 'badge-ok' : 'badge-bad'}`}>
      {ok
        ? `connected · ${health.networkCount ?? '?'} networks`
        : `not connected${health.error ? ` · ${health.error}` : ''}`}
    </span>
  )
}
