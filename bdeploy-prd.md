# BSN.cloud API Knowledgebase for a React + Vite Provisioning Demo SPA

## TL;DR
- BSN.cloud provisioning spans **three hosts**: the auth server (`auth.bsn.cloud`) for OAuth2 client-credentials tokens, the main API (`api.bsn.cloud/2022/06/REST`) for network selection / device management / registration tokens, and the B-Deploy provisioning service (`provision.bsn.cloud`) for serial-based provision records and setup packages. A demo SPA must orchestrate all three.
- The six required features map cleanly to documented endpoints: authenticate (client-credentials → select network), find device by serial (B-Deploy `GET /rest-device/v2/device/?serial=`), determine provisioning location (provision record `networkName`/`setupName`), create setup (`POST /rest-setup/v3/setup/`), create provision record (`POST /rest-device/v2/device/`), and reprovision (PUT/replace the provision record and/or delete-and-recreate to move networks).
- **Key risk for a browser SPA**: the client-credentials flow uses HTTP Basic auth with the client secret, refresh tokens are NOT supported, access tokens live 5 minutes 30 seconds, and a network session lasts 24 hours — secrets cannot be safely held in a public SPA, so a thin backend/proxy is effectively required.

## Key Findings

### Architecture and hosts
BrightSign Cloud APIs are grouped into (1) Basic Authorization APIs (OAuth bearer tokens), (2) B-Deploy/Provisioning APIs (automated field deployment), and (3) BSN.cloud & .com Service APIs (BrightAuthor:connected content/device management). Base URLs:
- Auth server token endpoint: `https://auth.bsn.cloud/realms/bsncloud/protocol/openid-connect/token`
- Main BSN.cloud API: `https://api.bsn.cloud/2022/06/REST`
- B-Deploy Provisioning Server / Setup Server: `https://provision.bsn.cloud`
- (Legacy parallel platform: `https://api.brightsignnetwork.com/`)

The Provisioning Server (PVS) returns a URL when given a serial number for any BSN.cloud/BSN-connected device and provides only REST APIs. The Provisioning Setup Server (PSS) stores and serves setup packages, presentation packages, and firmware, and exposes both a UI and REST APIs (calling PVS internally to add/retrieve serials and URLs).

The B-Deploy field-deployment sequence (for context): a blank/factory-reset player boots, times out of on-screen setup, queries the B-Deploy server; if its serial matches a record the server returns a provisioning script URL (otherwise HTTP **204**); the player reboots, runs the script, downloads its setup package, runs Player Setup (which sets the recovery URL to a B-Deploy handler), reboots and runs a recovery script that downloads the presentation package from the file server, then reboots and runs the presentation.

### Data model & terminology
- **Person**: a set of credentials (email + password) that can create and access networks as a user. Email is the unique identifier; a person can belong to multiple networks with one shared password.
- **Network**: the structure for managing/monitoring players on BSN.cloud. A network can have many players, but **a player can belong to only one network at a time**. A network can have multiple users (persons); the creator is the administrator. A newly created network defaults to bsn.Control; one or more player subscriptions upgrade it to bsn.Content.
- **Device / Player**: a physical BrightSign player, identified by serial number.
- **Setup / Setup Definition (device setup package)**: the configuration applied to a player (network config, firmware policy, DWS/LWS, logging, time zone, etc.). Stored in B-Deploy (PSS) and referenced by `setupId`/`setupName`.
- **Provision record (B-Deploy "device")**: associates a serial number with a network, a setup (or external URL), and an owner. A player can have only one provisioning record in BSN.cloud.
- **B-Deploy process**: the automated over-the-internet provisioning by which a blank/factory-reset player queries the provisioning server, gets a script URL if its serial is registered, downloads its setup package, and finally downloads its presentation from a file server.

**How networks relate to provisioning / reprovisioning across networks**: Because a player can belong to only one network at a time, moving a player to a different network requires deleting the device's provision record from the original network (on the BSN and B-Deploy services) and creating a new record under the target network. Only the current administrator of a player can delete its provision record; BrightSign generally cannot remove provisioning records (anti-theft/privacy). Reprovisioning to a *new setup within the same network* is done by applying a new setup to the provision record and then explicitly reprovisioning the player.

