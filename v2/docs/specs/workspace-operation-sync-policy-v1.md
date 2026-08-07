# Workspace operation sync policy v1

Status: implemented protocol policy.

This specification is the canonical product interpretation of the exhaustive
Rust policy in `skriuw-domain`. It classifies every operation in the current
`WorkspaceOperation` enum for sync protocol v1. The generated
[`workspace-operation-sync-policy-v1.json`](../../contracts/generated/workspace-operation-sync-policy-v1.json)
is the drift-checked Worker representation; it is generated from Rust and must
not be edited by hand.

## Classes and common rules

- **Replicated workspace content** may enter the v1 ordered workspace log after
  domain, envelope, sequence, identifier, and size validation.
- **Device-local state** is durable on one client but must not enter the cloud
  log. Portable archive membership does not by itself make state appropriate
  for live multi-device replication.
- **Unsupported by sync protocol v1** is valid local domain behavior whose
  prerequisites are absent from v1. The client must retain it locally and show
  a recovery-visible blocked state rather than dropping it.

Every replicated operation retains client order, receives one total
`serverSequence`, and must be applied in server order. That ordering is a
delivery fact, not a merge algorithm. Entity references still require causal
predecessors, domain validation still applies on remote application, and an
unsafe conflict must preserve recoverable content for the later convergence
work rather than silently selecting a winner.

Inline v1 accepts a serialized `ClientSyncOperation` only below
`MAX_INLINE_SYNC_OPERATION_BYTES` and a batch only below
`MAX_SYNC_BATCH_BYTES`. No operation is truncated. “Inline” below means the
operation is structurally suitable for inline transport, subject to those
bounds.

## Operation inventory

