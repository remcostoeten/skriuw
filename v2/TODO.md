# Post-v1 backlog

v1 is complete and shipped (see [FEATURES.md](FEATURES.md)). This list tracks candidate work beyond it. Nothing here is scheduled or committed to; add ADRs before starting anything that changes an architectural decision.

## Editor

- [ ] Image support — paste/drop an image into a note. Prompted once but never implemented. Spec: [docs/specs/note-images.md](docs/specs/note-images.md).
- [ ] Wiki-style `[[note]]` links as an alternative to `@` mentions. Spec: [docs/specs/wiki-links.md](docs/specs/wiki-links.md).
- [ ] Raw Markdown editing mode alongside the rich editor.

## Organization

- [ ] Pinned notes/folders. Spec: [docs/specs/pinned-notes.md](docs/specs/pinned-notes.md).
- [ ] Outline view (headings-as-tree navigation within a note).
- [ ] Quick-access sequences (recently visited, jump list).

## Workspace

- [ ] Tabs and split view. Low priority; largest architectural departure in this list. Spec: [docs/specs/tabs-and-split-view.md](docs/specs/tabs-and-split-view.md).
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