### Reprovisioning semantics
"Apply setup" only establishes what *should* be applied when the player is reprovisioned. A previously provisioned player that reboots or is even factory reset will NOT adopt a new setup until explicitly reprovisioned. Reprovisioning: clears the storage device, clears BSN.cloud registry settings but retains networking settings (e.g., WiFi configuration), and reboots; on reboot the player downloads/applies the setup associated with its provision record (or boots to the Activate screen if none). This contrasts with factory reset, which clears all settings including network settings but does not affect the provisioning record on BSN.cloud.

## Details — Full API Reference

### 1. Authentication (client-credentials, single account)

**Create client credentials (UI, one-time):** Log into the admin panel at `https://adminpanel.bsn.cloud`, select a network, go to Settings → Applications → Add Application, enter name/description, select the features (scopes) the app needs, Save. The new client ID and secret display once and are not shown again — store securely. Per the Authentication page, secrets expire every 180 days and should be rotated on or before expiry. Multiple applications can be created; name/description/features can be edited or deleted.

**Get access token:**
```
POST https://auth.bsn.cloud/realms/bsncloud/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic [base64(clientID:clientSecret)]
Accept: application/json

grant_type=client_credentials
```
Per RFC 6749 §4.4.2, credentials are passed using HTTP Basic auth (base64 of `clientID:clientSecret`). Response codes: **200 OK**; **401 Unauthorized** (invalid credentials). Notable response fields: `access_token` (use with API calls until expiry), `expires_in` (time to expiry — read this at runtime rather than hard-coding), `scope` (permitted scopes).

**Token lifecycle (from the Authentication FAQ):**
- Access token lifetime: **5 minutes 30 seconds**.
- Network session lifetime: **24 hours**.
- **Refresh tokens are NOT supported** with the client-credentials flow. (Refresh tokens exist only in the older person/user OAuth2 flow described on the Cloud APIs page.) On a 401 (expired token), re-request a token and re-select the network. Use `expires_in` to prefetch a new token before expiry.
- A 403 indicates the token's scopes don't permit the request — check application scopes.
- The Authentication FAQ states the legacy API token endpoint ceased to work on **February 23, 2026** (see Caveats — corroborated only on BrightSign's own doc, treat as BrightSign-stated).

**Select network (required after every new token):**
```
PUT https://api.bsn.cloud/2022/06/REST/self/session/network
Content-Type: application/json
Authorization: Bearer [accessToken]
Accept: application/json

{ "id": [networkId] }            // by ID
{ "name": "[networkName]" }      // by name
```
Response codes: **204 No Content** (success); **400 Bad Request** (network does not exist); **401 Unauthorized** (access token expired). Each application has access to all networks the registering user belongs to, so the network must be selected per session. Because the task specifies a single account with no multi-tenant switching, the SPA selects one fixed network after each token fetch.

**Rotate client secret (API):**
```
POST https://api.bsn.cloud/2022/06/REST/self/applications/{id}/secret/
Content-Type: application/json
Authorization: Bearer [accessToken]
Accept: application/json
```
`{id}` is the application ID (not the client ID). Response: **200** (old secret invalidated, new secret returned in response); **401**; **403**. The old secret continues to work for a limited time after rotation. Alternatively, deleting the application destroys its client ID and secret.

### 2. Finding devices by serial number

**Primary (B-Deploy provision record by serial):**
```
GET https://provision.bsn.cloud/rest-device/v2/device/?serial={serial}
Authorization: Bearer {token}
Accept: application/json
```
Returns the provision record(s) for that serial. Example response `result` fields: `_id`, `client`, `networkName`, `username`, `serial`, `name`, `model`, `desc`, `setupname`, `createdAt`, `updatedAt`, `__v`. Failure: 400, 401, 403, 5xx.

**Native BSN.cloud Devices resource** (`https://api.bsn.cloud/2022/06/REST/Devices`): The Main API exposes player-management methods that accept filter/sort expressions — retrieve a paged list of up to 100 `device` instances by marker/filter/sort, retrieve a `devicesregion` aggregation, retrieve a count of devices matching a filter, apply changes to devices matching a filter, and delete devices matching a filter. Filtering/sorting uses bracketed expressions such as `[Device].[Serial] ASC`. The paged-list response follows the standard wrapper, confirmed verbatim on the parallel Feeds/Media (2022/06) endpoint: `items[]`, `totalItemCount`, `matchingItemCount`, `pageSize`, `nextMarker`, `isTruncated`, `sortExpression`, `filterExpression` (max/default `pageSize` is 100). **Documentation gap:** the exact 2022/06 Devices path, required scope token, and full Device entity field list were not retrievable in the public docs at research time (see Caveats). The B-Deploy `rest-device/v2` endpoints are the reliable, fully-documented path for serial lookup.

### 3. Determining where a device is provisioned

A device's provisioning "location" is captured in its B-Deploy provision record: the `networkName` (which network it is provisioned to) and `setupname`/`setupId` (which setup). Use `GET /rest-device/v2/device/?serial={serial}` (above) or `GET /rest-device/v2/device/?_id={id}`. To enumerate everything in a network:
```
GET https://provision.bsn.cloud/rest-device/v2/device/?query[networkname]={networkName}&sort[serial]=1&page[pagenum]=1&page[pagesize]=20
Authorization: Bearer {token}
```
Query params: `query[networkname]` (string, **required**), `sort[serial]` (byte, optional), `page[pagenum]` (number, optional), `page[pagesize]` (number, optional). Response `result`: `total`, `matched`, `players[]` (each a provision record), `priv`. BrightSign does not expose to third parties which network a player is provisioned to (privacy), but the owning network's own API calls can read its own provision records. If a serial has no record in your network, it is either unprovisioned or owned by another network (and must be released by that network's admin — the "serial number already registered" error).

