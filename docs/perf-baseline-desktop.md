# Desktop performance baseline — 2026-07-02

Measured on the live vault (`~/.skriuw`) and the current `packages/web-spa` production build,
before the performance batch that follows the 2026-07-02 four-agent audit.
Re-measure after each batch with the commands below.

## After the 2026-07-02 batch (same session)

| Metric | Before | After |
|---|---|---|
| `listNotes` IPC payload (470 notes) | ~1.77 MB bodies + escaping | **~63 KB** metadata (`list_note_metadata`) — 28× less |
| Per-note list materialization | `resolveRichDocument` repair walk per note | skipped entirely on the list path |
| IPC round trips per autosave flush | 4 (`get_note` → `upsert_note` → `replace_note_links` → `record_note_version`) | 2 (`get_note` → `save_note`); note body crosses once, snapshot derived in Rust |
| Vault file reads per save (`find_note_path`) | 470 (full walk + frontmatter parse) | 1 (id→path cache, per-hit staleness check) |
| Bulk import path cost | O(n²) file reads | O(n) |
| Per-180 ms typing settle | files-list rewrite → sidebar re-render + O(n) `buildNoteIndexes` + O(n log n) palette sort | detail-cache write only; list reconciled per 1 s flush |
| Wikilink chips per settle | O(chips × 470) index rebuilds (content regex per note) | O(chips) map lookups; one deferred O(470) index per files change |
| Bubble-menu selector per keystroke | `getTextCursorPosition` + `getActiveStyles` every transaction | constant-object early return while caret is collapsed |
| markdown→blocks conversion (raw mode) | per settle | per flush |
| Editor mount / note-switch inline pass | 9 regex `matchAll` per text node | single trigger-char test for plain nodes |
| Network requests at desktop boot | Google Fonts CSS + font files (render-blocking) + Better Auth call to skriuw.com | **0** (18 latin woff2 self-hosted, 964 KB in bundle; auth skipped under Tauri) |
| IndexedDB RQ persistence on desktop | restore at boot + ~1 s dehydrate of all note bodies while typing | disabled (`isTauriRuntime`) |
| Entry/editor JS chunks | 390 / 465 KB gz | unchanged (within noise) |

Verified: cargo 46/46 tests, tsc 0 product-code errors, bun 255 pass (identical to `daddy`
baseline; 20 pre-existing failures), production build green, debug desktop binary boots +
reconciles the live vault, browser smoke test of typing/chips/tag-suggestions passes.

Bonus fixes found while verifying (pre-existing, unrelated to the perf work):
- **GuestGate crashed the whole `/app` notes route for guests** — `withKeyboardGuard`
  wrapped a single child in an array via `Children.map`, which Radix `Slot` (`asChild`)
  rejects (`react-slot` ≥1.3 requires `isValidElement(children)`). Fixed in
  `guest-gate.tsx`; affects any guest surface with a gated dropdown/popover trigger,
  including the Next.js web app.
- **Known open issue:** guest edits in the browser SPA preview do not persist to the
  `skriuw:guest:workspace` IndexedDB store (confirmed identical on clean `daddy`).
  Needs its own investigation.

Still open from the audit (deliberately deferred): tags/graph aggregation → SQL (blocked on a
trustworthy `note_links` index — currently 13 rows / 470 notes after the Simplenote import),
`NotesLayoutShell` memo split, SQLite read-connection pool, lazy collab stack.

## Dataset

| Metric | Value |
|---|---|
| Notes in vault | 470 (+22 in trash) |
| Vault on disk | 2.5 MB |
| `index.db` | 2.9 MB (+4.5 MB WAL) |
| `note_links` rows | 13 (link index effectively unpopulated after Simplenote import) |

## IPC payload (`list_notes`)

| Metric | Value |
|---|---|
| Markdown bodies total | 761 KB |
| richContent (BlockNote JSON) total | 1004 KB |
| **Raw bodies per `list_notes` call** | **~1.77 MB** (before JSON-string escaping overhead) |
| Average per note | 3.8 KB |
| Largest single note | 363 KB |

Re-fetched fresh (not from RQ cache) by `listTags`, `listTagNotes`, `listPersonNotes`,
`getNoteGraph`, `rewriteNotes`.

```sh
DB=~/.local/share/nl.remcostoeten.skriuw.dev/index.db
sqlite3 "file:$DB?mode=ro" "SELECT COUNT(*), SUM(LENGTH(content)), SUM(LENGTH(rich_content)) FROM notes"
```

## Per-save vault scan (`find_note_path` proxy)

Reading all 470 `.md` files: **14 ms warm cache** (SSD). The O(n) scan per save is real waste
but not dominant at this vault size on this machine; matters more on cold cache / larger vaults.

```sh
cd ~/.skriuw && time (find . -name '*.md' ! -path './.skriuw/*' -exec cat {} + > /dev/null)
```

## Bundle (vite production build, `packages/web-spa/dist/assets`)

| Chunk | Raw | Gzip | Loaded |
|---|---|---|---|
| `index` (entry) | 1.3 MB | 390 KB | eager |
| `editor` (BlockNote + prosemirror + yjs/collab) | 1.5 MB | 465 KB | on first editor open (idle-prefetched) |
| `shiki` | 1.7 MB | 369 KB | lazy, first code block |
| `markdown-vim-editor` | 637 KB | — | lazy |
| `native` | 423 KB | 81 KB | — |
| `graph` | 184 KB | 60 KB | lazy route |
| CSS (`index` + `editor`) | 214 + 209 KB | — | eager / with editor |

Desktop release binary: 7.8 MB (post `[profile.release]` tuning, 2026-06-26).

## Not yet measured (needs a runtime profiling session in the packaged app)

- Startup: launch → styled, populated UI (currently includes a network round-trip to
  fonts.googleapis.com + gstatic for 7 font families, and a Better Auth session call to skriuw.com).
- Keystroke latency / INP while typing in a note with many wikilinks.
- Note-switch time (dominated by the synchronous `upgradeRichDocumentChips` regex pass).

These are the ones users feel; capture with a DevTools performance trace in the dev webview
(`bun run --cwd apps/desktop tauri dev`, then WebKit inspector) before/after the editor-path fixes.
