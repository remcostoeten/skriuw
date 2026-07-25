# Image support in the editor

Status: implemented (July 2026), with the deviations and deferrals recorded at the end of this document. Archive-format image support and blob-aware backup remain open.

## Goal

Paste or drop an image into a note and have it appear inline, saved, and durable across restart, export, and archive round trip. "Paste-an-image must just work" is the bar — no upload dialog, no URL field, no waiting.

## Non-goals

- No remote image hosting, CDN, or cloud upload. Local-first constraint applies: an image never leaves the device.
- No image editing (crop/resize/annotate) in v1 of this feature. Resize-by-drag on the inline image is a fair follow-up, not a blocker.
- No arbitrary file attachments (PDFs, etc.) — this spec is images only. Generalizing to attachments is a separate, later decision.
- No inline base64 storage in `document_json`. Large notes with embedded base64 would blow the bounded-editor-window and Markdown-diff assumptions this app is built on (see `docs/performance-contract.md`); images must be content-addressed files on disk, referenced by ID.

## Storage model

Add a workspace-local blob store, sibling to the SQLite database file, not inside it:

```
<workspace-dir>/blobs/<sha256-hex>.<ext>
```

Content-addressed by SHA-256 of the decoded image bytes. This gives free deduplication (pasting the same image twice stores it once) and makes the blob store trivially verifiable (recompute the hash, compare to filename) the same way scheduled backups are verified today.

New table, migration `0005_note_images.sql` (or the next free number after whatever `pinned_at` claims):

```sql
CREATE TABLE IF NOT EXISTS note_images (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS note_images_note ON note_images(note_id);
CREATE INDEX IF NOT EXISTS note_images_hash ON note_images(content_hash);
```

