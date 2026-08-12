# ADR-0007: Portable workspace archive

- Status: accepted
- Date: 2026-07-20

## Context

Users need export, import, recovery, and migration between desktop and a future web runtime. A raw SQLite file is platform-specific, may include WAL state, and exposes rebuildable implementation details. Git contains Markdown history but not the complete structured workspace.

## Decision

Define a versioned `WorkspaceArchive` contract containing canonical nodes, structured documents, Markdown projections, settings, and the active note. Exclude FTS rows, cached history headers, queue leases, Git internals, and database metadata.

Validate archive versions, protocol versions, identifiers, timestamps, node graphs, document ownership, revisions, settings, and active-note availability before storage mutation. Replace import executes in one transaction and rebuilds search plus a current-state history baseline.

## Consequences

- Desktop and web can exchange the same archive JSON.
- Import failure preserves the previous workspace.
- Search and history caches remain rebuildable implementation details.
- Git history is not embedded in the portable archive.
- Archive migrations require explicit versioned compatibility code.
