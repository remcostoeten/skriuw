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
- [ ] Third-party importers. Adapter framework shipped (`app/src/import/`): one detect/parse contract feeding the safety-aware plan/commit pipeline, with Markdown, plain-text, Simplenote (`notes.json`), Bear (textbundle), and Obsidian (frontmatter → typed properties, `![[embeds]]` resolved against vault assets, wikilink/frontmatter-density detection) sources. Remaining: Notion zip, Apple Notes (needs an export-format decision), tag import for sources that carry tags (Simplenote and Obsidian currently warn instead).

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