### 4. Creating a setup definition — B-Deploy Setup Endpoints (v3)

Base URL: `https://provision.bsn.cloud/rest-setup/v3/setup/`. v3 adds multi-NIC support via the `network` object.

**Create setup:**
```
POST https://provision.bsn.cloud/rest-setup/v3/setup
Authorization: Bearer {token}
Content-Type: application/json
Accept: application/json

{ ...Device Setup Entity (v3)... }
```
The request body is a Device Setup Entity (v3) with a `bdeploy` object (`username` [required: BSN.cloud username], `networkName` [required], `packagename` [required, unique per person]), `setuptype` (e.g. `"bsn"`), a `bsndeviceregistrationtokenentity` (the player registration token + `scope`/`validFrom`/`validTo`), `firmwareupdatetype`, and many configuration fields (DWS/LWS enable + passwords, logging flags, `timezone`, `bsngroupname`, `network.interfaces[]`, DHCP/static IP, proxy, rate limits, `inheritnetworkproperties`, `internalCaArtifacts[]`, etc.). Success: **201** with body `{ "error": null, "result": "{setupId}" }`. Failure: 400, 401, 403, 415, 5xx.

**List setups:** `GET /rest-setup/v3/setup/?networkname={n}&username={u}&packagename={p}` — `networkname` required, others optional. Returns array of Setup Package Info (v3) objects; the full config lives in the stringified `setupJson` field. Failure 400 (e.g. missing networkname), 401, 403 (token must belong to same network), 5xx.

**Get one setup:** `GET /rest-setup/v3/setup/{id}/` — returns the Device Setup Entity (v3). **Modify:** `PUT /rest-setup/v3/setup` with the entity (200/400/401/403/415/5xx). **Delete:** `DELETE /rest-setup/v3/setup/?_id={id}` (200/400/401/403/5xx).

