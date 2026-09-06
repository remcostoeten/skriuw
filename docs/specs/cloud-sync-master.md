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
  in the background. Signing in is the explicit workspace connection: an account
  grants no capability other than sync, so a signed-in, unsynchronized device is
  not a state the product offers. Pausing is a separate, deliberate action.
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
- [x] Publish the compaction floor and answer a pull below it with
  `log_truncated` (HTTP 410) so a lagging device rehydrates instead of
  retrying forever; keep push idempotency across compaction through the
  compaction-immune operation index. See
  [sync content operations](sync-content-operations.md).
- [x] Enforce the per-workspace 2 GiB content quota (`quota_exceeded`, HTTP
  413), two-phase chunk deletion, the unreferenced-object sweep, and
  expired-socket closing.
- [ ] Add structured metrics and abuse limits beyond the quota. The
  [operational contract](sync-content-operations.md) is written; request-rate
  limits and metrics are not yet enforced or measured in production.

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
- [x] Converge automatically with no user-facing conflict: documents by the
  four-rule server-sequence decision in the
  [pure reconciliation decision](../../crates/skriuw-domain/src/reconcile.rs),
  every other family last-writer-by-server-sequence, losing bodies preserved
  as history with provenance `superseded`
  ([ADR-0037](../adr/0037-automatic-sync-convergence.md)).
- [x] Retain terminal identity tombstones that block resurrection, with
  [delete-versus-edit coverage](../../crates/skriuw-sqlite/src/tests.rs).
- [x] Recover a device below the server's compaction floor by rehydrating
  from a checkpoint with an empty outbox, keeping blocked rows and tombstones.
- [x] Propagate remote changes into the open editor: per-cycle change sets,
  narrow document reads, and an in-place editor merge without an undo entry.
- [ ] Compact client-side tombstones and received records once per-device
  acknowledgement and checkpoint evidence exists.
- [ ] Decide whether cloud content is end-to-end encrypted before public beta.
- [x] Test two offline devices reconnecting in either order, duplicate
  delivery, three-device ack-before-echo, parked write then remote write then
  retry, expired sessions mid-push and mid-pull, and rehydration after
  truncation in
  [`cycle_scenarios.rs`](../../crates/skriuw-sync/tests/cycle_scenarios.rs).
- [ ] Test clock skew, reordered delivery, and interrupted large uploads.
- [ ] Provide account deletion and cloud purge. Connected-workspace portable
  export carries canonical state and is no longer gated on sync state.

## Milestones

1. **Ordered-log foundation (complete):** generated contracts plus an
   internal-only tested Durable Object push/pull log. No public route and no
   desktop behavior change.
2. **Desktop sync proof:** two desktop databases converge through a development
   cloud workspace while local-only mode remains byte-for-behavior compatible.
3. **Browser proof:** web boots from OPFS, edits offline, and converges after a
   refresh without importing Tauri code.
4. **Private beta:** authentication, authorization, chunks, checkpoints,
   automatic convergence, observability, recovery, and deletion are complete.

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

Sync 1.0 converges without user action. Native SQLite owns the optional
[connection and transactional outbox](local-sync-outbox.md), inbound cursor,
received-operation idempotency, local-echo acknowledgement, superseded
received records, terminal identity tombstones, document heads, and history
provenance; [sync convergence v1](sync-convergence-v1.md) is the merge
contract and [ADR-0037](../adr/0037-automatic-sync-convergence.md) the
decision. The [desktop background coordinator](desktop-sync-coordinator.md)
uses a bounded production HTTP transport with size-based timeouts after an
explicit Account-settings connection, resumes from the OS credential vault
asynchronously on later launches, adapts its poll to window visibility and the
wake channel, treats offline as a hint, stops on session expiry and hands the
renderer a sign-in state, and reports per-cycle change sets that the renderer
merges into the open editor; local startup remains network-free. The first
connection transactionally seeds supported existing inline workspace state —
including `AttachImage` and cover operations for pre-existing images, ordered
after their notes — into the same durable outbox before later edits. The
browser runtime bundles worker-owned SQLite WASM over OPFS with native parity,
a real Chromium restart-durability gate, and the same cycle scheduled by a
driver that retries transiently and re-establishes a lost session. The cloud
stores [content-addressed chunks, versioned checkpoints, and per-device
retention](sync-content-operations.md) behind a published compaction floor,
a compaction-immune push index, two-phase chunk deletion, an unreferenced
sweep, and a per-workspace quota; a fresh device hydrates from a verified
checkpoint and a lagging device rehydrates after `log_truncated`. Open:
request-rate limits and production metrics, client-side tombstone compaction,
end-to-end encryption, account deletion and cloud purge, clock-skew and
interrupted-upload tests, cross-browser performance evidence, and measured
Cloudflare propagation latency. Local-only desktop behavior is unchanged.
