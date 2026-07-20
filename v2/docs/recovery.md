# Native recovery runbook

Scheduled native backups are verified single-file SQLite artifacts. They are separate from portable workspace archives and asynchronous Git history.

## Create or check a scheduled backup

```bash
cargo build -p skriuw-cli --locked
target/debug/skriuw-cli backup-rotate .data/skriuw.db .data/recovery
target/debug/skriuw-cli backup-manifest .data/recovery
```

The default policy creates at most one artifact every six hours, retains at most 28 artifacts, and expires artifacts older than 30 days. Calling rotation before it is due reports the next due Unix timestamp in milliseconds without changing the directory.

Each manifest artifact records a relative filename, creation timestamp, byte size, file SHA-256, source schema version, migration-ledger fingerprint, and successful verification state. `pendingDeletions` records manifest-owned artifacts whose checksum-guarded cleanup is retryable. Absolute paths never enter the manifest.

## Restore into a new database

Choose a retained artifact from the newest manifest generation, then restore it into a path that does not exist:

```bash
target/debug/skriuw-cli restore \
  .data/recovery/skriuw-backup-<created-at>.sqlite \
  .data/restored-skriuw.db
target/debug/skriuw-cli integrity .data/restored-skriuw.db
```

Restore verifies the source and writes another normalized create-new database. It never overwrites the open workspace.

## Replace the canonical database

The candidate and rollback must be unused sibling paths in the same directory as the canonical database. The command verifies the candidate before shutdown, drains the live runtime, preserves the original at the rollback path, and bootstraps the replacement before success:

```bash
target/debug/skriuw-cli swap-database \
  .data/skriuw.db \
  .data/restored-skriuw.db \
  .data/skriuw.pre-swap.rollback.db
```

On success, retain the rollback until the replacement has been exercised and accepted. The command never deletes it. If replacement validation fails after the moves, the lifecycle restores and reopens the original database and reports a recovery failure. If rollback itself fails, inspect every reported path before taking manual action; do not rerun with an existing rollback target.

## Safety boundaries

- Do not edit manifest files or backup artifacts in place.
- Rotation prunes only artifacts listed by the authoritative manifest and only while their type, size, and SHA-256 still match.
- Manual `backup` artifacts and pre-import safety backups are not part of rotation.
- An unrecognized or malformed newest manifest stops rotation instead of guessing.
- A changed pending artifact is retained and reported as an error.
- Live swap rejects distinct-directory paths, existing rollback targets, non-regular files, active SQLite sidecars after shutdown, and invalid candidates.