**Device registration token** (needed inside the setup's `bsndeviceregistrationtokenentity`):
```
POST https://api.bsn.cloud/2022/06/REST/Provisioning/Setups/Tokens/
Authorization: Bearer {UserAccessToken}
Accept: application/json, application/vnd.bsn.error+json
```
"Issues a token which allows you to register players in the current network." Required scope token: `bsn.api.main.devices.setups.token.create`. Response: `{ "token": ..., "scope": "cert", "validFrom": "...Z", "validTo": "...Z" }`. Retrieve a token via `GET /2022/06/REST/Provisioning/Setups/Tokens/{Token}/`. The Token Entity fields: `token` (string, required — a player registration token; explicitly **not** a user token), `validFrom` (required), `validTo` (required), `scope` (optional, default `"cert"`). A real example from BrightSign's Token Entity docs shows roughly a two-year validity window — e.g. `{"token":"cW7OQJPG...","scope":"cert","validFrom":"2024-03-05T19:50:25Z","validTo":"2026-03-05T19:50:25Z"}`. Status codes include 300/400/406. (The legacy 2020/10 variant of this endpoint uses a form-urlencoded POST with `grant_type=user_access_token`, `user_access_token`, `client_id`, `client_secret`.)

### 5. Creating a provision record — B-Deploy Device Endpoints (v2)

Base URL: `https://provision.bsn.cloud/rest-device/v2/device/`.
```
POST https://provision.bsn.cloud/rest-device/v2/device
Authorization: Bearer {token}
Content-Type: application/json
Accept: application/json
```
Request body fields:
- `username` (string, **required**) — login of the record owner (may or may not be registered in BSN.cloud).
- `serial` (string, **required**) — the player's serial.
- `networkName` (string, **required**) — target network for provisioning.
- `name` (string, optional) — player name; overrides setup value.
- `model` (string, optional).
- `desc` (string, optional) — overrides setup value.
- `setupId` (string, optional) — ID of a setup package stored in B-Deploy.
- `setupName` (string, optional) — descriptive name of the setup package.
- `url` (string, optional) — URL the player downloads its presentation from (alternative to a setup).
- `userData` (string, optional) — extra attributes for a custom setup.

A valid request must include either a `url` OR a `setupId`+`setupName` pair. Success: **201** (returns the unique ID of the created provision record). Failure: 400, 401, 403, 415, 5xx.

**Read:** `GET /?_id={id}`, `GET /?serial={serial}`, or the network list (section 3). **Delete:** `DELETE /?_id={id}`, `DELETE /?serial={serial}`, or bulk `DELETE /ids/[...]` (returns `{ deletedCount, deletedIds[], failedIds[], message }`).

### 6. Reprovisioning (new setup, and/or new network)

**Change a player's setup (same network):**
```
PUT https://provision.bsn.cloud/rest-device/v2/device/
Authorization: Bearer {token}
Content-Type: application/json

{ "_id": "...", "username": "...", "serial": "...", "networkName": "...",
  "setupId": "...", "setupName": "...", "userData": "" }
```
"Modifies a provision record of a specified player." Required body: `_id`, `username`, `serial`, `networkName`; plus either `url` OR `setupId`+`setupName`. Success **200**; failure 400/401/403/415/5xx. After updating the record, the player must be **explicitly reprovisioned** for the new setup to take effect (the record change alone does not push to a running player; reprovision is triggered via BrightAuthor:connected Control tab / remote DWS, or the player applies it on its next provisioning cycle).

**Move a player to a different network (reprovision across networks):** Because a player can belong to only one network at a time, you must (a) delete the existing provision record from the source network (`DELETE /rest-device/v2/device/?serial={serial}` — only the current admin can do this), then (b) create a new provision record under the target `networkName` (`POST /rest-device/v2/device`), then (c) reprovision the player so it picks up the new network/setup.

### Cross-cutting API conventions
- **Auth headers**: B-Deploy and main API both use `Authorization: Bearer {token}`; the token endpoint uses `Authorization: Basic`.
- **Accept header**: main API expects an explicit `Accept` (e.g. `application/json, application/vnd.bsn.error+json`); avoid `*/*` (ambiguous). XML is the default if JSON not explicitly requested.
- **Pagination**: B-Deploy uses `page[pagenum]`/`page[pagesize]`; main API uses marker-based paging (`marker`/`pageSize`, max 100) with `isTruncated`/`nextMarker`.
- **Filtering/sorting (main API)**: bracketed expressions like `[Name] BEGINS WITH 'Oct'` and `[LastModifiedDate] DESC`.
- **Versioning**: main API is path-versioned (`/2022/06/`); B-Deploy is versioned per resource (`device/v2`, `setup/v3`). Clients on 2020/10 must move to 2022/06 — note that the 2020/10 framework upgrade introduced breaking changes requiring `Content-Type: application/x-www-form-urlencoded` on token requests (else HTTP 415) and additional now-required body fields (else HTTP 400), per BrightSign support guidance.
- **Status codes** (main API set): 100,200,201,202,204,300,304,307,308,400,401,403,404,405,406,408,411,412,413,414,415,429,431,5xx. 429 implies rate limiting exists, though specific quotas are not published.
- **Conditional requests**: supported on singular GET/PUT/DELETE/PATCH via `Last-Modified`/`If-Modified-Since`/`If-Unmodified-Since`.

## Recommendations

**Staged build plan for the demo SPA (React + Vite):**

1. **Stand up a thin backend/proxy first (non-negotiable).** Because the client secret must be Basic-auth'd to the token endpoint, refresh tokens are unsupported, and tokens expire in 5 min 30 s, put token acquisition + network selection + secret storage behind a small server (Node/Express, serverless function, or Vite dev-server middleware). The React SPA should call your proxy, never `auth.bsn.cloud` directly. *Threshold to revisit:* if BrightSign later issues a public-client / PKCE flow, the SPA could call auth directly.

2. **Implement the auth module**: proxy endpoint that (a) POSTs client-credentials, (b) caches `access_token` with an expiry timer set from the live `expires_in` minus a safety margin (~30 s), (c) immediately PUTs `self/session/network` for the single fixed network, (d) transparently re-auths on 401 and re-selects the network. Track the 24-hour session ceiling separately.

3. **Feature 2 & 3 (find + locate device)**: build a serial-lookup view backed by `GET /rest-device/v2/device/?serial=`. Display `networkName`, `setupname`, `name`, `model`, `createdAt`. Treat empty results as "not provisioned in this network."

4. **Feature 4 (create setup)**: form → proxy → `POST /rest-setup/v3/setup`. Pre-fetch a device registration token via `POST /2022/06/REST/Provisioning/Setups/Tokens/` and embed it in `bsndeviceregistrationtokenentity`. Start from a minimal known-good Device Setup Entity (v3) body and expose only a few fields (name, timezone, network priority) in the demo UI.

5. **Feature 5 (create provision record)**: form → proxy → `POST /rest-device/v2/device` with `serial` + `networkName` + `setupId`/`setupName`. Surface the returned record ID.

6. **Feature 6 (reprovision)**: two flows — (a) *same network, new setup*: `PUT /rest-device/v2/device/` updating `setupId`/`setupName`; (b) *new network*: `DELETE ?serial=` then `POST` to the new `networkName`. Clearly message that a physical reprovision/reboot is required for changes to take effect.

7. **Error UX**: map 401→silent re-auth, 403→"scope/permission" message (check application features), 400→validation, 404→not found, serial-already-registered→"owned by another network; the current admin must release it."

**Benchmarks that change the plan:** if the customer needs the SPA to manage multiple networks, add a network-picker around `self/session/network` (the task scopes this out). If the native `api.bsn.cloud/.../Devices` entity is required (richer device telemetry than B-Deploy records), confirm the exact 2022/06 Devices path/scope/schema with BrightSign before committing UI to it.

## Caveats / documented gaps & risks
- **Browser secret exposure (top PRD risk)**: the documented flow is machine-to-machine; there is no PKCE/public-client variant in the docs, so a public SPA cannot safely hold the secret — a backend proxy is required.
- **No refresh tokens**: confirmed unsupported in the client-credentials flow; the app must re-authenticate on expiry, adding latency/complexity.
- **Token-lifetime / secret-expiry figures (5 min 30 s, 24 h, 180 days, Feb 23 2026 legacy cutoff)** are stated on BrightSign's live Authentication page (`docs.brightsign.biz/developers/authentication`) and are quoted here verbatim from that source. They could not be independently corroborated on a second BrightSign page (the "2025 API Usage Guide" mirror returned 404 at research time), and no third-party source confirms the Feb 23 2026 date. Treat them as BrightSign-stated and verify `expires_in` at runtime and secret expiry in the admin panel.
- **Native Devices (2022/06) endpoint under-documented in public docs**: exact path, required scope token, and full Device entity schema for `api.bsn.cloud/2022/06/REST/Devices` were not retrievable at research time; the B-Deploy `rest-device/v2` provision-record endpoints are the reliable, fully-documented path for serial lookup and should be the SPA's primary mechanism.
- **Provisioning/Setups native endpoints beyond Tokens**: only the `Provisioning/Setups/Tokens` POST/GET are confirmed on the 2022/06 Provisioning page; setup CRUD lives under B-Deploy PSS (`rest-setup/v3`).
- **Setup entity surface is large and under-specified field-by-field**: the v3 Device Setup Entity has dozens of fields; the docs give an example body but not exhaustive validation rules. Use a known-good template.
- **Cross-network moves require the current admin**: only the owning network's administrator can delete a provision record; BrightSign generally won't remove records. Demo data must use players you own.
- **Rate limits/quotas not published**: 429 is an allowed status but specific limits aren't documented — implement backoff defensively.
- **Two parallel platforms**: BSN.cloud vs legacy brightsignnetwork.com share API shapes; ensure the SPA targets `*.bsn.cloud` consistently.