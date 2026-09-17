# Embedded diagrams

Status: implemented for editable flowcharts; rendered previews for the other
Mermaid families ([ADR-0045](../adr/0045-rendered-mermaid-fences.md)).

## Product contract

A diagram is a top-level, selectable editor block. Its default presentation has
no frame or canvas fill, so it reads as part of the note. Selecting or focusing
the block reveals editing controls. An explicitly selected background belongs to
the diagram and is persisted with it.

Insertion paths:

- `/diagram`, with `mermaid`, `flowchart`, `graph`, and `workflow` aliases;
- typing a `mermaid` or `diagram` fence in the rich editor;
- pasting supported fenced Markdown;
- saving supported fences from raw Markdown mode.

The source form is a fenced `mermaid` flowchart. Unsupported Mermaid families and
syntax remain exact fenced code rather than becoming a partial or empty diagram.

## Stored model

The ProseMirror `diagram` node is atomic, isolating, draggable, and selectable.
Its `model` attribute contains:

- `version`, currently `1`;
- `direction`: `TD`, `TB`, `BT`, `LR`, or `RL`;
- an optional canvas background;
- up to 150 nodes with ID, label, shape, position, fill, and stroke;
- up to 300 edges with ID, endpoints, label, dashed state, and stroke.

Identifiers, labels, colors, coordinates, endpoint references, and collection
sizes are normalized whenever persisted JSON enters the renderer. The stored
format contains no DOM, CSS, React, SVG, or canvas-library objects.

## Interaction

The diagram itself is one document tab stop. Enter moves into its selected node
and Escape returns through normal editor navigation. Within the canvas:

- arrow keys move focus spatially;
- Shift plus an arrow nudges the focused node eight pixels;
- Enter or F2 edits its label;
- Delete removes it while preserving the non-empty-diagram invariant;
- Connect starts a keyboard target-selection operation;
- Add step creates and connects a node after the current node;
- Arrange performs deterministic layered layout;
- Source exposes the Mermaid projection; Mod+Enter applies and Escape cancels.

Pointer dragging updates the node transform and affected connectors during the
gesture, then commits one ProseMirror transaction. Whole-block movement continues
to use the editor gutter, context menu, and `Alt+ArrowUp/Down` commands.

## Rendering and accessibility

Diagram nodes are semantic DOM controls. Connectors and arrowheads share one SVG
layer and are hidden from the accessibility tree. Each node announces its shape
and outgoing connections; a live region announces creation, deletion, connection,
layout, source application, and movement. Editing controls have visible focus and
do not depend on hover. Reduced-motion preferences remove toolbar transitions.

Node movement never updates React or the workspace store per pointer event. The
NodeView recalculates connectors locally and ordinary document persistence runs
only after a committed editor transaction.

The current routing measurement is recorded in
[the diagram benchmark note](../benchmarks/2026-08-02-diagram-routing.md).

## Markdown and portability

Structured diagrams serialize as ordinary fenced Mermaid flowcharts. Topology,
labels, supported shapes, edge styles, and supported colors round-trip. Manual
coordinates and the optional canvas background remain in `document_json` and are
not emitted as proprietary Markdown metadata.

Because documents and their Markdown projections already travel through workspace
archives, SQLite backups, and Git history, diagrams require no schema migration or
separate media lifecycle.

## Rendered Mermaid fences

Every `mermaid` fence the editable block does not claim is still a `code_block`
whose fence stays the canonical source. Routing, in order:

| Fence | Result |
| --- | --- |
| flowchart the editable parser accepts | editable `diagram` node |
| flowchart the editable parser rejects (subgraphs, exotic shapes) | `code_block` with a rendered preview |
| `sequenceDiagram`, `stateDiagram(-v2)`, `classDiagram`, `erDiagram` | `code_block` with a rendered preview |
| any other family | `code_block`, source only, with the note "Rendering supports flowchart, sequence, state, class, and ER diagrams." |

Insertion paths for the rendered families: `/sequence`, `/state`, `/class`,
and `/er` insert a `mermaid` fence with a minimal template, open it in source
mode, and put the caret on the first token the template expects to be
replaced. Fences also arrive by typing, pasting, raw Markdown, sync, and import,
and are rendered the same way.

Preview and source contract:

- A renderable block carries `data-mermaid="preview"` or `"source"`. Preview is
  the default; a block whose source is empty, or whose text holds the caret
  when it mounts, opens in source mode.
- In preview mode the source stays in the DOM, visually collapsed, so a caret
  entering by keyboard still lands in it; the block then reveals the source.
- The toolbar is pinned in preview mode and offers Source/Preview, Copy, and
  Expand. Expand opens the SVG in a full-viewport native dialog with native pan
  and pinch zoom, closed by its control or Escape.
- Enter on a selected preview opens the source with the caret at its end.
  Escape in the source returns to the preview and reselects the block.
  `toggleDiagramSource` (`mod+alt+p` by default, rebindable, listed in the
  cheat sheet) flips the mode from anywhere in the block.
- Edits re-render 250 ms after the last keystroke in an idle callback. Only a
  block's first render animates; reduced motion and `saveData` disable
  animation, and the SVG carries the `prefers-reduced-motion` guard.
- A render error shows its message in a `role="status"` line under the preview
  and keeps the last good SVG. The block is never blank and never silently
  falls back to source.
- Colors come from the active theme tokens; a `data-theme` change on the root
  re-renders every visible preview in place.
- Output SVG is sanitized before insertion: Google Fonts imports, scripts,
  inline handlers, and `javascript:` links are removed.

Compact shell: the preview scales to the column, wide diagrams scroll
horizontally inside the block without widening the page, controls are 44 px at
`pointer: coarse` and visible without hover, and Expand gives a full-screen,
pinch-zoomable canvas.

## Verification

- Parser and serializer cover supported shapes, directions, labels, colors,
  invalid syntax, and position reconciliation.
- Editor coverage includes JSON, Markdown, slash insertion, unsupported-source
  preservation, word count, and geometry.
- Product verification must exercise keyboard creation, connection, movement,
  source application, block reordering, restart persistence, and raw-mode import.
- Representative 10-, 50-, and 150-node diagrams must retain the existing note
  switching and typing budgets before the size ceiling increases.
- Rendered fences: family detection, palette conversion, sanitizing, memo
  bounds, and error mapping are unit-tested; the node view is tested with a
  stubbed renderer for preview/source switching, debounced re-render, error
  surfacing, theme observation, and teardown; Markdown round-trips of every
  rendered family are byte-identical; the desktop and compact-shell e2e runs
  insert, edit, toggle, expand, and theme-switch a rendered fence. Render
  timings live in [the render benchmark](../benchmarks/2026-09-17-mermaid-render.md).
