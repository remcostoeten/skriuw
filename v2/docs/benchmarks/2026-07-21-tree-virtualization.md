# Nested tree virtualization observations

Date: 2026-07-21

## Purpose

This spike measures whether a bounded, fixed-row-height virtualized sidebar tree can hold the canonical 1,000-note and 5,000-note workspaces inside the interaction budgets of `docs/performance-contract.md` without React or a virtualization dependency. It also proves the tree correctness contract: deterministic flattening, collapsed subtrees never rendering, bounded DOM, stable selection, and complete keyboard navigation with tree/treeitem semantics.

## Fixtures

Fixtures are the canonical deterministic generators from `skriuw-fixtures` (ADR-0016), projected for the browser by `crates/skriuw-fixtures/examples/export_tree_projection.rs`. The projection preserves creation order, which equals sibling order because every fixture placement is semantic `last`. Digests are the serialized-operation digests pinned in the crate's default test suite:

| Fixture | Nodes | Max depth | Operations digest |
| --- | ---: | ---: | --- |
| `nested-1000` | 1,032 | 33 | `1e84b7fd861ee6c70ca55e80aba1b2c3d9ec0dd1e3133074d974f0335d6f960f` |
| `nested-5000` | 5,032 | 33 | `e41672a02c6102ab1fdd78d7f52c4dae9b840df8332fc4248e4e559d83ee543c` |
| `wide-1000` | 1,000 | 1 | `c4e6ca1b0392cf555fe758cd4b709ff956862661e4337cd26519fa836566481b` |
| `wide-5000` | 5,000 | 1 | `697fff9952091873cb2f2d2b3fe487e53356e00ac6a763d6cc4980b2d7f1d844` |
| `mixed-1000` | 1,016 | 9 | `a8be5c752487179431635a01ca989fbe866118251d836213453efd02bacb24b6` |
| `mixed-5000` | 5,016 | 9 | `debfb699e59fc51495802fc31501b99345c9abf32fa59cf219ad7e33bfb53e61` |

The nested shape is primary because a 33-level chain stresses depth indexing, ancestor expansion, and parent navigation. Wide covers the degenerate single 5,000-row sibling list, and mixed covers wide folder expansion plus a shallow chain; both reveal distinct flattening and sibling-list behavior, so all six canonical fixtures were exercised.

## Method

The disposable `spikes/tree-virtualization` harness renders one scroll container with a fixed 28 px row height, an absolute-positioned recycled row pool keyed by node ID, and an 8-row overscan above and below the viewport window. The complete tree, the parent-to-children index, and the initial flatten are prepared before any measured interaction; their costs are recorded separately. Rows carry `role="treeitem"` under one `role="tree"` host with `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`, `aria-selected`, and `aria-disabled`, which the ARIA APG requires when the full node set is not in the DOM. Keyboard focus is a roving tabindex; Arrow Up/Down move selection, Arrow Right expands or enters, Arrow Left collapses or moves to the parent, and Home/End jump. Nothing is animated.

Every run used a production Vite build served by `vite preview`, one fresh headless Chromium context per fixture with a fixed 1280×900 window, and no throttling. `scripts/bench.mjs` drives the run over the Chrome DevTools Protocol. Measured scenarios sample synchronous handler work, one forced `offsetHeight` read (settled = sync + forced layout), the next animation-frame opportunity, frame gaps, mutated-row counts, browser Long Tasks, and Long Animation Frames:

- 100 keyboard selection moves in one sequence covering top, middle, and bottom positions, including `End` and `Home` window jumps.
- 40 alternating expand/collapse toggles of the largest depth-1 folder and of the deepest folder.
- 30 top→middle→bottom→top scroll jumps.
- 20 reveals of a collapsed deep descendant through ancestor expansion, with the collapse reset performed outside the timed window.
- 50 pure visible-row recomputations (flatten only, no DOM).

Separately, 100 trusted `ArrowDown` key events were dispatched through CDP `Input.dispatchKeyEvent` at 24 ms spacing while the page recorded per-event handler timing, `PerformanceEventTiming` entries at the API's 16 ms minimum threshold, and a Chrome Performance trace whose `EventDispatch` keydown durations provide uncensored per-key dispatch timing.

Commands:

```bash
cd spikes/tree-virtualization
./scripts/export-fixtures.sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4174
node scripts/bench.mjs http://127.0.0.1:4174 nested-1000 nested-5000 wide-1000 wide-5000 mixed-1000 mixed-5000
```

## Environment

- Linux 7.1.2-arch3-1 x86_64, Intel Core i7-10700F, 16 threads, 23 GiB RAM, desktop machine under normal background load
- Headless Google Chrome 150.0.7871.46, fresh profile per fixture
- Node.js 24.15.0, Vite 8.1.5 production build (`buildMode: production`)
- Rust 1.95.0 release build for fixture projection
- Estimated frame duration 16.67 ms in every context; `longtask`, `long-animation-frame`, `event`, and `measureUserAgentSpecificMemory` all supported (no unsupported APIs recorded)

## DOM ceiling

Every fixture rendered 32 mounted rows at rest inside a 638 px viewport, with a hard computed cap of 40 rows (23 visible + 1 + 2 × 8 overscan) that the peak renderer never exceeded. Total document DOM was 163 elements for every fixture, identical at 1,000 and 5,000 notes, so rendered DOM is independent of workspace size. One tree host was mounted exactly once per run.

