# 28. Browser sync runs the native coordinator logic inside the storage worker

Date: 2026-08-06

## Status

Accepted

## Context

The browser runtime (ADR-0027) is local-only: the OPFS-backed SQLite worker
has no sync, checkpoint, or hydration path, while the desktop coordinator
(`skriuw-sync`) already proves ordering, idempotency, local-echo, convergence,
chunked content, and checkpoint behavior against the v2 Worker API (ADR-0026).
Reimplementing that protocol logic in TypeScript would create a second source
of truth for replication behavior that could drift from native. The
`skriuw-sync` cycle, hydration, checkpoint, and content modules are pure
synchronous orchestration over `&dyn` ports; only the coordinator's thread and
timer scheduling and the `reqwest` transport are native-only.

## Decision

The storage worker owns the entire browser sync lifecycle. `skriuw-sync`
compiles to `wasm32` with its thread-based coordinator and system clock gated
out; `run_sync_cycle`, checkpoint hydration/publication, and asset
externalization/resolution run unchanged inside the worker against the same
durable `WorkspaceSyncQueue` port.

- Transport: a synchronous XHR bridge in the worker script implements the
  crate's synchronous `SyncTransport` boundary — dedicated workers permit
  synchronous XHR, and each call is one bounded request with its own deadline.
  URLs and HTTP status classification live in the shared `skriuw_sync::http`
  module used by both the desktop `reqwest` transport and the browser bridge.
- Scheduling: `app/src/bridge/browser-sync.ts` replaces the coordinator
  thread. It submits one bounded `sync_cycle` worker request at a time and
  derives the next wake from the reported outcome, coalescing local commits,
  focus, and reconnect events like the coordinator's wake flag.
- Assets: replicated image bytes persist in a dedicated OPFS-backed SQLite
  asset store outside the canonical workspace schema, because the browser has
  no filesystem blob store and asset durability must hold before pulled
  operations apply.
- Progress: the worker posts out-of-band notifications (`requestId 0`) during
  multi-chunk transfers so checkpoint hydration stays visible while a worker
  request is in flight.
- Trust: the worker re-validates the cloud origin and session-token shape
  before creating a transport; a missing credential surfaces as
  `authenticationRequired` and is never bypassed.

## Consequences

- Browser and native replication behavior come from one Rust implementation;
  parity is enforced by `crates/skriuw-sqlite-wasm/tests/browser_sync_scenarios.rs`
  over the same fake transport used by the coordinator tests.
- Sync cycles serialize with persistence requests inside the single storage
  worker. Cycle work is therefore bounded (four push batches / four pull pages
  per cycle) so a renderer save acknowledgement waits at most one bounded
  cycle; renderer state updates synchronously and never waits on either.
- A long first-connect hydration executes inside one worker request with
  per-chunk (1 MiB) bounded transfers, a dedicated long client deadline, and
  visible progress; interruption leaves durable state untouched and the next
  cycle restarts hydration.
- The browser session token persists in `localStorage` under a versioned key
  (`app/src/features/auth/session-store.ts`) so a reload of a linked workspace resumes
  sync without interactive sign-in. Cookies are not an option because the
  cloud Worker is cross-origin and the auth client already runs the Bearer
  token flow, so `localStorage` is the least-novel fit; the accepted tradeoff
  is that an XSS compromise of the app origin could read the token, which the
  strict CSP and absence of third-party scripts mitigate. Hard lifecycle
  rules: the stored value is validated on load and cleared when malformed;
  explicit sign-out and any server session rejection (provision 401 or a
  cycle reporting `authenticationRequired`) clear it; the token is never
  logged. The server stays the authority on expiry — the client performs no
  expiry guessing, and a rejected persisted session degrades to
  `authenticationRequired`.
- The Worker API must allow `PUT` in CORS preflight for chunk uploads from
  browser origins.
