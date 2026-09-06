# Sync convergence v1

Status: normative product contract, implemented in `skriuw-domain::reconcile`,
the SQLite inbound adapter, `skriuw-sync`, and the browser worker runtime.
[ADR-0037](../adr/0037-automatic-sync-convergence.md) records the decision.

- **implemented** — pre-apply reconciliation decisions (apply / no-op /
  superseded / protocol-invalid) for every replicated operation family; the
  four-rule document decision over `sync_document_heads`; terminal identity
  tombstones for node purge, tag, person, note-property, template, task,
  prompt, and annotation deletion; tombstone-blocked resurrection prevention;
  superseded received-operation records carrying a stable reason and bounded
  detail; history preservation of every losing document body with
  provenance `superseded`; batching-independent deterministic replay;
  rehydration from a checkpoint after server log truncation.
- **not offered** — field transforms, reorder merges, placement substitution,
  and any user-facing conflict state. Divergent same-record edits outside
  documents converge as last-writer-by-server-sequence; the earlier record is
  retained in the received-operation record only.

This specification defines deterministic convergence for sync protocol v1.
Ordered delivery is a transport property, not a merge algorithm: every device
that consumes the same ordered log reaches the same canonical state without
user action, and advancing a pull cursor never discards a document body that
a user typed.

## 1. Scope and invariants

### Canonical sources

The exhaustive Rust `WorkspaceOperation` enum and its wildcard-free sync-policy
match are the canonical operation inventory and replication classification.
The generated policy is a drift check, not a second source of truth. This
document defines convergence for that inventory and must change whenever either
Rust source changes.

Related constraints remain authoritative:

- [ADR-0026](../adr/0026-optional-cloud-operation-replication.md) defines the
  local-first replication architecture and
  [ADR-0037](../adr/0037-automatic-sync-convergence.md) the convergence
  decision.
- [Workspace operation sync policy v1](workspace-operation-sync-policy-v1.md)
  defines admission and transport classes.
- [Local sync outbox](local-sync-outbox.md) defines local commit, enqueue,
  retry, echo, blocked-row, and received-record behavior.
- [Desktop sync coordinator](desktop-sync-coordinator.md) defines triggers,
  status projection, and truncation recovery.
- [Data model](../data-model.md), [subtree trash and purge](../adr/0009-subtree-trash-and-purge.md),
  and [portable archives](../adr/0007-portable-workspace-archive.md) define
  current canonical local behavior.
- [Recovery](../recovery.md) defines verified native backup and restore.

Protocol v1 contains 44 operations: 41 replicated workspace-content
operations and three device-local operations (`SetActiveNote`,
`UpdateSettings`, `RecordProviderImport`). No operation is unsupported by
sync v1. This document accounts for all 44, while merge behavior applies only
to the 41 replicated operations.

### Ordering, causality, and cursors

Each accepted operation has stable `(deviceId, clientSequence, operationId)`, a
`baseServerSequence` observed before the local operation was created, and one
server-assigned `serverSequence`. Server sequence is the only order any
decision consults. `baseServerSequence` is retained in the received record as
diagnostic provenance and never selects a winner: a device learns its own
write's server sequence from the push acknowledgement before the write is
echoed through pull, so a base captured in that window is not a fact both
devices share. Wall-clock fields such as `at`, `createdAt`, or
`trashedBefore` never establish causality or select a winner either.

Clients consume a contiguous server sequence. The SQLite behavior is normative
for cursor mechanics:

- a gap rejects and rolls back the complete inbound transaction; a gap that
  the server reports as `log_truncated` is recovered by rehydration (section
  5), never by skipping;
- an exact duplicate of a previously received envelope is an idempotent no-op,
  including across restart;
- reuse of an operation ID or server sequence with different provenance or
  content is protocol-invalid and rolls back; it is not a semantic decision;
- a matching local echo removes its outbox row without reapplying the mutation;
- an applied, no-op, echoed, or superseded operation advances the cursor; a
  backend failure or malformed envelope does not;
- batch boundaries do not affect canonical state, superseded records,
  tombstones, history rows, or cursor outcome.

### Common application rules

1. Validate the sync envelope and operation before reconciliation. Unsupported
   protocol, invalid IDs/sequences, invalid operation fields, oversized
   payloads, conflicting duplicates, and sequence gaps are malformed/protocol
   failures. They do not consume the cursor and never become superseded
   records.
2. Resolve dependencies and tombstones, then reconcile against unsequenced
   local writes. A missing causal predecessor that is not tombstoned is a
   `missing_dependency` superseded record; the ordered log guarantees the
   predecessor was already delivered or never accepted, so nothing is held.
3. Apply unchanged only if normal domain validation succeeds. Decisions are
   pure functions of the received operation, the durable head/tombstone/outbox
   state, and the canonical record, never receipt time or batch shape.
4. When an operation does not apply, record it as `superseded` with its reason
   and bounded detail in the same transaction as the cursor advance, and
   preserve any document body it carried to history in that transaction.
5. Recovery-relevant records survive restart. A superseded document body is
   preserved as a history row, not only as a diagnostic.
6. Local echoes are acknowledgements of already-applied content, not a second
   merge attempt.

The inbound adapter records `applied`, `local_echo`, `no_op`, or `superseded`
per received operation. It isolates a semantic failure with a savepoint,
records the superseded row, continues later contiguous operations, and
advances the cursor atomically. Backend failures abort the transaction; a
busy or locked database is a transient retry, never a superseded record.

### Matrix notation

- **Apply**: submit the operation unchanged through domain/storage validation,
  with a document write's expected revision rebased to the current local
  revision.
- **No-op**: record the operation as received because its complete intended
  state is already present.
- **Superseded**: canonical state does not change; the received record stores
  the reason and detail named in the matrix.
