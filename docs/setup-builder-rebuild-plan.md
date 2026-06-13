# Plan: Replace clone-and-tweak setup creation with a from-scratch builder

> Status: **proposed** (not yet implemented). The partner-App-URL gap was fixed
> separately within the existing clone model; this document captures the larger
> architectural change for a later decision.

## Context / why

`server/routes/setups.ts` creates a B-Deploy v3 setup by **cloning the first
existing setup** in the target network (or, failing that, the first setup found
in *any* network — `loadTemplate` / `fetchFirstSetup`), flipping a handful of
fields via `applyEditableFields`, embedding a fresh registration token, and
POSTing the mutated entity.

This was a pragmatic choice when the v3 Device Setup Entity looked
under-specified, but it has real downsides:

- **Nondeterministic base.** `basedOn` is "whichever setup happened to be first."
  Two creates in the same network can start from different templates.
- **Silent inheritance.** The new setup keeps the template's `bsnGroupName`,
  `firmwareUpdateType`, `firmwareUpdatesByFamily`, network interface config,
  DWS/LWS passwords, logging flags, snapshot config, etc. — none of which the
  user chose. This is exactly what masked the partner-App-URL bug: a cloned LFN
  template carried an empty/foreign `bDeploy.url`.
- **Cross-network leakage.** If the target network has no setups, we clone from
  an unrelated network and inherit *its* partner URL, group, etc.
- **Hard to reason about.** "Create" is really "copy a random setup and change 8
  fields," which is not what the UI implies.

The goal: build the entity from a **schema we own**, so every field is either an
explicit user choice or a documented default — no inheritance surprises.

## What we now know (empirically confirmed)

From probing the live account (21 partner setups + LFN/BSN/standalone):

- The v3 entity is the camelCase object inside `setupJson`. A complete, valid
  setup is structurally the **same across all `setupType`s** — the only
  partner-specific differentiators are `setupType: "partnerApplication"` and a
  populated **`bDeploy.url`** (the partner `autorun.zip`).
- Account-constant fields: `bDeploy.client` (`"bacon"`), `bDeploy.username`
  (the account login, available via `GET /self` — already used by the provisions
  route's `getUsername`).
- The registration token is minted separately (`POST /Provisioning/Setups/Tokens/`)
  and embedded as `bsnDeviceRegistrationTokenEntity` — keep this step as-is.
- The gopurple `docs/bdeploy-config-reference.md` documents 80+ optional fields
  and states the API fills sensible defaults when they're omitted — supporting a
  minimal hand-authored entity.

## Proposed design

1. **Own a canonical default entity.** Add `server/setupTemplate.ts` exporting a
   `buildSetupEntity(opts)` that returns a complete v3 entity from a code-defined
   default object literal (captured from a real known-good setup, scrubbed of
   `_id`, passwords, token, and network-specific values). This replaces
   `loadTemplate`/`fetchFirstSetup` for the create path.
2. **Explicit field mapping.** Reuse the existing `applyEditableFields` to layer
   the user's choices on top of the canonical defaults — same function, but the
   base is now deterministic instead of a clone.
3. **Wire identity fields:** set `bDeploy.{username (from GET /self), client:
   "bacon", networkName, packageName, url}`. Keep the token-mint step and
   `bsnDeviceRegistrationTokenEntity` embedding unchanged.
4. **Keep edit (PUT) as load-modify-PUT** — editing a real record should still
   round-trip that record, not the template.
5. **Drop `basedOn`** from the create response (or set it to `"schema-default"`),
   and update `CreateSetupPanel`'s copy ("Starts from a known-good template" →
   "Builds the setup from B-Deploy defaults").

### Critical files
- `server/routes/setups.ts` — `createSetup` swaps `loadTemplate` for
  `buildSetupEntity`; `applyEditableFields` reused as-is.
- `server/setupTemplate.ts` *(new)* — canonical default entity + builder.
- `src/components/CreateSetupPanel.tsx` — description copy; `basedOn` row.
- `src/types.ts` — `CreateSetupResponse.basedOn` becomes optional/removed.

## Risk + required verification

The **one real risk**: a hand-authored v3 entity POST may be rejected if the API
expects fields our captured default omits or mis-shapes. This MUST be verified
with a live **create + delete** in a sandbox network before trusting it:

1. Build the default entity, `POST /rest-setup/v3/setup`, assert `result` (new id).
2. `GET` the setup back; diff its `setupJson` against a cloned-equivalent to spot
   missing/defaulted fields.
3. Create one of each `setupType` (lfn, bsn, standalone, partnerApplication) to
   confirm all are accepted.
4. `DELETE` each test setup. (Note existing lingering test data per the project
   memory; clean up after.)

If any `setupType` fails from-scratch, fall back to a hybrid: ship the canonical
default for the common types and keep a (deterministic, same-network,
same-`setupType`) clone only for the failing case.

## Decision needed

- Go/no-go on owning a canonical default vs. keeping clone.
- Whether a live create+delete in `alliancelab-sandbox-01` is authorized for the
  verification step above.
