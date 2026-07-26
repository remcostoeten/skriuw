# Representative editor contract observations

Date: 2026-07-21

## Purpose

This slice tests whether the bounded ProseMirror candidate still satisfies its correctness and interaction budgets after loading representative product structure and behavior. It also records the application-owned semantics required when only a window of a large note is mounted.

## Representative contract

The candidate schema supports headings, paragraphs, bullet and ordered lists, list items, blockquotes, fenced code blocks, horizontal rules, links, strong emphasis, emphasis, and inline code. Its plugin set includes history, base editing commands, list splitting and indentation, smart punctuation, blockquote and fenced-code input rules, and slash-command query tracking.

Node regressions construct a document containing every selected block and mark and verify its Markdown serialization. A second regression verifies slash-query state and history depth after a document change. The production browser regression loads the same plugin set into the live bounded controller.

This is the representative schema for editor selection. It is not yet the durable document contract. The current bounded corpus projects top-level heading, paragraph, and quote text only, so rich marks, lists, code blocks, and horizontal rules must be preserved by a structured canonical window before product implementation can claim lossless editing.

## Production-browser observation

One fresh headless Chrome 149 production run used a deterministic 2,000-block note and a 192-block mounted window.

| Measure | Observation |
| --- | ---: |
| Host mounts | 1 |
| Editor instances | 1 |
| Active DOM elements | 203 |
| Rendered / canonical blocks | 192 / 2,000 |
| Cached switching P95 / maximum | 4.185 / 6.930 ms |
| Typing P95 / maximum | 0.845 / 1.305 ms |
| Observed dropped frames | 0 |

The scenario also verified exact DOM focus and selection restoration after a live window move, scroll anchoring, editor-to-canonical and external-to-editor reconciliation, state restoration after switching notes, one-level undo after switching away and back, slash-menu query detection and undo, and refusal to recycle a window during composition.

These measurements are exploratory development-machine observations. They are not fixed-runner performance evidence, and the forced-layout timing boundary does not include final presentation.

## Cross-window product policy

Bounded rendering makes whole-document browser semantics application responsibilities:

- Whole-note select-all and copy must serialize the canonical structured document. Native drag selection and native copy cover only the mounted window.
- In-note find must search the canonical document, move the mounted window to the result, and restore the matching selection. Native browser find is incomplete and cannot be presented as whole-note search.
- A composing text block pins the mounted window. Movement waits for `compositionend`, canonical reconciliation, and selection capture.
- ProseMirror history is sufficient while a note remains in one mounted window. Window replacement must use a canonical structured transaction history; silently clearing undo at a window boundary is not acceptable.
- The editor must expose canonical position and navigation semantics to assistive technology. A bounded DOM alone is not a complete screen-reader representation of the note, so an accessible whole-document path or equivalent virtual navigation remains required.

The first three policies can reuse the canonical document and selection projection. A follow-up now provides structured canonical undo and redo across recycled windows; complete assistive-technology traversal still needs an implementation and browser regression. See `docs/benchmarks/2026-07-21-editor-structured-window.md`.

## Candidate decision

ProseMirror is the selected editor candidate for the remaining architecture work. Lexical is explicitly rejected for this product contract:

- The bounded 2,000-block repeated-run median P95 was 3.64 ms for ProseMirror and 5.08 ms for Lexical.
- The representative bounded run used 203 DOM elements and a 2.38 MiB memory delta for ProseMirror versus 385 elements and 2.90 MiB for Lexical.
- The retained 500-block median P95 was 4.93 ms for ProseMirror versus 8.53 ms for Lexical, with lower retained memory and roughly half the DOM.
- ProseMirror now passes the live movement, selection, reconciliation, history, slash-menu, and composition-guard scenario. Implementing a second live controller would not close a remaining product requirement or compensate for a measured ProseMirror failure.

This selects the editor candidate, not the complete UI architecture. The structured-window follow-up closes the first lossless projection and cross-window history baseline. ADR-0020 and product UI scaffolding remain blocked on whole-note browser semantics, complete IME and accessible behavior, bounded history policy, and fixed-runner presentation evidence.

## Verification

```bash
cd spikes/ui-architecture
bun run test
bun run typecheck
bun run build
bun run test:browser
```

The repository-wide verification remains `./scripts/check.sh`.
