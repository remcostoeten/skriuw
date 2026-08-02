# Embedded diagrams

Status: implemented for editable flowcharts.

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

## Verification

- Parser and serializer cover supported shapes, directions, labels, colors,
  invalid syntax, and position reconciliation.
- Editor coverage includes JSON, Markdown, slash insertion, unsupported-source
  preservation, word count, and geometry.
- Product verification must exercise keyboard creation, connection, movement,
  source application, block reordering, restart persistence, and raw-mode import.
- Representative 10-, 50-, and 150-node diagrams must retain the existing note
  switching and typing budgets before the size ceiling increases.
