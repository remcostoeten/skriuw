# Sync convergence and conflict recovery v1

Status: normative product contract; convergence persistence and resolution are
not yet implemented unless a rule is explicitly labelled **implemented**.

This specification defines deterministic convergence for sync protocol v1. It
is intentionally stricter than the current inbound-apply foundation: ordered
delivery is a transport property, not a merge algorithm, and advancing a pull
cursor must never silently discard valid user content.

## 1. Scope and invariants

### Canonical sources

The exhaustive Rust `WorkspaceOperation` enum and its wildcard-free sync-policy
match are the canonical operation inventory and replication classification.
The generated policy is a drift check, not a second source of truth. This
document defines convergence for that inventory and must change whenever either
Rust source changes.

Related constraints remain authoritative:

- [ADR-0026](../adr/0026-optional-cloud-operation-replication.md) defines the
  local-first replication architecture.
- [Workspace operation sync policy v1](workspace-operation-sync-policy-v1.md)
  defines admission and transport classes.
- [Local sync outbox](local-sync-outbox.md) defines local commit, enqueue,
  retry, and echo behavior.
- [Data model](../data-model.md), [subtree trash and purge](../adr/0009-subtree-trash-and-purge.md),
  and [portable archives](../adr/0007-portable-workspace-archive.md) define
  current canonical local behavior.
- [Recovery](../recovery.md) defines verified native backup and restore.

Protocol v1 contains 30 operations: 26 replicated workspace-content
operations, three device-local operations, and one operation unsupported by
sync v1. This document accounts for all 30, while merge behavior applies only
to the 26 replicated operations.

### Ordering, causality, and cursors

Each accepted operation has stable `(deviceId, clientSequence, operationId)`, a
`baseServerSequence` observed before the local operation was created, and one
server-assigned `serverSequence`. Operation `A` is concurrent with earlier
server operation `B` when `A.baseServerSequence < B.serverSequence`; otherwise
`A` observed `B`. Wall-clock fields such as `at`, `createdAt`, or
`trashedBefore` never establish causality or select a winner.

Clients consume a contiguous server sequence. The current SQLite behavior is
normative for cursor mechanics:

- a gap rejects and rolls back the complete inbound transaction;
- an exact duplicate of a previously received envelope is an idempotent no-op,
  including across restart;
- reuse of an operation ID or server sequence with different provenance or
  content is protocol-invalid and rolls back; it is not a semantic conflict;
- a matching local echo removes its outbox row without reapplying the mutation;
- an applied operation or durably preserved semantic conflict advances the
  cursor; a backend failure or malformed envelope does not;
- batch boundaries do not affect canonical state, conflicts, tombstones, or
  cursor outcome.

`baseServerSequence` detects concurrency but is not enough by itself for a
three-way field merge. A transform that needs a base value may run only when a
retained entity version or checkpoint proves that value. Absence of that proof
produces a durable conflict, never a guessed merge.

### Common application rules

1. Validate the sync envelope and operation before opening semantic-conflict
   handling. Unsupported protocol, invalid IDs/sequences, invalid operation
   fields, oversized payloads, conflicting duplicates, and sequence gaps are
   malformed/protocol failures. They do not consume the cursor or become
   ordinary conflicts.
2. Resolve dependencies and tombstones, then reconcile against concurrent local
   changes. A missing causal predecessor may be held as a durable dependency
   block; it must not be treated as permanent merely because it arrived in a
   separate pull batch.
3. Apply unchanged only if normal domain validation succeeds. Deterministic
   transforms must be pure functions of persisted operation/state provenance,
   never receipt time or batch shape.
4. If safe application or transformation cannot be proven, preserve a durable
   semantic conflict and all user-recoverable inputs in the same transaction as
   the received-operation record and cursor advance.
5. Recovery-relevant records survive restart. Logging an error, retaining only
   a bounded diagnostic, or retaining only the losing operation is insufficient
   when user content is involved.
6. Local echoes are acknowledgements of already-applied content, not a second
   merge attempt.

The currently implemented inbound adapter records `applied`, `local_echo`, or
`conflict` per received operation. It isolates semantic failures with a
savepoint, records a conflict, continues later contiguous operations, and
advances the cursor atomically. Backend failures abort the transaction. Those
mechanics are retained; the conflict payload and reconciliation decision must
be strengthened as specified below.

### Matrix notation

- **Apply**: submit the operation unchanged through domain/storage validation.
- **No-op**: record the operation as received because its complete intended
  state is already present.
- **Transform**: apply a deterministic derived operation and retain the source
  operation plus transform provenance.
- **Conflict**: do not overwrite canonical content; preserve the recovery
  artifact named in the matrix.
- **Dependency block**: retain for causal retry without advancing past it until
  the dependency arrives or is proven impossible. A tombstone can make it a
  final semantic conflict.
