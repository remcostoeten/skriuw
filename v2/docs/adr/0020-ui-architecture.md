# ADR-0020: UI architecture selection

- Status: accepted
- Date: 2026-07-21

## Context

ADR-0004 deferred every UI and editor decision until measured evidence existed. The
UI architecture gate in `TODO.md` required benchmarking editor candidates, cached
switching, tree virtualization, renderer store isolation, persistent editor hosting,
and desktop bridge overhead before selecting a stack. All six measurement items are
complete, with evidence recorded under `docs/benchmarks/`:

- `2026-07-21-editor-candidates-initial.md`, `2026-07-21-editor-retained.md`,
  `2026-07-21-editor-bounded.md`, `2026-07-21-editor-native-presentation.md`,
  `2026-07-21-editor-product-contract.md`, `2026-07-21-editor-structured-window.md`
- `2026-07-21-renderer-store-selectors.md`

The tree-virtualization and desktop-bridge measurements also informed this decision.
Both conclusions were carried into the product (bounded row pool, zero-IPC
navigation) and are covered by product tests and the later reference-production
measurement, so their disposable harnesses and benchmark records were retired after
the decision landed.

The product decision that unblocks a simpler default: notes are expected to stay
short. Multi-thousand-block documents are an edge case, not the primary workload.

## Decision

### Editor: ProseMirror

Direct ProseMirror is selected. Lexical is rejected: it showed no product capability
advantage and consistently used more DOM, memory, and interaction time in the
retained and bounded measurements.

The product editor uses one persistent ProseMirror instance that is never remounted
during navigation, with the representative Markdown schema, keymaps, list commands,
input rules, and slash-query state from
`spikes/ui-architecture/src/editors/prosemirror-product.ts`.

### Editor rendering path: whole-document by default, bounded window as fallback

The default path renders the whole canonical document in the persistent editor.
Measurements show this meets the cached-swap budget at 50 blocks and is marginal at
500; since notes are expected to stay short, the simple path ships first and keeps
navigation free of projection bookkeeping.

The bounded 192-block canonical window (structured JSON preservation, compact
per-note history, window movement, selection and scroll restoration) is retained as
the validated fallback for large documents: 3.845 ms switching P95 and 225 DOM
elements at 2,000 blocks. It is enabled per document above a block-count threshold
chosen during implementation, and is not part of the MVP navigation path.

### Renderer store: dependency-free external store with `useSyncExternalStore`

React is selected as the view layer. Application state lives in a dependency-free
external store with narrow selector subscriptions, ported from
`spikes/renderer-store`. Measured isolation guarantees carry over as invariants:
editor keystrokes must not render the application shell, and note selection must
render selected-note consumers only. Render-count assertions from the spike become
product tests.

### Build tool: Vite

Vite builds the renderer. All routes and the editor load in the startup bundle; no
post-startup chunk loading exists on navigation or editing paths, per the
performance contract.

### Desktop shell: Tauri 2

Tauri 2 hosts the renderer over the existing Rust workspace. The measured bridge
contract holds: zero IPC during navigation, optimistic FIFO-acknowledged writes
through the serialized runtime, and sub-millisecond command overhead at product
payload sizes.

### Undo history policy (by fiat)

Edits within a 500 ms burst group into one undo entry. Per-note history is capped at
200 entries; the oldest entries are dropped beyond the cap. This is standard editor
practice and requires no further measurement.

### Deferred evidence

Fixed-runner (reference hardware) presentation evidence is deferred until the MVP
UI exists; measuring disposable spikes on fixed hardware would not survive into
product evidence. The 100-cached-switch zero-dropped-frame proof runs once against
the real application after the MVP UI is assembled.

## Performance contract check

Every selected option was measured within the provisional budgets of
`docs/performance-contract.md` in its spike: cached editor swap, tree interaction,
store transitions, and bridge overhead all held P95 below 8 ms with zero observed
dropped frames on the development machine. No candidate that failed the contract was
selected; the unbounded retained editor pool and naive full-DOM swap at 2,000 blocks
were rejected on that basis.

## Consequences

- Product UI construction starts now; spike code is ported, not re-derived.
- Whole-note find/copy, IME completion, and accessible traversal are implemented in
  the product against the canonical document, not proven in further spikes.
- The bounded-window fallback keeps large documents viable without complicating the
  default navigation path.
- Fixed-runner evidence is a post-MVP verification step, not a construction gate.
