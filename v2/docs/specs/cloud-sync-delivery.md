# Cloud and web delivery plan

Status: implementation plan.
Canonical scope and completion status: [cloud sync master tracker](cloud-sync-master.md).

This plan divides the complete connected-desktop and browser product into
bounded agent assignments. It does not authorize skipping the invariants in the
master tracker, [ADR-0026](../adr/0026-optional-cloud-operation-replication.md),
or the [performance contract](../performance-contract.md).

## Product outcome

The shipped feature has three modes:

| Mode | Account/network | Canonical interaction store | Sync behavior |
| --- | --- | --- | --- |
| Local desktop | Neither required | Native SQLite | No cloud activity |
| Connected desktop | Explicit account + workspace connection | Native SQLite | Durable background operation replication |
| Web | Account required after public launch | Worker-owned SQLite WASM over OPFS | Offline edits converge in the background |

Typing, navigation, local search, export, and recovery must never await cloud
work. SQLite files/pages are never replicated. Every remote change is a
versioned, validated domain operation; unsafe document reconciliation preserves
both versions rather than silently choosing one.

## Working rules for all agents

- Start from the master tracker and current code, not this document alone.
- Preserve unrelated work in the currently dirty tree. Use an isolated worktree
  or coordinate file ownership before editing overlapping areas.
- Make each implementation task independently reviewable: contract/migration,
  implementation, public-interface tests, and documentation in one change.
- Regenerate and commit Rust/TypeScript contracts whenever domain wire types
  change. Never hand-edit generated schemas.
- Test recovery-visible failures, restart behavior, and duplicate delivery at
  every durable boundary.
- No agent may make a network request part of an editing or navigation path.
- `./scripts/check.sh` is the v2 integration gate. A focused command named in a
  task is the minimum iteration check, not permission to skip the final gate.

## Dependency map

```text
A protocol + operation policy
├── B local connected-storage/outbox ──── D desktop sync client ───┐
├── C cloud authenticated data plane ──────────────────────────────┼── F convergence + recovery
└── E browser local runtime ───────────── G web account/hydration ─┘
                         C large-content/checkpoints ──────────────┘
F product safety + observability ────────────────────────────────── H private beta
```

`A`, `C` (internal-only hardening), and `E` can begin together. `B` requires
`A`; `D` requires `B` and authenticated `C`; `G` requires `E` and authenticated
`C`; `F` is designed alongside A/B/C but only integrates after D/G can exchange
operations. `H` is the release gate, not a work stream that can compensate for
missing prerequisites.

## Agent assignments

### A. Protocol and replication policy owner

**Owns:** `crates/skriuw-domain/src/sync.rs`, operation classification,
`contracts/fixtures/`, generated sync schemas, protocol ADR/spec additions.

**Prerequisite:** none.
**Unblocks:** B, C validation, D, E parity, F convergence.

Deliver a versioned replication policy for every `WorkspaceOperation`: replicated
content operation, device-local state, or explicitly unsupported until a later
protocol version. Define stable operation/device IDs, client/server cursor
semantics, inline payload ceiling, capability/version negotiation, and error
codes. Do not mark an operation replicated simply because it serializes: state
the merge and tombstone implications.

Subagents may work in parallel on:

1. **Operation inventory:** produce a table mapping every operation family to
   replication class, ordering requirements, merge rule, and large-content
   handling. This is a review artifact in the spec/ADR before implementation.
2. **Contract implementation:** add only the agreed wire types, validators,
   schema generation hooks, golden JSON fixtures, and Rust validation tests.
3. **Compatibility tests:** test unknown versions, malformed IDs, bounds,
   duplicate IDs/sequences, and schema/fixture drift across Rust and Worker
   TypeScript.

Done when the classification is approved in repository documentation, generated
contracts are clean, and a Worker can reject invalid envelopes using the same
rules without duplicating an unbounded Rust implementation.

### B. Connected local-storage and transactional outbox owner

**Owns:** additive native SQLite migrations; sync connection, outbox, cursor,
and conflict-record storage ports/use cases; runtime tests.
**Prerequisite:** A.
**Unblocks:** D and F.

Add an optional connection record without changing local-only startup. On a
connected workspace, the same transaction that accepts a replicated local
operation must enqueue a durable outbox entry. Device-local operations must not
enter it. Local edits remain successful if the cloud is unavailable.

Subagents may work in parallel on:

1. **Schema/migration design:** forward-safe tables and indexes for connection
   metadata, device identity, monotonic client sequence, outbox states, pull
   cursor, applied-operation idempotency, and visible conflict/failure records.
2. **Storage use cases:** implement narrow transaction-bound operations for
   connect/disconnect, enqueue/lease/ack/retry, record pull cursor, and apply a
   remote envelope through existing domain validation.
3. **Failure suite:** restart between commit and upload, transaction rollback,
   retry after acknowledgement loss, duplicate pull, logout with pending work,
   and concurrent-runtime ordering tests.

Integrate these in one owner-controlled change because transaction semantics and
migrations overlap. Do not let subagents independently modify the same SQL
migration sequence.