## Hydration and preparation costs (outside interaction timing)

All values are milliseconds from the recorded representative runs.

| Fixture | Fetch | Parse | Index | Initial flatten | Initial render |
| --- | ---: | ---: | ---: | ---: | ---: |
| `nested-1000` | 3.28 | 0.19 | 0.41 | 0.03 | 1.96 |
| `nested-5000` | 13.87 | 8.99 | 6.41 | 1.77 | 5.17 |
| `wide-1000` | 2.25 | 0.17 | 0.33 | 0.05 | 2.21 |
| `wide-5000` | 4.32 | 0.85 | 1.11 | 0.34 | 3.38 |
| `mixed-1000` | 2.57 | 0.19 | 0.29 | 0.03 | 1.68 |
| `mixed-5000` | 4.80 | 1.19 | 5.67 | 0.11 | 2.03 |

## Interaction observations

Settled duration is synchronous work plus one forced layout read, in milliseconds. Dropped is frame gaps above 1.5× the estimated frame. Rows is the maximum rows mutated by one sample. LT and LoAF are Long Task and Long Animation Frame counts at their 50 ms browser thresholds.

### nested-1000

| Scenario | Sync P50 | Settled P50 | P95 | P99 | Max | Dropped | Rows | LT | LoAF |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| keyboard-selection-100 | 0.64 | 0.64 | 1.26 | 1.64 | 1.73 | 0 | 72 | 0 | 0 |
| expand-collapse-shallow | 0.44 | 0.70 | 1.51 | 1.70 | 1.70 | 0 | 32 | 0 | 0 |
| expand-collapse-deep | 0.43 | 0.82 | 1.93 | 2.24 | 2.24 | 0 | 19 | 0 | 0 |
| scroll-jumps | 0.36 | 1.16 | 1.66 | 1.73 | 1.73 | 0 | 72 | 0 | 0 |
| reveal-selected-descendant | 2.15 | 2.16 | 4.02 | 4.37 | 4.37 | 0 | 82 | 0 | 0 |
| visible-row-recompute | 0.02 | 0.02 | 0.04 | 0.04 | 0.04 | 0 | 0 | 0 | 0 |

Trusted keydown handler: P50 0.77, P95 1.08, max 1.66 over 100 events; trace keydown dispatch P50 0.82, P95 1.14, max 1.74.

### nested-5000

| Scenario | Sync P50 | Settled P50 | P95 | P99 | Max | Dropped | Rows | LT | LoAF |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| keyboard-selection-100 | 1.37 | 1.38 | 2.63 | 3.65 | 9.05 | 0 | 72 | 0 | 0 |
| expand-collapse-shallow | 1.15 | 1.77 | 8.52 | 11.88 | 11.88 | 0 | 32 | 0 | 0 |
| expand-collapse-deep | 1.19 | 1.87 | 4.77 | 5.19 | 5.19 | 0 | 19 | 0 | 0 |
| scroll-jumps | 1.27 | 3.92 | 7.13 | 8.08 | 8.08 | 0 | 72 | 0 | 0 |
| reveal-selected-descendant | 3.47 | 3.48 | 11.76 | 12.34 | 12.34 | 0 | 82 | 0 | 0 |
| visible-row-recompute | 0.16 | 0.16 | 0.53 | 0.61 | 0.61 | 0 | 0 | 0 | 0 |

Trusted keydown handler: P50 0.78, P95 1.79, max 2.51 over 100 events; trace keydown dispatch P50 0.81, P95 1.89, max 2.65.

### wide-1000 and wide-5000

| Scenario | Fixture | Settled P50 | P95 | Max | Dropped | Rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| keyboard-selection-100 | wide-1000 | 0.49 | 0.94 | 1.79 | 0 | 72 |
| keyboard-selection-100 | wide-5000 | 0.48 | 1.00 | 1.48 | 0 | 72 |
| scroll-jumps | wide-1000 | 1.06 | 1.54 | 1.58 | 0 | 72 |
| scroll-jumps | wide-5000 | 1.05 | 1.29 | 1.34 | 0 | 72 |
| visible-row-recompute | wide-5000 | 0.07 | 0.30 | 0.36 | 0 | 0 |

Wide fixtures contain no folders, so expansion scenarios do not apply. The 5,000-row single sibling list behaves identically to 1,000 rows. Trusted keydown P95 was 1.14 (wide-1000) and 1.36 (wide-5000).

### mixed-1000 and mixed-5000

| Scenario | Fixture | Settled P50 | P95 | Max | Dropped | Rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| keyboard-selection-100 | mixed-1000 | 0.44 | 0.76 | 1.81 | 0 | 72 |
| keyboard-selection-100 | mixed-5000 | 0.44 | 2.36 | 2.96 | 0 | 72 |
| expand-collapse-shallow | mixed-1000 | 1.18 | 2.61 | 3.29 | 0 | 63 |
| expand-collapse-shallow | mixed-5000 | 1.31 | 1.86 | 1.95 | 0 | 63 |
| expand-collapse-deep | mixed-5000 | 0.97 | 5.05 | 6.04 | 0 | 19 |
| scroll-jumps | mixed-5000 | 0.97 | 4.91 | 6.19 | 0 | 72 |
| reveal-selected-descendant | mixed-5000 | 1.59 | 2.06 | 2.21 | 0 | 72 |
| visible-row-recompute | mixed-5000 | 0.05 | 0.10 | 0.13 | 0 | 0 |

