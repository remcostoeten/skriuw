# Excalidraw drawings

Status: implemented on desktop and in the browser
([ADR-0066](../adr/0066-excalidraw-drawing-blocks.md)).

## Product contract

A drawing is a top-level, selectable, draggable editor block that holds one
Excalidraw scene: shapes, arrows, freehand lines, text and images. It is
separate from the annotation layer ([ADR-0035](../adr/0035-note-annotation-layer.md)),
which draws over the whole note.

Insertion paths:

- `/excalidraw`, with `drawing`, `draw`, `sketch`, `whiteboard` and `canvas`
  aliases, inserts an empty drawing;
- `/import` (Import Excalidraw file) opens the file chooser and inserts the
  picked drawing;
- dropping a `.excalidraw` file on a note inserts it where it lands;
- typing or pasting an `excalidraw` fence whose body is a drawing;
- saving such a fence from raw Markdown mode.

Files the importer reads: official `.excalidraw` files, Excalidraw clipboard
JSON, and PNG or SVG files Excalidraw exported with "Embed scene" on. Save
writes an official `.excalidraw` file named after the note, through the native
save dialog on the desktop and a download in the browser.

## Stored model

The ProseMirror `excalidraw` node is atomic, isolating, draggable and
selectable. Its only attribute, `scene`, is a string holding a compact
official Excalidraw document:

- `type: "excalidraw"`, `version: 2`, `source: "https://skriuw.com"`;
- `elements`: every element needs a non-empty string `id` and `type`; other
  fields are kept as Excalidraw wrote them;
- `appState`: only `viewBackgroundColor`, `gridSize`, `gridStep` and
  `gridModeEnabled`, the keys Excalidraw writes to files;
- `files`: embedded images keyed by id, each with a `data:` URL.

A scene is at most 8 MB serialized and 20 000 elements. Deleted elements and
files no image element points at are dropped before each save. Whenever a
scene enters the renderer from Markdown, a file or the clipboard, it is read
through `readExcalidrawScene`; anything that fails stays a code block or is
rejected with a reason.

## Markdown degradation

The block serializes as an `excalidraw` fence holding the stored document on
one line. A fence whose body is not a drawing stays an ordinary code block,
so nothing is dropped. Another Markdown tool shows the fence as JSON. The
search index drops `excalidraw` fences ([ADR-0041](../adr/0041-full-text-search-index.md)).

## Rendering and editing

The block renders a static SVG preview made with Excalidraw's `exportToSvg`,
with a transparent background and Excalidraw's dark-mode filter when the app
is dark. An empty block shows an empty state and never loads the library. The
preview's accessible name lists the element count and the text in the
drawing.

Edit, double-click on the preview, or Enter on the selected block opens a
full-window Excalidraw editor with Import file, Save .excalidraw and Done.
Changes commit to the block 400 ms after they stop and again on close. Escape
closes the editor unless a text edit, a shape being drawn, or a menu, popup
or dialog is active, and `Mod+Enter` always closes it. Excalidraw's own open, save and
export actions are hidden, because its browser file APIs do not work in the
desktop webview. Keys typed in the editor do not reach app shortcuts.

## Bounded window, history and archive

A drawing is one atom node with one string attribute, so the bounded editor
window counts it as one block and never walks its elements. Each commit is one
`setNodeMarkup` transaction: undo and redo step through commits, and every
commit saves through `SaveDocument`. Archives, backups and sync carry the
scene inside `document_json` and the fence inside the Markdown.

## Dependency cost

`@excalidraw/excalidraw` 0.18.1 is loaded with its stylesheet the first time a
block with content renders or the editor opens. It is never part of the
startup bundle. The app bundles Excalidraw's text fonts (520 KB) under
`excalidraw-assets/fonts/` and leaves out the 13 MB CJK font. The browser
service worker precaches the Excalidraw chunks so drawings open offline.

## Not covered

- Text inside drawings is not searchable.
- Library browsing (libraries.excalidraw.com) and live collaboration are not
  wired up.
- The mobile app has not been checked with drawings.
- Agent (MCP) tools for drawings come with the local MCP server.
