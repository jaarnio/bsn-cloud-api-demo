import { getValidToken, selectNetwork, invalidate } from './auth.ts'
import { record, redactSecrets, shortUrl } from './trace.ts'

export interface BsnResponse {
  status: number
  ok: boolean
  body: unknown
}

export interface TraceAnnotation {
  /** Stable step label; the UI collapses consecutive identical steps. */
  step: string
  /** One-line plain-language annotation. */
  note?: string
  /** Already-sanitized request body to show (never pass raw secrets/passwords). */
  reqBody?: unknown
  /**
   * Override the trace `response`. By default the full body is shown with
   * credential-named keys masked (redactSecrets). Supply this only for special
   * cases: stripping a huge blob (snapshot base64), or masking secrets that hide
   * inside a stringified-JSON value that key-based redaction can't reach.
   */
  summarize?: (body: unknown) => unknown
}

export interface BsnFetchOptions extends RequestInit {
  /** Select this network on the session before the request (and after re-auth). */
  network?: string
  /** When present, record this call to the active API-flow trace. */
  trace?: TraceAnnotation
}

/**
 * Authenticated fetch against the BSN.cloud / B-Deploy APIs.
 *
 * - ensures a valid token, and (if `network` is given) selects it first
 * - injects Bearer + an explicit Accept (the API defaults to XML otherwise)
 * - on 401 (expired token), re-auths, RE-SELECTS the network, and retries once
 *   (PRD step 7: 401 -> silent re-auth). Re-selection matters because a fresh
 *   token starts with no network selected.
 * - if `opts.trace` is given, records a sanitized entry to the API-flow trace
 *
 * Returns the parsed body and status; does NOT throw on non-2xx so callers can
 * map status codes to user-facing messages.
 */
export async function bsnFetch(url: string, opts: BsnFetchOptions = {}): Promise<BsnResponse> {
  const { network, trace, ...init } = opts
  const method = (init.method ?? 'GET').toUpperCase()

  const doFetch = async (): Promise<Response> => {
    const token = await getValidToken()
    if (network) await selectNetwork(network)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    return fetch(url, { ...init, headers })
  }

  const started = Date.now()
  let res = await doFetch()
  let reauthed = false

  if (res.status === 401) {
    invalidate()
    reauthed = true
    res = await doFetch()
  }

  const text = await res.text()
  let body: unknown = text
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      // leave body as raw text (e.g. an XML/HTML error page)
    }
  }

  if (trace) {
    record({
      step: trace.step,
      method,
      url: shortUrl(url),
      note: reauthed
        ? `${trace.note ?? ''} (token had expired → silent re-auth + re-select, retried once)`.trim()
        : trace.note,
      reqHeaders: { Authorization: 'Bearer ••••••••', Accept: 'application/json' },
      reqBody: trace.reqBody,
      status: res.status,
      ms: Date.now() - started,
      response: trace.summarize ? trace.summarize(body) : redactSecrets(body),
    })
  }

  return { status: res.status, ok: res.ok, body }
}