- `C(op)` means the durable source operation and bounded diagnostic already
  represented by the current `sync_conflicts` table.
- `V(op, local)` means the full concurrent-version artifact in section 4.
- `T(kind, id)` means the retained tombstone in section 5.

## 2. Exhaustive operation matrix

The “different target” column treats distinct identities as different targets.
Operations can still share a prerequisite; domain graph validation always has
the final word.

| Operation / class | Identity and prerequisites | Concurrent same target | Concurrent different target | Trash, delete, restore, purge | Result and durable evidence | Representative public tests |
| --- | --- | --- | --- | --- | --- | --- |
| `CreateTag` / replicated | Tag ID; referenced `createdIn` note, if present | Byte-equivalent semantic create is **No-op**; any divergent record is identity **Conflict** | **Apply**; later references wait for this predecessor | Cannot reuse an ID protected by `T(tag, id)` | No-op or apply; divergent create stores `C(op)` plus both records; deletion later creates tombstone | identical and divergent same-ID creates; create/reference in separate batches; stale create after delete |
| `RenameTag` / replicated | Existing live tag | Same field uses server order, as required by the v1 policy; exact same value is **No-op** | **Apply** | Concurrent delete wins availability; retain losing rename in `C(op)`. A causally later rename of deleted ID conflicts and never resurrects | Apply/no-op or conflict; `T(tag, id)` blocks stale rename | two offline renames in reversed pull batches; rename/delete; missing tag |
| `RecolorTag` / replicated | Existing live tag | Same scalar rule as `RenameTag`; `name` versus `color` commute | **Apply** | Same as tag rename/delete | Apply/no-op or `C(op)` | rename versus recolor; recolor versus recolor; recolor after delete |
| `DeleteTag` / replicated | Existing tag; document reference cleanup must remain domain-valid | Duplicate delete is **No-op** only when the tombstone proves the same deletion lineage; concurrent rename/recolor loses availability | Different tags commute. Delete concurrent with a new reference is **Conflict** unless the reference can be preserved without a dangling canonical reference | Creates terminal `T(tag, id)`; never permits identity reuse | Apply plus tombstone, or `C(op)` preserving the blocked reference/edit | duplicate delete; document reference versus delete; stale create/rename after delete |
| `CreatePerson` / replicated | Person ID; referenced `createdIn` note, if present | Equivalent create is **No-op**; divergent data is identity **Conflict** | **Apply** | `T(person, id)` forbids stale recreation | Same as `CreateTag`, preserving complete person records | identical/divergent collision; delayed property reference; stale create |
| `RenamePerson` / replicated | Existing live person | Server-ordered scalar value; name and color commute | **Apply** | Delete wins availability; rename remains visible in `C(op)` | Apply/no-op or conflict | rename/rename, rename/recolor, rename/delete |
| `RecolorPerson` / replicated | Existing live person | Server-ordered scalar value; name and color commute | **Apply** | Same as person rename | Apply/no-op or `C(op)` | recolor/recolor; different-field edit; deleted target |
| `DeletePerson` / replicated | Existing person; no surviving property/template person reference | Duplicate with matching tombstone is **No-op**; concurrent scalar edit loses availability | Different persons commute. Concurrent property/template reference is **Conflict**, matching current referential safety | Creates terminal `T(person, id)`; stale references and recreates are blocked | Apply plus tombstone, or `C(op)` containing the referencing operation/data | referenced delete; delete versus property/template; stale recreate |
| `CreateFolder` / replicated | New node ID; active folder parent; active direct-child anchor | Equivalent create is **No-op**; divergent title/placement/kind is identity **Conflict** | **Apply** when prerequisites exist | Ancestor trash blocks canonical creation under it; purged parent or reused tombstoned ID conflicts | Apply/no-op or `C(op)`; create establishes node lineage tracked by `T(node, id)` | same-ID collision; missing parent/anchor; create under trashed/purged parent |
| `CreateNote` / replicated | New node ID; parent/anchor; valid complete document and references | Equivalent complete create is **No-op**; any divergent title, placement, document, or kind is identity **Conflict** and preserves both complete records | **Apply** when prerequisites exist | Same structural rule as folder; purged ID cannot return | Divergence stores `V(op, local)` including both initial documents and node metadata | two devices create same ID with different bodies; missing reference; tombstoned ID reuse |
| `RenameNode` / replicated | Existing available node | Concurrent titles use server order; exact value is **No-op**. Rename and move/pin operate on distinct fields | Different nodes commute | Rename against trash/purge does not restore. Preserve title intent in `C(op)`; causally later rename requires an explicit restore first | Apply/no-op or `C(op)`; terminal tombstone blocks | rename/rename; rename/move; rename versus trash and purge |
| `SetNoteCover` / replicated | Available note; non-null image metadata and verified bytes owned by that note | Concurrent cover selection uses server order only when both referenced assets are available; exact selection is **No-op** | Different notes commute | Trash blocks display/application; purge or asset tombstone blocks. A stale cover change cannot recreate note or asset | Apply/no-op; otherwise dependency block or `C(op)` with content reference. Asset bytes stay retained while referenced by conflict | two covers; clear versus select; missing bytes; edit versus purge |
| `SetNoteCoverFullWidth` / replicated | Available note and current cover when setting true | Server-ordered scalar; commutes with transform but is causally dependent on cover presence | Different notes commute | Trash/purge blocks without resurrection | Apply/no-op, dependency block for causally pending cover, or `C(op)` | full-width before cover across batches; clear-cover race; purged note |
| `SetNoteCoverTransform` / replicated | Available note and current cover | The `(positionX, positionY, zoom)` tuple is one scalar value and uses server order; cover selection is a dependency | Different notes commute | Trash/purge or removed cover blocks; never retarget transform to a different image implicitly | Apply/no-op, dependency block, or `C(op)` containing cover identity context | transform/transform; transform versus cover replacement/clear; purge |
| `MoveNode` / replicated | Available source; active folder parent; active sibling anchor; acyclic result | Concurrent valid moves of the same node use server order, per v1 policy. Exact destination is **No-op**. Never use timestamps | Moves of different nodes apply in server order if each remains valid; a resulting cycle or invalid anchor conflicts | Move never restores. Trash/purge of source or destination blocks it. Deleted anchor is not silently replaced | Apply/no-op or `C(op)`. A future transform may use a retained placement snapshot, but v1 without that proof conflicts | move/move; crossed parent moves; parent deletion; missing anchor; cycle; batch-independent ranks |
| `SetNodePinned` / replicated | Existing available node | Server-ordered scalar; commutes with rename/move | Different nodes commute | Trash preserves existing pin but rejects new pin changes while unavailable; purge removes it and tombstone blocks stale change | Apply/no-op or `C(op)` | pin/unpin; pin/move; trash then restore; purge |
| `SaveDocument` / replicated | Available note; exact expected local revision; valid full JSON/Markdown/reference set | Same resulting full document is **No-op**. Concurrent divergent documents always **Conflict**; server order and timestamp never choose a body | Different notes commute; document references can introduce dependencies | Edit of trashed content becomes a preserved delete/edit conflict; purge blocks canonical apply and preserves the delayed version beside `T(node, id)` | Apply/no-op or mandatory `V(op, local)`; history enqueue only follows an applied/resolved canonical revision | two offline writers; edit/trash; edit/purge; references arriving late; restart/export/backup recovery |
| `TrashSubtree` / replicated | Available root and complete current subtree lineage | Duplicate matching trash is **No-op**. Concurrent restore is ordered only if it observed the trash; an unobserved restore conflicts | Disjoint subtrees commute. Ancestor/descendant trash collapses to unavailable state while preserving every direct marker | Creates soft node/subtree tombstone. Concurrent descendant edits/moves become durable conflicts; it never destroys content | Apply plus `T(node, root)` and conflict links; preserve direct nested trash markers | duplicate trash; nested trash; edit/move versus trash; active-note clearing |
| `RestoreSubtree` / replicated | Direct soft tombstone; active destination/anchor; acyclic result | A causally later restore clears soft deletion. Concurrent restore/restore with different destinations conflicts; identical destination is **No-op** | Disjoint roots commute | Cannot reverse purge. Missing/trashed/purged destination or anchor is **Conflict**; root is not auto-moved to workspace root because current domain requires that fallback explicitly | Apply/no-op or `C(op)` retaining requested placement and tombstone lineage | restore destination loss; two restores; independently trashed descendant; restore after purge |
| `PurgeSubtree` / replicated | Directly trashed root, retention intent, and safe-retention evidence from section 5 | Duplicate purge is **No-op** against terminal tombstone. Concurrent restore/edit cannot override terminal intent merely by later delivery | Disjoint safe purges commute | Converts soft deletion to terminal tombstone. Physical deletion is deferred until device/checkpoint evidence is sufficient | Record purge intent and `T(node, root)` first; retain descendant identities and conflicts until safe compaction | edit/restore versus purge; nested markers newer than cutoff; delayed device; restart during deferred purge |
| `SetActiveNote` / device-local | Available local note or `None` | No cross-device merge meaning | Local only | Local availability rules clear invalid selection; no sync tombstone | Never admitted to v1 log; no sync conflict | outbox rejects class while local state commits; archive behavior remains local contract |
| `UpdateSettings` / device-local | Valid whole `WorkspaceSettings` document | No cross-device merge meaning | Local only | None | Never admitted to v1 log; no sync conflict | two devices retain different settings; outbox rejects class; archive round trip |
| `AttachImage` / unsupported v1 | Available owner note, unique image ID, verified content hash and bytes | Future protocol: identical ID/hash/owner is **No-op**; divergent identity is conflict | Different images commute once chunks exist | Note purge removes metadata only after conflict/checkpoint references release it; blob deletion follows reference proof | Current local operation commits and creates recovery-visible `unsupported_operation`; no inbound v1 operation is valid | local blocked record/restart; attempted inbound rejection; future hash collision and missing chunk |
| `SetNoteProperty` / replicated | Available note; property ID; valid typed value/options/person references; valid position for create | Same complete value is **No-op**. With a retained common base, proven disjoint field edits may **Transform** field-wise. Without that base, any divergent same-property edit is **Conflict** | Different property IDs on the same note and properties on different notes commute, subject to positions/references | Removed-property tombstone or purged note blocks stale upsert. Trash preserves property but blocks mutation until restore | Apply/no-op/verified transform, otherwise `C(op)` with complete local/base/remote property records; `T(property, note/id)` on removal | same field; different fields with/without base; different IDs; person deletion; remove/edit |
| `RemoveNoteProperty` / replicated | Available note and live property ID | Duplicate is **No-op** with matching tombstone. Concurrent edit conflicts and removal wins canonical absence until resolved | Different property IDs commute, followed by deterministic contiguous-position normalization | Creates `T(property, note/id)`; note purge subsumes it | Apply/no-op plus tombstone, or `C(op)` preserving edited property | remove/edit; remove/remove; concurrent removal of two fields; purge |
| `ReorderNoteProperties` / replicated | Available note and exact surviving property-ID set | Identical order is **No-op**. Concurrent divergent order or add/remove/reorder without a provable common collection is **Conflict**, not invalid partial position writes | Lists on different notes commute | Removed IDs remain tombstoned and cannot be reintroduced by stale order | Apply/no-op or `C(op)` with base/local/remote ordered ID lists; normalize positions only after decision | two reorders; reorder plus add/remove; same order; restart |
| `SetNotePropertyTemplate` / replicated | Template ID; complete valid field set and person references; valid position for create | Same complete template is **No-op**. With retained base, proven disjoint fields may **Transform**; otherwise divergent same-ID create/update is **Conflict** | Different template IDs commute, subject to collection position | Deleted-template tombstone blocks stale update; note properties instantiated earlier remain independent | Apply/no-op/verified transform or `C(op)` preserving full base/local/remote templates | divergent create; same/different field updates; person deletion; update/delete |
| `DeleteNotePropertyTemplate` / replicated | Existing template | Duplicate is **No-op** with tombstone; concurrent update conflicts and canonical template remains absent pending resolution | Different templates commute, then normalize positions | Creates `T(template, id)`; never deletes instantiated note properties | Apply/no-op plus tombstone or `C(op)` with full edited template | delete/update; duplicate delete; independent properties survive |
| `ReorderNotePropertyTemplates` / replicated | Exact surviving template-ID set | Identical order is **No-op**; divergent reorder or add/delete/reorder without retained base is **Conflict** | There is one workspace template list, so all such operations share a target | Deleted IDs remain tombstoned and stale orders cannot recreate them | Apply/no-op or `C(op)` with base/local/remote ordered IDs | two reorders; reorder plus create/delete; batching independence |
| `RecordProviderImport` / device-local | Local provider/source receipt and local note | No cross-device merge meaning | Local only; imported canonical operations sync independently | Receipt cascades locally with purged note; no cloud tombstone | Never admitted to v1 log; source paths remain local and out of sync conflicts | receipt stays local; imported note/property operations replicate by their own classes |

