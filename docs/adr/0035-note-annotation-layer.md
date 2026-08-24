# ADR-0035: The note annotation layer is versioned document data

- Status: accepted
- Date: 2026-08-23

## Context

Skriuw v2 needs freehand annotation over a whole note — ink and simple shapes
drawn across the text, including the margins outside the writing column, staying
glued to the content it was drawn over as the note scrolls. v1 ships this
interaction on top of Excalidraw. The interaction is worth keeping; the
dependency is not. Excalidraw, tldraw, and perfect-freehand each carry a runtime
far larger than the feature, and `docs/performance-contract.md` forbids
post-startup chunk loading, so a drawing library would be paid for on every cold
start whether or not a note has ink.

The surface is not a block. It covers the entire note, so it cannot be a
movable, reorderable, deletable node in the content flow without contradicting
what it is. It also must not become a second persistence path: v2 keeps SQLite
canonical, serializes durable writes, and routes every document change through
one `SaveDocument` operation that the history outbox, archive, scheduled backup,
and sync reconcile paths already understand.

## Decision

The annotation layer is a `drawing` attribute on the ProseMirror document root,
stored inside `document_json`. It is written by an ordinary transaction
(`Transaction.setDocAttribute`), so it undoes and redoes through normal document
history and commits through the existing `SaveDocument` operation. No new table,
no new IPC command, no second persistence path.

The model is versioned and library-independent. `strokes` are freehand paths
held as flat point arrays in document coordinates with a color, width, and tool;
`shapes` are `line`, `rect`, and `ellipse` with the same color and width plus a
fill flag. Every element carries a stable id, so erasing, moving, and sync
convergence can address one element without rewriting the layer. Coordinates are
CSS pixels from the top-left of the note content, with the annotation space
pinned to zoom 1: the canvas stays viewport-sized and paints at `y - scrollTop`
rather than allocating a canvas as tall as the note.

Ink color is stored as a preset id wherever the user picked a preset, and as a
`#rrggbb` literal only for a custom color. A preset resolves to a light or dark
value at paint time, so the same stroke stays legible when the theme changes;
a literal has no theme pair and is stored as written.

The layer is bounded: at most 512 elements per note, 2048 points in one stroke,
and 16384 points across a note. Strokes are simplified (Ramer–Douglas–Peucker)
and rounded to a tenth of a pixel when committed, so a persisted stroke keeps
its shape at a fraction of the samples a pointer produces.

Markdown export projects a non-empty layer as one trailing fenced `drawing`
block holding the model as JSON, and import lifts that fence back into the
document root. Nothing is ever silently discarded, matching the contract
ADR-0025 keeps for unsupported `mermaid` sources, but there are two distinct
recovery cases and they are handled differently.

A payload that is still recognisably a layer envelope — an object with a
numeric `version` and an array of `elements` — but that this build cannot
render is *foreign*: a layer written by a newer version, or a scene carried in
from another tool. It is kept byte-for-byte on the document root, exported
verbatim, and surfaced as read-only. Annotate mode refuses to edit it, because
committing a stroke would replace it, which is the one way ink written by a
newer version could be lost. A payload that is not a layer envelope at all is
left exactly where it is and lands as an ordinary code block.

Layers, text elements, images, arrows, panning or zooming the annotation space,
PNG and SVG export, pressure sensitivity, and collaboration cursors are not part
of this decision. Converting a v1 Excalidraw scene into this model is explicitly
not in scope; a v1 scene survives import as opaque payload.

## Consequences

- Ink rides every path a note's text already rides — save, undo, history
  outbox, archive, backup, sync reconcile — without new plumbing, and a
  conflicting two-device annotation edit resolves as an ordinary document
  conflict.
- Every code path that rebuilds a document from its top-level blocks must carry
  the root's attributes across. The bounded-document window did not, so a note
  over 192 blocks would have lost its ink on every save; `documentFromBlocks`
  now takes the attributes, and the window's own history records and undoes an
  attributes-only change, which is what a drawing edit is.
- Documents now serialize a `drawing` key on the root even when empty, so stored
  `document_json` gains one null-valued attribute on its next write.
- The renderer ships no new runtime dependency, and a note without ink keeps no
  canvas warm and installs no live handlers. Idle, the overlay is
  `pointer-events: none`, hidden from assistive technology, and absent from the
  tree entirely when the note has never been drawn on.
- A conflicting two-device annotation edit is an ordinary `SaveDocument`
  revision conflict, and the losing device's alternative is preserved for
  resolution like any other document conflict.
- The model is deliberately narrower than any drawing library. New element
  kinds require their own geometry, accessibility contract, and bounds rather
  than growing an unbounded union.
