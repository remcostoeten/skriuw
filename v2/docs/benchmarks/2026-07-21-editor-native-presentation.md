# Native editor presentation observations

Date: 2026-07-21

## Purpose

This slice replaces programmatic-only navigation evidence with trusted keyboard input and Chrome presentation diagnostics. It determines what the browser APIs can prove before the bounded editor experiment.

## Method

A production build mounted retained ProseMirror with eight prepared 500-block notes. Memory collection was disabled for this interaction-only run. Native mode installed one document-level ArrowDown handler, switched the active prepared state synchronously, updated a visible note sentinel, forced layout through the active surface, and emitted user-timing marks around the work.

Browser automation sent trusted ArrowDown key input. Synthetic events were not used. A `PerformanceObserver` collected Event Timing entries at the minimum 16 ms duration threshold and Long Animation Frames above the browser's 50 ms threshold. One five-interaction Chrome Performance trace recorded the Interactions and Frames tracks. A separate rapid run sent 100 trusted ArrowDown interactions.

## Environment

- Linux x86_64
- Chrome 149.0.0.0
- Production Vite build
- No CPU or network throttling
- ProseMirror retained strategy, 500 blocks, eight prepared notes

## Five-interaction trace

High-resolution handler-through-layout samples were 2.020, 1.715, 1.750, 1.715, and 1.730 ms.

Event Timing durations were 32, 16, 16, 16, and 16 ms. The trace's longest keydown was 35 ms: 0.3 ms input delay, 18 ms processing, and 17 ms presentation delay. The first interaction was materially slower than the following samples. No Long Animation Frame above 50 ms was reported.

The trace was saved outside the repository as a local diagnostic artifact. Chrome's trace viewer, rather than an application parser for Chromium's unstable trace schema, remains the inspection boundary.

## Rapid 100-interaction run

| Metric | Observation |
| --- | ---: |
| Trusted keydowns handled | 100 |
| Handler-through-layout P50 | 0.960 ms |
| Handler-through-layout P95 | 1.175 ms |
| Handler-through-layout P99 | 1.330 ms |
| Handler-through-layout max | 1.730 ms |
| Reported Event Timing keydown entries | 37 |
| Distinct nonzero interaction IDs | 37 |
| Event Timing duration 16 ms | 37 entries |
| Long Animation Frames above 50 ms | 0 |

The browser did not expose 63 accepted keydown entries at the 16 ms threshold. Missing entries are censored evidence, not zero-duration interactions. Entries are correlated to accepted trusted ArrowDown handler samples by their event timestamp.

## Interpretation

The high-resolution handler/layout work has large headroom at 500 blocks under retained ProseMirror. That does not establish the complete interaction contract. Event Timing observes trusted input through the next rendering update, but entries below 16 ms are censored and durations are quantized in 8 ms increments. It cannot prove a P95 below 8 ms. Zero Long Animation Frames only proves no observed frame exceeded the API's 50 ms threshold.

The five-event trace exposes a real 35 ms first interaction and separates its input, processing, and presentation phases. Subsequent 16 ms entries fit one display interval but still do not prove the strict 8 ms requirement. Production selection needs repeated fresh-context traces and native typing measurements after bounded projection and product plugins exist.

## Decision

- Keep programmatic high-resolution measurements as work diagnostics.
- Keep Event Timing as trusted native-input and next-render evidence plus a 16 ms failure detector.
- Keep Long Animation Frame capture for ambient frames above 50 ms. Add script attribution only when a measured need justifies the extra raw data.
- Use Chrome Performance traces as the presentation verification boundary.
- Never label requestAnimationFrame opportunity, missing Event Timing entries, or zero Long Animation Frames as an 8 ms presentation pass.
