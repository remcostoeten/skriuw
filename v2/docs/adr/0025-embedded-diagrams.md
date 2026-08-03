# ADR-0025: Embedded diagrams use a structured local model

- Status: accepted
- Date: 2026-08-02

## Context

Skriuw needs diagrams that can be created from readable syntax and edited by
pointer or keyboard inside a note. Mermaid is a useful interchange syntax, but
its automatic renderer does not preserve manual coordinates and its complete
runtime includes many diagram families the editor does not need. The v1 diagram
feature also stored Mermaid source beside library-specific canvas JSON, allowing
the two representations to disagree.

The v2 editor must retain its persistent direct-ProseMirror host, bounded-document
fallback, zero-IPC navigation, synchronous local editing, and portable Markdown
projection. A diagram must remain an ordinary movable editor block and cannot
introduce a second persistence path.

## Decision

The editor owns a versioned `diagram` ProseMirror node containing a bounded,
library-independent flowchart model. Nodes carry stable IDs, labels, shapes,
positions, and optional colors. Edges carry stable endpoints, labels, line style,
and optional color. Diagram state is part of `document_json`; the existing
`SaveDocument` operation, SQLite transaction, history outbox, archive, and backup
paths remain authoritative.

Mermaid-compatible `flowchart` fences are an import and export projection. The
supported subset includes five directions, common node shapes, directed solid or
dashed edges, edge labels, comments, and basic `style` colors. Supported source is
parsed into the structured model. Invalid or unsupported source remains a code
block and is never silently discarded. When source is edited from an existing
diagram, stable node IDs retain their stored positions and appearance.

Rendering uses semantic DOM nodes over one SVG connector layer in a direct
ProseMirror NodeView. Pointer movement updates only the local surface and commits
one transaction when the gesture ends. Keyboard users can enter the block, move
spatially between nodes, rename, delete, connect, and nudge nodes. SVG is
decorative; relationship descriptions are exposed through accessible labels and
announcements.

The first version is limited to flowcharts with at most 150 nodes and 300 edges.
Sequence, Gantt, mind-map, arbitrary SVG, animation, and executable MDX are not
part of this decision.

## Consequences

- Diagram positions and presentation survive restart without a new table or IPC
  command.
- Markdown stays readable and portable, but manual coordinates are intentionally
  a structured-document enhancement because Mermaid does not represent them.
- The renderer does not ship React Flow or Mermaid's full rendering runtime.
- Source compatibility is deliberately narrower than Mermaid language parity and
  reports the first unsupported line.
- New diagram families require their own model, accessibility contract, and
  performance evidence rather than growing an unbounded union.