No row authorizes an operation to bypass normal domain validation. In
particular, server order may select between two otherwise-valid scalar or move
intents, but it cannot legalize a cycle, dangling reference, unavailable parent,
invalid typed value, or unsupported content reference.

## 3. Conflict taxonomy

### Implemented reason codes

The current SQLite inbound adapter maps domain/storage errors to exactly four
durable reason codes:

| Code | Implemented meaning | Required safe outcome |
| --- | --- | --- |
| `revision_conflict` | `SaveDocument.expectedRevision` differs from the current revision | Preserve both complete versions before cursor advance; the current implementation records only the remote operation and therefore does not yet meet this outcome |
| `missing_dependency` | Storage returned `NotFound` | Retain the source operation. Classify it as retryable dependency absence or tombstone-blocked once lineage evidence is available |
| `identity_conflict` | Storage returned `AlreadyExists` | Preserve both identity records; semantically identical creates may become no-ops only after full comparison |
| `domain_conflict` | Domain/storage rejected an otherwise valid replicated envelope, including tree, reference, availability, or unsupported-domain state | Preserve the operation and enough state/provenance to explain or resolve the violation |

These codes remain valid compatibility categories. Their current mapping is
coarse: for example, a missing purged node and a predecessor not downloaded yet
both become `missing_dependency`. Resolution code must not infer safety from the
string alone.

