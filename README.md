# BSN.cloud API Demo

A sandbox web app that demonstrates BrightSign's **BSN.cloud** and **B-Deploy** provisioning
APIs end-to-end. Every feature is a tab with a split screen: the function on the left and a
live **"API flow"** view on the right showing the actual (sanitized) bsn.cloud calls the
server makes — so a developer can see how each operation works.

**Tabs:** Authentication · Find device · Create setup · Setup packages (list/edit/delete) ·
Create provision · Provision records (list/edit/delete) · Reprovision (rDWS).

## Architecture

A React + Vite SPA talks **only** to a small Express proxy (`/api/*`). The proxy holds the
client secret, manages the OAuth token lifecycle (the client-credentials flow has no refresh
tokens and tokens expire in ~5½ min), selects networks, and forwards calls to
`auth.bsn.cloud`, `api.bsn.cloud`, `provision.bsn.cloud`, and `ws.bsn.cloud`. The secret and
access tokens never reach the browser.

```
src/        React SPA (tabs + live API-flow panel)
server/     Express proxy (auth, trace capture, route handlers)
```

## Prerequisites

- Node.js 20+
- A BSN.cloud account with OAuth2 application credentials (Client ID + Secret), created in the
  admin panel under **Settings → Applications**.

## 1. Create the `.env` file

The `.env` is **not** committed (it holds your secret). Create one in the project root:

```ini
client_ID=your-client-id
client_secret=your-client-secret
default-network=your-network-name
```

| Key | Description |
| --- | --- |
| `client_ID` | OAuth2 application Client ID |
| `client_secret` | OAuth2 application Client Secret (rotates every 180 days) |
| `default-network` | Network selected for the Authentication demo (any network in your account) |

> Note: the keys are exactly as shown (the hyphen/casing matters). The app can read/write any
> network your credentials can access; `default-network` is only used for the Auth tab demo.

## 2. Install

```bash
npm install
```

## 3. Run (development)

```bash
npm run dev
```

Runs the Express proxy (`:3001`) and the Vite dev server (`:5173`) together. Open
**http://localhost:5173**. The header badge should read **connected · N networks**.

## 4. Build (production)

```bash
npm run build      # type-check + bundle the SPA to dist/
npm run preview    # preview the built SPA
```

For a real deployment, serve `dist/` behind the Express proxy so the secret stays server-side.

## Security notes

- `.env` is git-ignored — never commit your Client Secret.
- The proxy redacts secrets, tokens, and device passwords from the API-flow view.
- Write operations (create/edit/delete setups & provision records) and **Reprovision** act on
  live data. Reprovision reboots the player and clears its storage — it is gated behind a
  confirmation and only enabled for online players.
