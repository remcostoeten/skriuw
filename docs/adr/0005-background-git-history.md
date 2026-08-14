# ADR-0005: Asynchronous Git history

- Status: accepted
- Date: 2026-07-20

## Context

Users need note history. Git offers durable Markdown diffs but filesystem writes and repository operations cannot enter editing or navigation paths.

## Decision

SQLite remains authoritative. Successful document transactions append generic `history_outbox` rows. A background history adapter materializes stable `notes/<uuid>.md` paths and commits them. Cached headers use backend-neutral version IDs and feed UI.

Saves coalesce into one pending revision per editing burst: a save landing within `HISTORY_COALESCE_WINDOW_MS` (2 minutes) of a pending revision's first save updates that outbox row in place, and a pending revision only becomes claimable once the window has elapsed. The document itself is still persisted on every save; coalescing only bounds how many restore points a burst of typing produces.

## Consequences

- Git failure never fails a note save.
- Outbox replay survives crashes.
- History is eventually consistent.
- Browser runtime may implement `HistoryPort` with SQLite revisions or remote history instead of Git.
