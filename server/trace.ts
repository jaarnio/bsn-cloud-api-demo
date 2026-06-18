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

/**
 * Keys whose VALUES are secrets and must never appear in a trace, regardless of
 * nesting depth. Matched case-insensitively as a substring of the key name.
 */
const SECRET_KEY_RE = /password|passphrase|secret|token|psk|authorization|credential/i

const MASK = '••••••••'

/**
 * Deep-clone a response body for display, masking any property whose key looks
 * like a credential (see SECRET_KEY_RE). Recurses through objects and arrays;
 * primitives are returned unchanged. This is the DEFAULT trace `response` so
 * every call shows its real JSON without leaking secrets. NOTE: it cannot reach
 * secrets embedded inside a stringified-JSON value (e.g. setupJson) — callers
 * holding such blobs must supply a custom summarize (see setups route).
 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? MASK : redactSecrets(v)
    }
    return out
  }
  return value
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
