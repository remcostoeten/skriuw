# Scale fixtures

Deterministic backend workspace fixtures live in the portable `skriuw-fixtures` crate. They exist for FTS, import, bootstrap, sidebar tree, and future performance workloads. See [ADR-0016](adr/0016-deterministic-scale-fixtures.md) for the decision record.

## Shape catalogue

`generate_workspace_fixture(FixtureSpec { shape, note_count })` returns a `WorkspaceFixture` holding expectation metadata plus a `WorkspaceOperationEnvelope` sequence. The canonical specs from `canonical_specs()` are:

| Name | Shape | Notes | Folders | Nodes | Max depth |
| --- | --- | --- | --- | --- | --- |
| `wide-1000` | all notes as root siblings | 1,000 | 0 | 1,000 | 1 |
| `nested-1000` | 32-folder chain, notes spread along it | 1,000 | 32 | 1,032 | 33 |
| `mixed-1000` | 200 root notes, 600 across 8 wide folders, 200 along an 8-folder chain | 1,000 | 16 | 1,016 | 9 |
| `wide-5000` | all notes as root siblings | 5,000 | 0 | 5,000 | 1 |
| `nested-5000` | 32-folder chain, notes spread along it | 5,000 | 32 | 5,032 | 33 |
| `mixed-5000` | 1,000 root notes, 3,000 across 8 wide folders, 1,000 along an 8-folder chain | 5,000 | 16 | 5,016 | 9 |

Depth counts nodes below the workspace root, so a root note has depth 1 and a note inside the deepest nested folder has depth 33.

## Determinism

Every value is a pure function of the spec:

- IDs: `fixture-{shape}-folder-{NN}` and `fixture-{shape}-note-{NNNNN}`, sequential and zero-padded.
- Timestamps: base `1_753_000_000_000` ms, advancing 1,000 ms per create operation.
- Titles, Markdown, and structured document JSON are templated from shape and index.
- Settings are the version-1 defaults tagged with a `fixtureName` extension holding the fixture name.
- Placement is always semantic `NodePlacement::last`; the storage adapter allocates every durable rank per ADR-0010.
- The final operations set the settings document and activate note 1.

`fixture_digest` hashes the serialized operation sequence; the six canonical digests are pinned in the default test suite. Intentional generator changes must update those constants.

## Search tokens

Each note's Markdown and document JSON embed predictable FTS terms:

| Term | Matches |
| --- | --- |
| `uniq{shape}{NNNNN}` | exactly the one note with that index |
| `sharedall` | every note |
| `sharedtenth` | every tenth note (`note_count / 10`) |
| `sharedhundredth` | every hundredth note (`note_count / 100`) |

`FixtureMetadata.search_expectations` records the expected match counts, including one representative unique token.

## Materialization

Nothing generated is committed. Materialize into SQLite by replaying `operation_batches(512)` through `WorkspaceStorage::apply_operations`; the default suite proves the flow with a 120-note mixed fixture against an in-memory database, validates the exported archive, and checks integrity.

The 5,000-note manual materialization is ignored by default and asserts no timing budget:

```bash
cargo test -p skriuw-fixtures --release --locked -- --ignored --nocapture
```

One release-mode run on the development machine materialized the 5,018 `mixed-5000` operations in 2.119 s, then passed bootstrap-count, search-count, archive, and integrity assertions.

## Browser tree projection

The `export_tree_projection` example writes one JSON file per canonical fixture for browser tree workloads. Each file contains the fixture metadata, the pinned operations digest, the active note ID, and every node as `{id, parentId, kind, title}` in creation order, which equals sibling order because every fixture placement is semantic `last`. The example generates each projection twice and asserts byte equality before writing; nothing generated is committed.

```bash
cargo run --release --locked -p skriuw-fixtures --example export_tree_projection -- app/harnesses/renderer-store/public/fixtures
```

`app/harnesses/renderer-store/scripts/export-fixtures.sh` wraps the same command for the renderer-store harness, which asserts node, folder, and document counts, maximum depth, and parent relationships against the embedded metadata after hydration.

## Backend workload measurements

`tests/backend_workloads.rs` adds deterministic correctness coverage plus manual optimized-build measurements for import, bootstrap, and native Git history workloads over the `mixed-1000` and `mixed-5000` fixtures. The default suite proves the complete pipeline with a 120-note mixed fixture: archive import, bootstrap state, search counts, SQLite integrity, outbox-to-Git drain, Git history integrity, and validated cache rebuild.

The three ignored manual measurements run individually:

```bash
cargo test -p skriuw-fixtures --release --locked benchmarks_import_workloads -- --ignored --nocapture
cargo test -p skriuw-fixtures --release --locked benchmarks_bootstrap_workloads -- --ignored --nocapture
cargo test -p skriuw-fixtures --release --locked benchmarks_history_workloads -- --ignored --nocapture
```

- Import measures `SqliteWorkspace::open` and `replace_from_archive` separately against a fresh file-backed database; the source archive is materialized, verified, and exported before timing.
- Bootstrap measures `open` and `bootstrap` separately against one fully materialized file-backed database; page-cache state is warm and uncontrolled.
- History measures the outbox-to-Git drain and the validated Git-to-SQLite cache rebuild as two separate numbers; every count and integrity assertion runs outside the timed intervals, and historical Markdown stays lazy.

Raw samples, medians, environment metadata, and limitations are recorded in [benchmarks/2026-07-21-backend-workloads.md](benchmarks/2026-07-21-backend-workloads.md). No timing assertion exists in any test.

## Deferred

- 50, 500, and 2,000-block document bodies wait for editor schema selection (ADR-0004).
- Trash, history, and import-under-load workload variants build on these generators later.
- Timing budgets belong to the future fixed performance runner, never ordinary CI.