### Proposed stable reason codes

The following are required additions, not claims about current implementation:

| Proposed code | Stable meaning and safe outcome |
| --- | --- |
| `concurrent_document_version` | Two valid complete document versions cannot be reconciled safely. Preserve both with section 4 provenance; canonical content does not change until explicit resolution |
| `tombstone_blocked` | The target/dependency lineage was deleted or purged, so retry cannot make the operation directly applicable. Preserve the operation and referenced content; never resurrect implicitly |
| `unsupported_capability` | A valid operation or resolution depends on a negotiated protocol capability not present on this client. Keep it durable and user-visible; do not advance as though applied unless the server log contract explicitly represents the block |
| `content_unavailable` | Metadata references content-addressed bytes or another complete payload that is not verified locally. Retain the reference and retry; do not create a broken canonical reference |
| `concurrent_field_edit` | A same-record property/template change is divergent and lacks the retained common base needed for a proven field transform. Preserve base/local/remote records where available |
| `collection_conflict` | Concurrent reorder/add/remove intent cannot produce a provably valid deterministic collection. Preserve each ordered ID list and membership provenance |
| `tree_conflict` | A structurally valid intent cannot apply without a cycle, invalid parent/anchor, or unapproved destination substitution. Preserve requested placement and relevant tree lineage |

