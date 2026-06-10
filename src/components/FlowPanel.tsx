import { useState } from 'react'
import type { TraceEntry } from '../types'

// A run of consecutive entries that share the same step label.
interface Group {
  step: string
  entries: TraceEntry[]
}

// Group by step label across the whole trace, preserving first-appearance
// order. The device sweep runs device + provision lookups in PARALLEL so their
// entries interleave per network; grouping by label (not adjacency) yields the
// intended narrative — "List networks", "Select network ×N", "Find device
// record ×N", etc. — with the last (matching) entry shown by default.
function groupByStep(trace: TraceEntry[]): Group[] {
  const groups: Group[] = []
  const byStep = new Map<string, Group>()
  for (const entry of trace) {
    let group = byStep.get(entry.step)
    if (!group) {
      group = { step: entry.step, entries: [] }
      byStep.set(entry.step, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
}

export function FlowPanel({ trace, busy }: { trace: TraceEntry[] | null; busy?: boolean }) {
  return (
    <aside className="flow">
      <div className="flow-head">
        <h3>API flow</h3>
        <span className="muted small">Live bsn.cloud calls made by the proxy</span>
      </div>
      {busy && <p className="muted">Running…</p>}
      {!busy && (!trace || trace.length === 0) && (
        <p className="muted">Run the function to see the live API flow.</p>
      )}
      {trace && trace.length > 0 && (
        <ol className="flow-list">
          {groupByStep(trace).map((group, i) => (
            <GroupRow key={i} index={i + 1} group={group} />
          ))}
        </ol>
      )}
    </aside>
  )
}

function GroupRow({ index, group }: { index: number; group: Group }) {
  // Show the last entry's detail (the matching network / final attempt); a
  // repeated run collapses to a ×N badge that expands to every attempt.
  const count = group.entries.length
  const [open, setOpen] = useState(false)
  const shown = group.entries[count - 1]

  return (
    <li className="flow-step">
      <div className="flow-step-head">
        <span className="flow-num">{index}</span>
        <span className="flow-title">{group.step}</span>
        {count > 1 && (
          <button className="flow-count" onClick={() => setOpen((v) => !v)}>
            ×{count} {open ? '▾' : '▸'}
          </button>
        )}
        <Status entry={shown} />
      </div>
      {open && count > 1 ? (
        group.entries.map((e, j) => <Call key={j} entry={e} sub />)
      ) : (
        <Call entry={shown} />
      )}
    </li>
  )
}

function Status({ entry }: { entry: TraceEntry }) {
  if (entry.status == null) return null
  const cls = entry.status < 300 ? 'ok' : entry.status < 500 ? 'warn' : 'bad'
  return (
    <span className={`flow-status flow-status-${cls}`}>
      {entry.status}
      {entry.ms != null ? ` · ${entry.ms}ms` : ''}
    </span>
  )
}

function Call({ entry, sub }: { entry: TraceEntry; sub?: boolean }) {
  return (
    <div className={`flow-call ${sub ? 'flow-call-sub' : ''}`}>
      <div className="flow-line">
        <span className="flow-method">{entry.method}</span> <span className="flow-url">{entry.url}</span>
      </div>
      {entry.note && <div className="flow-note">{entry.note}</div>}
      {entry.reqHeaders && (
        <pre className="flow-pre">
          {Object.entries(entry.reqHeaders)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}
        </pre>
      )}
      {entry.reqBody != null && <pre className="flow-pre">body  {fmt(entry.reqBody)}</pre>}
      {entry.response != null && <pre className="flow-pre flow-resp">←     {fmt(entry.response)}</pre>}
    </div>
  )
}

function fmt(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
