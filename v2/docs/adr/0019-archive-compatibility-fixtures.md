# ADR-0019: Archive compatibility fixtures

- Status: accepted
- Date: 2026-07-21

## Context

`WorkspaceArchive` is the canonical interchange contract between desktop, recovery flows, and the future web runtime (ADR-0007). Its wire format was previously proven only by tests that serialize and immediately deserialize with the same code revision. Nothing pinned the accepted byte-level format across releases, so an accidental rename, ordering change, or validation regression could break every previously exported archive without failing any test.

## Decision

### Golden fixtures are immutable compatibility evidence

Committed, human-reviewable archive JSON lives under `fixtures/archives/v{N}/`, one directory per supported archive version. Each file is a complete valid archive that real production code once accepted. Golden fixture bytes never change after commit; tests may parse and compare them semantically but must never rewrite them during ordinary runs. A fixture change is a compatibility break and requires an explicit decision, not a test-suite convenience edit.

### Catalogue coverage

`fixtures/archives/manifest.json` names the supported archive version set and every golden file. Tests fail when:

- the manifest's supported set differs from the production supported set (`WORKSPACE_ARCHIVE_VERSION` today),
- a supported version has no fixture,
- a fixture file exists on disk without a catalogue entry, or a catalogued file is missing,
- a version directory exists for an unsupported version,
- a fixture's `archiveVersion` disagrees with its directory and catalogue entry.

### Supported-version policy

Version 1 is the only supported archive version. Unsupported future versions fail validation explicitly with `UnsupportedArchiveVersion`; they are never coerced to version 1. Backward compatibility is claimed only for versions the production validator actually accepts.

### Normalization rules

Fixtures are stored in the adapter's canonical export order: nodes by `(parent_id, rank, id)` with root nodes first, documents by `note_id`. Round-trip tests therefore compare typed archives directly with no ordering normalization. JSON formatting (indentation, key order) is not significant; comparisons are semantic through the typed contract. If a future adapter requires an ordering normalization, it must be documented here and in `docs/archive-fixtures.md` before a test applies it.

### Future versions require migration code and fixtures together

A release may raise or extend the supported archive version set only when it ships, in the same change: explicit versioned migration/compatibility code, at least one golden fixture for the new version, and catalogue plus test updates. Older supported versions keep their fixtures for as long as they remain accepted.

## Consequences

- Format drift in nodes, documents, settings, extensions, Unicode content, or the active note now fails deterministic tests against committed bytes.
- SQLite import/export is proven stable across two full round trips for every golden file.
- Adding archive version 2 has a documented, test-enforced checklist instead of an implicit convention.
- Fixture review happens in ordinary diff review because files are small and human-readable.
