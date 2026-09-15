# ADR-0040: The browser build is an installable shell that never caches workspace data

- Status: accepted
- Date: 2026-09-10

## Context

The browser build is deployed under `/app/` and is the only way to run Skriuw
on a phone. Without a manifest it cannot be installed, and without a cached
shell every cold launch waits on the network before the renderer, the SQLite
WASM module, and the OPFS worker can start. Both are the difference between an
application and a website.

Caching is dangerous here in a way it is not for a content site. SQLite over
OPFS is canonical storage (ADR-0027), the worker owns migrations, and cloud
replication is optional (ADR-0026). A cache that held workspace reads would
become a second, stale source of truth, and a shell served from one build while
another build had already migrated the database would violate the operation
protocol (ADR-0003).

Mobile browsers add a durability problem the desktop shell does not have: a
best-effort origin is evicted under storage pressure, and on iOS after a period
without a visit. Eviction of an OPFS workspace is lost work, not a cold cache.

## Decision

The browser build ships a manifest and a service worker, both scoped to the
deployment directory rather than the site root, so the marketing site is never
inside the application's scope.

The worker caches exactly two things: hashed build assets, which are immutable
by contract and already served with an immutable `Cache-Control`, and the shell
document, served stale-while-revalidate. Every other request, including all
non-GET traffic, all cross-origin traffic, and everything outside the
registration scope, passes through untouched. The worker never sees a workspace
read or a durable write, so it cannot become a second source of truth.

A revalidated shell is never swapped under a running session. The waiting
worker announces itself and the session offers a reload; the swap happens only
when the user accepts. A shell from one build therefore cannot drive a database
another build migrated, and a reload cannot discard edits that have not reached
the database yet.

Persistent storage is requested once the workspace opens. A denied request is
reported to the user while an export is still possible rather than logged and
forgotten, in keeping with the rule that recovery-relevant failures stay
visible.

Everything above is browser-only. The desktop shell serves its renderer over
the Tauri protocol, has no offline problem, and registers nothing.

## Consequences

The application starts from disk when offline and installs to a home screen
with the palette the user chose, because `theme-color` follows the live
`--background` token instead of a value frozen into the manifest.

The shell cache is invalidated by build hashes alone. A change to the cached
shape of the worker requires bumping its cache name, and `sw.js` must not be
served with a long-lived `Cache-Control` or updates cannot reach clients.

Storage durability on the web remains the browser's decision. Skriuw can ask
and warn; it cannot guarantee, which is one more reason the portable archive
(ADR-0007) is the supported backup.
