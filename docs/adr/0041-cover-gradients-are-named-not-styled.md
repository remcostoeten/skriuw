# 0041 — Cover gradients are named, not styled

## Status

Accepted, 2026-09-09. Extends the note-cover pipeline of ADR 0030 to covers
that own no asset.

## Context

v1 let a note wear a built-in theme gradient as well as an uploaded image. v2
shipped only image covers, so a note that wanted colour at the top had to carry
a blob it did not need: a file in the content-addressed store, a row in the
attachment table, a line in every archive and backup, and a share of the unused
sweep's work. Adding a note's twentieth gradient cover should cost nothing on
disk.

## Decision

A note carries an optional `cover_gradient` alongside `cover_image_id`, and the
two are mutually exclusive: `SetNoteCoverGradient` with a value clears the image
(detaching it exactly as removing a cover does), and `SetNoteCover` with an
image clears the gradient. Both feed the same full-width flag; a gradient cover
has no transform, so position and zoom reset when one is chosen.

The stored value is an **identifier from a fixed allow-list**, never CSS.
`COVER_GRADIENT_IDS` in `skriuw-domain` is the trust boundary — validation
rejects any other value on an operation and in an archive — and
`app/src/features/note-chrome/cover-gradient-model.ts` is the only place an id
becomes paint. A workspace is untrusted content that arrives over sync, import,
and archive restore; a free-form style string would let a peer or a crafted file
choose what the renderer paints, including a `url()` that reaches the network
from inside the editor chrome. An id cannot.

## Consequences

- An id this build does not recognise — a workspace written by a newer version,
  or a corrupted row — resolves to no paint and the note falls back to plain
  chrome. It is never passed through to a style attribute, and it is never
  silently rewritten, so a downgrade followed by an upgrade keeps the gradient.
- Adding a gradient means adding an id in both the Rust list and the renderer
  table. A unit test compares the two, so drift fails the gate rather than
  shipping a cover that validates and paints nothing.
- Full-width covers no longer imply an image. The archive rule that rejected
  cover width without a cover now accepts either kind, and rejects a node that
  claims both.
- The migration only adds a nullable column, so an existing workspace opens
  unchanged and every prior archive version stays readable.