- `R(reason)` means a `superseded` received-operation row with that reason.
- `Hist(body)` means the document body preserved as a `history_outbox` row with
  provenance `superseded` (section 4).
- `T(kind, id)` means the retained terminal tombstone in section 5.
- **Rules 1–4** means the document decision in section 4.

## 2. Exhaustive operation matrix

The “different target” column treats distinct identities as different targets.
Operations can still share a prerequisite; domain graph validation always has
the final word.

| Operation / class | Identity and prerequisites | Concurrent same target | Concurrent different target | Trash, delete, restore, purge | Result and durable evidence | Representative public tests |
| --- | --- | --- | --- | --- | --- | --- |
| `CreateTag` / replicated | Tag ID; referenced `createdIn` note, if present | Byte-equivalent semantic create is **No-op**; a divergent record keeps the first server-ordered record | **Apply**; later references follow this predecessor in the log | Cannot reuse an ID protected by `T(tag, id)` | No-op or apply; divergent create → `R(identity_conflict)`; tombstoned ID → `R(tombstone_blocked)` | identical and divergent same-ID creates; create/reference in separate batches; stale create after delete |
| `RenameTag` / replicated | Existing live tag | Later server sequence wins; exact same value is **No-op** | **Apply** | Delete wins availability; a rename of a deleted ID never resurrects it | Apply/no-op or `R(tombstone_blocked)` | two offline renames in reversed pull batches; rename/delete; missing tag |
| `RecolorTag` / replicated | Existing live tag | Same scalar rule as `RenameTag`; `name` and `color` commute | **Apply** | Same as tag rename/delete | Apply/no-op or `R(tombstone_blocked)` | rename versus recolor; recolor versus recolor; recolor after delete |
| `DeleteTag` / replicated | Existing tag; document reference cleanup must remain domain-valid | Duplicate delete is **No-op** against the tombstone | Different tags commute; a later reference to the deleted tag is superseded | Creates terminal `T(tag, id)`; never permits identity reuse | Apply plus tombstone; blocked later reference → `R(tombstone_blocked)` | duplicate delete; document reference versus delete; stale create/rename after delete |
| `CreatePerson` / replicated | Person ID; referenced `createdIn` note, if present | Equivalent create is **No-op**; divergent data keeps the first record | **Apply** | `T(person, id)` forbids stale recreation | Same as `CreateTag` | identical/divergent collision; delayed property reference; stale create |
| `RenamePerson` / replicated | Existing live person | Later server sequence wins; name and color commute | **Apply** | Delete wins availability | Apply/no-op or `R(tombstone_blocked)` | rename/rename, rename/recolor, rename/delete |
| `RecolorPerson` / replicated | Existing live person | Later server sequence wins; name and color commute | **Apply** | Same as person rename | Apply/no-op or `R(tombstone_blocked)` | recolor/recolor; different-field edit; deleted target |
| `DeletePerson` / replicated | Existing person; no surviving property/template person reference | Duplicate with matching tombstone is **No-op** | Different persons commute. A concurrent property/template reference arriving later is superseded, matching referential safety | Creates terminal `T(person, id)`; stale references and recreates are blocked | Apply plus tombstone; blocked reference → `R(tombstone_blocked)` or `R(domain_conflict)` | referenced delete; delete versus property/template; stale recreate |
| `CreateFolder` / replicated | New node ID; active folder parent; active direct-child anchor | Equivalent create is **No-op**; divergent title/placement/kind keeps the first record | **Apply** when prerequisites exist | Ancestor trash blocks canonical creation under it; purged parent or reused tombstoned ID is superseded | Apply/no-op, `R(identity_conflict)`, `R(missing_dependency)`, or `R(tombstone_blocked)`; create establishes lineage tracked by `T(node, id)` | same-ID collision; missing parent/anchor; create under trashed/purged parent |
| `CreateNote` / replicated | New node ID; parent/anchor; valid complete document and references | Node fields keep the first server-ordered record; the incoming document body goes through **Rules 1–4** as a `SaveDocument` of that body | **Apply** when prerequisites exist | Same structural rule as folder; purged ID cannot return | Node: apply/no-op or `R(identity_conflict)`; body: apply, no-op, or `R(concurrent_document_version)` + `Hist(body)`; purged ID → `R(tombstone_blocked)` with the body retained in the received record | two devices create same ID with different bodies; missing reference; tombstoned ID reuse |
| `RenameNode` / replicated | Existing node, trashed or active | Later server sequence wins; exact value is **No-op**. Rename and move/pin operate on distinct fields | Different nodes commute | Rename applies to a trashed node without restoring it; purge blocks | Apply/no-op or `R(tombstone_blocked)` | rename/rename; rename/move; rename versus trash and purge |
| `SetNoteCover` / replicated | Note; non-null image metadata and verified bytes owned by that note | Later server sequence wins; exact selection is **No-op** | Different notes commute | Purge or asset tombstone blocks; a stale cover change cannot recreate note or asset | Apply/no-op or `R(missing_dependency)` / `R(tombstone_blocked)` with the cover reference in the received record | two covers; clear versus select; missing bytes; edit versus purge |
| `SetNoteCoverFullWidth` / replicated | Note and current cover when setting true | Later server sequence wins | Different notes commute | Purge blocks without resurrection | Apply/no-op or `R(domain_conflict)` / `R(tombstone_blocked)` | full-width before cover across batches; clear-cover race; purged note |
| `SetNoteCoverTransform` / replicated | Note and current cover | The `(positionX, positionY, zoom)` tuple is one scalar; later server sequence wins | Different notes commute | Purge or removed cover blocks; never retarget to a different image implicitly | Apply/no-op or `R(domain_conflict)` / `R(tombstone_blocked)` | transform/transform; transform versus cover replacement/clear; purge |
| `MoveNode` / replicated | Available source; active folder parent; active sibling anchor; acyclic result | Later valid move wins; exact destination is **No-op**; never timestamps | Moves of different nodes apply in server order if each remains valid; a resulting cycle or invalid anchor is superseded | Move never restores. Trash/purge of source or destination blocks it; a deleted anchor is not silently replaced | Apply/no-op, `R(tree_conflict)`, `R(missing_dependency)`, or `R(tombstone_blocked)` with the requested placement in the received record | move/move; crossed parent moves; parent deletion; missing anchor; cycle; batch-independent ranks |
| `SetNodePinned` / replicated | Existing available node | Later server sequence wins; commutes with rename/move | Different nodes commute | Trash rejects pin changes until restore; purge blocks | Apply/no-op, `R(domain_conflict)`, or `R(tombstone_blocked)` | pin/unpin; pin/move; trash then restore; purge |
| `SaveDocument` / replicated | Existing note, active or trashed; valid full JSON/Markdown/reference set; expected revision rebased | **Rules 1–4**: equivalent body → No-op; unsequenced local write pending → local wins; else the greater server sequence wins | Different notes commute; late note references are tolerated on the sync path through `sync_dangling_references` | An edit of a trashed note applies and becomes visible on restore; purge blocks and the body stays in the received record beside `T(node, id)` | Apply (history provenance `remote`), no-op, or `R(concurrent_document_version)` + `Hist(body)`; purged → `R(tombstone_blocked)` | two offline writers in either order; edit/trash then restore; edit/purge; references arriving late; restart/backup recovery |
| `TrashSubtree` / replicated | Available root and complete current subtree lineage | Duplicate matching trash is **No-op**; a later restore in server order wins | Disjoint subtrees commute. Ancestor/descendant trash collapses to unavailable state while preserving every direct marker | Sets `deleted_at`; this is not a tombstone. Concurrent document edits to trashed notes apply; concurrent moves/pins of trashed nodes are superseded | Apply; preserve direct nested trash markers; superseded structural edits → `R(domain_conflict)` | duplicate trash; nested trash; edit/move versus trash; active-note clearing |
| `RestoreSubtree` / replicated | Direct trash marker; active destination/anchor; acyclic result | Later restore in server order wins; identical destination is **No-op** | Disjoint roots commute | Cannot reverse purge. Missing/trashed/purged destination or anchor is superseded; root is not auto-moved. Document edits applied while trashed are visible after restore | Apply/no-op or `R(tree_conflict)` / `R(tombstone_blocked)` retaining the requested placement | restore destination loss; two restores; independently trashed descendant; restore after purge; edit while trashed then restore |
| `PurgeSubtree` / replicated | Directly trashed root and retention intent | Duplicate purge is **No-op** against the terminal tombstone. A later restore or edit in server order is superseded: purge is terminal | Disjoint purges commute | Converts trash to terminal `T(node, root)` covering every descendant identity | Apply plus tombstone; later edits → `R(tombstone_blocked)` with body retained in the received record | edit/restore versus purge; nested markers newer than cutoff; delayed device; restart |
| `SetActiveNote` / device-local | Available local note or `None` | No cross-device merge meaning | Local only | Local availability rules clear invalid selection; no sync tombstone | Never admitted to v1 log | outbox rejects class while local state commits; archive behavior remains local contract |
| `UpdateSettings` / device-local | Valid whole `WorkspaceSettings` document | No cross-device merge meaning | Local only | None | Never admitted to v1 log | two devices retain different settings; outbox rejects class; archive round trip |
| `AttachImage` / replicated | Owner note, unique image ID, verified content hash and bytes | Identical ID/hash/owner is **No-op**; divergent identity keeps the first record | Different images commute once chunks exist | Note purge blocks | Apply after the asset bytes are downloaded, digest-verified, and durably stored; missing or corrupt content fails the pull before anything applies; `R(identity_conflict)` / `R(tombstone_blocked)` | remote attach convergence; duplicate identical attach; note tombstone blocks attach; missing chunk; corrupt chunk |
| `SetNoteProperty` / replicated | Note; property ID; valid typed value/options/person references; valid position for create | Same complete value is **No-op**; otherwise the later server sequence wins whole-record, no field transform | Different property IDs and different notes commute | Removed-property tombstone or purged note blocks stale upsert | Apply/no-op, `R(tombstone_blocked)`, or `R(domain_conflict)` for invalid references; `T(note_property, note/id)` on removal | same field; different fields; different IDs; person deletion; remove/edit |
| `RemoveNoteProperty` / replicated | Note and live property ID | Duplicate is **No-op** with matching tombstone; a later edit in server order is superseded | Different property IDs commute, followed by deterministic contiguous-position normalization | Creates `T(note_property, note/id)`; note purge subsumes it | Apply/no-op plus tombstone; later edit → `R(tombstone_blocked)` | remove/edit; remove/remove; concurrent removal of two fields; purge |
| `ReorderNoteProperties` / replicated | Note and exact surviving property-ID set | Identical order is **No-op**; the later server-ordered order wins when its ID set matches; a mismatched set is superseded | Lists on different notes commute | Removed IDs remain tombstoned and cannot be reintroduced by stale order | Apply/no-op or `R(collection_conflict)` with the requested list in the received record | two reorders; reorder plus add/remove; same order; restart |
| `SetNotePropertyTemplate` / replicated | Template ID; complete valid field set and person references; valid position for create | Same complete template is **No-op**; otherwise the later server sequence wins whole-record | Different template IDs commute | Deleted-template tombstone blocks stale update; instantiated note properties remain independent | Apply/no-op, `R(tombstone_blocked)`, or `R(domain_conflict)` | divergent create; same/different field updates; person deletion; update/delete |
| `DeleteNotePropertyTemplate` / replicated | Existing template | Duplicate is **No-op** with tombstone; a later update is superseded | Different templates commute, then normalize positions | Creates `T(property_template, id)`; never deletes instantiated note properties | Apply/no-op plus tombstone; later update → `R(tombstone_blocked)` | delete/update; duplicate delete; independent properties survive |
| `ReorderNotePropertyTemplates` / replicated | Exact surviving template-ID set | Identical order is **No-op**; later matching-set order wins; mismatched set is superseded | One workspace template list, so all such operations share a target | Deleted IDs remain tombstoned | Apply/no-op or `R(collection_conflict)` | two reorders; reorder plus create/delete; batching independence |
| `RecordProviderImport` / device-local | Local provider/source receipt and local note | No cross-device merge meaning | Local only; imported canonical operations sync independently | Receipt cascades locally with purged note; no cloud tombstone | Never admitted to v1 log | receipt stays local; imported note/property operations replicate by their own classes |
| `CreateTask` / replicated | Task ID; valid tag/assignee references; optional paired source link | Equivalent create is **No-op**; divergent record keeps the first | **Apply** | `T(task, id)` blocks recreation; a purged source note detaches, never deletes | Apply/no-op or `R(identity_conflict)` / `R(tombstone_blocked)` | identical/divergent collision; stale create after delete |
| `UpdateTask` / replicated | Existing task; optional source-document rewrite for the linked note | Later server sequence wins whole-record; the embedded source rewrite lands with it or the whole operation is superseded | Different tasks commute | Deleted task blocks; a trashed source note still accepts the rewrite; a purged source note is superseded | Apply/no-op or `R(tombstone_blocked)` / `R(domain_conflict)` | update/update; update/delete; update with purged source |
| `DeleteTask` / replicated | Existing task; optional source-document rewrite | Duplicate is **No-op** with tombstone; a later update is superseded | Different tasks commute | Creates `T(task, id)` | Apply/no-op plus tombstone; later update → `R(tombstone_blocked)` | delete/update; duplicate delete |
| `DetachTask` / replicated | Existing linked task; optional source-document rewrite | Later server sequence wins; detaching an unlinked task is **No-op** | Different tasks commute | Deleted task blocks | Apply/no-op or `R(tombstone_blocked)` | detach/update; detach/delete |
| `PromoteChecklistTask` / replicated | Source note and block; new task ID; source-document rewrite proving the link | Equivalent promotion is **No-op**; a second promotion of the same block is superseded by the unique source-link rule | Different blocks commute | Purged source note blocks; `T(task, id)` blocks recreation | Apply/no-op or `R(identity_conflict)` / `R(tombstone_blocked)` | promote on two devices; promote versus purge |
| `SetPrompt` / replicated | Prompt ID; valid complete prompt record | Same complete prompt is **No-op**; later server sequence wins whole-record | Different prompts commute | `T(prompt, id)` blocks stale upsert after deletion | Apply/no-op or `R(tombstone_blocked)` | edit/edit; edit/delete; stale create |
| `DeletePrompt` / replicated | Existing prompt | Duplicate is **No-op** with tombstone; later edit is superseded | Different prompts commute | Creates `T(prompt, id)` | Apply/no-op plus tombstone | delete/edit; duplicate delete |
| `CreateAnnotation` / replicated | Annotation ID; existing note; anchor inside the document (see [ADR-0034](../adr/0034-annotation-anchors-are-document-data.md)) | Equivalent create is **No-op**; divergent record keeps the first | Different annotations commute | Purged note blocks; `T(annotation, id)` blocks recreation | Apply/no-op or `R(identity_conflict)` / `R(tombstone_blocked)` | same-ID collision; create on trashed note; stale create |
| `AddAnnotationComment` / replicated | Existing annotation; unique comment ID | Equivalent comment is **No-op**; divergent same-ID comment keeps the first | Different comments commute | Deleted annotation blocks | Apply/no-op or `R(identity_conflict)` / `R(tombstone_blocked)` | two comments; comment on deleted annotation |
| `UpdateAnnotationComment` / replicated | Existing annotation and comment | Later server sequence wins; exact body is **No-op** | Different comments commute | Deleted annotation or comment blocks | Apply/no-op or `R(missing_dependency)` / `R(tombstone_blocked)` | edit/edit; edit/delete |
| `DeleteAnnotationComment` / replicated | Existing annotation and comment | Duplicate is **No-op**; later edit is superseded | Different comments commute | Deleted annotation blocks | Apply/no-op or `R(missing_dependency)` | delete/edit; duplicate delete |
| `ResolveAnnotation` / replicated | Existing annotation | Later server sequence wins between resolve and reopen; duplicate is **No-op** | Different annotations commute | Deleted annotation blocks | Apply/no-op or `R(tombstone_blocked)` | resolve/reopen in both orders |
| `ReopenAnnotation` / replicated | Existing annotation | Same as resolve | Different annotations commute | Deleted annotation blocks | Apply/no-op or `R(tombstone_blocked)` | reopen/resolve; reopen after delete |
| `DeleteAnnotation` / replicated | Existing annotation | Duplicate is **No-op** with tombstone; later comment/resolve/reopen is superseded | Different annotations commute | Creates `T(annotation, id)` | Apply/no-op plus tombstone | delete/comment; duplicate delete |