Trusted keydown P95 was 1.26 (mixed-1000) and 1.08 (mixed-5000).

### nested-5000 run-to-run variance

Five fresh-context repeats of the complete nested-5000 run:

| Run | Kbd P95 | Kbd max | Shallow P95 | Reveal P95 | Reveal max | Scroll P95 | Trusted P95 | Trace P95 | Dropped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.63 | 9.05 | 8.52 | 11.76 | 12.34 | 7.13 | 1.79 | 1.89 | 0 |
| 2 | 1.69 | 1.91 | 2.39 | 12.29 | 12.32 | 1.37 | 1.08 | 1.12 | 0 |
| 3 | 1.06 | 1.79 | 1.79 | 4.07 | 5.44 | 1.59 | 1.17 | 1.20 | 0 |
| 4 | 1.59 | 7.37 | 1.99 | 2.61 | 3.13 | 5.63 | 1.12 | 1.17 | 0 |
| 5 | 3.07 | 7.84 | 2.42 | 11.42 | 11.48 | 6.46 | 2.16 | 2.29 | 0 |

## Correctness assertions

All eleven in-page checks plus both gallery checks passed in every run of every fixture, with zero console errors and zero page exceptions:

- projection-contract: node, folder, document counts, maximum depth, parent existence, folder-typed parents, parent-before-child order, unique IDs, and digest shape match the embedded fixture metadata.
- flatten-matches-reference: the iterative flattener equals a recursive reference flattener across all-expanded, all-collapsed, every-other-folder, and first-folder-only expansion states.
- collapsed-descendants-never-render: collapsing removes every descendant from both the visible list and the DOM.
- expansion-order-deterministic: re-expansion reproduces identical visible rows in sibling order.
- selection-survives-viewport-movement: a selected row unmounts when scrolled away, remains selected, and remounts with `aria-selected="true"`.
- deep-parent-navigation: the deepest note reports `aria-level` 33 equal to fixture max depth, and repeated Arrow Left reaches a root node.
- keyboard-never-selects-unavailable: collapsing an ancestor of the selection reassigns selection to the collapsed ancestor, and the next Arrow move stays on a visible row; the gallery additionally proves disabled rows are skipped.
- rendered-rows-bounded: rendered and peak row counts stay at or below the 40-row cap at 5,000 nodes.
- selection-only-mutation-bounded: a selection-only change mutates exactly two rendered rows.
- host-mounts-one and no-hydration-during-measurement: one host mount; zero fixture fetch, parse, or index calls inside measured interactions.

Dense states at top, middle, and bottom of nested-5000 plus the selected, focused, disabled, expanded, collapsed, empty, error, and reduced-motion gallery states were screenshot-inspected in the production build.

## Budget result

Compared provisionally against the tree create/move/reorder-class targets (P95 below 8 ms, maximum below 16.67 ms) using settled durations:

- Keyboard selection, deep expand/collapse, scroll jumps, wide and mixed scenarios, and trusted keydown handling pass with wide margin in every run (worst P95 7.13 ms, worst single sample 9.05 ms).
- Shallow expansion of the folder that owns the entire nested-5000 subtree straddles the boundary: expansion samples run 7.2–11.9 ms while collapses stay near 1.7 ms, giving P95 values of 1.79–8.52 ms across five runs.
- Reveal-selected-descendant at nested-5000 has a 2–4 ms typical cost but sporadic 8–12 ms samples pushed P95 above 8 ms in three of five runs; the maximum stayed below the 16.67 ms frame ceiling in every sample of every run.
- Zero dropped frames, zero Long Tasks, and zero Long Animation Frames were observed anywhere, including during trusted-input capture.

The bounded virtualized tree is therefore a viable candidate for ADR-0020 at both scales, with full-subtree expansion and deep reveal at 5,000 notes as the only interactions near the provisional gate.

## Limitations

- One development machine and headless Chromium; no fixed reference runner, so no universal guarantee is claimed.
- Frame gaps use animation-frame callbacks, which run before paint; they do not prove presentation timing.
- Long Tasks and Long Animation Frames only surface work at or above 50 ms, so their zero counts cannot prove the 8 ms main-thread ceiling.
- PerformanceEventTiming censors durations below its 16 ms minimum threshold; the ~20 entries per run at exactly 16–24 ms reflect vsync alignment of the following paint, not handler cost. Uncensored per-key evidence comes from trace `EventDispatch` durations (P95 ≤ 2.29 ms), which cover dispatch, not input-to-presentation.
- The 8–12 ms reveal and shallow-expansion outliers coincide with full-window row replacement after large flatten changes and possibly garbage collection from the per-sample reset; they were not attributed further.
- Row labels at depth 33 exhaust a 340 px pane through indentation alone; the product tree needs an indentation clamp or horizontal strategy at extreme depth.
- Synthetic `handleKey` scenarios measure handler work, not native input latency. Trusted CDP keys cover ArrowDown only.
- No memory ceiling was recorded for this spike; retained state is one row pool plus the hydrated tree index.

## Raw samples

Settled durations in milliseconds, in sample order, from the recorded representative run of each fixture. Trusted-handler samples and censored Event Timing durations follow each fixture. Complete per-sample JSON (including sync, layout, next-frame, frame-gap, and mutated-row fields) is regenerated by the commands above.

### nested-1000

