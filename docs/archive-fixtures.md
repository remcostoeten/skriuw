# Archive compatibility fixtures

Golden `WorkspaceArchive` JSON proves that every supported archive version keeps deserializing, validating, importing, and re-exporting identically across releases. See [ADR-0019](adr/0019-archive-compatibility-fixtures.md) for the decision record.

## Layout

```text
fixtures/archives/
├── manifest.json
├── v1/
│   ├── minimal.json
│   └── representative.json
├── v2/
│   └── pinned.json
├── v3/
│   └── typed-properties.json
└── v4/
    └── tasks.json
```

- `manifest.json` declares `supportedArchiveVersions` and catalogues every golden file with its version.
- `v1/minimal.json` is the empty workspace: no nodes, no documents, no active note, default settings.
- `v1/representative.json` covers root and nested nodes, notes and folders, deterministic ranks and timestamps, Unicode Markdown and structured document JSON, non-default settings, an unknown `labsPreview` settings extension, an available active note, and a directly trashed folder whose child stays valid through inherited unavailability. It has no `pinnedAt` field on any node, proving pre-pinning archives import with every node unpinned.
- `v2/pinned.json` covers `pinnedAt`: a pinned folder, a pinned note, and an unpinned note round trip exactly.
- `v3/typed-properties.json` covers typed note properties and property templates, including person and select values with their bounded options.
- `v4/tasks.json` covers tasks: one promoted task whose source checklist item is present in the document, one detached task that outlived its source, and one standalone task. Its ordinary checklist item proves that an unlinked `check_item` creates no task.

Fixture bytes are immutable compatibility inputs. Never regenerate them from current code to make a failing test pass; a mismatch means the production format drifted.

## Enforcement

- `crates/skriuw-domain/tests/archive_fixtures.rs` checks catalogue/production version agreement, directory coverage, deserialization, validation, compatibility-sensitive fields, semantic round trips, and explicit rejection of future archive and protocol versions.
- `crates/skriuw-sqlite/tests/archive_fixtures.rs` imports every golden file through `replace_from_archive` into a fresh database, asserts bootstrap state, inherited unavailability, and search behavior, re-exports with the fixture's `exportedAt`, re-imports that export into a second fresh database, proves both exports semantically equal the fixture, verifies integrity after each import, and proves invalid archives fail before mutation.

Fixtures are stored in the canonical export order (nodes by `(parent_id, rank, id)` with root nodes first, documents by `note_id`), so round-trip comparisons use direct typed equality with no normalization.

Exports always emit the current archive version (`WORKSPACE_ARCHIVE_VERSION`, currently 4). Importing an older supported fixture and re-exporting therefore produces the fixture's content at the current version; the SQLite round-trip tests compare against the fixture with only `archiveVersion` upgraded. Version 2 added the optional node field `pinnedAt`; version 1 archives without it deserialize with `pinnedAt = null`. Version 3 added typed properties and property templates, and version 4 added `tasks`; older archives deserialize both as empty collections.

## Adding a new archive version

1. Ship the versioned compatibility/migration code that makes production actually accept the new version.
2. Create `fixtures/archives/v<version>/` with at least one small, single-purpose golden file exported by that code.
3. Add the version and files to `manifest.json`.
4. Extend both test files where version-specific assertions apply; the catalogue tests fail until manifest, directories, and the production supported set agree.
5. Keep every still-supported older version's fixtures untouched.
6. Update ADR-0019 if the supported-version or normalization policy changes.
