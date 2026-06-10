import dotenv from 'dotenv'

dotenv.config()

/**
 * The .env in this repo uses non-standard key names, so we read them
 * explicitly and normalize. Fail fast if any are missing.
 *
 *   default-network=...
 *   client_ID=...
 *   client_secret=...
 */
function required(key: string): string {
  const value = process.env[key]
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required env var "${key}". Check the .env file in the project root.`,
    )
  }
  return value.trim()
}

export const config = {
  clientId: required('client_ID'),
  clientSecret: required('client_secret'),
  networkName: required('default-network'),
  port: Number(process.env.PORT) || 3001,
}

// BSN.cloud host constants (see bdeploy-prd.md).
export const AUTH_URL =
  'https://auth.bsn.cloud/realms/bsncloud/protocol/openid-connect/token'
export const API_BASE = 'https://api.bsn.cloud/2022/06/REST'
export const PROVISION_BASE = 'https://provision.bsn.cloud'