- keyboard-selection-100: 0.51, 0.68, 0.82, 0.47, 0.46, 0.49, 0.82, 0.63, 0.48, 0.46, 0.48, 0.51, 0.61, 0.46, 0.49, 0.50, 0.68, 1.03, 0.50, 0.61, 0.59, 0.82, 1.07, 0.86, 0.73, 0.77, 0.77, 1.19, 1.27, 0.70, 0.68, 0.72, 0.87, 1.07, 0.69, 0.87, 1.63, 0.84, 1.09, 0.93, 0.45, 1.06, 1.11, 0.68, 0.48, 0.60, 0.67, 1.16, 0.54, 0.53, 0.54, 1.26, 0.64, 0.87, 0.57, 0.50, 0.52, 0.73, 0.97, 0.51, 1.41, 0.66, 0.84, 0.63, 0.41, 1.16, 0.42, 0.46, 0.81, 0.42, 0.43, 0.41, 1.06, 0.64, 0.42, 0.45, 0.39, 0.69, 0.95, 0.40, 0.39, 1.73, 0.96, 0.73, 0.44, 0.46, 0.44, 0.47, 0.94, 0.50, 0.64, 0.69, 0.66, 0.74, 0.46, 1.64, 0.59, 0.60, 0.90, 0.48
- expand-collapse-shallow: 1.47, 0.45, 1.33, 0.45, 1.37, 0.65, 1.42, 0.68, 1.39, 0.47, 1.70, 0.47, 1.42, 0.46, 1.43, 0.58, 1.43, 0.48, 1.36, 0.47, 1.51, 0.70, 1.42, 0.50, 1.43, 0.43, 1.55, 0.48, 1.39, 0.45, 1.49, 0.44, 1.41, 0.45, 1.39, 0.59, 1.31, 0.44, 1.22, 0.46
- expand-collapse-deep: 0.74, 0.71, 1.58, 0.82, 0.76, 0.74, 1.19, 2.24, 0.89, 0.80, 0.92, 1.93, 0.96, 0.75, 0.72, 0.71, 1.34, 1.61, 1.79, 1.13, 0.82, 0.79, 1.95, 1.08, 0.75, 0.73, 1.67, 0.71, 1.04, 0.73, 0.75, 0.73, 1.28, 1.20, 0.74, 0.70, 0.70, 1.63, 1.28, 0.69
- scroll-jumps: 0.03, 1.41, 1.63, 1.62, 1.23, 0.04, 1.23, 1.14, 1.15, 1.47, 0.04, 1.16, 1.02, 1.73, 1.21, 0.04, 1.13, 0.84, 1.15, 1.35, 0.05, 1.16, 0.88, 1.18, 1.29, 0.05, 1.42, 1.03, 1.66, 1.43
- reveal-selected-descendant: 1.82, 2.06, 3.47, 1.86, 4.37, 1.87, 2.07, 4.02, 2.20, 1.86, 2.16, 2.25, 3.58, 2.27, 1.99, 2.44, 2.28, 2.09, 2.19, 2.03
- visible-row-recompute: 0.03, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.02, 0.02, 0.02, 0.01, 0.01, 0.04, 0.01, 0.02, 0.03, 0.03, 0.03, 0.02, 0.03, 0.02, 0.03, 0.03, 0.02, 0.03, 0.02, 0.02, 0.02, 0.01, 0.02, 0.02, 0.02, 0.03, 0.02, 0.02, 0.02, 0.03, 0.04, 0.02, 0.03, 0.02, 0.02, 0.04, 0.02, 0.03, 0.02, 0.03, 0.02
- trusted-keydown-handler: 0.85, 0.53, 0.88, 0.52, 0.55, 0.52, 0.59, 0.49, 0.56, 0.96, 0.59, 0.51, 0.51, 0.55, 0.77, 0.53, 0.50, 0.56, 0.57, 0.55, 0.51, 0.57, 0.77, 0.89, 0.76, 0.83, 0.92, 0.75, 0.79, 0.75, 0.88, 0.90, 0.72, 0.83, 0.73, 0.93, 0.98, 0.74, 0.74, 0.70, 0.81, 0.83, 0.72, 0.72, 0.80, 0.74, 0.86, 0.72, 0.92, 0.72, 0.71, 0.90, 0.75, 0.98, 0.90, 0.72, 0.71, 0.77, 0.73, 0.71, 0.73, 0.77, 0.84, 0.75, 0.77, 1.66, 0.88, 1.13, 0.73, 0.83, 0.84, 1.03, 0.83, 0.79, 1.06, 1.09, 0.85, 0.88, 1.00, 0.83, 0.72, 1.08, 0.79, 0.77, 1.05, 0.87, 1.06, 0.84, 0.74, 1.27, 1.07, 1.06, 1.13, 0.82, 0.83, 1.05, 0.73, 1.06, 1.05, 0.74
- event-timing durations (censored below 16): 16 ×22

### nested-5000