| Operation | Class | Ordering and conflict/merge rule | Tombstone or deletion implication | Content and v1 transport | Failure implication |
| --- | --- | --- | --- | --- | --- |
| `CreateTag` | Replicated | Must precede references to the tag. Same-ID divergent creates are conflicts; an identical retry is idempotent. | Establishes identity later protected by a delete tombstone. | Small metadata; inline. | Missing/duplicate identity is recovery-visible during remote apply. |
| `RenameTag` | Replicated | Requires the tag. Concurrent scalar renames resolve by server order in the later convergence layer. | Must not resurrect a deleted tag. | Small metadata; inline. | A rename of a missing/deleted tag is an explicit conflict. |
| `RecolorTag` | Replicated | Same scalar rule as rename. | Must not resurrect a deleted tag. | Small metadata; inline. | Missing/deleted target is an explicit conflict. |
| `DeleteTag` | Replicated | Ordered after creation; delete-versus-reference/edit needs convergence handling. | Requires a retained tag tombstone so stale devices cannot recreate it. | Small metadata; inline. | Dangling document references or premature tombstone removal are recovery-visible. |
| `CreatePerson` | Replicated | Must precede person-property and document references. Same-ID divergent creates conflict. | Establishes identity later protected by a delete tombstone. | Small metadata; inline. | Missing/duplicate identity is recovery-visible during remote apply. |
| `RenamePerson` | Replicated | Requires the person; concurrent scalar renames resolve by server order later. | Must not resurrect a deleted person. | Small metadata; inline. | Missing/deleted target is an explicit conflict. |
| `RecolorPerson` | Replicated | Same scalar rule as rename. | Must not resurrect a deleted person. | Small metadata; inline. | Missing/deleted target is an explicit conflict. |
| `DeletePerson` | Replicated | Ordered after creation; delete-versus-property/reference needs convergence handling. | Requires a retained person tombstone. | Small metadata; inline. | Referencing properties/documents and unsafe removal remain visible. |
| `CreateFolder` | Replicated | Parent and placement anchor must already exist. Divergent same-ID creates conflict. | New identity participates in subtree tombstones. | Small metadata; inline. | Missing parent/anchor, cycle, or ID collision is recovery-visible. |
| `CreateNote` | Replicated | Parent/anchor must exist. Same-ID divergence, including different initial documents, is a conflict. | New identity and its initial document participate in subtree tombstones. | Contains a full structured document plus Markdown. Inline only below the v1 ceiling; larger content requires future chunk transport and is rejected, never truncated. | Oversize is a user-visible blocked-sync error; unsafe document conflict must preserve content. |
| `RenameNode` | Replicated | Requires the node; concurrent scalar renames resolve by server order later. | Rename after trash may update retained content; rename after purge must not resurrect it. | Small metadata; inline. | Missing/purged target is an explicit conflict. |
| `SetNoteCover` | Replicated | Requires the note; a non-null image ID also requires causally available image content. Concurrent cover selections resolve by server order later. | Clearing the cover is not an asset tombstone; asset retention follows media references. | Small metadata inline, but referenced media requires future verified chunk transport. | A missing image must remain a visible pending/conflict state, not a broken silent reference. |
| `SetNoteCoverFullWidth` | Replicated | Requires the note; concurrent scalar updates resolve by server order later. | Must not resurrect a purged note. | Small metadata; inline. | Missing/purged note is an explicit conflict. |
| `SetNoteCoverTransform` | Replicated | Requires the note and existing cover; concurrent transform updates resolve as one server-ordered value. | Must not resurrect a purged note or deleted asset. | Small metadata; inline. | Missing note/cover or invalid transform is explicit. |
| `MoveNode` | Replicated | Source, parent, and anchor must exist. Server order chooses among concurrent valid moves; cycle/domain validation remains mandatory. | Moving a trashed/purged node must not resurrect it. | Small metadata; inline. | Missing anchors, cycles, and move-versus-delete conflicts are recovery-visible. |
| `SetNodePinned` | Replicated | Pins are workspace content. Concurrent pin/unpin resolves by server order using the operation timestamp only as content metadata, not transport order. | Trash preserves the pin; purge removes it with the node tombstone lifecycle. | Small metadata; inline. | Missing/purged target is explicit. |
| `SaveDocument` | Replicated | Requires the note. `expectedRevision` protects one local history but is not a multi-device merge rule; concurrent document saves must preserve both versions until the convergence layer resolves them. | Save after trash needs delete-versus-edit handling; save after purge must never recreate the note. | Contains a full structured document plus Markdown. Inline only below the v1 ceiling; larger content requires chunks and is rejected, never truncated. | Revision conflict and oversize are user/recovery-visible; neither document may be discarded. |
| `TrashSubtree` | Replicated | Requires the root. Concurrent descendant edits/moves need delete-versus-edit handling; server order alone is insufficient. | Creates subtree tombstones retained through device/checkpoint safety. | Small metadata; inline. | Partial trash application or hidden descendant conflict is recovery-visible. |
| `RestoreSubtree` | Replicated | Requires a retained tombstone plus valid parent/anchor. Concurrent restore/move/delete follows explicit convergence rules later. | Clears logical deletion only while the tombstone is still safely retained; it cannot reverse purge. | Small metadata; inline. | Missing tombstone/anchor or unsafe resurrection is explicit. |
| `PurgeSubtree` | Replicated | Records user intent in order, but physical removal on other clients/cloud must wait for acknowledgement/checkpoint retention rules. | Terminal tombstone intent; stale devices must not resurrect purged identities. | Small metadata; inline. | Premature physical purge is a recovery failure; deferred purge must remain visible. |
| `SetActiveNote` | Device-local | Navigation selection belongs to one device/session and has no cross-device merge meaning. | Local validation clears unavailable selections; no cloud tombstone. | Small, but forbidden from v1 replication. | Outbox admission must return `device_local_operation`; local persistence remains unchanged. |
| `UpdateSettings` | Device-local | Theme, accessibility, layout, and editor preferences are one device's presentation state. Archive portability remains supported, but live devices do not overwrite each other's preferences. | No tombstone. | Small bounded document, but forbidden from v1 replication. | Outbox admission must return `device_local_operation`; local settings remain usable. |
| `AttachImage` | Replicated | Requires the note and a verified content-addressed blob. The operation stays metadata-only; the bytes travel as an asset manifest on the same payload and are digest-verified on both sides before the metadata is applied. Identical ID/hash/owner is a no-op; divergent identity is a conflict. | Server retention pins asset chunks through `sync_chunk_refs` while any retained operation references them; local blob sweeping keys on live `note_images` rows. | Metadata is inline; the media bytes travel as canonical chunks referenced by the payload's asset manifest. | Missing local bytes block the push; missing or corrupt remote chunks fail the pull without applying partial content. |
| `SetNoteProperty` | Replicated | Requires note and referenced people/options. Same-property concurrent edits need value-aware convergence; server order is the deterministic fallback only where declared safe later. | Must not recreate a removed property or purged note without an explicit later operation. | Bounded metadata/value content; inline. | Invalid references and unsafe concurrent values are explicit conflicts. |
| `RemoveNoteProperty` | Replicated | Requires note/property identity; remove-versus-edit needs convergence handling. | Requires a property tombstone until stale edits cannot arrive. | Small metadata; inline. | Missing property and stale edit are recovery-visible. |
| `ReorderNoteProperties` | Replicated | Requires the exact surviving property set. Concurrent add/remove/reorder must be reconciled as an ordered-ID collection, not last-write of invalid positions. | Removed property IDs stay governed by their tombstones. | Bounded ID list; inline. | Missing/extra IDs are an explicit conflict. |
| `SetNotePropertyTemplate` | Replicated | Templates are reusable workspace content. Same-ID divergent creates/updates and referenced-person changes need convergence handling. | Recreating a deleted template requires explicit post-delete intent. | Bounded property metadata; inline. | Invalid references or conflicting template bodies are explicit. |
| `DeleteNotePropertyTemplate` | Replicated | Requires the template; delete-versus-update needs convergence handling. Existing note properties are independent content. | Requires a template tombstone. | Small metadata; inline. | Stale template update must not silently resurrect it. |
| `ReorderNotePropertyTemplates` | Replicated | Requires the exact surviving template set; concurrent add/delete/reorder is collection reconciliation. | Deleted IDs remain tombstoned. | Bounded ID list; inline. | Missing/extra IDs are an explicit conflict. |
| `RecordProviderImport` | Device-local | A receipt deduplicates one device's source ingestion; local paths/provider source keys have no safe workspace-wide merge meaning. Imported notes, documents, properties, and assets sync through their own operations. | Receipt removal/retention is local operational state, not a cloud tombstone. | Small metadata that may contain a local path, but forbidden from v1 replication. | Returns `device_local_operation`; the local receipt remains durable so re-import safety is unchanged. |

## Enforcement and evolution

`ClientSyncOperation::validate` and `ReplicatedWorkspaceOperation::validate`
both enforce the Rust policy. The Worker validates operation types against the
generated policy before starting its Durable Object transaction and returns
stable `device_local_operation` or `unsupported_operation` codes. Unknown
operation types remain `sync_rejected`.

The Rust match has no wildcard. Adding a `WorkspaceOperation` therefore fails
compilation until a policy is chosen. Tests also compare the policy inventory
with the generated operation schema, and Worker tests consume the same
generated policy. A later class change requires a deliberate Rust change,
contract regeneration, fixture/test review, and an update to this document.

The native transactional outbox is specified separately in
[the local sync outbox contract](local-sync-outbox.md). This policy does not
implement remote application, chunks, tombstone storage, or convergence. Those
remain separate tasks in the [cloud sync master tracker](cloud-sync-master.md).