Done when a deterministic test proves that a committed local replicated change
survives process restart and is uploadable exactly once semantically (retries
allowed), while a local-only workspace produces no sync rows or requests.

### C. Cloud control and data-plane owner

**Owns:** `cloud/`, Worker routes, Durable Object schema/RPC, auth and workspace
authorization adapters, R2 chunk/checkpoint transport, cloud tests and runbook.
**Prerequisite:** internal log exists; public routes require A before exposure.
**Unblocks:** D, G, F, H.

Keep one SQLite-backed `WorkspaceSyncObject` per workspace as the ordering atom.
The edge Worker authenticates and authorizes before routing to it; the DO must
not decide identity from caller-supplied workspace or user IDs. Preserve the
current internal-only route posture until both are implemented and tested.

Subagents may work in parallel on:

1. **DO log hardening:** validate the finalized protocol, persist device
   acknowledgement cursors, idempotency/conflict behavior, bounded ordered pull,
   compaction eligibility, and Durable Object migration tests.
2. **Control plane:** account/session verification, membership lookup, explicit
   workspace creation/connection authorization, route-level error mapping,
   expiry/revocation tests, and secret/configuration documentation. This needs a
   concrete auth provider decision before coding; do not borrow v1 auth.
3. **Large content and hydration:** content-addressed R2 upload/verify/dedup,
   chunk-reference operations, upload-resume failure cases, signed/access-safe
   retrieval, checkpoints, and new-device bootstrap bounds.
4. **Operations:** structured logs/metrics, abuse/rate limits, retention and
   compaction policy, incident recovery/runbook, deletion/purge worker paths.

The C owner decides the interfaces among these subtasks first. Chunk and
checkpoint formats are protocol changes, so A reviews them before merge.

Done when authenticated members can only read/write their workspace; retries
are idempotent; stale devices do not block safe compaction forever; a new device
can hydrate from a bounded checkpoint plus tail; and every public failure has a
safe, actionable client code.

### D. Desktop connected-mode owner

**Owns:** desktop sync coordinator, background scheduling/transport, Tauri
commands, connected-mode renderer state/settings, and desktop E2E coverage.
**Prerequisite:** B and public-authenticated C.
**Unblocks:** F and the desktop portion of H.

Build a background coordinator around B's narrow storage use cases. It uploads
leased outbox work after local commits, pulls on startup/reconnect/focus/manual
refresh and bounded polling, and applies remote operations outside the renderer
and runtime UI threads. It never turns local startup into sign-in or network
work.

Subagents may work in parallel on:

1. **Coordinator/transport:** cancellation, backoff, retry classification,
   session refresh, push/pull batching, lifecycle shutdown, and no-network-path
   instrumentation.
2. **Connection UX:** account/session UI, explicit workspace connect/upload
   flow, sync status, manual refresh, logout semantics, and accessible failure
   reporting. Existing local workspaces stay local unless the user opts in.
3. **Two-device harness:** deterministic fake server/clock plus desktop
   integration tests for convergence, offline queueing, reconnect, stale
   session, duplicate delivery, and conflicts.

The coordinator owns durable semantics; the UI reads narrow status projections
and must not implement retry or conflict policy itself.

Done when two desktop databases can connect, edit offline, restart, reconnect,
and converge through the development cloud service while benchmarked local
typing/navigation behavior remains unchanged.

### E. Browser-local runtime owner

**Owns:** `crates/skriuw-sqlite-wasm`, browser worker implementation, OPFS
SQLite integration, browser bridge, web build/e2e parity, browser recovery ADR.
**Prerequisite:** A for final operation support; local boot work can start now.
**Unblocks:** G and the web portion of F/H.

Replace the current deliberate unavailable browser-worker stub with a worker
that owns the SQLite-WASM connection and OPFS VFS. It applies the shared native
migrations, implements the `WorkspaceStorage` use cases, and sends only typed
request/response data across the worker boundary. The renderer/store must not
gain adapter branches.

Subagents may work in parallel on:

1. **WASM/OPFS adapter:** select and document the SQLite WASM/VFS integration,
   worker lifecycle, migration execution, transaction behavior, capability
   detection, and corruption/open failures.
2. **Bridge and startup:** request serialization/error projections, worker
   initialization/readiness, browser lifecycle flush, test-only adapter seam,
   and browser build packaging without Tauri imports.
3. **Parity and performance:** run operation/archive/tree fixtures against
   native and browser adapters; browser E2E for fresh boot/edit/refresh/offline;
   measure interaction budgets using the performance contract.
4. **Browser safety design:** ADR for history strategy and browser recovery;
   define portable archive export/import as the recovery baseline before UI is
   shipped.

The E owner integrates adapter and bridge changes because the worker protocol is
one contract. No subagent may add a browser-only document model or migrations.

Done when a browser build creates/opens an OPFS workspace, edits offline,
refreshes without loss, exports/imports a validated archive, and passes the
same relevant fixture and interaction gates as desktop.

### F. Convergence, conflict, and recovery owner

**Owns:** merge policy implementation and tests, conflict records/UI contract,
tombstone retention, connected archive/export/import, account deletion and
cloud purge requirements.
**Prerequisite:** A; integration requires B/C/D or E as relevant.
**Unblocks:** H.

