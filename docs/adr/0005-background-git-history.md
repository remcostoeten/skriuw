# ADR-0005: Asynchronous Git history

- Status: accepted
- Date: 2026-07-20

## Context

Users need note history. Git offers durable Markdown diffs but filesystem writes and repository operations cannot enter editing or navigation paths.

## Decision

SQLite remains authoritative. Successful document transactions append generic `history_outbox` rows. A background history adapter materializes stable `notes/<uuid>.md` paths and commits them. Cached headers use backend-neutral version IDs and feed UI.

## Consequences

- Git failure never fails a note save.
- Outbox replay survives crashes.
- History is eventually consistent.
- Browser runtime may implement `HistoryPort` with SQLite revisions or remote history instead of Git.
