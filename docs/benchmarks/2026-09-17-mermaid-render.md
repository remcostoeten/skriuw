# Rendered Mermaid fence diagnostic

Date: 2026-09-17

A local Node 24.21 diagnostic timed `@vercel/beautiful-mermaid` 0.1.5 through
the same options the node view passes (enriched palette, transparent
background, system font, 14 px labels). Each diagram was rendered once cold
after module load and then 50 more times; the memo in `mermaid-render.ts` was
bypassed so every sample is a full parse, layout, and SVG serialization.

| Diagram | SVG size | First render | P50 | P95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sequence, 2 participants, 2 messages | 3.0 KB | 2.25 ms | 0.04 ms | 0.20 ms | 0.58 ms |
| Sequence, 12 participants, 24 messages | 11.4 KB | 0.17 ms | 0.13 ms | 0.31 ms | 3.47 ms |
| State, 60 states, animated | 50.1 KB | 42.41 ms | 19.92 ms | 28.48 ms | 32.21 ms |
| Class, 6 classes, 5 relations | 8.9 KB | 5.38 ms | 1.60 ms | 5.05 ms | 7.39 ms |
| ER, 5 entities | 9.5 KB | 11.23 ms | 2.65 ms | 4.03 ms | 5.16 ms |
| Flowchart with subgraphs, 12 nodes | 7.1 KB | 33.14 ms | 16.68 ms | 26.81 ms | 29.07 ms |

The renderer chunk measures 107.5 KB raw and 32 KB gzipped in the Vite
production build (`dist-*.js`), loaded by dynamic import on the first
renderable fence and absent from the main bundle.

Sequence, class, and ER layouts are trivial. The two dagre-backed families
(flowchart, state) dominate: the 60-state reference case lands at 20 ms warm
and 42 ms cold, under the 50 ms warm budget the plan set and under the 100 ms
threshold that would have moved rendering behind a Worker. Renders never run in
a typing path: the node view schedules them in an idle callback, 250 ms after
the last keystroke while editing source, and a note's first paint does not wait
for them because the preview fills in after the document is on screen. Note
switching back to an already rendered note hits the memo and costs no render.

These development-host timings show the headroom in the algorithm and the
chunk cost, not the fixed-runner frame verdict: they exclude browser style,
layout, paint, and SVG rasterization of the returned markup. A production
browser run on the reference host is still required before the diagram render
budget is promoted to release evidence.