`revision_conflict`, `identity_conflict`, and `domain_conflict` may be retained as
broad API categories while the proposed code is stored as a more precise
subreason. Wire/schema evolution must be explicit either way.

### Failures that are not semantic conflicts

Malformed JSON, unsupported envelope or sync version, invalid identifiers,
invalid/non-contiguous sequences, size-limit violations, device-local or
unsupported-v1 admission, operation-field validation errors, conflicting
duplicate IDs/sequences, workspace mismatch, and authentication/authorization
failure are rejected at a trust boundary. They do not become `sync_conflicts`
and do not advance the inbound cursor.

A database, filesystem, serialization, transaction, or resource-exhaustion
failure is a backend failure. It rolls back canonical state, received record,
conflict/tombstone state, and cursor together, then retries with the same
envelope. Converting such a failure into a semantic conflict would falsely
acknowledge data that was not durably preserved.

## 4. Document preservation and resolution contract

### Required conflict artifact

Before acknowledging a divergent `SaveDocument` or `CreateNote`, one atomic
transaction must durably store:

- conflict ID, status, reason, created/resolved times, and target note/node ID;
- remote operation ID, device ID, client sequence, base server sequence, server
  sequence, protocol version, and the exact validated operation envelope;
- the complete remote structured document, Markdown, word count, expected
  revision, and operation timestamp;
- the complete current local structured document, Markdown, word count,
  revision, title/node metadata needed to interpret it, and its latest known
  originating operation/device/server provenance;
- the retained common-base version and revision when available, or an explicit
  marker that it is unavailable;
- content-reference manifests for images and other immutable chunks required by
  any retained version, with verification state;
- an immutable audit of later resolution: selected source or merged content,
  resolving operation, resulting canonical revision, resolver identity, and
  resolution server sequence.

The local canonical document remains unchanged when the conflict is first
recorded. Both alternatives are readable after restart even if either device is
offline. A bounded diagnostic may summarize the issue but never substitutes for
the documents.

### User resolution

The renderer receives a narrow summary: conflict ID, note identity/title,
origin labels, revision/sequence provenance, availability of complete content,
and status. It can request either full version only when the resolution surface
opens. Accessible actions must let the user keep local, keep remote, or save an
explicit merged document; destructive labels must state which version becomes
canonical.

Resolution is a narrow durable use case and, for multi-device convergence, a
new versioned replicated operation such as `ResolveDocumentConflict`. That
operation is **proposed and not part of the current 30-operation v1 inventory**.
It must name the conflict, the exact alternatives it resolves, and the complete
chosen/merged result. It performs an optimistic canonical revision increment,
history enqueue, conflict-status update, and sync enqueue atomically. A stale or
duplicate resolution is a no-op only if it names the same alternatives and
result; two divergent resolutions create another explicit conflict.

Resolution never deletes the unselected version. The selected or merged result
enters normal document history, while the alternative remains immutable
recovery evidence linked from that history. Conflict compaction is governed by
the same device/checkpoint evidence as tombstones, not by UI dismissal or
cursor advancement.

### History, archive, export, and backup

- Native raw-database backup must contain conflict rows, both version payloads,
  referenced content, tombstones, and resolution audit, and verified restore
  must make them readable before publication.
- The current portable archive v3 excludes sync operational tables and cannot
  preserve these artifacts. A connected-workspace export is therefore not
  complete until a later archive version includes unresolved conflicts,
  retained alternatives, required blobs, tombstones, and resolved audit links.
- Import validates that every conflict alternative and referenced blob is
  complete before mutation, then restores canonical state and recovery data
  atomically. Search and cache projections remain rebuildable.
