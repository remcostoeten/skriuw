# ADR-0008: Verified native SQLite backups

- Status: accepted
- Date: 2026-07-20

## Context

The desktop database uses WAL mode. Copying only the main database file can omit committed WAL content or produce an inconsistent recovery artifact. Backup and restore must never silently overwrite an existing user file.

## Decision

Use SQLite's Online Backup API through rusqlite for native database snapshots. Write into a uniquely named partial sibling, normalize the result to a single rollback-journal database, validate SQLite integrity, foreign keys, migration checksums, and portable domain state, then rename it into a create-new target.

Verified restore reads a backup without mutation and writes another create-new database through the same backup API and validation pipeline. It never replaces a live database file. Portable replace import creates a verified safety backup before mutation in the CLI workflow.

## Consequences

- Backup captures committed WAL state without copying sidecar files.
- Published backup is one self-contained file.
- Existing targets are never overwritten.
- Corrupt, incompatible, or domain-invalid backups cannot produce a restore target.
- Live database swapping remains a desktop-shell lifecycle responsibility.
- Web runtimes implement their own durable-storage backup while retaining portable archives.