- keyboard-selection-100: 0.54, 1.64, 1.70, 0.52, 0.51, 1.29, 1.65, 1.74, 1.64, 1.80, 1.98, 1.66, 1.71, 1.64, 1.66, 0.71, 0.44, 0.43, 0.41, 1.69, 1.69, 3.65, 0.70, 0.71, 2.75, 0.76, 1.68, 2.59, 2.60, 2.74, 2.85, 2.59, 2.63, 1.44, 1.46, 1.39, 0.65, 1.06, 0.64, 0.74, 0.88, 1.45, 1.58, 1.54, 1.64, 1.66, 1.57, 1.49, 0.42, 0.45, 0.54, 0.75, 1.13, 0.47, 0.46, 1.81, 1.76, 1.75, 1.69, 1.78, 1.58, 0.37, 0.37, 0.35, 0.55, 1.43, 0.78, 0.37, 0.38, 0.41, 0.43, 0.79, 1.46, 0.82, 0.38, 0.46, 0.37, 1.37, 1.42, 1.38, 1.37, 9.05, 0.40, 0.44, 0.40, 0.63, 0.45, 0.69, 1.60, 1.59, 1.76, 2.15, 1.66, 2.21, 1.63, 1.61, 0.91, 0.50, 0.45, 0.42
- expand-collapse-shallow: 4.13, 1.62, 7.88, 1.79, 11.88, 0.54, 1.64, 0.47, 3.30, 1.64, 8.40, 1.73, 8.05, 1.69, 7.81, 1.82, 7.60, 1.07, 7.45, 1.69, 8.90, 1.66, 7.50, 1.65, 7.49, 1.65, 1.60, 0.42, 1.49, 0.57, 7.23, 1.77, 8.52, 2.02, 8.46, 0.97, 4.41, 0.49, 2.03, 0.48
- expand-collapse-deep: 2.37, 3.63, 3.93, 3.75, 3.97, 4.99, 3.86, 3.62, 3.69, 3.98, 1.62, 1.07, 0.90, 1.37, 4.45, 3.35, 0.93, 0.93, 0.95, 0.96, 1.01, 1.00, 1.98, 0.92, 1.01, 0.98, 0.96, 0.93, 0.93, 1.29, 3.53, 0.96, 4.43, 4.43, 2.92, 1.87, 4.77, 4.38, 5.19, 0.96
- scroll-jumps: 0.04, 2.11, 5.44, 5.68, 8.08, 0.04, 1.25, 1.30, 3.47, 6.73, 0.16, 5.28, 3.83, 5.11, 5.89, 0.10, 5.46, 5.24, 5.34, 7.13, 0.10, 6.18, 2.87, 3.88, 1.29, 0.04, 5.19, 3.92, 5.21, 5.80
- reveal-selected-descendant: 3.75, 1.93, 9.73, 10.01, 4.18, 2.10, 2.31, 2.16, 2.37, 2.16, 2.21, 11.76, 12.34, 4.54, 3.48, 2.88, 2.69, 5.84, 8.24, 8.31
- visible-row-recompute: 0.29, 0.31, 0.21, 0.18, 0.29, 0.21, 0.19, 0.21, 0.05, 0.06, 0.07, 0.06, 0.06, 0.05, 0.07, 0.05, 0.06, 0.07, 0.07, 0.11, 0.33, 0.27, 0.26, 0.41, 0.27, 0.49, 0.07, 0.08, 0.13, 0.27, 0.08, 0.06, 0.07, 0.10, 0.28, 0.32, 0.28, 0.13, 0.06, 0.11, 0.27, 0.36, 0.31, 0.53, 0.19, 0.11, 0.16, 0.61, 0.10, 0.56
- trusted-keydown-handler: 0.79, 0.52, 0.69, 1.79, 1.96, 2.51, 1.60, 0.48, 0.49, 0.57, 0.92, 1.83, 0.51, 0.51, 0.60, 0.97, 1.75, 1.80, 1.71, 1.84, 0.48, 0.61, 1.11, 0.85, 0.81, 0.79, 1.13, 1.17, 0.86, 0.78, 0.76, 0.85, 0.90, 0.72, 0.70, 0.71, 0.72, 1.23, 1.26, 1.19, 1.12, 0.83, 1.15, 1.08, 0.86, 0.77, 0.81, 0.76, 0.74, 0.73, 0.73, 0.80, 0.73, 0.71, 0.75, 0.81, 0.83, 0.90, 0.76, 0.95, 1.61, 1.51, 0.78, 0.78, 0.79, 0.74, 0.73, 0.75, 0.71, 0.72, 0.77, 0.74, 0.85, 0.85, 0.74, 0.79, 0.75, 0.92, 0.77, 0.90, 1.07, 1.01, 0.73, 0.76, 0.72, 0.88, 0.87, 1.01, 0.75, 0.72, 0.73, 0.71, 0.75, 0.72, 0.74, 0.75, 0.74, 0.73, 0.73, 0.77
- event-timing durations (censored below 16): 16 ×18, 24 ×1

### wide-1000