- Plain Markdown export must emit canonical notes plus a deterministic conflict
  companion representation or explicit sidecar files; it must never claim a
  lossless connected export while silently omitting alternatives.
- Git history is asynchronous and rebuildable. It may materialize canonical and
  resolution revisions, but cannot be the sole store for an unresolved remote
  version.

Until that archive evolution ships, connected portable export must fail closed
with an actionable “unresolved sync recovery data cannot be exported” result or
offer a clearly labelled canonical-only export. It must not silently produce an
apparently complete recovery archive.

## 5. Tombstone and retention contract

### Tombstone contents and behavior

A tombstone records entity kind and stable ID, deletion operation and server
sequence, deleting device/client/base sequences, soft-trash versus terminal
purge state, ancestor/root lineage for subtree deletion, and any superseding
restore or purge operation. Property identities are scoped by note ID. A
terminal subtree tombstone protects every descendant identity, even after
canonical rows are physically removed.

Trash is reversible unavailability. It preserves canonical nodes, documents,
properties, images, history, direct nested trash markers, and conflicts. A
causally later explicit `RestoreSubtree` may clear the soft root marker when its
destination is valid. Neither an edit nor a move restores content implicitly.

Purge is terminal identity intent. Applying `PurgeSubtree` first records the
terminal tombstone; deletion of canonical rows is a separate compaction step.
A delayed create, edit, move, property update, asset reference, or stale
checkpoint covered by the tombstone cannot resurrect the ID. Its user content
is preserved as a tombstone-blocked conflict when applicable.

Tag, person, property, and template deletion likewise creates identity
tombstones. This extends current SQLite behavior, which physically deletes
these records without sync tombstone storage.

### Evidence required for physical removal

Wall-clock age, `trashedBefore`, local receipt time, and “no recent activity”
are insufficient. A tombstone or its conflict evidence may be compacted only
when all of the following are durably proven:

1. Every device still authorized to upload from a pre-deletion state has an
   acknowledgement cursor at or beyond the deletion/purge server sequence, or
   has been explicitly retired/revoked.
2. A retired device cannot resume its old client sequence. It must discard the
   stale replica and rehydrate from an eligible checkpoint before uploading.
3. Every retained checkpoint either includes the tombstone/terminal deletion
   state or begins after a compaction boundary that makes pre-delete operations
   inadmissible.
4. The server no longer accepts an operation whose `baseServerSequence`
   predates the retained lineage boundary for that identity.
5. No unresolved conflict, retained document alternative, history/export
   artifact, or content manifest requires the tombstoned canonical payload.
6. The compaction result and checkpoint are verified before the prior evidence
   is removed, so crash/restart cannot expose a resurrection window.

An inactive but not retired device continues to block compaction. Product
policy may later define an inactivity period after which the user or account
owner is asked to retire it, but elapsed time alone never performs retirement.
Account/workspace deletion is a separate authorized destructive workflow and
must still provide auditable completion rather than weakening these sync rules.

## 6. Executable scenario catalogue

Each scenario names the expected canonical state, cursor, durable evidence, and
recoverable data. `N` is the starting cursor and sequences shown are contiguous.

### Envelope, duplicate, and cursor scenarios

#### S1 — Exact duplicate across restart

**Given** operation `O` at `N+1` applied and its received record committed;
**when** the process restarts and receives byte-equivalent `O`; **then**
canonical state is unchanged, the cursor remains `N+1`, no new conflict or
tombstone is created, and the originally applied data remains recoverable.

#### S2 — Conflicting duplicate

**Given** operation ID `O` already recorded at `N+1`; **when** an envelope reuses
`O` or `N+1` with different provenance or content; **then** the complete inbound
transaction is rejected, canonical state and cursor remain unchanged, no
ordinary semantic conflict is created, and the first received envelope remains
recoverable for protocol investigation.

#### S3 — Gap and backend failure

**Given** cursor `N`; **when** a batch contains `N+1` then `N+3`, or persistence
fails after staging `N+1`; **then** the whole inbound transaction rolls back,
cursor remains `N`, no received/conflict/tombstone residue exists, and replay of
`N+1` can succeed.

#### S4 — Local echo races acknowledgement

**Given** a locally applied outbox operation; **when** pull observes its exact
echo before acknowledgement, or acknowledgement records it before pull;
**then** canonical state changes once, the outbox row is removed once, cursor
advances only contiguously, the later event is a duplicate, and local data is
unchanged and recoverable.

### Documents and deletion

#### S5 — Two offline document writers

**Given** devices A and B save different complete versions from the same base;
**when** server order assigns A=`N+1`, B=`N+2`; **then** a client that already
contains either version retains its canonical document until reconciliation
proves the other save non-concurrent, otherwise records
`concurrent_document_version`; cursor becomes `N+2`; `V` contains base, A, and B
with provenance; both bodies survive restart, history, connected export, and
backup. Reversing upload arrival changes sequence provenance, not the set of
recoverable versions.