No row authorizes an operation to bypass normal domain validation. Server
order selects between two otherwise-valid intents, but it cannot legalize a
cycle, dangling reference, unavailable parent, invalid typed value, or
unsupported content reference. The one deliberate relaxation is the
availability check for `SaveDocument` on the sync apply path, which accepts a
trashed target so that a document edit is never lost to a concurrent trash.

## 3. Superseded reasons

### Stored shape

A received operation that does not change canonical state and is not a no-op
or echo is stored with outcome `superseded`, a stable `reason` code, and a
bounded `detail` (at most 1,024 characters) in `sync_received_operations`.
The reason vocabulary is `SyncConflictReason` in `skriuw-domain`:

| Reason | Meaning | Convergent outcome |
| --- | --- | --- |
| `concurrent_document_version` | A document write lost the four-rule decision (section 4) | The losing body is a history row with provenance `superseded`; canonical body unchanged |
| `tombstone_blocked` | The target or a dependency lineage was purged or deleted, so the operation can never apply | Canonical state unchanged; a carried document body stays in the received record |
| `missing_dependency` | Storage returned `NotFound` for a non-tombstoned prerequisite | Canonical state unchanged; the ordered log guarantees no later delivery will supply it |
| `identity_conflict` | Storage returned `AlreadyExists` for a divergent same-ID create | The first server-ordered record stays canonical |
| `tree_conflict` | A move or restore would form a cycle or names an invalid parent/anchor | Last valid placement stays canonical |
| `concurrent_field_edit` | A whole-record write for a property, template, task, or prompt failed validation against the current record | The current record stays canonical |
| `collection_conflict` | A reorder named an ID set that differs from the surviving set | The current order stays canonical, positions contiguous |
| `content_unavailable` | Referenced content-addressed bytes could not be fetched or verified | The pull fails before applying; this reason appears only in status detail, never as a superseded row |
| `unsupported_capability` | The envelope depends on a protocol capability this client lacks | The pull is rejected at the trust boundary; never a superseded row |
| `domain_conflict` | Any other domain/storage rejection of an otherwise valid replicated envelope | Canonical state unchanged; `detail` carries the bounded diagnostic |

