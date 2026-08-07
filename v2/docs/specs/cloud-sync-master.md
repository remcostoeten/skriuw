# Cloud sync master tracker

Status: active implementation contract.

This is the canonical tracker for the new v2 cloud and browser work. It is a
durable product specification, not a release checklist or agent handoff. Every
completed item must link to code, tests, an ADR, or benchmark evidence. Nothing
under `apps/` or `packages/` is an implementation dependency: v1 is not reused.

For bounded multi-agent assignments, dependency ordering, and per-stream done
conditions, see the companion [cloud and web delivery plan](cloud-sync-delivery.md).
This tracker remains the canonical source of scope and completion status.

## Product contract

Skriuw has two desktop modes and one web mode:

- Local desktop requires no account or network and keeps the current behavior.
- Connected desktop keeps SQLite as the interaction database and synchronizes
  in the background after an explicit workspace connection.
- Web requires an account, keeps its interaction database in worker-owned
  SQLite over OPFS, and uses the same v2 operation and sync contracts.

Logging out stops synchronization without deleting the local desktop copy.
Cloud availability never gates typing, navigation, local search, export, or
recovery. No network request is permitted on those interaction paths.

## Selected system shape

```text
desktop renderer                     web renderer
       |                                  |
native SQLite runtime              SQLite WASM worker + OPFS
       |                                  |
       +---------- durable outbox --------+
                          |
                authenticated Worker API
                          |
              one WorkspaceSyncObject per workspace
                 |                      |
          ordered SQLite log       R2 content chunks
```

The first cloud implementation uses one SQLite-backed Cloudflare Durable
Object as the coordination atom for each workspace. D1 may later hold account
and workspace membership indexes; it is not workspace content storage. R2 is
required before documents or assets above the inline-operation ceiling can
sync.

See [ADR-0026](../adr/0026-optional-cloud-operation-replication.md).

## Performance invariants

- Renderer state changes and paints before persistence or sync acknowledgement.
- Local SQLite commits remain serialized and transactional.
- Enabling sync adds an outbox write to the local transaction; it never adds a
  network wait.
- Pull, merge, checkpoints, and notifications run outside editing and
  navigation paths.
- Cached navigation preserves every budget in
  [the performance contract](../performance-contract.md).
- Online propagation is measured separately from local interaction latency.

## Sync protocol invariants

- Rust domain types are the canonical wire-contract source.
- Every client operation has a stable operation ID, device ID, monotonically
  increasing client sequence, and observed server sequence.
- The workspace Durable Object assigns one monotonically increasing server
  sequence and accepts retries idempotently.
- Reusing an operation ID or client sequence with different content is an
  explicit conflict, never a silent overwrite.
- Pull is cursor based and ordered by server sequence.
- Deletes require tombstones until every retained device/checkpoint no longer
  needs them.
- Full-document operations larger than the bounded inline ceiling travel as
  content-addressed chunks under sync protocol 2; they are never truncated, and
  an operation is never published while any chunk it references is missing.

## Delivery tracker

### Foundation

- [x] Preserve the portable `skriuw-domain` and `skriuw-storage`
  [WASM gate](../../scripts/check-wasm.sh).
- [x] Confirm [native SQLite remains canonical](../adr/0002-sqlite-canonical.md)
  and local-only by default.
- [x] Commit versioned
  [Rust sync contracts](../../crates/skriuw-domain/src/sync.rs) and generated
  JSON Schemas.
- [x] Add a
  [cross-language golden wire fixture](../../contracts/fixtures/sync-push-v1.json).
- [x] Classify every `WorkspaceOperation` through the exhaustive
  [sync policy](workspace-operation-sync-policy-v1.md), including protocol-v1
  unsupported operations and Worker rejection behavior.
- [x] Add an optional
  [local connection record and transactional sync outbox](local-sync-outbox.md).
- [x] Add restart, rollback, retry, disconnect, acknowledgement-loss, and
  partial-failure tests for the outbox.

### Cloud data plane

- [x] Scaffold the
  [v2-only Worker and SQLite-backed Workspace Durable Object](../../cloud/src/workspace-sync-object.ts).
- [x] Implement bounded, idempotent ordered push and cursor pull in that object.
- [x] Test retries, sequence gaps, conflicting duplicates, and
  [workspace isolation in the Workers runtime](../../cloud/test/workspace-sync-object.spec.ts).
- [x] Add and test the fail-closed
  [provider-independent authentication and authorization boundary](cloud-sync-authentication.md),
  including roles, device binding, generated operation-field validation, safe
  errors, sanitized logs, and authorization before Durable Object resolution.
- [x] Connect deployed Better Auth bearer sessions to server-owned D1
  workspace membership and bounded device provisioning before resolving a
  workspace Durable Object.
- [x] Add per-device acknowledgement cursors and bounded
  [log compaction](sync-content-operations.md).
- [x] Add R2 content-addressed chunks for large documents through the
  [versioned chunk contract, protocol-v2 admission, and authorized transfer](sync-content-chunks-v1.md).
  Media assets still have no referencing operation.
- [x] Add checkpoints that can hydrate a new device without replaying an
  unbounded log.
- [x] Externalize oversized operations from the client transport end to end,
  with [chunk upload on push and verified reassembly on pull](sync-content-chunks-v1.md).
- [ ] Add structured observability, abuse limits, and recovery procedures. The
  [operational contract](sync-content-operations.md) is written; quotas and
  metrics are not yet enforced or measured in production.