#### S6 — Identical offline saves

**Given** A and B produce semantically identical JSON, Markdown, word count, and
references from the same base; **when** both arrive; **then** one canonical
revision represents that content, the second is a semantic no-op with retained
provenance, cursor reaches the later sequence, no unresolved conflict exists,
and the identical body is recoverable.

#### S7 — Edit versus trash

**Given** A edits a note without observing B's subtree trash; **when** both are
replayed in either batching; **then** the canonical subtree is trashed, cursor
passes both operations, the edit is retained in a delete/edit conflict linked
to the soft tombstone, and restore does not silently apply it. The user may
restore then explicitly choose/merge the version.

#### S8 — Edit versus purge

**Given** a delayed full document edit predates a terminal purge; **when** it is
received after the purge or loaded from a stale checkpoint; **then** no node is
recreated, cursor advances only after the edit and full payload are stored as
`tombstone_blocked`, the terminal tombstone remains, and the user can export the
orphaned version but cannot implicitly restore the purged identity.

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
cursor advances with a `tree_conflict` or `tombstone_blocked` record, and the
requested placement remains recoverable. The adapter does not guess workspace
root or “last”.

#### S11 — Crossed moves would form a cycle

**Given** concurrent operations move folder A below B and B below A; **when**
server order applies the first and makes the second cyclic; **then** the first
valid placement remains canonical, the second becomes `tree_conflict`, cursor
passes both, the tree is acyclic after every commit, and both intents survive.

#### S12 — Concurrent create identity collision

**Given** two devices create the same node/tag/person ID; **when** complete
records are equal; **then** the later is a no-op. When any identity-bearing
field differs, the first server-ordered record remains canonical, cursor passes
the conflict, and both complete records are preserved as `identity_conflict`.
A kind collision (note versus folder) is always divergent.

#### S13 — Restore destination loss

**Given** a directly trashed subtree and a restore naming a destination deleted
concurrently; **when** the restore arrives; **then** the subtree stays trashed,
cursor advances with `tree_conflict`/`tombstone_blocked`, the soft tombstone and
requested placement survive, and the user can retry with an explicit active
destination. No automatic root restore occurs.

### Properties, templates, and references

#### S14 — Same and different property fields

**Given** A changes a property's name and B changes its value from one retained
base; **when** the base proves those fields disjoint; **then** a deterministic
field transform produces both changes, cursor passes both, transform provenance
is stored, and the merged property is recoverable. Without that base, or when
both change the value differently, canonical property stays unchanged by the
unsafe operation and `concurrent_field_edit` preserves base/local/remote
records. Changes to different property IDs apply independently.

#### S15 — Property remove versus edit and reorder

**Given** A removes property P while B edits P or submits an order containing
P; **when** they are concurrent; **then** P is canonically absent with a property
tombstone, the edit/order becomes a conflict, surviving positions are
contiguous, cursor advances, and P's complete edited value plus each order list
remain recoverable.

#### S16 — Template same/different fields

**Given** two devices update one template; **when** a retained base proves
disjoint field changes, they transform; otherwise divergent complete templates
produce `concurrent_field_edit`. Updates to distinct template IDs commute.
Cursor reaches the final sequence, canonical positions remain contiguous, and
all full template bodies remain recoverable.

#### S17 — Person deletion against property/template

**Given** A deletes person P while B creates a property or template referencing
P; **when** operations converge; **then** canonical state never contains a
dangling person reference. The unsafe operation becomes a visible conflict,
cursor advances only after its full typed record is durable, the person
tombstone remains, and the user can remove the reference or recreate under a
new identity explicitly.

### Tombstones, restart, batching, and archives

#### S18 — Delayed operation around checkpoint boundary

**Given** terminal tombstone at sequence T, device D acknowledged only T-1, and
a checkpoint at or after T; **when** D uploads a stale edit based before T;
**then** it is rejected from canonical resurrection and preserved as
`tombstone_blocked`; D prevents tombstone compaction until retired or advanced.
After explicit retirement, D must rehydrate and cannot resume its stale client
sequence. Checkpoint install cannot remove the tombstone until all section 5
evidence holds.

#### S19 — Restart while preserving a conflict

**Given** failure after staging an alternative but before the received record,
conflict, tombstone link, and cursor commit; **when** the client restarts;
**then** none of those partial writes exists and the operation replays. If the
atomic commit completed, all exist, the cursor reflects it, and duplicate replay
creates no second conflict.

#### S20 — Restart during resolution

**Given** a document conflict and resolution transaction; **when** a crash
occurs at any write boundary; **then** restart exposes either the unresolved
conflict with the old canonical revision or the resolved conflict, new canonical
revision, history enqueue, and outbox record together. It never exposes a
chosen body without its audit or loses the unselected body.

