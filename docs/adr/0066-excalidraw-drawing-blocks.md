# ADR-0066: Excalidraw drawings are document blocks that load the library on demand

- Status: accepted
- Date: 2026-11-22
- Amends: the dependency reasoning in
  [ADR-0035](0035-note-annotation-layer.md)

## Context

ADR-0035 kept freehand ink over a whole note and rejected Excalidraw for it,
because a drawing library would be paid for on every cold start. That layer
answers "mark up this note". It does not answer "draw a diagram inside this
note": boxes, arrows, text and images on a canvas of their own, in a format
other tools read. People keep that work in `.excalidraw` files, open them on
excalidraw.com, and want to move them in and out of notes without converting
them.

Since ADR-0035, two content renderers load their library on demand: KaTeX for
math and `@vercel/beautiful-mermaid` for diagram previews. Neither is a route
or editor chunk, so the performance contract's rule against loading those
after startup does not cover them. A notes app that never shows a drawing
never loads either library.

## Decision

A drawing is an `excalidraw` block: an atomic, selectable, draggable node
whose one attribute, `scene`, holds the drawing as a compact official
Excalidraw document (`type: "excalidraw"`, `version: 2`, its elements, the
appState keys Excalidraw writes to files, and the embedded image files). The
attribute is a string, so a scene of thousands of elements is one JSON node in
`document_json` rather than thousands, and it stays inside the document node
and depth limits. Edits replace the attribute through an ordinary transaction,
so they undo, save, archive and sync on the existing `SaveDocument` path. No
new table, operation or IPC command stores drawings.

Markdown carries the block as an `excalidraw` fence holding that same
document. A fence that does not parse as a drawing stays a code block, so
nothing is lost. The search index already drops `excalidraw` fences
(ADR-0041), so coordinates never reach search results.

The Excalidraw library is loaded only to render a block that has content and
to open the editor. An empty block, and every note without a drawing, never
loads it. The block shows a static SVG preview in the note, and editing
happens in a full-window Excalidraw editor that commits shortly after each
change stops and again on close.

Files move in both directions. Import takes an official `.excalidraw` file
(parsed without the library) or a PNG or SVG that Excalidraw exported with
the scene embedded. Save writes an official `.excalidraw` file through a new
`save_text_file` desktop command that opens the native save dialog, and
through a download in the browser. A dropped `.excalidraw` file becomes a
drawing block where it lands.

The fonts Excalidraw draws text with are bundled with the app (520 KB), since
the desktop CSP blocks the CDN it falls back to. The CJK font, Xiaolai (13 MB),
is left out: CJK text in a drawing renders in a system font.

A scene is capped at 8 MB serialized and 20 000 elements. Deleted elements
and images no element points at are pruned before every save. A change that
would push a drawing over the cap is not saved, and the editor says so.

ADR-0035 stands. The annotation layer stays library-free, because it is drawn
over every note that has ink and must not load a canvas library to paint a
stroke.

## Consequences

- `.excalidraw` files open on excalidraw.com and in other Excalidraw tools
  unchanged, and their files import without conversion.
- The browser's service worker precaches the Excalidraw chunks with the rest
  of the app, so drawings open offline. That makes the first browser install
  larger.
- Text inside a drawing is not searchable.
- An older build cannot read a document that contains an `excalidraw` node, so
  it opens such a note empty, as with every block type added before. Typing
  into it there replaces the note. Every device that edits notes with
  drawings needs this build or later. Markdown exports and imports carry the
  fence, which older builds keep as a code block.
- Agent tools for drawings (create, read, update a drawing over MCP) build on
  this block once the local MCP server lands.
