# ADR-0016: Deterministic operation-sequence scale fixtures

- Status: accepted
- Date: 2026-07-21

## Context

The performance contract requires 1,000-note and 5,000-note workspaces before any UI benchmark can run, and the future web runtime must replay the same workloads against a different adapter. Committing generated workspace JSON or database files would bloat the repository, drift from contract changes silently, and freeze rank values that ADR-0010 assigns to the backend. Fixtures also must not depend on wall-clock time, random IDs, or a specific storage adapter.

## Decision

Scale fixtures are generated code, not committed data. The portable `skriuw-fixtures` crate deterministically produces `WorkspaceOperationEnvelope` sequences plus explicit expectation metadata; nothing generated is checked in.

Fixtures are operation sequences rather than archives or snapshots. Every create, settings, and active-note change flows through the versioned operation protocol with semantic `NodePlacement` only, so the storage adapter owns every durable rank and the generated state stays valid under whatever the current tree, trash, settings, and revision contracts are.

All content is a pure function of shape and note count: fixed base timestamp `1_753_000_000_000` ms with a 1,000 ms step, zero-padded sequential IDs, deterministic titles, Markdown, structured document JSON, and a version-1 settings document tagged through a `fixtureName` extension. Three shapes exist: wide (all notes as root siblings), nested (a 32-folder chain), and mixed (root notes, eight wide folders, and an eight-folder chain). Canonical fixtures are the six shape × {1,000, 5,000} combinations.

Each note embeds predictable FTS tokens: one unique token per note plus shared tokens matching every note, every tenth note, and every hundredth note. Metadata records node, folder, document, and operation counts, maximum depth, and expected match counts so later FTS, import, bootstrap, and virtualization workloads assert against declared numbers instead of re-deriving them.

Determinism is enforced by pinned SHA-256 digests over the serialized operations of all six canonical fixtures. SQLite materialization happens only through tests: a small fixture in the default suite proves contract validity end to end, and an ignored manual test materializes the 5,000-note fixture without asserting any timing budget.

## Consequences

- Fixture drift against the operation, settings, archive, or placement contracts fails compilation or the default test suite immediately.
- The repository stores generator code and expectations only; no large JSON or database artifacts are committed.
- Native and future web adapters can replay identical operation sequences for comparable measurements.
- Intentional generator changes must re-pin the canonical digests, making workload changes explicit in review.
- Ordinary CI remains correctness-only; timing stays in manual ignored tests and future dedicated performance runners.
- Block-count document fixtures remain deferred until the editor schema is selected (ADR-0004).
