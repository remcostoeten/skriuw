# ADR-0045: Rendered Mermaid fences

- Status: accepted
- Date: 2026-09-17

## Context

The editable diagram block ([spec](../specs/embedded-diagrams.md)) covers one
Mermaid family: flowcharts its own parser accepts. Every other `mermaid` fence
a note holds, whether imported, pasted, synced, or typed, stays a plain code
block. Sequence, state, class, and entity relationship diagrams are common in
engineering notes, and a flowchart with a `subgraph` or an exotic node shape
falls out of the editable parser too. All of them sat in the note as dead
source text.

Anything that renders those fences has to respect the constraints already in
place: SQLite and the fenced Markdown stay the canonical source, note switching
and typing budgets in the [performance contract](../performance-contract.md)
must hold, the desktop CSP allows no external font or script loads, and the
editable block's routing must not change.

## Decision

Renderable fences get a read-only preview inside the existing code block node
view. There is no new node type, schema change, or stored format change.

Routing is a single rule, applied in this order:

| Fence | Result |
| --- | --- |
| `mermaid` flowchart the editable parser accepts | editable `diagram` node, unchanged |
| `mermaid` flowchart the editable parser rejects | `code_block` with a rendered preview |
| `sequenceDiagram`, `stateDiagram(-v2)`, `classDiagram`, `erDiagram` | `code_block` with a rendered preview |
| any other family (`gantt`, `pie`, `mindmap`, ...) | `code_block`, source only, with a one-line note |

The renderer is `@vercel/beautiful-mermaid` 0.1.5 (MIT), pinned exactly and
wrapped by `apps/workspace/src/features/editor/mermaid-render.ts`. It is pure TypeScript
with one dependency (`@dagrejs/dagre`), takes a string and returns an SVG
string, and has no DOM dependency, so it can move behind a Worker seam later as
a transport change only. The chunk is loaded with a dynamic import on the first
renderable fence a note view meets: 107.5 KB raw, 32 KB gzipped, none of it in
the main bundle.

The wrapper owns everything the library does not fit:

- family detection from the first meaningful header line, so unsupported
  families never reach the renderer;
- a palette read from the live theme tokens (`--background`, `--foreground`,
  `--muted-foreground`, `--card`, `--border`) so the diagram inherits every
  theme without a second theme table, and a `MutationObserver` on the root
  `data-theme` attribute re-renders on theme changes;
- sanitizing of the returned SVG before it reaches `innerHTML`: the library
  emits a Google Fonts `@import`, which the CSP would block and which must not
  load a network font in a local-first app, and the source is user text, so
  `<script>` elements, `on*` handlers, and `javascript:` links are stripped and
  tested for;
- a bounded memo (64 entries) keyed by source, palette, and animation, so
  switching back to a note costs nothing;
- error mapping: parser errors and degenerate empty output become a visible
  one-line message under the preview while the last good SVG stays.

Preview is the default presentation for a renderable fence. The source stays in
the DOM, collapsed rather than `display: none`, so a caret arriving by keyboard
still lands in it and the node view flips to source. Enter on a selected
preview opens the source, Escape in the source returns to the preview, and the
`toggleDiagramSource` shortcut (`mod+alt+p`, rebindable) flips from anywhere in
the block. Re-renders while typing are debounced 250 ms and run in an idle
callback, never in the typing path, and only the first render of a block
animates. The library emits the `prefers-reduced-motion` guard for animated
output; the node view additionally skips animation under reduced motion and
`saveData`.

Wide diagrams scroll horizontally inside the block instead of shrinking below
legibility or widening the note column. An Expand control opens the SVG in a
native `<dialog>` at full viewport with native pan and pinch zoom; the shared
React `Dialog` is not usable from a ProseMirror node view, and the native
element gives the same top-layer focus trap and Escape handling.

Measurements are in
[the render benchmark](../benchmarks/2026-09-17-mermaid-render.md).

## Rejected alternatives

- **mermaid.js.** Over 2 MB, DOM-bound rendering with its own stylesheet
  injection, and a poor fit for the CSP and for a lazy chunk.
- **Upstream `beautiful-mermaid`.** Pulls in `elkjs`, a larger and slower
  layout engine, for no visible gain at note-sized diagrams. The Vercel fork
  adds rank-by-rank animation, a richer palette contract, and one small
  dependency.
- **Making the other families editable.** The editable block earns its cost
  through spatial editing of graphs. Sequence and class diagrams are text-first;
  source editing with a live preview is the better experience at a fraction of
  the cost.
- **Rendering in a Worker now.** Warm renders for the reference diagrams stay
  well inside a frame; the seam exists if a future family or size breaks that.
- **Rendering at save time or storing SVG.** Duplicates the source of truth and
  bloats documents, sync payloads, and history for output that is cheap to
  recompute and memoized.

## Consequences

- Markdown export, sync, encryption, history, archives, and import need no
  changes: the fence stays the only stored form.
- The library is `0.1.x`. Upgrades or a swap back to upstream touch one file.
- The library derives a few secondary colors with `color-mix()`. The wrapper
  passes the full enriched palette so the primary colors never depend on it,
  but very old WebKitGTK builds would render those secondary tints without
  mixing.
- Swipe-to-close is not implemented for the expanded view; it closes from its
  44 px control and from Escape.