`id` is the stable reference used inside `document_json` (an editor node shouldn't embed a content hash directly — renaming the dedup strategy later must not require rewriting every document). `content_hash` is the join to the blob file on disk. One blob can be referenced by multiple `note_images` rows (same image pasted into two notes) without duplicating file bytes; reference counting is implicit in the `note_images` rows, so cleanup is "delete orphaned blobs with zero referencing rows" — needs a maintenance sweep, see Lifecycle below.

## Domain and operations

`crates/skriuw-domain`: add an `WorkspaceOperation::AttachImage { id, note_id, content_hash, mime_type, byte_size, width, height, at }` variant recording the row, and let normal `SaveDocument` calls carry the `image_ref` node referencing `id` — the operation only registers the blob metadata; the document JSON mutation flows through the existing save path unchanged.

Deleting an image from a note is just an ordinary document edit (remove the node) plus, on next backend save-transaction, a check for now-unreferenced `note_images` rows — do not add a separate "delete image" operation; that would create two sources of truth for what's actually in the document.

The blob write itself (decoding clipboard data, hashing, writing the file) is native-side I/O and must not enter `skriuw-domain` (no filesystem type in domain contracts, matching every other native module here — see N1's coordinator for the established pattern). Add a narrow `ImageStore` port in `skriuw-storage`/a new `skriuw-images` crate: `put(bytes) -> ContentHash`, `get(hash) -> bytes`, `exists(hash) -> bool`, `sweep_unreferenced() -> count`.

## Editor integration

`app/src/editor/schema.ts`: add an `image_ref` node spec, atom + inline-or-block (block, most likely — images are typically their own line, unlike `tag_ref`/`mention_ref` which are inline atoms):

```ts
const imageRefSpec: NodeSpec = {
  group: "block",
  atom: true,
  selectable: true,
  attrs: { id: {}, width: { default: null }, height: { default: null }, alt: { default: "" } },
  toDOM: (node) => ["img", { "data-image-id": node.attrs.id, alt: node.attrs.alt, ... }],
  parseDOM: [{ tag: "img[data-image-id]", getAttrs: ... }],
};
```

Paste/drop handling lives in `app/src/editor/note-editor.tsx` alongside the existing clipboard handling (`note-editor.tsx:552` already intercepts `clipboardData` for whole-document copy — add a paste-side handler, not a copy-side one, in the same file). On `paste`/`drop`:

1. Read `DataTransfer.files` (drop) or `clipboardData.items` (paste) for `image/*` MIME types.
2. Hash the bytes client-side is unnecessary — dispatch the raw bytes through the bridge (`app/src/bridge/**`) to the native `ImageStore.put`, which hashes and writes.
3. On success, insert an `image_ref` node at the cursor with the returned `id`.
4. While the write is in flight, insert a placeholder decoration (loading state) so typing isn't blocked — but per the performance contract, this must not block the keystroke path for unrelated typing elsewhere in the note.

Rendering: `image_ref`'s `toDOM`/NodeView resolves `id` to a local `file://`/custom-protocol URL through the bridge (Tauri's asset protocol, scoped to the workspace's blob directory — do not expose the whole filesystem). The renderer should cache resolved URLs per note-open, not re-resolve on every render.

## Markdown export/import

`app/src/export/markdown-transfer.ts`: an `image_ref` serializes to standard `![alt](relative/path/to/blob)`. Markdown export must copy the referenced blob file alongside the exported `.md` (e.g. into an `images/` sibling directory), not just emit a dangling path — the whole point of Markdown export is portability. Markdown import reads local `![alt](path)` references, hashes the referenced file, and creates the matching `note_images` row + blob (deduplicating if the hash already exists).

## Archive and portability

Portable workspace archives (ADR-0007) must include image blobs, not just metadata — an archive that references images it doesn't contain is broken by definition. Options, in order of preference:
1. Archive format gains an `images/<hash>.<ext>` directory alongside the existing JSON, i.e. the archive becomes a directory/zip rather than a single JSON file for workspaces containing images. This is an archive-format version bump (ADR-0019 fixture discipline applies) and needs explicit sign-off since it changes the archive from "always one JSON file" to "JSON file, optionally with a sibling blob directory."
2. Alternative: keep the archive JSON-only and base64-inline blobs under a size threshold, refusing images over that threshold with a clear error. Simpler but worse for real photos.

Prefer option 1. Write the ADR before implementing; this is exactly the kind of format decision this repo requires one for.

## Lifecycle and maintenance

- Blob sweep: a maintenance pass (reuse the six-hour rotation timer infrastructure from N2, or a separate lower-frequency timer) deletes blob files with zero referencing `note_images` rows. Must run off the editing/navigation path, same rule as backup rotation.
- Backups (`docs/recovery.md`) currently back up the SQLite file only. Once images exist, either the blob directory must be included in the backup/restore/verified-swap path, or the recovery runbook must explicitly document that images are excluded from backup — silently losing images on restore is not acceptable. Extend N1/N2's verified-swap machinery to cover the blob directory as a paired unit with the database file.

## Acceptance criteria

- Pasting a PNG/JPEG from the system clipboard inserts it inline with no dialog, no URL entry, no visible loading stall for typical image sizes.
- Dropping an image file from the OS file manager onto the editor works identically to paste.
- The same image pasted into two different notes stores one blob file (verify via `note_images` row count vs. distinct `content_hash` count).
- Deleting the note (trash + purge) removes its images' rows; a later sweep removes now-orphaned blobs only if no other note references the same hash.
- Markdown export produces a `.md` file plus an `images/` directory that a fresh import of that same export reconstructs identically.
- Archive export/import round-trips images bit-for-bit (hash before === hash after).
- Backup and verified live-swap restore images together with workspace data — no restore leaves a workspace with `image_ref` nodes pointing at missing blobs.
- No image operation touches the note navigation or keystroke-to-paint path; the performance contract's budgets remain unaffected for image-free notes.

## Implementation notes (July 2026)

What shipped, and where it deviates from the sections above:

- **`image_ref` is an inline atom, not a block.** It matches the existing `tag_ref`/`mention_ref` token pattern (same NodeView/selection/keymap machinery), makes paste-at-cursor and Markdown import (`![alt](path)` parses inline) trivial, and CSS still renders images on their own visual line. Attrs are `{ id, alt, width, height }` as specced.
- **Operation shape.** `WorkspaceOperation::AttachImage { image: WorkspaceImage }` carries the whole metadata record; the blob write stays out of the domain. Detached rows are pruned inside the `SaveDocument` transaction via `document_image_ids`, and `ON DELETE CASCADE` covers purge. Bootstrap snapshots now include `images`, which is how the renderer resolves `id → contentHash/mimeType` without a read-path DB query.
- **Blob store.** `crates/skriuw-images` — flat `blobs/` directory beside the database, `<sha256>.<ext>`, atomic temp-file+rename writes, magic-byte sniffing (PNG/JPEG/GIF/WebP; SVG deliberately excluded), path-traversal-safe hash validation.
- **Rendering.** The NodeView reads the blob over IPC once per content hash per session and caches an object URL; CSP gained `img-src 'self' blob:`. No asset-protocol scope was opened.
- **Sweep.** Runs once per app start on a detached thread, 60 s after launch, off every interaction path. Blobs younger than one hour are never collected, closing the race with an in-flight `AttachImage`. Moving the sweep onto the six-hour rotation timer is a fair follow-up.
- **Markdown round trip.** Canonical markdown serializes `image_ref` as `![alt](images/<id>)` (no extension — the serializer has no MIME access). Export rewrites paths to `images/<id>.<ext>`, emits per-directory `images/` entries, and the native side copies blobs from the store. Import converts relative-`src` markdown images into stored blobs + `image_ref` nodes. Remote and absolute sources retain their Markdown attributes in blocked placeholder nodes, never receive a live `src`, and are counted in the import report.
- **Migration number.** Landed as `0005_note_images.sql` on this branch; the migration ledger requires contiguous versions, so whichever of pinned-nodes/note-images merges second renumbers.
- **Settings surface.** Settings → Data lists every stored image (grouped by content hash, with format, size, and the notes that reference it), opens the blobs folder in the file manager, and can relocate the whole workspace — the maintenance coordinator quiesces the runtime, copies the database (consistent backup path) plus `blobs/`, `history/`, and `recovery/`, writes a `storage-location` pointer file in the app data directory, and restarts the app. The old folder is kept as a fallback; `SKRIUW_DB` disables relocation.

### Deferred

- **Archives.** Portable archives still exclude blobs; an archive containing `image_ref` nodes imports cleanly but renders missing-image placeholders. The directory/zip archive format bump needs its own ADR (option 1 above) before implementation.
- **Backup.** Scheduled backup/verified swap cover the SQLite file only; the exclusion is documented in [../recovery.md](../recovery.md). Pairing `blobs/` with the database in the swap machinery is open.
- **Resize-by-drag, SVG support, editor-side markdown link pasting of local files.**
