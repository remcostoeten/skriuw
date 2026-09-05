# ADR-0037: Automatic sync convergence

- Status: accepted
- Date: 2026-09-05

## Context

[ADR-0026](0026-optional-cloud-operation-replication.md) replicates versioned
domain operations through an ordered per-workspace log and applies them
through the same validation as local operations. It deliberately left
semantic convergence as a product rule per operation family, and
[sync convergence v1](../specs/sync-convergence-v1.md) filled that gap with a
conflict model: a divergent `SaveDocument` or `CreateNote` preserved both
complete bodies in `sync_document_conflicts`, every other unappliable
operation became a `sync_conflicts` row, the coordinator projected
`conflict { openConflicts }`, the renderer offered a conflict review surface
with keep-local, keep-remote, and merged resolution, and portable export
failed closed while any conflict stayed open (issue #347).

That model was safe but it was not a product. A workspace could sit in a
conflict state indefinitely because convergence depended on a user action on
every device that observed the fork; the same fork produced one review per
device; a note edited on two devices while both were offline showed a dialog
rather than a note; and export was refused for reasons unrelated to what the
user was exporting. The product goal for connected mode is zero user-facing
conflicts: every device converges on the same workspace without anyone being
asked to choose, and nothing anyone typed is discarded.

The document rule that migration `0021_sync_document_heads.sql` introduced
compared the incoming write's `base_server_sequence` with the local head. The
storage audit (finding C1) showed that this base is not a safe input: a device
learns its own write's server sequence from the push acknowledgement before
that write is echoed through pull, so a second local write created in that
window carries a base that claims to observe the first write while the local
head has not recorded it. Two devices reading the same log could therefore
classify the same pair of writes differently. A rule that only reads facts
both devices share — the server order and whether a local write is still
unsequenced — does not have that window.

## Decision

Convergence is deterministic and automatic. No operation family produces a
conflict record, a conflict status, or a resolution use case.

### Documents

An incoming remote document write `W` for note `N` with server sequence `S_w`
is decided against `H`, the greatest server sequence of a document write this
device has already incorporated for `N` (`sync_document_heads`, `0` when
absent), and `P`, whether this device holds an unsequenced local document
write for `N` in `sync_outbox` or as an unresolved `sync_blocked_operations`
row. The four rules are total and consult neither `base_server_sequence` nor
the device-local `revision` counter:

1. `W` is equivalent to the current body: outcome `no_op`; `H := max(H, S_w)`.
2. `P` holds: local wins; outcome `superseded` with reason
   `concurrent_document_version`; the body of `W` is preserved to history;
   `H := max(H, S_w)`.
3. `P` does not hold and `S_w > H`: remote wins; `W` applies with its expected
   revision rebased to the current local revision; `H := S_w`; the applied
   body enters history with provenance `remote`.
4. `P` does not hold and `S_w < H`: local wins; outcome `superseded`; the body
   of `W` is preserved to history; `H` is unchanged.

A `CreateNote` whose node already exists keeps the existing node record (the
first server-ordered record wins) and routes its document body through the
same four rules. A document write for a trashed note applies on every device;
trash is reversible unavailability, not a tombstone, and the sync apply path
bypasses the availability check for `SaveDocument` only. `tombstone_blocked`
applies to purged targets only; purge is terminal.

When a parked local document write is requeued and its body no longer equals
the canonical body, the queue enqueues a fresh `SaveDocument` of the current
canonical body instead of the stale one, so a device never pushes a body it
has already moved past.

### Every other family

All other replicated operations apply in server order through domain
validation: last writer by server sequence. An operation that cannot apply —
a purged target or dependency (`tombstone_blocked`), a missing dependency, an
identity collision (`identity_conflict`, first record stays), or a post-apply
validation failure (`tree_conflict`, `concurrent_field_edit`,
`collection_conflict`, `domain_conflict`) — is recorded as a `superseded`
received operation carrying its reason and a bounded detail, and the cursor
advances. No field transform, reorder merge, or placement substitution is
attempted; the reason codes of the earlier taxonomy are retained as the
`reason` vocabulary.

### History preservation

Losing document bodies are never discarded. `history_outbox` carries a
`provenance` column (`local`, `remote`, `superseded`); a superseded body is
written as a history-only row at the note's current revision with provenance
`superseded`, without touching the canonical document, its projections, or
the sync outbox. Remote applies write history with provenance `remote`. Only
consecutive `local` rows coalesce; a `remote` or `superseded` row closes the
coalescing window. The history materializer labels a superseded row
"Version from another device (superseded)".

### Schema

Migration `0023_automatic_convergence.sql` rebuilds `history_outbox` with
provenance, rebuilds `sync_received_operations` with the outcome set
`applied`, `local_echo`, `no_op`, `superseded` plus `reason` and `detail`
columns (existing `conflict` rows migrate to `superseded` with their reason
and message), drops `sync_document_conflicts` and `sync_conflicts`, adds the
`cloud_rejected` blocked reason, adds `sync_connection.rehydrated_through`,
and adds `sync_dangling_references`. The migration is forward-safe and its
checksum joins the immutable ledger.

## Consequences

- No conflict tables, contracts, commands, coordinator status, or renderer
  surface exist. `SyncStatus::Conflict`, `ResolveDocumentConflict`,
  `SyncConflictReviewView`, `DocumentConflictVersionsView`, the conflict
  Tauri commands, and the conflict review component are removed, together
  with the tests that depended on them; they are replaced by convergence
  tests asserting that both devices end with the same body and that the
  losing body sits in history with provenance `superseded`.
- Portable export no longer fails closed on sync state. Sections 3 and 4 of
  [sync convergence v1](../specs/sync-convergence-v1.md) as written before
  this decision — the conflict taxonomy, the both-version conflict artifact,
  user resolution, `ResolveDocumentConflict`, and the fail-closed export rule
  — are superseded; that specification now describes the superseded-record
  and history-provenance contract. The corresponding consequence in
  [ADR-0035](0035-note-annotation-layer.md) (annotation edits resolve as a
  document conflict) now reads: annotation edits converge as document writes
  under the rules above.
- Convergence argument: for every concurrent pair of document writes both
  devices keep the write with the greater server sequence. `H` is the greatest
  incorporated sequence for the note and only grows; `P` covers exactly the
  window in which a local write has no sequence yet, and a write that leaves
  that window either becomes the echo (already applied) or, if the server
  ordered it below a write already applied, is superseded on this device and
  on every other device by the same comparison. A device hydrated from a
  checkpoint (`H = 0` everywhere) and a device that replayed the log make the
  same choice for every later incoming write, so heads are neither seeded from
  checkpoints nor carried through rehydration.
- The `revision` counter stays a device-local optimistic-concurrency token and
  `base_server_sequence` stays a diagnostic in the received-operation record.
  Neither participates in the merge decision, which is why the
  ack-before-echo window cannot split two devices' decisions.
- History gains provenance, and a user recovers a superseded body by opening
  the note's history, on any device that materializes history. The browser
  runtime has no history materializer, so a superseded body written there is
  durable in `history_outbox` but not browsable until a materializer exists.
- What is still lost: a document body whose target note was purged before
  the write arrived is retained only inside
  `sync_received_operations.operation_json`; there is no note to attach a
  history row to. This is accepted for 1.0 and stays visible in the received
  record.
- Field-level merges are not attempted. Two devices editing different fields
  of the same property, template, or task record concurrently keep the later
  server-ordered record whole; the earlier record's values are retained in the
  received-operation record, not merged.