### Desktop connected mode

- [x] Add optional, lazy-loaded account/session UI without changing local startup.
- [x] Add explicit desktop account provisioning, a production HTTP transport,
  and transactional initial upload of supported existing workspace state.
- [x] Push the durable outbox immediately after local commit through the
  [background sync coordinator](desktop-sync-coordinator.md).
- [x] Pull on startup, reconnect, focus, manual refresh, and bounded polling
  with coalesced triggers and a single loop per workspace.
- [x] Apply remote operations through the same domain/storage validation path.
- [x] Preserve pending local changes across logout and process restart.
- [x] Surface the narrow sync status and retry/pause states in Account settings
  without blocking local editing.

### Browser runtime

- [x] Implement the worker transport and browser `WorkspacePort`.
- [x] Implement SQLite WASM over OPFS using the shared migrations and prove a
  [real Chromium close/reload round trip](../../app/e2e/browser-storage.mjs).
- [x] Pass native/browser operation and archive fixture parity.
- [x] Define browser history and recovery behavior in
  [ADR-0027](../adr/0027-browser-sqlite-opfs-sah-pool.md).
- [ ] Add account bootstrap and progressive workspace hydration.
- [ ] Prove the browser build against the interaction performance contract.

### Convergence and product safety

- [x] Define the [merge behavior per operation family](sync-convergence-v1.md).
- [x] Preserve both complete document versions when automatic reconciliation is
  unsafe, and resolve them through the
  [pure reconciliation decision](../../crates/skriuw-domain/src/reconcile.rs)
  and its keep-local/keep-remote/merged use case.
- [x] Retain terminal identity tombstones that block resurrection, with
  [delete-versus-edit coverage](../../crates/skriuw-sqlite/src/tests.rs).
- [ ] Compact tombstones and resolved conflicts once per-device
  acknowledgement and checkpoint evidence exists.
- [ ] Decide whether cloud content is end-to-end encrypted before public beta.
- [ ] Test two offline devices, clock skew, duplicate delivery, reordered
  delivery, expired sessions, and interrupted large uploads. Two offline
  devices forking the same document — both-version preservation, per-device
  resolution, and convergence without resolution ping-pong — plus duplicate
  delivery and expired sessions are covered in
  [`cycle_scenarios.rs`](../../crates/skriuw-sync/tests/cycle_scenarios.rs);
  clock skew, reordered delivery, and interrupted large uploads remain open.
  Conflict records are intentionally per-device: every device that observed
  the fork resolves it locally, and replicated resolutions apply as ordinary
  saves (identical content is a semantic no-op).
- [ ] Provide connected-workspace export, account deletion, and cloud purge.

## Milestones

1. **Ordered-log foundation (complete):** generated contracts plus an
   internal-only tested Durable Object push/pull log. No public route and no
   desktop behavior change.
2. **Desktop sync proof:** two desktop databases converge through a development
   cloud workspace while local-only mode remains byte-for-behavior compatible.
3. **Browser proof:** web boots from OPFS, edits offline, and converges after a
   refresh without importing Tauri code.
4. **Private beta:** authentication, authorization, chunks, checkpoints,
   conflicts, observability, recovery, and deletion are complete.

## Current implementation status

Milestone 1 and the authenticated desktop transport slice are implemented: Rust owns the bounded v1 sync contracts and
exhaustive [operation policy](workspace-operation-sync-policy-v1.md), committed
JSON Schemas, generated Worker policy, and a golden request fixture cover
language drift, and the v2-only cloud package has a tested SQLite Durable Object
ordered log. The Worker has a tested provider-independent
[security boundary](cloud-sync-authentication.md) plus deployed Better Auth
email/password identity backed by D1. Better Auth bearer verification and a
server-owned D1 membership/device registry now guard provisioning, push, and
pull. Authorization runs before Durable Object resolution and is rechecked on
every request.

This is not yet an end-user sync feature. Native SQLite owns the optional
[connection and transactional outbox](local-sync-outbox.md), inbound cursor,
received-operation idempotency, local-echo acknowledgement, durable semantic
conflict records, terminal identity tombstones, and preserved both-version
document conflicts with an explicit
[resolution use case](sync-convergence-v1.md).
The [desktop background coordinator](desktop-sync-coordinator.md)
now uses a bounded production HTTP transport after an explicit Account-settings
connection and resumes from the OS credential vault asynchronously on later
launches, while local startup remains network-free. The first connection
transactionally seeds supported existing inline workspace state — including
`AttachImage` operations for pre-existing images, ordered after their notes —
into the same durable outbox before later edits. The browser-local runtime now
bundles worker-owned SQLite WASM over OPFS and has native parity plus a real
Chromium restart-durability gate. Account bootstrap into a connected workspace,
cross-browser/performance evidence, browser sync bootstrap, the multi-device
convergence scenario matrix, base-proof field transforms, client-side tombstone
and conflict compaction, media assets, and cloud purge remain open.
The cloud now stores [content-addressed chunks, versioned checkpoints, and
per-device retention](sync-content-operations.md), and a fresh device can
hydrate from a verified checkpoint and replay only the ordered tail. The desktop
transport now externalizes oversized operations into chunks on push and verifies
and reassembles them on pull; automatic checkpoint publication and first-connect
hydration are not wired into the coordinator yet.
Local-only desktop behavior is unchanged.
