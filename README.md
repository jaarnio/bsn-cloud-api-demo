# BSN.cloud API Demo

A sandbox web app that demonstrates BrightSign's **BSN.cloud**, **B-Deploy**, and **Remote DWS**
APIs end-to-end. Every feature is a page with a split screen: the function on the left and a
live **"API flow"** view on the right showing the actual (sanitized) bsn.cloud calls the
server makes — raw request/response JSON — so a developer can see how each operation works.

## Features

Pages are grouped in the left nav. The **RDWS** pages each start by picking a network and then a
player within it (offline players are shown but disabled, since Remote DWS only reaches online
players); all operations then target that player.

### Account
- **Authentication** — runs the full OAuth2 client-credentials flow live (force a fresh token,
  then select a network) and shows the token + network-selection calls.

### Devices
- **List devices** — registered players in a network, with health (Normal/Warning/Error) and
  registered/provisioned status pills.
- **Find device** — account-wide serial lookup; sweeps every network and surfaces the device
  record, its provision record, and the resolved setup definition.
- **Reprovision** (rDWS) — lists players with online/offline state and last-contact time, and
  sends a Remote DWS reprovision command. Destructive (reboots + clears storage); confirmation-
  gated and enabled only for online players.

### RDWS (Remote DWS — drive a single player)
- **Information** — read general player info (model, firmware, boot version, uptime, power, PoE,
  extensions, blessings, supported hardware, and Ethernet/Wi-Fi network config) plus date/time.
- **Control** — reboot the player; check/set the DWS password (show/hide field; the API only
  reports whether a password is set, never returns it); enable/disable the local DWS. *Every
  Control write reboots the player and is confirmation-gated.*
- **Logs** — fetch and view the player's current log output in a scrollable console.
- **Storage** — browse the player's storage as a lazy, read-only file tree (defaults to the SD card).
- **Custom** — send a custom command to the player's autorun (delivered on UDP port 5000).
- **Snapshot** — capture a screenshot of what the player is currently showing and display it.
- **OS Update** — instruct the player to download a firmware file from a URL and apply it.
  Destructive (applies firmware + reboots); confirmation-gated.
- **Video** — read the player's currently active video mode.
- **Registry** — dump the full registry as a styled table, and set a single value by
  section / key / value (e.g. `brightscript` / `debug` / `1`).

### Setup
- **Create setup** — build a device setup from a schema the app owns: full network-config
  breakout (Ethernet/Wi-Fi, DHCP or static with CIDR, hostname, interface priority, time server),
  services (DWS / Remote DWS / LWS), diagnostics, per-family OS-update policy, and remote snapshots.
- **Setup packages** — list, edit, and delete existing setups.

### Provisioning
- **Create provision** — create a B-Deploy provision record binding a serial to a setup.
- **Provision records** — list, edit, and delete provision records.

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
- The proxy redacts secrets, tokens, and device passwords (including the DWS password set via
  RDWS → Control) from the API-flow view.
- Write operations act on live data. The destructive ones are confirmation-gated: **Reprovision**
  (reboots + clears storage), and the RDWS **Control** (reboot, DWS password, local DWS — each
  reboots the player) and **OS Update** (downloads + applies firmware, then reboots) pages.
