# Post-v1 backlog

v1 is complete and shipped (see [FEATURES.md](FEATURES.md)). This list tracks candidate work beyond it. Nothing here is scheduled or committed to; add ADRs before starting anything that changes an architectural decision.

## Editor

- [ ] Image support — paste/drop an image into a note. Prompted once but never implemented. Spec: [docs/specs/note-images.md](docs/specs/note-images.md).
- [x] Wiki-style `[[note]]` links as an alternative to `@` mentions. Spec: [docs/specs/wiki-links.md](docs/specs/wiki-links.md). Shipped: `[[` trigger detection, note-scoped completion menu, `]]` closing match, `[[note title]]` Markdown export/import round-tripping.
- [ ] Raw Markdown editing mode alongside the rich editor.

## Organization

- [x] Pinned notes/folders. Spec: [docs/specs/pinned-notes.md](docs/specs/pinned-notes.md). Shipped: `SetNodePinned` operation, archive v2 (`pinnedAt`), sidebar shelf, palette action, `mod+p`.
- [ ] Outline view (headings-as-tree navigation within a note).
- [ ] Quick-access sequences (recently visited, jump list).

## Workspace

- [x] Tabs and split view. Spec: [docs/specs/tabs-and-split-view.md](docs/specs/tabs-and-split-view.md). Shipped per [ADR-0021](docs/adr/0021-tabs-and-split-view.md): tab strip + open-beside split, live editors bounded at visible panes, native pane-layout persistence. Deferred: per-pane tab strip, C2 single-live-editor instrumentation assertion.
- [ ] Note properties (custom metadata fields per note). Spec: [docs/specs/note-properties.md](docs/specs/note-properties.md).
- [ ] Third-party importers (Notion, Obsidian, etc.) beyond the existing Markdown import.

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
