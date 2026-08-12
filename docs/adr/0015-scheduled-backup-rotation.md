# ADR-0015: Scheduled backup rotation

- Status: accepted
- Date: 2026-07-20

## Context

ADR-0008 defines how to create and verify one native SQLite backup, but it does not define when periodic recovery points are due, how many survive, how they are described, or which files retention may delete. The desktop shell does not exist yet, so timing orchestration must remain callable without introducing a renderer timer or weakening create-new backup publication.

## Decision

The native recovery policy defaults to one backup every six hours, at most 28 retained artifacts, and a maximum artifact age of 30 days. A future desktop scheduler calls the rotation capability away from renderer, navigation, and editor threads. The capability enforces cadence itself and returns the next due timestamp when called early. Negative timestamps, zero limits, and invalid policy bounds are rejected.

Artifacts use the relative name `skriuw-backup-<created-at>.sqlite`. Each artifact is produced through the existing SQLite Online Backup API, normalized, and verified before publication. Rotation then inspects that exact file and records its byte size, SHA-256, source schema version, complete migration-ledger fingerprint, and `verified: true`.

Recovery metadata is published as immutable, create-new `recovery-manifest-<generated-at>.json` generations. A manifest contains its version, generation time, policy snapshot, retained artifact records, and pending-deletion records. It contains relative filenames only. The newest exact timestamped manifest is authoritative; malformed or unsupported newest metadata fails explicitly. The adapter retains the two newest valid manifest generations and never overwrites a manifest in place.

Publication and retention run in this order:

1. Load and validate the newest manifest and finish any previously recorded pending deletions.
2. Return without writing when the latest retained artifact is not yet due.
3. Create, normalize, verify, checksum, and publish the new backup artifact.
4. Write and fsync a create-new manifest generation that lists the new artifact and marks count- or age-expired artifacts as pending deletion.
5. Delete only pending artifacts whose exact relative name, regular-file type, size, and SHA-256 still match their manifest record.
6. Remove only older valid manifest generations after the new generation exists.

A returned failure before manifest publication leaves the previous manifest authoritative and removes the newly created artifact. Process termination in that window may leave an unlisted verified file; it is never treated as owned or pruned automatically. An interruption after manifest publication leaves every deletion retryable from `pendingDeletions`. Missing pending files are success; changed files, directories, and symlinks are never removed. Files merely sharing the recovery directory are never discovered and pruned as artifacts.

Concurrent rotation calls on one `SqliteWorkspace` share a maintenance gate, so one call publishes and the other re-evaluates cadence. Manual named backups and pre-import safety backups remain outside scheduled rotation and are never entered into or pruned by the recovery manifest.

## Consequences

- Periodic native recovery has deterministic cadence, count, age, naming, and ownership rules before a desktop scheduler exists.
- A recovery UI can enumerate verified artifacts without opening every database or storing machine-specific paths.
- Retention cannot delete unlisted, changed, non-regular, or checksum-mismatched files.
- Immutable manifest generations avoid cross-platform overwrite semantics and make interrupted cleanup recoverable.
- The live-database shutdown, verified swap, and rollback UI remain a later desktop lifecycle slice.
- Future web storage defines its own artifact mechanism while preserving equivalent manifest and retention invariants where practical.