`revision_conflict` is not a reason: a replicated document write carries its
expected revision rebased to the local revision before domain validation, so
the device-local counter cannot reject it.

### Failures that are not superseded records

Malformed JSON, unsupported envelope or sync version, invalid identifiers,
invalid/non-contiguous sequences, size-limit violations, device-local
admission, operation-field validation errors, conflicting duplicate
IDs/sequences, workspace mismatch, and authentication/authorization failure
are rejected at a trust boundary. They do not become superseded rows and do
not advance the inbound cursor; the coordinator projects them as
`blocked { rejected_pull }` with detail until a later page is valid.

A database, filesystem, serialization, transaction, or resource-exhaustion
failure is a backend failure. It rolls back canonical state, received record,
history row, tombstone state, and cursor together, then retries with the same
envelope. A busy or locked database is a short transient retry, never a
ten-minute block. Converting a backend failure into a superseded record would
falsely acknowledge data that was not durably preserved.

## 4. Document decision and history provenance

### The four rules

For an incoming remote document write `W` (a `SaveDocument`, or the body of a
`CreateNote` whose node already exists) on note `N` with server sequence
`S_w`:

- `H` is `sync_document_heads[N]`, the greatest server sequence of a document
  write this device has incorporated for `N`, or `0`.
- `P` holds when an unresolved local document write for `N` exists in
  `sync_outbox` or as an unresolved `sync_blocked_operations` row
  (`SaveDocument` or `CreateNote` for `N`).

