# ADR-0001: Standalone local-first product

- Status: accepted
- Date: 2026-07-20

## Context

Desktop ships first. Notes must remain usable without accounts, server availability, or network connectivity. A later web runtime may exist.

## Decision

Desktop is a standalone local application. Local state is complete and authoritative. Any future server performs optional replication, never primary reads for interaction paths.

## Consequences

- No authentication or HTTP dependency in backend core.
- Imports, exports, backups, and recovery are first-class.
- Future sync requires durable operations, revisions, tombstones, and conflict handling.
