import apiDocs from './api-docs.json'

interface DocLink {
  method?: string
  match: string
  title?: string
  docUrl?: string
}

const LINKS = (apiDocs.links ?? []) as DocLink[]

/** Drop the query string and any trailing slash for stable comparison. */
function normalize(url: string): string {
  const path = url.split('?')[0]
  return path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * Resolve the documentation URL for a traced call, or null if none is mapped.
 *
 * Trace URLs are `host/path?query` (from the server's shortUrl). We match on
 * method (case-insensitive; "*" or absent matches any) and on host+path. A
 * `match` ending in `*` is a prefix wildcard for dynamic trailing segments
 * (e.g. registry section/key, files path). Only entries with a non-empty
 * `docUrl` resolve — blank entries (awaiting a doc link) show no icon.
 */
export function findDocLink(method: string, url: string): string | null {
  const m = method.toUpperCase()
  const target = normalize(url)
  for (const link of LINKS) {
    if (!link.docUrl) continue
    const linkMethod = (link.method ?? '*').toUpperCase()
    if (linkMethod !== '*' && linkMethod !== m) continue
    if (link.match.endsWith('*')) {
      const prefix = link.match.slice(0, -1)
      if (url.split('?')[0].startsWith(prefix)) return link.docUrl
    } else if (normalize(link.match) === target) {
      return link.docUrl
    }
  }
  return null
}