| Rule | Condition | Outcome | `H` | History |
| --- | --- | --- | --- | --- |
| 1 | body of `W` is equivalent to the canonical body | `no_op` | `max(H, S_w)` | none |
| 2 | `P` | `superseded` (`concurrent_document_version`) | `max(H, S_w)` | `Hist(W)` |
| 3 | `!P` and `S_w > H` | `applied`; expected revision rebased | `S_w` | provenance `remote` |
| 4 | `!P` and `S_w < H` | `superseded` (`concurrent_document_version`) | unchanged | `Hist(W)` |

The decision consults neither `baseServerSequence` nor `documents.revision`.
The adapter computes the facts (`target_exists`, `target_trashed`,
`target_tombstoned`, `dependency_tombstoned`, `state_equivalent`,
`local_write_pending`, `incoming_outranks_head`) and the domain decides.

A `SaveDocument` for a trashed note applies under rules 1–4 on every device;
the restored note shows the edit. A `SaveDocument` for a purged note is
`tombstone_blocked` and its body is retained only in the received record.

Convergence: for every concurrent pair of writes, both devices keep the write
with the greater server sequence. `H` is monotone; `P` covers exactly the
window in which a local write has no server sequence yet. A local write that
leaves that window either arrives as its own echo (already applied, `H`
advances to its sequence) or was ordered below a write already applied, in
which case this device supersedes it on echo exactly as every other device
superseded it on receipt. A device hydrated from a checkpoint (`H = 0`) and a
device that replayed the log make the same choice for every subsequent write,
so heads are not seeded from checkpoints and rehydration clears them.

### Requeue of a parked document write

When a blocked `SaveDocument` or `CreateNote` is requeued and its parked body
differs from the current canonical body, the queue enqueues a fresh
`SaveDocument` of the current canonical body instead of the stale one and
resolves the parked row. A device therefore never publishes a body it has
already moved past.

### History provenance

`history_outbox` rows carry `provenance IN ('local', 'remote', 'superseded')`
and are unique on `(note_id, revision, provenance)`:

- `local`: a revision this device wrote. Consecutive local rows inside the
  120 s window coalesce as before.
- `remote`: a revision applied from the log (rule 3). It never coalesces into
  or out of a local row, and it closes the local coalescing window: a later
  local save inserts a new row.
- `superseded`: a losing body preserved by rule 2 or 4 through
  `preserve_document_version(note_id, markdown, at)`. The row is written at
  the note's current revision with `next_attempt_at = created_at`. It is a
  history-only insert: no document write, no FTS, reference, image, or task
  side effect, no revision bump, and never a `sync_outbox` row.

The coalescing decision reads the newest unclaimed row for the note
regardless of provenance; only a `local` row inside the window coalesces.

The history materializer receives the provenance with each claimed item. A
`superseded` item is committed with the summary "Version from another device
(superseded)"; a `remote` item reads like an ordinary revision. The browser
runtime has no materializer, so its superseded rows are durable but not
browsable until one exists.

