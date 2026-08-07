# ADR-0026: Optional cloud operation replication

- Status: accepted
- Date: 2026-08-03

## Context

Skriuw v2 must support an independent browser product and optional
multi-device synchronization without making the existing desktop application
account-dependent. Desktop SQLite is already canonical, renderer actions
already become versioned `WorkspaceOperation` values, and navigation is
required to remain independent of disk, IPC, and network work.

Remote database access on the interaction path would violate those guarantees.
Replicating SQLite database files or pages would also couple native and browser
storage engines, weaken operation validation, and make concurrent offline
writes unsafe.

## Decision

Local SQLite remains the interaction database on every client. A desktop
workspace is local-only until the user explicitly connects it; local-only mode
does not require an account and performs no sync work.

Connected clients replicate versioned domain operations through a durable
transactional outbox. The first cloud adapter uses one SQLite-backed Cloudflare
Durable Object per workspace. The object owns idempotency and assigns the total
server order for that workspace. Clients pull by server-sequence cursor and
apply remote operations through the same domain and storage validation used for
local operations.

The initial protocol bounds inline operations below the cloud SQLite row limit.
Large document bodies and media will use content-addressed R2 chunks referenced
by later protocol operations. Public sync endpoints use Better Auth bearer
sessions and server-owned D1 workspace membership/device records. Provisioning
derives the private workspace from the trusted account subject; clients cannot
claim a workspace, role, or membership in a request body.

The cloud service and all contracts are new v2 code. No v1 cloud, auth,
collaboration, schema, or API implementation is reused.

Every current operation has an explicit protocol-v1 class and transport,
ordering, deletion, conflict, and failure contract in the
[workspace operation sync policy](../specs/workspace-operation-sync-policy-v1.md).
The exhaustive Rust policy is canonical; the Worker consumes its generated
representation and rejects non-replicated operations before storage.

Native connected storage follows the
[local sync outbox contract](../specs/local-sync-outbox.md): replicated local
operations and their stable client identities commit atomically with canonical
SQLite state, while device-local operations produce no queue work and blocked
large/capability-dependent operations remain recovery-visible.

## Consequences

- Local interaction latency is independent of cloud latency and availability.
- Existing desktop workspaces and startup behavior remain valid.
- Connected mode requires additive local sync metadata, tombstones, conflict
  records, and recovery-visible failure handling.
- Server ordering makes delivery deterministic but does not by itself resolve
  semantic conflicts; convergence rules remain operation-family product rules.
- A new device needs checkpoints and content chunks before large workspaces can
  hydrate efficiently.
- The Durable Object adapter is replaceable at the operation protocol boundary;
  product code does not receive a generic cloud-database abstraction.