- keyboard-selection-100: 0.50, 0.55, 0.47, 0.44, 0.49, 0.63, 0.45, 0.53, 0.42, 0.54, 0.53, 0.40, 0.41, 0.41, 0.43, 0.55, 0.41, 0.42, 0.45, 0.48, 0.63, 0.68, 0.64, 0.63, 0.73, 0.97, 0.62, 0.61, 0.63, 0.70, 0.94, 0.74, 0.65, 0.64, 0.65, 0.88, 0.68, 0.73, 0.68, 0.67, 0.72, 0.40, 0.42, 0.43, 0.44, 0.58, 0.61, 0.46, 1.46, 0.45, 0.57, 0.44, 0.43, 0.51, 1.04, 0.62, 0.50, 0.69, 0.70, 0.52, 1.79, 0.64, 0.46, 0.43, 0.47, 0.83, 0.43, 0.44, 0.42, 0.49, 0.65, 0.45, 0.46, 0.46, 0.42, 0.55, 0.40, 0.40, 0.48, 0.43, 0.61, 1.38, 0.46, 0.41, 0.40, 0.72, 0.39, 0.39, 0.43, 0.40, 0.53, 0.49, 0.46, 0.43, 0.42, 0.45, 0.43, 0.41, 0.43, 0.40
- scroll-jumps: 0.04, 1.28, 1.04, 1.15, 1.01, 0.04, 1.12, 1.08, 1.45, 1.02, 0.04, 1.58, 1.38, 1.24, 1.39, 0.03, 1.13, 1.02, 1.26, 0.98, 0.04, 1.13, 1.00, 1.20, 0.98, 0.03, 1.13, 1.00, 1.54, 1.06
- visible-row-recompute: 0.02, 0.01, 0.02, 0.01, 0.02, 0.02, 0.01, 0.02, 0.02, 0.02, 0.01, 0.02, 0.02, 0.02, 0.03, 0.03, 0.02, 0.01, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.04, 0.02, 0.02, 0.02, 0.01, 0.02, 0.02, 0.02, 0.02, 0.01, 0.02, 0.01, 0.01, 0.02, 0.02, 0.02, 0.02, 0.01, 0.03, 0.02, 0.01, 0.02, 0.02
- trusted-keydown-handler: 0.50, 0.49, 0.47, 0.56, 0.51, 0.50, 0.49, 0.48, 0.51, 0.46, 0.49, 0.49, 0.47, 0.67, 0.48, 0.46, 0.50, 0.59, 0.46, 0.48, 0.68, 1.21, 0.71, 0.76, 0.72, 0.81, 0.72, 0.82, 0.76, 0.79, 1.42, 0.84, 0.80, 0.88, 0.79, 1.14, 1.02, 0.97, 0.78, 0.84, 2.29, 0.85, 0.90, 0.91, 0.92, 0.87, 0.77, 0.85, 0.86, 1.01, 0.84, 0.88, 0.79, 0.75, 1.00, 0.79, 0.76, 0.77, 0.81, 0.86, 0.73, 0.83, 0.76, 0.92, 0.75, 0.75, 0.79, 1.27, 0.72, 0.78, 0.79, 0.76, 0.99, 0.88, 0.79, 0.77, 0.74, 0.93, 0.88, 0.79, 1.01, 1.29, 0.76, 0.78, 0.79, 0.92, 1.07, 0.87, 0.77, 0.81, 0.88, 0.78, 0.75, 0.75, 0.92, 0.80, 0.76, 0.84, 0.86, 0.89
- event-timing durations (censored below 16): 16 ×21

### wide-5000

- keyboard-selection-100: 0.49, 0.74, 0.44, 0.39, 0.56, 0.39, 0.59, 0.43, 0.42, 0.42, 0.43, 0.45, 0.42, 0.43, 0.41, 0.41, 0.71, 0.40, 0.39, 0.42, 0.48, 0.67, 1.37, 0.65, 0.69, 0.65, 0.89, 0.84, 0.72, 0.66, 0.66, 0.72, 0.76, 0.66, 0.68, 0.68, 0.95, 0.85, 0.75, 0.68, 0.50, 0.48, 0.45, 0.44, 0.42, 0.45, 0.61, 0.58, 0.46, 0.45, 0.63, 0.60, 0.53, 0.59, 0.64, 0.44, 0.65, 0.54, 0.52, 0.46, 1.44, 0.48, 0.85, 0.46, 0.45, 0.41, 0.64, 0.90, 0.54, 0.46, 0.44, 0.40, 0.60, 0.38, 0.40, 0.47, 0.46, 1.00, 0.39, 0.46, 0.41, 1.48, 0.83, 0.46, 0.53, 0.62, 0.46, 0.97, 0.57, 0.46, 0.45, 0.48, 1.17, 0.46, 0.41, 0.41, 0.43, 1.12, 0.41, 0.41
- scroll-jumps: 0.05, 1.34, 0.96, 1.12, 1.05, 0.04, 1.14, 0.96, 1.13, 1.10, 0.03, 1.10, 0.94, 1.10, 1.05, 0.04, 1.12, 0.96, 1.09, 1.04, 0.04, 1.10, 0.94, 1.09, 1.07, 0.04, 1.08, 0.97, 1.10, 1.29
- visible-row-recompute: 0.10, 0.34, 0.11, 0.10, 0.11, 0.12, 0.30, 0.12, 0.12, 0.06, 0.06, 0.10, 0.06, 0.06, 0.06, 0.07, 0.20, 0.06, 0.06, 0.07, 0.09, 0.16, 0.06, 0.06, 0.05, 0.07, 0.36, 0.09, 0.13, 0.06, 0.07, 0.08, 0.06, 0.08, 0.05, 0.09, 0.17, 0.06, 0.06, 0.07, 0.06, 0.12, 0.06, 0.07, 0.06, 0.06, 0.24, 0.06, 0.08, 0.06
- trusted-keydown-handler: 0.54, 0.49, 0.48, 0.45, 0.52, 0.68, 0.62, 0.46, 0.62, 0.50, 0.62, 0.47, 0.48, 0.48, 0.46, 0.64, 0.46, 0.45, 0.49, 0.58, 0.46, 0.60, 0.87, 0.69, 0.71, 0.71, 1.00, 0.71, 1.17, 0.74, 0.72, 1.17, 0.73, 0.73, 0.77, 0.78, 0.89, 1.07, 0.76, 0.77, 0.97, 0.78, 0.92, 0.90, 0.75, 0.85, 0.75, 0.76, 0.81, 0.98, 0.85, 0.93, 0.80, 0.88, 1.04, 0.82, 1.55, 1.72, 1.14, 0.77, 0.83, 0.74, 1.07, 1.09, 0.91, 0.81, 0.96, 0.96, 1.07, 1.12, 0.88, 0.76, 1.11, 1.46, 1.36, 0.94, 1.92, 1.96, 1.29, 1.21, 0.83, 1.29, 0.76, 1.11, 0.77, 1.12, 1.04, 0.88, 0.86, 0.70, 0.82, 1.12, 0.73, 0.78, 0.74, 0.90, 0.96, 0.97, 0.71, 0.70
- event-timing durations (censored below 16): 16 ×22