Every history row, superseded record, tombstone, and cursor advance for one
received operation commit in one transaction. Pull pages apply in sub-batches
of 32 operations, and each operation's complete outcome stays inside one
transaction.

### Archive, export, and backup

Portable archives carry canonical state only; superseded bodies live in the
history backend, which each device rebuilds locally. Export is never refused
on account of sync state. Native raw-database backup contains
`history_outbox`, `sync_received_operations`, `sync_tombstones`,
`sync_document_heads`, and `sync_blocked_operations`, so verified restore
keeps every superseded body and its provenance.

## 5. Tombstone, hydration, and retention contract

### Tombstones

A tombstone (`sync_tombstones`) records entity kind and stable ID, scope for
note-scoped identities, root lineage for subtree purge, the deleting
operation, and its server sequence. Kinds are `node`, `tag`, `person`,
`note_property`, `property_template`, `task`, `prompt`, and `annotation`. A
terminal subtree tombstone protects every descendant identity, even after
canonical rows are physically removed.

Trash is reversible unavailability recorded by `deleted_at`, not a tombstone.
It preserves canonical nodes, documents, properties, images, history, and
direct nested trash markers. A later `RestoreSubtree` clears the root marker
when its destination is valid. Document edits apply to trashed notes;
structural edits (move, pin, restore destination) do not restore implicitly.

Purge is terminal identity intent. A delayed create, edit, move, property
update, asset reference, or stale checkpoint covered by the tombstone cannot
resurrect the ID; it is recorded as `tombstone_blocked`.

Tag, person, property, template, task, prompt, and annotation deletion
create identity tombstones in the same transaction as the canonical delete.

### Hydration and rehydration

First-connect hydration installs a verified checkpoint only when, inside the
same immediate transaction, the observed server sequence is `0`, the next
client sequence is `1`, no received-operation rows exist, the outbox is empty
(claimed rows included), and no unresolved blocked rows exist. Any other
state replays the log.

