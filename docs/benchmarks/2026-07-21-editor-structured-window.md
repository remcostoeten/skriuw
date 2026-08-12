# Structured bounded editor observations

Date: 2026-07-21

## Purpose

This follow-up closes two correctness gaps in the selected ProseMirror candidate: lossless top-level structure while windows are recycled and undo/redo after the changed block has left the mounted DOM.

## Structured projection

Canonical bounded blocks now retain complete ProseMirror node JSON in addition to the text used by the older comparison harness. The representative 2,000-block corpus includes marked paragraphs, bullet lists, ordered lists with a non-default start, code blocks, horizontal rules, headings, blockquotes, and paragraphs.

Projection reads deep-clone nested nodes, marks, attributes, and content. Window installation reconstructs the editor document directly from canonical node JSON. Editor transactions convert every mounted top-level node back to schema-validated JSON before replacing the canonical window. External text reconciliation preserves the existing block structure and the first marked text leaf used by the current fixture.

Nine Node regressions pass. They cover the existing window invariants, deep-clone isolation, exact structured replacement, every representative node and mark, Markdown serialization, product plugin state, and exact product-corpus JSON reconstruction.

## Canonical history

Each note owns application-level undo and redo stacks outside the mounted ProseMirror state. A document transaction removes equal prefixes and suffixes and retains only the changed top-level range. The product keymap routes undo and redo to this canonical boundary.

Undo and redo replace canonical ranges, move the bounded window back to the affected range, rebuild the mounted state, and restore projected focus and selection. A new edit clears redo. In the browser workload, 31 prior single-block edits retained 31 before-blocks; the tested edit raised both values to 32 rather than retaining 32 complete 192-block windows.

This is a correctness baseline, not the final history policy. Compound transaction grouping, a retention limit, structural multi-block editing fixtures, and measured long-session memory remain open.

## Production-browser observation

The final fresh-profile Chrome 149 production run used eight 2,000-block notes with a 192-block mounted window.

| Measure | Observation |
| --- | ---: |
| Host mounts | 1 |
| Editor instances | 1 |
| Active DOM elements | 225 |
| Rendered / canonical blocks | 192 / 2,000 |
| Cached switching P95 / maximum | 3.845 / 4.950 ms |
| Typing P95 / maximum | 1.160 / 1.585 ms |
| Observed dropped frames | 0 |

The correctness scenario verified exact rich-node equality after a window move, canonical reconciliation, note switching, compact history growth, window recycling before undo, exact undo, a second recycling before redo, exact redo, a second undo, slash-query state and undo, focus and selection restoration, scroll anchoring, and composition movement refusal. Console and page error collections were empty.

One earlier development run of the structured candidate observed a 16.775 ms switching maximum despite a 4.465 ms P95 and zero dropped-frame diagnostics. Raw exploratory samples are not committed, and the forced-layout boundary does not include final presentation. The fixed-runner gate therefore remains open.

## Remaining boundary

The selected editor candidate now has representative structure and cross-window history behavior. Product UI scaffolding remains blocked on:

- canonical whole-note copy, select-all, and find behavior;
- completing deferred window movement after IME composition ends;
- an accessible whole-document navigation or representation path;
- bounded and grouped long-session history;
- fixed-runner presentation traces and reference-hardware confirmation.

## Verification

```bash
cd spikes/ui-architecture
bun run test
bun run typecheck
bun run build
bun run test:browser
```

Repository-wide verification passes with `./scripts/check.sh`.
