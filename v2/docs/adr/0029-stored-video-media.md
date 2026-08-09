# 0029 — Stored video media

## Status

Accepted, 2026-08-09. Supersedes the image-only scope of the workspace asset
pipeline (previously the `media` node was URL-only by design).

## Context

The workspace blob store, `AttachImage` operations, and the media library were
built exclusively for images (PNG, JPEG, GIF, WebP). Videos could only be
embedded by remote URL through the `media` node, which meant local recordings
had no durable, workspace-owned home and did not participate in usage
accounting or export.

## Decision

Videos (MP4, WebM) become first-class stored media, reusing the existing image
plumbing instead of adding a parallel pipeline:

- `skriuw-images` sniffs MP4 (`ftyp` box) and WebM (EBML header with a `webm`
  DocType) magic bytes and maps their extensions. The store remains
  content-addressed and format-validated at the trust boundary.
- `WorkspaceImage` records and `AttachImage` operations carry video attachments
  unchanged; `validate_mime_type` accepts `video/*` alongside `image/*`.
  `width`/`height` stay null for videos.
- The editor `media` node gains an optional `refId` attribute binding it to a
  workspace attachment. Canonical markdown serializes stored media as
  `[title](images/<refId>)<!--skriuw-media:video-->`, so exports reuse the
  image path-rewriting and file-bundling machinery.
- `document_image_ids` (Rust) and its renderer mirrors collect `media.refId`
  next to `image_ref.id`. Detach-on-save, the unused sweep's live set, the
  media library's usage accounting, and "Remove all unused" therefore treat
  video references exactly like image references.
- Videos are excluded from the note-cover picker; covers remain images.

## Consequences

- A stored video that loses its last `media` reference is detached and becomes
  sweepable, identical to images.
- Video playback picks its transport per platform. WebKitGTK delegates media
  fetches to GStreamer, which resolves only http(s) and data URLs itself:
  measured on WebKitGTK 2.52, asset-protocol video sources fail instantly
  with `MEDIA_ERR_SRC_NOT_SUPPORTED` (while `fetch()` of the same URL returns
  206 with correct ranges) and blob-URL videos stalled or errored on roughly
  half of 1–4 MB loads. Data URLs played 9/9 through 20 MB (~180 ms encode),
  so Linux desktop plays videos from a data URL and gives up streaming.
  macOS/Windows webviews stream custom schemes correctly and use the asset
  protocol (scope extended at runtime because the blobs directory is only
  known then). The browser runtime serves an object URL backed by an OPFS
  `File` handle. All retain a full-read blob-URL fallback. Images keep the
  byte-copy path.
- The browser runtime gained its own media blob store
  (`app/src/bridge/browser-media.ts`): the same content-addressed
  `<sha256>.<ext>` layout in one flat OPFS directory, with a TypeScript
  mirror of the magic-byte sniffer. Its unused sweep takes the live hash set
  from the renderer (the browser has no backend-side attachment view) and
  keeps the one-minute safety margin.
- The `skriuw-images` crate name and `WorkspaceImage` contract name are kept
  despite now covering video, to avoid a contract rename with no behavioral
  benefit.