When the server reports `log_truncated` (its compaction floor is above this
device's cursor) the device rehydrates: after the push phase has drained or
parked the outbox, `rehydrate_from_checkpoint(archive, C)` runs in one
immediate transaction that requires an empty outbox, replaces canonical state
with the verified checkpoint taken at `C`, deletes every
`sync_received_operations` row and every `sync_document_heads` row, keeps
`sync_tombstones` and unresolved `sync_blocked_operations`, carries
`history_outbox` rows for notes present in the archive (revision offset above
the archive revision when needed, provenance kept), and sets the cursor and
`sync_connection.rehydrated_through` to `C`. Own-device operations above `C`
that have no outbox or received row re-apply from the log as ordinary remote
operations; below or at `C` they are already inside the checkpoint. A workspace
with no checkpoint above the floor is `blocked { log_truncated_without_checkpoint }`.

Blocked rows survive rehydration; a parked document write is requeued against
the rehydrated canonical body under the requeue rule in section 4.

### Retention

Server-side compaction is governed by
[sync content operations](sync-content-operations.md): an operation is
removable only at or below the oldest retained checkpoint and every active
device cursor, and the compaction floor is published so a lagging device
recovers by rehydration rather than by waiting forever. Client-side
tombstones, received records, and history rows are not compacted by the
server and must never be assumed to be. A device that has not acknowledged
within the idle window stops pinning the log and rehydrates when it returns.

## 6. Executable scenario catalogue

Each scenario names the expected canonical state, cursor, durable evidence, and
recoverable data. `N` is the starting cursor and sequences shown are contiguous.
Scenario numbers are stable identifiers shared with the test suites; S20,
S22, and S23 (restart during resolution, export with an unresolved conflict,
export after resolution) were retired with the conflict model and are not
reused.

### Envelope, duplicate, and cursor scenarios

#### S1 — Exact duplicate across restart

**Given** operation `O` at `N+1` applied and its received record committed;
**when** the process restarts and receives byte-equivalent `O`; **then**
canonical state is unchanged, the cursor remains `N+1`, no new superseded
record, history row, or tombstone is created, and the originally applied data
remains recoverable.

#### S2 — Conflicting duplicate

**Given** operation ID `O` already recorded at `N+1`; **when** an envelope reuses
`O` or `N+1` with different provenance or content; **then** the complete inbound
transaction is rejected, canonical state and cursor remain unchanged, no
superseded record is created, the coordinator reports
`blocked { rejected_pull }` with detail, and the first received envelope
remains recoverable for protocol investigation.

#### S3 — Gap and backend failure

**Given** cursor `N`; **when** a batch contains `N+1` then `N+3`, or persistence
fails after staging `N+1`; **then** the whole inbound transaction rolls back,
cursor remains `N`, no received/history/tombstone residue exists, and replay of
`N+1` can succeed. A busy database retries shortly; a gap the server did not
report as truncation is `blocked { rejected_pull }`.

#### S4 — Local echo races acknowledgement

**Given** a locally applied outbox operation; **when** pull observes its exact
echo before acknowledgement, or acknowledgement records it before pull;
**then** canonical state changes once, the outbox row is removed once, cursor
advances only contiguously, the later event is a duplicate, and local data is
unchanged and recoverable.

### Documents and deletion

#### S5 — Two offline document writers

**Given** devices A and B save different complete versions from the same base;
**when** server order assigns A=`N+1`, B=`N+2`; **then** both devices end with
B's body. A receives B at `N+2` with `H = N+1` and no pending write, so rule 3
applies B with a `remote` history row; A's own body is already in A's history
as its `local` revision. B receives A at `N+1` while its own write is still
pending (rule 2) or, after its echo, with `H = N+2 > N+1` (rule 4), so A's
body is superseded on B and preserved there as a history row with provenance
`superseded`. On both devices A's body is recoverable from history, cursor is
`N+2`, and B's superseded received record carries
`concurrent_document_version`. Reversing upload arrival swaps which body wins,
not the set of recoverable bodies.

#### S6 — Identical offline saves

**Given** A and B produce semantically identical JSON, Markdown, word count, and
references from the same base; **when** both arrive; **then** one canonical
revision represents that content, the second is a `no_op` with retained
provenance, `H` reaches the later sequence, cursor reaches the later sequence,
no superseded row exists, and the identical body is recoverable.

#### S7 — Edit versus trash

**Given** A edits a note without observing B's subtree trash; **when** both are
replayed in either batching; **then** the canonical subtree is trashed, the
edit applies to the trashed note on every device under rules 1–4, cursor
passes both operations, no superseded row exists for the edit, and restoring
the subtree on either device shows the edited body.

#### S8 — Edit versus purge

**Given** a delayed full document edit predates a terminal purge; **when** it is
received after the purge or loaded from a stale checkpoint; **then** no node is
recreated, cursor advances with the edit recorded as `tombstone_blocked`, the
terminal tombstone remains, and the body is retained in
`sync_received_operations.operation_json`. Purge wins; no history row is
written because the note no longer exists.

### Tree and identity

#### S9 — Concurrent valid moves

**Given** A moves node X under folder P and B, without observing A, moves X
under Q; **when** both destinations remain valid; **then** the later server
sequence is the canonical placement, cursor reaches it, no content is lost, and
both placement intents remain traceable in received provenance. Rebatching the
same ordered log produces identical parent and sibling order.

#### S10 — Move against deleted parent or anchor

**Given** a move targets a parent/anchor concurrently trashed or purged;
**when** domain validation cannot apply it; **then** the source remains at its
last valid canonical placement (or remains unavailable if itself deleted),
cursor advances with a `tree_conflict` or `tombstone_blocked` superseded
record, and the requested placement remains in that record. The adapter does
not guess workspace root or “last”.

#### S11 — Crossed moves would form a cycle

**Given** concurrent operations move folder A below B and B below A; **when**
server order applies the first and makes the second cyclic; **then** the first
valid placement remains canonical, the second is `tree_conflict`, cursor
passes both, and the tree is acyclic after every commit.

#### S12 — Concurrent create identity collision

**Given** two devices create the same node/tag/person ID; **when** complete
records are equal; **then** the later is a no-op. When any identity-bearing
field differs, the first server-ordered record stays canonical, cursor passes
the second as `identity_conflict`, and for a note the second body goes through
rules 1–4: it is preserved as a `superseded` history row when it loses, or
applied when it wins. A kind collision (note versus folder) is always
divergent and the first record stays.

#### S13 — Restore destination loss

**Given** a directly trashed subtree and a restore naming a destination deleted
concurrently; **when** the restore arrives; **then** the subtree stays trashed,
cursor advances with `tree_conflict`/`tombstone_blocked`, the trash marker
and requested placement survive, and a later explicit restore to an active
destination applies. No automatic root restore occurs.

### Properties, templates, and references

#### S14 — Same and different property fields

**Given** A changes a property's name and B changes its value concurrently;
**when** both arrive; **then** the later server-ordered whole record is
canonical on every device and the earlier record is retained only in its
received-operation record. No field transform runs. Changes to different
property IDs apply independently.

#### S15 — Property remove versus edit and reorder

**Given** A removes property P while B edits P or submits an order containing
P; **when** they are concurrent; **then** if the removal is ordered first, P is
canonically absent with a property tombstone, the edit is `tombstone_blocked`,
the order is `collection_conflict`, and surviving positions are contiguous; if
the edit is ordered first, it applies and the removal then removes it. Cursor
advances either way.

#### S16 — Template same/different fields

**Given** two devices update one template; **when** both arrive; **then** the
later server-ordered complete template is canonical, the earlier is retained
in its received record, updates to distinct template IDs commute, cursor
reaches the final sequence, and canonical positions remain contiguous.

#### S17 — Person deletion against property/template

**Given** A deletes person P while B creates a property or template referencing
P; **when** operations converge; **then** canonical state never contains a
dangling person reference. If the deletion is ordered first, the referencing
operation is `tombstone_blocked` with its full typed record in the received
record; if the reference is ordered first, the deletion is `domain_conflict`
on every device and the person stays until the reference is removed.

### Tombstones, restart, batching, and archives

#### S18 — Device below the compaction floor

**Given** device D acknowledged cursor `K`, the server compacted through
`F > K`, and the latest checkpoint was taken at `C ≥ F`; **when** D next pulls;
**then** the server answers `log_truncated`. D pushes first: its outbox drains
or parks. With an empty outbox D reports `rehydrating`, verifies the checkpoint,
rehydrates in one transaction (canonical state replaced, received rows and
heads cleared, tombstones and blocked rows kept, history carried, cursor and
`rehydrated_through` set to `C`), then pulls from `C`. Own operations above
`C` re-apply from the log. With a non-empty outbox D is
`blocked { log_truncated }` with detail until the push phase clears it. D's
stale edit of a purged identity is `tombstone_blocked` after rehydration.

#### S19 — Restart while preserving a superseded write

**Given** failure after staging a history row but before the received record,
tombstone link, and cursor commit; **when** the client restarts; **then** none
of those partial writes exists and the operation replays. If the atomic
commit completed, the `superseded` row, its history row, and the cursor all
exist, and duplicate replay creates no second history row.

#### S21 — Batching-independent replay

**Given** one valid contiguous ordered log containing creates, different-target
edits, moves, deletes, and superseded operations; **when** replayed one
operation per call, in allowed pull batches, in sub-batches of 32, or across
restarts; **then** canonical state, cursor, tombstones, heads, superseded
records, and history-row payload hashes are identical. Only transaction and
receive-time diagnostics may differ.

### Propagation and session scenarios

#### S24 — Two-device edit of the open note

**Given** the same note is open on A and B and both are online; **when** A
saves; **then** B's cycle applies the write (rule 3), reports the note ID in
its change set, and B's editor merges the incoming document into its view
without an undo entry and without scheduling a save. If B has unsaved local
edits, B keeps them where its blocks changed and adopts A's blocks elsewhere,
stays dirty, and its next save publishes the merged body, which A then applies
by rule 3. Neither device shows a conflict.

#### S25 — Offline edits on both devices, reconnect in either order

**Given** A and B edit the same note offline; **when** A reconnects first and
then B, or B first and then A; **then** the body ordered later by the server
is canonical on both devices, the other body is a `superseded` history row on
both, and both cursors reach the final sequence. The order of reconnection
changes which body wins, never whether both bodies survive.

#### S26 — Sign-out mid-push

**Given** a claimed push batch in flight; **when** the user signs out; **then**
the in-flight call is interrupted, the lease is released, the outbox and
blocked rows are preserved, status becomes `authenticationRequired`, no
further polling occurs, and signing back in resumes the same client sequence;
a batch the server accepted before the interruption resolves idempotently on
the next push.

#### S27 — Token expiry mid-pull

**Given** a pull page in flight when the session expires; **when** the server
answers 401; **then** the coordinator settles `authenticationRequired`, marks
the session invalid, stops the wake listener, clears the vault token, emits
`sync-session-expired`, and the renderer drops the user and offers "Sign in".
The cursor did not advance and the next signed-in cycle re-pulls the same page.

#### S28 — Browser and desktop on the same account simultaneously

**Given** the same workspace connected on a desktop and in a browser; **when**
both edit; **then** each runtime runs the same `run_sync_cycle` over its own
outbox and cursor, both converge under sections 2 and 4, and the browser's
superseded bodies are durable in its `history_outbox` even though it cannot
browse them.

#### S29 — Device offline beyond the compaction horizon

**Given** a device offline longer than the device idle expiry with local
edits; **when** it reconnects; **then** its push is accepted (client sequences
are still contiguous), its pull answers `log_truncated`, and it rehydrates per
S18 after its outbox drains; its own pushed writes above the checkpoint
re-apply from the log and its edits of purged identities are
`tombstone_blocked`.

#### S30 — Ack-before-echo window with three devices

**Given** A pushes write W1 (`N+1`), receives its acknowledgement, and creates
W2 before its cycle pulls the echo of W1; B pushes W3 (`N+2`) concurrently;
C observes everything; **when** the log is `W1, W3, W2`; **then** on every
device W2 (`N+3`) is canonical: A applies W3 while W2 is pending (rule 2 →
W3 superseded on A) and then echoes W2; B and C apply W1, W3, then W2 by rule
3. `baseServerSequence` is not consulted, so A's base for W2 cannot make A
choose differently from B and C.

#### S31 — Parked write, remote write, retry

**Given** A's `SaveDocument` is parked in `sync_blocked_operations`
(`cloud_rejected`) and a remote write for the same note arrives; **when** the
remote write is decided; **then** rule 2 supersedes it (the parked write
counts as pending) and its body enters history. **When** the user retries the
blocked row and the parked body no longer equals the canonical body, a fresh
`SaveDocument` of the canonical body is enqueued instead and the parked row is
resolved; the next cycle pushes it and the other devices apply it by rule 3.

Property tests generate two-device histories over all replicated families,
vary operation grouping, sub-batch size, and restart points, and assert:
contiguous cursor monotonicity; idempotency; deterministic canonical hashes;
acyclic valid trees; exact surviving collection membership; no dangling
references; no tombstoned identity resurrection; identical canonical state on
every device; and byte-for-byte history preservation of every superseded
document body.

## 7. Decisions

### Evidence-backed decisions

- Server sequence is delivery order and the deterministic decision for every
  replicated family. Documents add one exception: an unsequenced local write
  wins until it is sequenced, which is what makes the decision identical on
  every device.
- Divergent full documents converge by server sequence; the losing body is
  preserved in history, never discarded and never presented for resolution.
- `expectedRevision` remains device-local optimistic concurrency and is rebased
  on the sync apply path; `baseServerSequence` is diagnostic provenance only.
- Missing anchors/destinations are not substituted; explicit root restore
  remains a caller decision.
- Trash is reversible and preserves content; document edits apply to trashed
  notes. Purge creates terminal identity intent and is never overridden by a
  later-delivered edit or restore.
- Cursor advancement across a superseded operation requires its history row,
  received record, and reason to be durable in the same transaction.
- Device-local settings, active note state, and provider receipts never enter
  the v1 log. `AttachImage` replicates under protocol 2 through the verified
  asset transport in
  [content-addressed chunk transport v1](sync-content-chunks-v1.md).
- A device below the server's compaction floor rehydrates from a checkpoint
  with an empty outbox; blocked rows and tombstones survive rehydration.
- Wall-clock age alone cannot retire a tombstone; device idle expiry retires
  a cursor, and the device recovers by rehydration.

### Decided questions

1. Field-level merges for properties, templates, tasks, and prompts do not
   ship in v1; whole-record last-writer-by-server-sequence is the contract.
2. Reorder intents do not merge; a reorder applies when its ID set matches
   the surviving set and is superseded otherwise.
3. A missing placement anchor is never transformed; the move or restore is
   superseded.
4. Superseded document bodies are recovered through note history, not a
   dedicated surface.
5. Portable archives carry canonical state only; superseded bodies travel
   with the local history backend and native backup.
6. Compaction publishes a floor; the rejection is `log_truncated` (HTTP 410)
   and the recovery is rehydration.
7. Content-chunk references remain blocked rather than applied until verified;
   end-to-end encryption stays open on the master tracker.
8. Scalar metadata history beyond received-operation provenance is not
   user-visible.

No decision permits implicit resurrection, dangling content references, or
loss of a document body on cursor advancement.