### mixed-1000

- keyboard-selection-100: 0.42, 0.47, 0.43, 0.39, 0.39, 0.44, 0.46, 0.37, 0.39, 0.38, 0.60, 0.49, 0.41, 0.43, 0.40, 0.40, 0.46, 0.41, 0.43, 0.41, 0.51, 0.71, 0.63, 0.71, 0.64, 0.68, 0.76, 0.66, 0.69, 0.68, 0.88, 0.89, 0.66, 0.66, 0.67, 0.67, 0.81, 0.65, 0.66, 0.63, 0.42, 0.52, 0.45, 0.42, 0.44, 0.42, 0.52, 0.44, 0.48, 0.42, 0.43, 0.55, 0.41, 0.42, 0.44, 0.42, 0.50, 0.44, 0.43, 0.43, 1.38, 0.62, 0.42, 0.39, 0.42, 0.45, 0.68, 0.43, 0.46, 0.42, 0.51, 0.73, 0.42, 0.43, 0.45, 0.61, 0.49, 0.57, 0.42, 0.40, 0.68, 1.81, 0.51, 0.42, 0.42, 0.43, 0.48, 0.43, 0.40, 0.40, 0.40, 0.51, 0.44, 0.41, 0.40, 0.44, 0.48, 0.47, 0.40, 0.40
- expand-collapse-shallow: 1.12, 1.13, 1.18, 1.29, 1.45, 1.14, 1.13, 1.29, 2.53, 1.67, 1.10, 1.09, 1.41, 1.18, 1.33, 1.11, 1.12, 1.38, 3.29, 1.57, 1.13, 1.15, 1.13, 1.42, 1.33, 2.11, 1.11, 2.61, 1.28, 1.57, 1.10, 1.10, 2.69, 1.15, 1.56, 1.10, 1.16, 1.18, 1.14, 1.56
- expand-collapse-deep: 1.06, 0.79, 0.66, 0.65, 0.66, 0.70, 0.74, 0.70, 0.67, 0.64, 0.70, 0.72, 0.73, 0.69, 0.70, 0.79, 0.79, 0.68, 0.67, 0.65, 0.70, 0.72, 0.65, 0.74, 0.70, 0.70, 0.78, 0.67, 0.66, 0.66, 0.69, 0.85, 0.66, 0.70, 0.69, 0.69, 0.74, 0.69, 0.78, 0.68
- scroll-jumps: 0.05, 1.27, 1.28, 1.71, 2.17, 0.04, 4.89, 1.04, 2.83, 5.42, 0.03, 1.04, 1.85, 1.13, 1.10, 0.03, 1.12, 0.85, 1.76, 1.00, 0.05, 1.82, 1.09, 6.16, 6.55, 0.04, 1.02, 0.92, 1.29, 1.02
- reveal-selected-descendant: 1.51, 1.34, 1.63, 1.30, 2.11, 1.54, 1.52, 1.32, 1.35, 1.43, 1.64, 1.71, 1.41, 1.29, 1.48, 1.66, 1.50, 1.33, 1.28, 1.36
- visible-row-recompute: 0.02, 0.02, 0.05, 0.02, 0.01, 0.06, 0.02, 0.06, 0.02, 0.04, 0.02, 0.01, 0.04, 0.01, 0.02, 0.01, 0.01, 0.03, 0.02, 0.02, 0.01, 0.06, 0.02, 0.10, 0.02, 0.01, 0.01, 0.02, 0.01, 0.02, 0.09, 0.02, 0.11, 0.09, 0.02, 0.02, 0.02, 0.03, 0.02, 0.01, 0.02, 0.01, 0.04, 0.02, 0.02, 0.02, 0.01, 0.02, 0.02, 0.01
- trusted-keydown-handler: 0.61, 0.49, 0.50, 0.48, 0.59, 0.51, 0.55, 0.46, 0.46, 0.48, 0.46, 0.67, 0.50, 0.44, 0.66, 0.51, 0.46, 0.46, 0.55, 0.48, 0.45, 0.54, 0.73, 0.77, 0.96, 0.71, 0.76, 0.84, 0.73, 0.90, 0.96, 0.74, 0.87, 1.06, 1.28, 0.75, 0.72, 0.85, 0.73, 0.77, 0.74, 0.74, 0.79, 2.09, 0.72, 0.74, 0.71, 0.71, 0.75, 0.83, 0.71, 0.72, 0.86, 1.20, 0.78, 0.71, 0.72, 0.70, 0.73, 3.62, 3.16, 0.80, 0.73, 0.91, 0.79, 0.75, 0.80, 1.45, 0.70, 0.77, 0.88, 0.92, 0.97, 0.96, 0.94, 1.05, 0.84, 0.72, 1.07, 0.99, 0.72, 0.79, 0.70, 0.73, 0.76, 0.78, 1.26, 0.97, 0.72, 0.71, 0.79, 0.96, 0.87, 0.73, 0.82, 0.85, 0.74, 0.82, 0.76, 0.88
- event-timing durations (censored below 16): 16 ×18, 24 ×2