This stream converts ordered delivery into correct product behavior. Server
order is not a merge algorithm. Define deterministic behavior for each operation
family, including delete-versus-edit and structural moves; use explicit conflict
records and preserved document versions whenever automatic reconciliation is
unsafe.

Subagents may work in parallel on:

1. **Merge matrix/tests:** property-style and scenario tests for reordered and
   duplicate deliveries, two offline devices, clock skew, sequence gaps, and
   every classified operation family.
2. **Document conflicts:** preservation format, user-visible resolution flow,
   history/archive behavior, and tests proving neither version is silently lost.
3. **Tombstones/deletion:** retention rules tied to device cursors/checkpoints,
   safe resurrection prevention, account deletion, workspace cloud purge, and
   connected export semantics.

F should publish the merge matrix before modifying storage so B/D/E can build
the correct persistence seams. Conflicts are product data, not console-only
errors.

Done when all conflict classes have a specified result and public test, deleted
content cannot reappear incorrectly, user-visible recovery is possible, and
export/deletion flows have documented cloud behavior.

### G. Web account bootstrap and connected browser owner

**Owns:** web-only session/bootstrap flow, progressive workspace hydration,
browser sync coordinator and UI, web integration E2E.
**Prerequisite:** E and authenticated C; remote application uses B-equivalent
browser storage use cases and F's merge policy.
**Unblocks:** H.

After an OPFS workspace can run independently, connect it to the same protocol
as desktop. Authentication may gate opening a cloud workspace, but after local
hydration all interaction behavior is local-first. New-device hydration must
use C checkpoints/chunks, not an unbounded operation replay.

Subagents may work in parallel on:

1. **Session and workspace selection:** secure browser session handling,
   account bootstrap, workspace list/select/create, expiry/logout behavior, and
   no v1 auth dependencies.
2. **Hydration:** checkpoint/chunk download verification, progress and retry
   states, interrupted hydration recovery, and atomic handoff into OPFS.
3. **Browser coordinator/UI:** background push/pull scheduling, offline and
   conflict status, accessible sync controls, and test coverage across refresh
   and network transitions.

Done when a signed-in browser can hydrate a workspace, work offline after the
first bootstrap, refresh safely, and converge with connected desktop without
making editor/navigation await the network.

### H. Security, observability, performance, and release owner

**Owns:** cross-stream acceptance harnesses, threat model, privacy/encryption
decision, deployment configuration/rehearsal, beta criteria and rollback plan.
**Prerequisite:** starts at design time; final validation needs C–G.
**Unblocks:** public/private beta only.

Subagents may work in parallel on:

1. **Security/privacy:** threat model, authorization test matrix, secret and
   session handling review, abuse controls, encryption-at-rest/end-to-end
   encryption product decision, and security incident playbook.
2. **Observability/SRE:** dashboards and structured event taxonomy that exclude
   note content, propagation and queue metrics, alerts, load/compaction tests,
   backup/restore and cloud recovery drills.
3. **Performance/release:** representative desktop and browser measurements,
   two-device end-to-end suite, staged rollout/feature flag plan, release
   checklist, account-deletion verification, and rollback/kill-switch rehearsal.

Done when the private-beta checklist is satisfied: auth/authorization, chunks,
checkpoints, conflicts, observability, recovery, deletion, convergence tests,
and desktop/browser performance evidence are all complete. No public launch is
allowed on the basis of a functioning happy-path sync demo.

## Recommended delivery sequence

| Wave | Agent work that may proceed together | Merge gate |
| --- | --- | --- |
| 0 | A inventory/contract; C DO hardening design; E OPFS feasibility + recovery ADR | Protocol policy approved; no public routes |
| 1 | A implementation; B schema/use cases; C control-plane implementation; E local adapter/bridge | Contracts regenerated; local-only regression suite passes |
| 2 | B failure suite; C auth + log tests; E browser parity/performance; F merge matrix | Authenticated development API and durable local outbox |
| 3 | D desktop proof; C chunks/checkpoints; F conflict/tombstone implementation | Two desktop databases converge under fault injection |
| 4 | G web bootstrap/sync; D connection UX; H security/observability/perf | Desktop ↔ browser offline/refresh convergence |
| 5 | F deletion/export; H beta rehearsal | Private-beta release criteria met |

At each wave, designate one integration owner to rebase the parallel changes,
regenerate contracts, run `./scripts/check.sh`, and update the master tracker
with code/test/benchmark links. A task is not complete merely because its
subagents produced patches; it is complete only after the owner proves its done
condition and records the evidence.

## Explicit non-goals and stop conditions

- Do not reuse v1 web, cloud, collaboration, schemas, or authentication.
- Do not deploy public sync routes before authentication and workspace
  authorization have independently passed their tests.
- Do not release browser mode with an in-memory or IndexedDB-only substitute for
  the specified worker-owned SQLite/OPFS durability model without a new ADR,
  measured evidence, and an explicit scope decision.
- Do not ship automatic document merging where the merge matrix marks the result
  unsafe.
- Do not treat raw SQLite copies as browser backup or cloud replication.
