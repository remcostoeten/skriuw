# Embedded diagram routing diagnostic

Date: 2026-08-02

A local Bun 1.3.14 diagnostic exercised the synchronous routing work for one
drag frame across the three diagram fixtures required by the performance
contract. Each of 10,000 iterations selected the moved node's incident edges,
resolved their endpoints, and recalculated their cubic connector paths.

| Nodes | Incident edges | P50 | P95 | Maximum |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 20 | 0.006 ms | 0.014 ms | 1.34 ms |
| 50 | 100 | 0.048 ms | 0.099 ms | 1.78 ms |
| 150 | 300 | 0.171 ms | 0.311 ms | 3.22 ms |

The 150-node case deliberately makes every allowed edge incident to the moved
node. It is therefore less favorable than a normal flowchart, where a move
usually updates one to four paths. The diagnostic exposed and removed a full
SVG rebuild from the drag path; the NodeView now mutates only the moved node's
transform and its incident path and label attributes, then commits one editor
transaction at gesture end.

These Linux development-host timings demonstrate adequate headroom in the
routing algorithm, but they are not the fixed-runner frame verdict: they do not
include browser style, layout, paint, input dispatch, or presentation. A
production-browser run with the dedicated reference host is still required to
promote the diagram drag budget to release evidence.
