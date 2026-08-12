# Bounded editor projection observations

Date: 2026-07-21

## Purpose

This experiment asks whether limiting the editor-owned document to 192 rendered blocks removes the large-note switching cost without retaining eight complete editor views. It is a feasibility projection for note switching, not a complete virtualized editor.

## Method

Each candidate keeps one persistent editor instance and one outer host. Eight deterministic 2,000-block canonical documents remain in JavaScript memory. Before measurement, each note prepares one contiguous editor state capped at 192 blocks. The prepared windows rotate between the beginning, middle, and end of the canonical document so switching exercises different content ranges.

Each production-build run primes all prepared states, then records 100 cached note switches and 30 editor-owned text updates. The switching boundary begins before editor-state installation and ends after a host-height read forces layout. Fixture creation, editor-state construction, user-agent-specific memory collection, and priming remain outside navigation timing.

The harness rejects a bounded run unless its state metadata declares at most 192 rendered blocks, it retains exactly one host mount and editor instance, and it reports no more than 512 active or total DOM elements. The metadata is produced by the same internal corpus helper as the editor state; this is not an independent inspection of editor content.

## Environment

- Linux x86_64
- Headless Chrome 149.0.0.0
- Production Vite build
- ProseMirror state 1.4.4, view 1.42.1, model 1.25.11, schema-basic 1.2.4
- Lexical and `@lexical/rich-text` 0.48.0
- No CPU or network throttling

## Representative observations

All durations are milliseconds. Memory delta is MiB.

| Candidate | Canonical blocks | Rendered blocks | Prepare | Mount | Prime | End-to-layout P50 | End-to-layout P95 | End-to-layout P99 | End-to-layout max | Typing end-to-layout P95 | Typing end-to-layout max | Dropped | Tasks >50 ms | DOM elements | Editors | Memory delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ProseMirror | 2,000 | 192 | 6.40 | 6.22 | 272.58 | 2.78 | 4.15 | 4.43 | 6.37 | 0.76 | 0.86 | 0 | 0 | 203 | 1 | 2.38 |
| Lexical | 2,000 | 192 | 32.74 | 20.20 | 265.77 | 3.61 | 4.72 | 6.23 | 7.06 | 0.87 | 1.48 | 0 | 0 | 385 | 1 | 2.90 |

The prepared ranges were `[0, 192)`, `[904, 1096)`, and `[1808, 2000)`, repeated across the eight notes. Preparation calls remained unchanged during navigation. Browser error output was empty.

Prepare and mount timings are diagnostics, not engine comparisons. Lexical constructs its editor during candidate creation before these timers begin; ProseMirror constructs its view inside the timed mount.

## Evidence status

These are exploratory development-machine observations, not fixed-runner contract evidence. Raw JSON was inspected in the harness during each session but was not committed, and the Chrome trace remains a local diagnostic outside the repository. A production-selection run must preserve machine-readable raw samples and trace summaries as required by the performance contract.

## Fresh-context repetition

Memory collection was disabled for five additional fresh-browser runs per engine so it could not perturb interaction timing.

| Candidate | End-to-layout P95 samples | Median P95 | Worst maximum | Dropped frames |
| --- | --- | ---: | ---: | ---: |
| ProseMirror | 3.47, 4.32, 4.14, 3.14, 3.64 | 3.64 | 6.23 | 0 |
| Lexical | 5.30, 4.44, 4.72, 5.08, 6.54 | 5.08 | 8.35 | 0 |

These untraced mutation-through-layout samples satisfy the provisional 8 ms P95 target on this machine. They do not prove presentation or fixed-runner behavior.

## Trusted input and presentation diagnostics

Rapid runs sent 100 trusted ArrowDown events after mounting each bounded candidate.

| Candidate | Handler-through-layout P50 | Handler-through-layout P95 | Handler-through-layout P99 | Handler-through-layout max | Event Timing entries | Unreported at threshold | Long animation frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ProseMirror | 2.76 | 3.75 | 4.63 | 4.83 | 42 | 58 | 0 |
| Lexical | 4.04 | 5.12 | 5.82 | 6.51 | 59 | 41 | 0 |

Reported Event Timing durations were 16 or 24 ms. Missing entries remain censored at the API's 16 ms reporting threshold and are not treated as passes.

The native handler samples include editor installation, benchmark sentinel and status text mutations, and the final forced-layout read. They are conservative whole-handler diagnostics rather than editor-only costs.

A five-key ProseMirror trace recorded 8.86, 13.39, 8.84, 10.60, and 10.45 ms handler-through-layout samples. Its longest interaction was 42 ms, split into roughly 0.3 ms input delay, 21 ms processing, and 21 ms presentation. No frame crossed the Long Animation Frame API's 50 ms threshold. Tracing materially perturbed the same work relative to the untraced rapid and fresh-context runs, so the trace is presentation-phase evidence rather than a strict unperturbed timing sample.

## Correctness limits

This projection does not shift its window while scrolling or editing. It has no spacers, scroll correction, cross-window selection model, selection restoration, native select-all or find behavior, drag selection, IME migration, clipboard policy, cross-window undo, or accessibility traversal across the complete document. Editing mutates only the prepared bounded editor state and is not reconciled back into the canonical array.

Neither ProseMirror nor Lexical natively provides complete whole-document virtualization. Keeping the canonical document outside the editor makes the DOM cost bounded, but it transfers important browser and editor semantics to application code. Calling this a complete editor architecture would be incorrect.

## Decision

- Precomputed static-window state swaps capped at 192 blocks remove the raw 2,000-block DOM switching bottleneck for both candidates on the recorded machine. This does not measure runtime window projection.
- ProseMirror has the smaller observed DOM and memory footprint; this is evidence, not an editor selection.
- The next editor gate is correctness: implement window movement, scroll anchoring, selection restoration, and canonical edit reconciliation for one candidate before adding product plugins.
- ADR-0020 and product UI scaffolding remain blocked until bounded correctness, representative plugins, fixed-runner presentation evidence, tree/store behavior, and desktop bridge overhead are measured.