### mixed-5000

- keyboard-selection-100: 0.39, 0.39, 0.56, 0.41, 0.38, 0.38, 0.58, 0.43, 0.38, 0.88, 0.41, 0.38, 1.59, 1.60, 1.45, 0.40, 0.46, 0.63, 1.49, 1.43, 2.05, 2.96, 2.61, 0.64, 0.68, 0.58, 0.65, 1.37, 0.65, 0.66, 0.68, 0.64, 0.76, 0.65, 2.68, 0.61, 0.66, 2.63, 2.83, 2.36, 0.40, 0.41, 1.02, 0.39, 0.42, 0.43, 0.47, 1.04, 0.41, 0.44, 0.42, 0.41, 0.45, 0.39, 0.41, 0.41, 0.40, 0.87, 0.44, 0.43, 1.43, 0.40, 0.86, 0.40, 0.38, 0.41, 0.41, 0.68, 0.37, 0.43, 0.42, 0.43, 1.12, 0.40, 0.44, 0.43, 0.38, 0.74, 0.41, 0.38, 0.38, 1.37, 0.41, 0.43, 0.39, 0.37, 0.48, 0.75, 0.39, 0.49, 0.37, 0.38, 0.68, 0.35, 0.47, 0.95, 1.79, 0.58, 0.44, 2.12
- expand-collapse-shallow: 1.33, 1.95, 1.42, 1.25, 1.24, 1.23, 1.28, 1.21, 1.23, 1.32, 1.31, 1.27, 1.24, 1.26, 1.37, 1.32, 1.29, 1.35, 1.41, 1.31, 1.46, 1.27, 1.39, 1.23, 1.62, 1.45, 1.24, 1.36, 1.28, 1.38, 1.66, 1.35, 1.22, 1.29, 1.54, 1.85, 1.86, 1.23, 1.28, 1.89
- expand-collapse-deep: 1.05, 0.95, 5.09, 1.63, 0.88, 0.88, 1.04, 5.05, 0.89, 0.86, 0.87, 1.31, 0.91, 0.97, 0.88, 0.86, 0.93, 1.68, 0.89, 4.25, 4.29, 3.98, 1.62, 0.85, 1.08, 0.87, 0.85, 0.90, 1.45, 0.87, 4.15, 3.87, 6.04, 0.86, 0.88, 1.33, 3.96, 4.11, 4.11, 0.88
- scroll-jumps: 0.04, 1.21, 6.19, 4.91, 4.28, 0.03, 0.97, 1.30, 1.02, 0.96, 0.03, 0.94, 0.84, 1.01, 0.91, 0.03, 0.98, 0.88, 0.96, 0.92, 0.04, 1.21, 1.09, 1.10, 1.27, 0.03, 0.97, 1.69, 0.98, 0.91
- reveal-selected-descendant: 1.51, 1.53, 1.77, 1.54, 1.54, 1.59, 2.05, 1.83, 1.54, 1.57, 1.53, 1.61, 1.76, 1.55, 1.66, 2.06, 1.77, 2.21, 1.56, 1.88
- visible-row-recompute: 0.05, 0.06, 0.05, 0.05, 0.05, 0.05, 0.06, 0.08, 0.06, 0.06, 0.05, 0.05, 0.05, 0.06, 0.13, 0.05, 0.05, 0.05, 0.05, 0.07, 0.05, 0.05, 0.05, 0.06, 0.07, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.06, 0.05, 0.05, 0.09, 0.05, 0.05, 0.06, 0.10, 0.06, 0.06, 0.07, 0.08, 0.06, 0.07, 0.11, 0.06
- trusted-keydown-handler: 0.56, 0.52, 0.56, 0.63, 0.47, 0.49, 0.56, 0.60, 0.70, 0.78, 0.73, 0.57, 0.83, 0.71, 0.74, 0.78, 0.63, 0.50, 1.54, 0.49, 0.45, 0.60, 0.85, 1.07, 1.05, 1.12, 0.73, 0.75, 0.79, 0.74, 0.80, 0.79, 0.78, 0.71, 0.76, 0.79, 0.79, 0.82, 0.71, 0.72, 0.71, 0.72, 0.92, 0.72, 0.71, 0.71, 0.71, 0.75, 2.85, 3.05, 0.70, 0.77, 0.76, 0.97, 0.73, 0.71, 0.71, 0.75, 0.71, 0.73, 1.08, 0.79, 0.75, 0.82, 0.82, 0.89, 0.76, 1.04, 0.90, 0.81, 0.85, 0.88, 1.08, 0.71, 0.87, 0.83, 0.76, 0.78, 0.86, 0.88, 0.88, 0.90, 0.84, 1.05, 0.81, 0.77, 0.77, 1.03, 0.96, 0.95, 0.98, 0.85, 0.80, 0.84, 1.83, 0.97, 0.77, 0.99, 0.81, 0.96
- event-timing durations (censored below 16): 16 ×20, 24 ×1
