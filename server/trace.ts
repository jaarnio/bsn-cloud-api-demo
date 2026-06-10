import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request capture of the upstream bsn.cloud calls the proxy makes, so the
 * SPA can show a "behind the scenes" API flow. An AsyncLocalStorage holds the
 * current request's trace array; instrumented call sites push sanitized entries
 * via record() without threading a parameter through every function.
 *
 * SECURITY: entries are sanitized at the source — never put the client secret,
 * access tokens, bearer/basic header values, or device credentials in a trace.
 */
export interface TraceEntry {
  step: string // stable label; the UI collapses consecutive identical steps
  method: string
  url: string // already shortened/sanitized
  note?: string // one-line plain-language annotation
  reqHeaders?: Record<string, string>
  reqBody?: unknown
  status?: number
  ms?: number
  response?: unknown // a small, sanitized summary — never the raw token/secret
}

const store = new AsyncLocalStorage<TraceEntry[]>()

/** Run `fn` inside a fresh trace collector; returns the result and the trace. */
export async function withTrace<T>(fn: () => Promise<T>): Promise<{ result: T; trace: TraceEntry[] }> {
  const trace: TraceEntry[] = []
  const result = await store.run(trace, fn)
  return { result, trace }
}

/** Push an entry onto the active trace. No-op outside a withTrace() context. */
export function record(entry: TraceEntry): void {
  store.getStore()?.push(entry)
}

/** True when a trace collector is active (lets call sites skip work otherwise). */
export function isTracing(): boolean {
  return store.getStore() !== undefined
}

/** Shorten a URL to host + path (+ key query params) for display. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const query = u.search ? decodeURIComponent(u.search) : ''
    return `${u.host}${u.pathname}${query}`
  } catch {
    return url
  }
}

/** Replace Authorization header values with an obscured placeholder. */
export function redactAuth(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization') {
      const scheme = v.split(' ')[0] || 'Token'
      out[k] = `${scheme} ••••••••`
    } else {
      out[k] = v
    }
  }
  return out
}
