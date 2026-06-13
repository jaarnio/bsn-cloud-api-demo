import type { ReactNode } from 'react'

/**
 * Render an arbitrary JSON object as a styled, recursively-nested key/value table
 * (the main-panel counterpart to the raw JSON shown in the API-flow panel).
 */
export function JsonTable({ data, nested }: { data: Record<string, unknown>; nested?: boolean }) {
  return (
    <table className={`record ${nested ? 'record-nested' : ''}`}>
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>
              <Value v={v} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Value({ v }: { v: unknown }): ReactNode {
  if (v == null || v === '') return <span className="muted">—</span>
  if (typeof v === 'boolean') return <>{v ? 'Yes' : 'No'}</>
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="muted">none</span>
    const allScalar = v.every((x) => x === null || typeof x !== 'object')
    if (allScalar) return <>{v.map((x) => String(x)).join(', ')}</>
    return (
      <div className="rdws-nest">
        {v.map((x, i) => (
          <div className="rdws-nest-item" key={i}>
            <Value v={x} />
          </div>
        ))}
      </div>
    )
  }
  if (typeof v === 'object') return <JsonTable data={v as Record<string, unknown>} nested />
  return <>{String(v)}</>
}
