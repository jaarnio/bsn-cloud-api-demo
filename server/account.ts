import { API_BASE } from './config.ts'
import { bsnFetch } from './bsnClient.ts'
import { AuthError } from './auth.ts'

let usernameCache: string | null = null

/**
 * The account login (GET /self). Used as the owner `username` on provision
 * records and on a setup's `bDeploy.username`. Cached for the session.
 */
export async function getUsername(): Promise<string> {
  if (usernameCache) return usernameCache
  const { ok, status, body } = await bsnFetch(`${API_BASE}/self`, {
    trace: {
      step: 'Get account user',
      note: 'The account login (GET /self) owns provision records and setups.',
      summarize: (b) => ({ login: (b as { login?: string })?.login }),
    },
  })
  if (!ok) throw new AuthError(status, `Failed to read account user (${status}).`)
  const login = (body as { login?: string })?.login
  if (!login) throw new AuthError(502, 'Account user has no login.')
  usernameCache = login
  return login
}