#### S21 — Batching-independent replay

**Given** one valid contiguous ordered log containing creates, different-target
edits, moves, deletes, and semantic conflicts; **when** replayed one operation
per call, in allowed pull batches, or across restarts; **then** canonical state,
cursor, tombstones, unresolved/resolved conflicts, and recoverable payload
hashes are identical. Only transaction and receive-time diagnostics may differ.

#### S22 — Archive/export with unresolved conflict

**Given** an unresolved document conflict; **when** connected portable export
and import run; **then** canonical state, both alternatives, provenance,
content bytes, tombstones, and unresolved status round-trip atomically. With the
current archive version, export instead fails closed or is explicitly labelled
canonical-only; it never silently claims complete recovery.

#### S23 — Archive/export after resolution

**Given** a resolved document conflict; **when** export/import or verified
backup/restore runs; **then** the chosen/merged canonical revision, resolution
operation, complete unselected alternative, immutable audit, required blobs,
and tombstones remain linked and readable. Replay of the resolution is
idempotent.

Property tests should generate two-device histories over all replicated
families, vary operation grouping and restart points, and assert: contiguous
cursor monotonicity; idempotency; deterministic canonical hashes; acyclic valid
trees; exact surviving collection membership; no dangling references; no
tombstoned identity resurrection; and byte-for-byte recoverability of every
conflicting document alternative.

## 7. Implementation sequence and open decisions

### Smallest required seams

These are implementation requirements derived from the matrix, not a broad
rewrite plan:

1. **Domain:** add explicit reconciliation input/output types containing
   operation provenance, target lineage, optional retained base, and decisions
   `apply`, `no_op`, `transform`, `dependency_block`, or `conflict`. Implement
   operation-family matches without a wildcard. Add a versioned document
   resolution contract; do not couple it to SQLite or transport.
2. **Storage:** in one remote-apply transaction, persist received provenance,
   complete conflict alternatives, transforms, dependency blocks, scoped
   tombstones, resolution audit, and cursor. Store entity/field lineage needed
   to detect concurrency and verify bases. Keep backend failures outside
   semantic conflict conversion.
3. **Archive/recovery:** define a new archive version or connected recovery
   bundle for conflicts, tombstones, alternatives, audits, and blobs. Extend
   golden fixtures, two-round-trip tests, native backup verification, and
   restore/restart tests.
4. **Renderer contract:** expose narrow conflict summaries and on-demand full
   alternatives plus explicit resolve actions. Retry, cursor, retention, and
   merge policy remain outside React state and navigation paths.
5. **Tests:** make S1–S23 public domain/storage/archive scenarios and add
   generated two-device replay tests comparing canonical and recovery-state
   hashes across batch partitions and restarts.

### Evidence-backed decisions

- Server sequence is delivery order and the deterministic tie-breaker only for
  operation families explicitly marked safe above.
- Divergent full documents are never last-write-wins.
- Existing `expectedRevision` remains local optimistic concurrency, not a
  cross-device merge algorithm.
- Missing anchors/destinations are not silently substituted; explicit root
  restore remains a caller decision.
- Trash is reversible and preserves content; purge creates terminal identity
  intent before physical compaction.
- Cursor advancement is allowed across a semantic conflict only after all data
  required for recovery is durable in the same transaction.
- Device-local settings, active note state, and provider receipts never enter
  the v1 log. `AttachImage` remains blocked until verified content transport is
  negotiated.
- Wall-clock age alone cannot retire a tombstone or device.

### Open product decisions

The safe interim behavior for every item below is the durable conflict or block
specified in the matrix:

1. Whether same-property and same-template disjoint-field merge will ship, and
   which retained-base/field-lineage representation proves it. Until decided,
   divergent same-record edits conflict.
2. Whether concurrent reorder intents should gain a deterministic sequence-merge
   algorithm. Until it has invariants and public property tests, divergent
   orders conflict.
3. Whether a missing placement anchor can transform using a retained neighbor
   snapshot. Until the exact transform is approved, it conflicts rather than
   moving to first/last/root.
4. The renderer presentation and permission model for restore-versus-copy of a
   tombstone-blocked document version. The data remains exportable meanwhile.
5. The archive wire shape and retention duration for resolved alternatives.
   Retention cannot end before device/checkpoint safety and explicit recovery
   policy both permit it.
6. Device retirement authority, user messaging, checkpoint cadence, and the
   server rejection code for uploads predating a compaction boundary.
7. End-to-end encryption and content-chunk availability rules. Until content is
   verified, metadata references remain blocked rather than applied.
8. Whether scalar metadata history beyond received-operation provenance should
   be user-visible. This does not change the server-order decision for the
   scalar families identified above.

No open decision permits silent last-write-wins for documents, implicit
resurrection, dangling content references, or deletion of recovery evidence on
cursor advancement.
