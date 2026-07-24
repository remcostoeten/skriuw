# ADR-0002: SQLite is canonical

- Status: accepted
- Date: 2026-07-20

## Context

Markdown files are portable but make rich-editor round trips, tree metadata, atomic multi-record writes, search indexing, and crash recovery more complex.

## Decision

SQLite stores canonical structured documents and metadata. Markdown is a transactional projection used for export, search, and history.

## Consequences

- Navigation can hydrate structured documents without Markdown parsing.
- One transaction protects each logical write.
- External filesystem editing is excluded from initial scope.
- Export and backup must remain prominent because database files are not user-readable notes.
