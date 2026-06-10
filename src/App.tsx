import { useEffect, useState } from 'react'
import { getHealth } from './api/client'
import { DeviceLookup } from './components/DeviceLookup'
import { AuthPanel } from './components/AuthPanel'
import { CreateSetupPanel } from './components/CreateSetupPanel'
import { SetupPackagesPanel } from './components/SetupPackagesPanel'
import { CreateProvisionPanel } from './components/CreateProvisionPanel'
import { ProvisionRecordsPanel } from './components/ProvisionRecordsPanel'
import { ReprovisionPanel } from './components/ReprovisionPanel'
import { FlowPanel } from './components/FlowPanel'
import type { HealthStatus, TraceEntry } from './types'

type TabId = 'auth' | 'device' | 'setup' | 'packages' | 'provision' | 'provisions' | 'reprovision'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'auth', label: 'Authentication' },
  { id: 'device', label: 'Find device' },
  { id: 'setup', label: 'Create setup' },
  { id: 'packages', label: 'Setup packages' },
  { id: 'provision', label: 'Create provision' },
  { id: 'provisions', label: 'Provision records' },
  { id: 'reprovision', label: 'Reprovision' },
]

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [tab, setTab] = useState<TabId>('auth')

  // Each tab keeps its own latest trace so switching tabs preserves context.
  const [authTrace, setAuthTrace] = useState<TraceEntry[] | null>(null)
  const [deviceTrace, setDeviceTrace] = useState<TraceEntry[] | null>(null)
  const [setupTrace, setSetupTrace] = useState<TraceEntry[] | null>(null)
  const [packagesTrace, setPackagesTrace] = useState<TraceEntry[] | null>(null)
  const [provisionTrace, setProvisionTrace] = useState<TraceEntry[] | null>(null)
  const [provisionsTrace, setProvisionsTrace] = useState<TraceEntry[] | null>(null)
  const [reprovisionTrace, setReprovisionTrace] = useState<TraceEntry[] | null>(null)

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err) =>
        setHealth({ ok: false, tokenValid: false, networkCount: null, error: (err as Error).message }),
      )
  }, [])

  return (
    <main className="app">
      <header>
        <h1>BSN.cloud Provisioning Demo</h1>
        <HealthBadge health={health} />
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="card">
        {tab === 'auth' && (
          <div className="split">
            <AuthPanel onTrace={setAuthTrace} />
            <FlowPanel trace={authTrace} />
          </div>
        )}
        {tab === 'device' && (
          <div className="split">
            <DeviceLookup onTrace={setDeviceTrace} />
            <FlowPanel trace={deviceTrace} />
          </div>
        )}
        {tab === 'setup' && (
          <div className="split">
            <CreateSetupPanel onTrace={setSetupTrace} />
            <FlowPanel trace={setupTrace} />
          </div>
        )}
        {tab === 'packages' && (
          <div className="split">
            <SetupPackagesPanel onTrace={setPackagesTrace} />
            <FlowPanel trace={packagesTrace} />
          </div>
        )}
        {tab === 'provision' && (
          <div className="split">
            <CreateProvisionPanel onTrace={setProvisionTrace} />
            <FlowPanel trace={provisionTrace} />
          </div>
        )}
        {tab === 'provisions' && (
          <div className="split">
            <ProvisionRecordsPanel onTrace={setProvisionsTrace} />
            <FlowPanel trace={provisionsTrace} />
          </div>
        )}
        {tab === 'reprovision' && (
          <div className="split">
            <ReprovisionPanel onTrace={setReprovisionTrace} />
            <FlowPanel trace={reprovisionTrace} />
          </div>
        )}
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
