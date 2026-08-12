# ADR-0004: Defer UI and editor selection

- Status: accepted
- Date: 2026-07-20

## Context

Framework popularity and bundle size do not prove post-startup latency. Editor DOM work is expected to dominate note switching and typing.

## Decision

No UI, desktop-shell, router, state-library, or editor dependency enters backend foundation. Editor selection follows measured fixtures and the performance contract.

Direct ProseMirror and Lexical are benchmark candidates. UI candidates must support a persistent editor host and external normalized store.

## Consequences

- Backend work proceeds without accidental framework coupling.
- A small benchmark spike precedes UI architecture commitment.
- Existing visual components may be ported only after boundaries exist.
