# ADR-0059: One native sync runtime, platforms supply the IO

- Status: accepted
- Date: 2026-11-06

## Context

`skriuw-sync` owned the cycle, the coordinator thread and the HTTP status
rules, but each platform drove a session its own way:

| | Desktop (`src-tauri/src/sync.rs`) | Mobile (`skriuw-mobile/src/sync`) | Browser (worker + `platform/browser/sync.ts`) |
| --- | --- | --- | --- |
| Loop owner | `SyncCoordinator` thread | `SyncCoordinator` thread | JavaScript scheduler, one bounded `sync_cycle` worker request at a time |
| Retry and backoff | coordinator (`SyncBackoff`) | coordinator | `SyncCycleState` in the worker, timers in JavaScript |
| Wake channel | `tungstenite` listener thread in the shell | the shell's own foreground socket | browser `WebSocket` in JavaScript |
| Provisioning | `reqwest` in the shell | foreign `MobileSyncNetwork` | `fetch` in JavaScript |
| Origin and token checks | own copy | own copy | own copy in the worker |
| Link rules | own copy | own copy | own copy in the worker and in JavaScript |
| Encryption state, recovery view | own copy | own copy | worker commands |
| Maintenance suspension | yes | no | not applicable |
| Asset store | image blob directory | foreign `MobileAssetStore` | OPFS asset database |

Desktop and mobile carried two near-identical copies of the session
lifecycle, and they had drifted: mobile re-provisioned on every connect and
could start sync after a pause that landed during provisioning, both of which
desktop had already fixed.

## Decision

`skriuw-sync` owns the platform-neutral half of a session:

- `origin`: which cloud origins a build trusts with the bearer credential and
  which credentials are well formed. Platforms only name their development
  hosts. `SyncRuntime::connect` takes a `TrustedCloudOrigin`, which only the
  check (or an explicit debug override) can produce.
- `link`: what a provisioning answer means, the provisioning status
  classification, and the rule that a store linked to one cloud workspace is
  never linked to another.
- `wake`: the wake listener's reconnect policy (1 s to 60 s doubling, exit on a
  refused session or a dropped coordinator) over a platform `WakeConnector`.
- `runtime`: `SyncRuntime`, which serializes connects, reuses a running
  session, stops a connect overtaken by a pause, suspends sync during
  maintenance, owns the wake listener, and serves the recovery and encryption
  use cases on short-lived connections.

A platform supplies only IO: a `SyncCloud` (its HTTP transport, which also
implements `SyncProvisioner`, and optionally a wake connector), a
`SyncAssetStore`, a function that opens the workspace database, and the
entropy for a recovery code. `runtime` and `wake` need threads and are gated
out of `wasm32`; `origin` and `link` are plain functions every target uses.
`skriuw-sync` gains no network dependency, so the mobile facade's linkage
boundary (`crates/skriuw-mobile/tests/dependencies.rs`) holds.

Desktop and mobile both drive sessions through `SyncRuntime`. The browser
worker adopts `origin` and `link` only. Its loop stays in JavaScript
(ADR-0028) because the worker is single-threaded and serializes sync with
persistence; a coordinator thread cannot run there.

## Consequences

- Desktop's shell keeps its `reqwest` transport, `tungstenite` socket, image
  blob store and the debug `SKRIUW_CLOUD_URL` override. Its Tauri commands and
  their messages are unchanged.
- Mobile gains desktop's connect deduplication and pause-during-connect
  guard. A connect for the session already running now returns its status
  instead of re-provisioning.
- Both platforms remember the last reported visibility and apply it to a
  session that starts later, instead of always starting at the focused
  cadence.
- Encryption calls use the transport of the running session only, so after a
  pause they ask for sign-in instead of reusing the paused credential.
  Maintenance refusal is checked before the session, so a restore always
  reports that sync is paused.
- The browser worker's origin check rejects URLs with spaces and its token
  check rejects control characters, matching the native rules.
- What remains per platform: the browser's scheduler, provisioning and wake
  channel are TypeScript and mirror the native policy by hand; the browser and
  native retry constants are not shared code.
- `maintenance.rs` in the desktop shell stays there. It drives Git history,
  the image store, scheduled backups and the live database swap, none of which
  mobile or the browser run; only the history batch loop and the rotation
  delay are pure, and they have no second consumer.
