# Post-v1 backlog

v1 is complete and shipped (see [FEATURES.md](FEATURES.md)). This list tracks candidate work beyond it. Nothing here is scheduled or committed to; add ADRs before starting anything that changes an architectural decision.

## Editor

- [x] Image support — paste/drop an image into a note. Spec: [docs/specs/note-images.md](docs/specs/note-images.md). Shipped except archive-format support (needs its ADR) and blob-aware backup; both tracked in the spec.
- [x] Wiki-style `[[note]]` links as an alternative to `@` mentions. Spec: [docs/specs/wiki-links.md](docs/specs/wiki-links.md). Shipped: `[[` trigger detection, note-scoped completion menu, `]]` closing match, `[[note title]]` Markdown export/import round-tripping.
- [x] Raw Markdown editing mode alongside the rich editor. Toggle any note between rendered (ProseMirror) and raw (plain-text CommonMark source) with `mod+m`, the command palette, or "Default to raw Markdown" in editor settings. Full CommonMark round-trips via `prosemirror-markdown`; `[[wiki links]]` and note images (`image_ref`) are relinked back to their structured nodes on re-entering rendered mode. Frontmatter and footnotes select lossless raw handling until structured support exists. Same-note history restores and external updates reconcile clean raw editors without replacing dirty local input. Known limitation: `#tag` and `$person` mentions remain plain text after Markdown import because their syntax is ambiguous without workspace context.

## Organization

- [x] Pinned notes/folders. Spec: [docs/specs/pinned-notes.md](docs/specs/pinned-notes.md). Shipped: `SetNodePinned` operation, archive v2 (`pinnedAt`), sidebar shelf, palette action, `mod+p`.
- [ ] Outline view (headings-as-tree navigation within a note).
- [ ] Quick-access sequences (recently visited, jump list).

## Workspace

- [x] Tabs and split view. Spec: [docs/specs/tabs-and-split-view.md](docs/specs/tabs-and-split-view.md). Shipped per [ADR-0021](docs/adr/0021-tabs-and-split-view.md): tab strip + open-beside split, live editors bounded at visible panes, native pane-layout persistence. Covered by tests: `app/__tests__/store/panes.test.ts`, `app/__tests__/actions/panes.test.ts`, `app/__tests__/store/pane-layout-persistence.test.ts`, `app/__tests__/shell/editor-panes.test.ts` (asserts exactly one/two live editor hosts via `renderToStaticMarkup`). Deferred: per-pane tab strip.
- [x] Note properties (custom metadata fields per note). Spec: [docs/specs/note-properties.md](docs/specs/note-properties.md). Shipped in 0.2.0: typed durable property contracts, optimistic renderer projections, metadata-panel editor with built-in templates.
- [ ] Third-party importers. Core preview and atomic local import exists for Markdown, plain text, Simplenote (`notes.json`), Bear (TextBundle and `.bear2bk`), Obsidian, Notion Markdown/database CSV, Apple Notes Markdown, Evernote (`.enex`), Joplin RAW, Google Keep Takeout, and Standard Notes decrypted backups. See [the import guide](docs/provider-import.md), [spec](docs/specs/provider-import.md), and [ADR-0024](docs/adr/0024-previewed-atomic-provider-import.md).
  - [x] Destination-folder selection.
  - [x] Organize options: nest imports in a provider-named folder and split notes into per-year folders, reusing existing folders on re-import.
  - [x] Simplenote pin state imports as pinned workspace notes.
  - [x] Duplicate copy, skip, and in-place update modes backed by durable atomic receipts.
  - [x] Progress plus cancellation before the non-cancellable atomic commit.
  - [x] Standards-compliant Obsidian YAML parsing with lossless fallback.
  - [x] Workspace tag backlinks and a typed `Tags` property for raw-preserved notes.
  - [x] Sanitized export-shape golden fixtures for every current provider.
  - [x] Apple Notes selected-note Markdown export and missing bulk-export documentation.
  - [x] Generated-contract, full check, production-build, focused browser E2E, and 10,000-note post-import navigation evidence.
  - [ ] Sanitized fixtures captured from real provider applications rather than synthetic export-shape fixtures.
  - [ ] Obsidian alias and heading wikilinks (`[[target|label]]`, `[[target#heading]]`). The importer matches the whole link label against note titles (`resolveImportedNoteReferences` in `app/src/export/markdown-transfer-model.ts`), so both forms count as unresolved and stay literal `[[…]]` text. Fix: split the target on `|`/`#` for title matching, keep the alias as display label, drop or suffix the heading anchor. Low priority; reproduce with `fixtures/import-samples/obsidian-vault` (the two unresolved wiki-link warnings in `Home.md`).
  - [x] Full native Tauri WebDriver import E2E (`app/e2e/run-native.mjs`): the real debug binary under `tauri-driver` + WebKitWebDriver imports `fixtures/import-samples/notion-export.zip` end to end — real ZIP intake, preview, SQLite commit verified in the database file, and an idempotent skip-mode re-import. Manually invoked, not in CI; see [app/e2e/README.md](app/e2e/README.md). It caught two real plan bugs the mocked bridge never could: non-dense provenance property positions and skip-mode re-imports re-creating already-imported folders.
- [ ] Later provider adapters: Evernote ENEX, Google Keep, Joplin, and Standard Notes.

## Platform

- [ ] Web runtime: `wasm32-unknown-unknown` build, worker-owned SQLite-WASM/OPFS adapter, fixture parity against the native adapter. Low priority. Spec: [docs/specs/web-runtime.md](docs/specs/web-runtime.md).
- [ ] Mobile — unscheduled, no spec.
- [ ] Browser extension — unscheduled, no spec.

## Sync and collaboration

- [ ] Durable sync outbox — only if sync enters scope.
- [ ] Multi-device sync, sharing, collaboration, authentication — all require a scope decision first; none are assumed.

## Diagnostics

- [ ] Add React Scan to profiling builds only if the production Profiler and render-count evidence expose a diagnostic gap that current tooling can't explain.

## AI

- [ ] Out of scope until a concrete use case and privacy model are decided. Local-first constraint applies: no note content leaves the device without explicit, visible user action.
