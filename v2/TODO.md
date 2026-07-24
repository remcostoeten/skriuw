# Post-v1 backlog

v1 is complete and shipped (see [FEATURES.md](FEATURES.md)). This list tracks candidate work beyond it. Nothing here is scheduled or committed to; add ADRs before starting anything that changes an architectural decision.

## Editor

- [ ] Image support — paste/drop an image into a note. Prompted once but never implemented.
- [ ] Wiki-style `[[note]]` links as an alternative to `@` mentions. Does not collide with Markdown link syntax (`[text](url)` / `[text][ref]` both require a following `(` or `[`), but the parser must check for that trailing token before treating a leading `[[` as a wiki-link, since `[[note]](url)` is a real link whose text is bracket-wrapped.
- [ ] Raw Markdown editing mode alongside the rich editor.
- [ ] Note icons/emoji.

## Organization

- [ ] Pinned notes/folders. Spec: [docs/specs/pinned-notes.md](docs/specs/pinned-notes.md).
- [ ] Outline view (headings-as-tree navigation within a note).
- [ ] Quick-access sequences (recently visited, jump list).

## Workspace

- [ ] Tabs and split view.
- [ ] Note properties (custom metadata fields per note).
- [ ] Third-party importers (Notion, Obsidian, etc.) beyond the existing Markdown import.

## Platform

- [ ] Web runtime: compile portable crates for `wasm32-unknown-unknown`.
- [ ] Worker-owned SQLite-WASM adapter over durable browser storage.
- [ ] Run shared operation/archive/tree/recovery fixtures against native and web adapters to prove parity.
- [ ] Mobile.
- [ ] Browser extension.

## Sync and collaboration

- [ ] Local revision or remote history materializer selection.
- [ ] Durable sync outbox — only if sync enters scope.
- [ ] Multi-device sync, sharing, collaboration, authentication — all require a scope decision first; none are assumed.

## Diagnostics

- [ ] Add React Scan to profiling builds only if the production Profiler and render-count evidence expose a diagnostic gap that current tooling can't explain.

## AI

- [ ] Out of scope until a concrete use case and privacy model are decided. Local-first constraint applies: no note content leaves the device without explicit, visible user action.
