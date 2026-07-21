# Retained editor switching observations

Date: 2026-07-21

## Purpose

This follow-up tests the smallest symmetric alternative to replacing a complete rendered document on navigation. Retained mode creates eight real editor instances before measurement, keeps every pane laid out in one stacked host, and switches only visibility. It trades startup and memory for navigation latency.

CSS clipping is not treated as bounded rendering because it leaves reconciliation and layout work unchanged. `display: none` was also rejected during harness development because Chromium discarded layout and rebuilt it on reveal.

## Method

Each production-build run used a fresh headless Chromium context, eight deterministic prepared notes, one outer host mount, 100 cached switches, and 30 editor-owned updates. Every pane was installed, forced through layout, and given two animation frames before timing. Navigation recorded state or visibility mutation through the same active-surface height read for both engines, plus next-frame gaps and browser Long Tasks above 50 ms. Inactive panes were inert and hidden from the accessibility tree.

Memory is the difference between user-agent-specific memory before candidate construction and after preparation, mounting, and priming. It includes prepared states and mounted editors. The measurement is available because the preview server supplies cross-origin isolation headers. It is a process observation, not a product memory ceiling.

## Environment

- Linux x86_64
- Headless Chrome 149.0.0.0
- Production Vite build
- ProseMirror state 1.4.4, view 1.42.1, model 1.25.11, schema-basic 1.2.4
- Lexical and `@lexical/rich-text` 0.48.0

## Representative observations

All durations are milliseconds. Memory delta is MiB.

| Candidate | Blocks | Prepare | Mount | Prime | Switch P50 | Switch P95 | Switch P99 | Switch max | Typing P95 | Typing max | Switch dropped | Browser tasks >50 ms | Active elements | Total elements | Editors | Memory delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ProseMirror | 500 | 18.12 | 35.71 | 307.45 | 4.28 | 4.93 | 5.09 | 5.35 | 5.73 | 7.06 | 0 | 0 | 526 | 4,208 | 8 | 3.00 |
| ProseMirror | 2,000 | 40.97 | 75.65 | 444.48 | 9.62 | 16.75 | 17.85 | 17.90 | 16.10 | 16.58 | 0 | 0 | 2,101 | 16,808 | 8 | 10.88 |
| Lexical | 500 | 45.00 | 92.19 | 280.12 | 4.65 | 8.53 | 9.71 | 13.38 | 3.43 | 3.70 | 0 | 0 | 1,001 | 8,008 | 8 | 4.34 |
| Lexical | 2,000 | 142.69 | 306.21 | 319.16 | 8.48 | 10.22 | 10.27 | 28.64 | 7.67 | 10.88 | 1 | 0 | 4,001 | 32,008 | 8 | 14.76 |

Every run retained one outer host and performed zero preparation calls during navigation. Browser error output was empty.

## Interpretation

Retaining laid-out panes gives ProseMirror substantial end-to-layout headroom at 500 blocks in this representative run. Lexical misses the provisional 8 ms P95 target at 8.53 ms. ProseMirror retains roughly half as many elements and has a smaller observed memory delta. Preparation, mount, and priming timers are reported separately but are not directly comparable because Lexical may defer reconciliation into priming.

Neither candidate satisfies even the provisional 2,000-block end-to-layout gate. ProseMirror misses the navigation and typing 8 ms P95 targets. Lexical misses navigation P95 and maximum and drops one observed switch frame. Retaining entire documents also scales residency linearly to 16,808 ProseMirror or 32,008 Lexical elements for only eight open notes.

These observations do not prove the full cached-swap contract because animation-frame callbacks run before paint and the browser Long Tasks API only reports tasks above 50 ms. This result rejects an unbounded retained-editor pool as the large-document solution. It does not select ProseMirror: repeated runs, presentation and Long Animation Frame evidence, focus/selection and scroll restoration, representative plugins, native keyboard-to-paint measurements, structured Markdown fidelity, and a genuinely bounded viewport remain open. Raw samples remain available from the harness but are not committed with this representative report.
