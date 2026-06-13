import { useState } from 'react'
import { PlayerSelect } from '../PlayerSelect'
import { getFiles } from '../../api/client'
import type { FileEntry, TraceEntry } from '../../types'

type Target = { network: string; serial: string }

const ROOT = 'sd'

export function StoragePanel({ onTrace }: { onTrace: (trace: TraceEntry[]) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  // Directory listings keyed by path; populated lazily as folders are expanded.
  const [entries, setEntries] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function onSelect(network: string, serial: string | null) {
    setEntries({})
    setExpanded(new Set())
    setLoading(new Set())
    setError(null)
    if (serial) {
      const t = { network, serial }
      setTarget(t)
      void loadDir(t, ROOT)
    } else {
      setTarget(null)
    }
  }

  async function loadDir(t: Target, path: string) {
    setLoading((prev) => new Set(prev).add(path))
    setError(null)
    try {
      const res = await getFiles(t.serial, t.network, path)
      onTrace(res.trace)
      setEntries((prev) => ({ ...prev, [path]: res.listing.files ?? [] }))
      setExpanded((prev) => new Set(prev).add(path))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    }
  }

  function toggle(entry: FileEntry) {
    if (!target) return
    if (expanded.has(entry.path)) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(entry.path)
        return next
      })
    } else if (entries[entry.path]) {
      setExpanded((prev) => new Set(prev).add(entry.path))
    } else {
      void loadDir(target, entry.path)
    }
  }

  function renderEntry(entry: FileEntry) {
    const isDir = entry.type === 'dir'
    const isOpen = expanded.has(entry.path)
    const isLoading = loading.has(entry.path)
    return (
      <li key={entry.path}>
        {isDir ? (
          <div className="rdws-tree-row rdws-tree-dir" onClick={() => toggle(entry)}>
            <span className="rdws-tree-toggle">{isLoading ? '·' : isOpen ? '▾' : '▸'}</span>
            <span>📁 {entry.name}</span>
          </div>
        ) : (
          <div className="rdws-tree-row rdws-tree-file">
            <span className="rdws-tree-toggle" />
            <span>📄 {entry.name}</span>
            {entry.mime && <span className="rdws-tree-mime">{entry.mime}</span>}
          </div>
        )}
        {isDir && isOpen && entries[entry.path] && (
          <ul className="rdws-tree-children">
            {entries[entry.path].length === 0 ? (
              <li className="muted tiny">empty</li>
            ) : (
              entries[entry.path].map(renderEntry)
            )}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div className="fn-pane rdws">
      <h2>Storage</h2>
      <p className="muted small">
        Browse the player's storage (read-only), defaulting to the SD card, via Remote DWS.
      </p>

      <PlayerSelect onTrace={onTrace} onSelect={onSelect} />

      {error && <p className="error">{error}</p>}

      {!target ? (
        <p className="muted">Select an online player to continue.</p>
      ) : (
        <section>
          <div className="rdws-actions">
            <button onClick={() => loadDir(target, ROOT)} disabled={loading.has(ROOT)}>
              {loading.has(ROOT) ? 'Loading…' : 'Refresh'}
            </button>
            <span className="muted tiny">/{ROOT}</span>
          </div>
          {entries[ROOT] && (
            <ul className="rdws-tree">
              {entries[ROOT].length === 0 ? (
                <li className="muted tiny">empty</li>
              ) : (
                entries[ROOT].map(renderEntry)
              )}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
