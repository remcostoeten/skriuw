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

Restore verifies the source and writes another normalized create-new database. It never overwrites the open workspace. Replacing a live desktop database still requires explicit runtime shutdown, connection closure, verified path swap, rollback handling, and restart; that shell lifecycle is not implemented yet.

## Safety boundaries

- Do not edit manifest files or backup artifacts in place.
- Rotation prunes only artifacts listed by the authoritative manifest and only while their type, size, and SHA-256 still match.
- Manual `backup` artifacts and pre-import safety backups are not part of rotation.
- An unrecognized or malformed newest manifest stops rotation instead of guessing.
- A changed pending artifact is retained and reported as an error.
