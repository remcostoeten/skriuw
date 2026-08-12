# ADR-0003: Operation protocol and runtime adapters

- Status: accepted
- Date: 2026-07-20

## Context

Desktop uses native SQLite. Future web may use SQLite WASM. UI behavior must not import Tauri or database details.

## Decision

UI submits versioned `WorkspaceOperation` values through a small `WorkspaceStorage` port. Every adapter passes the same contract tests.

## Consequences

- Runtime choice stays local.
- Operations can later feed sync/outbox systems.
- Adapter implementations duplicate some storage mechanics but not product semantics.
- Adapter-independent validation executes before database-dependent validation.
- Schema version changes require explicit compatibility work.
