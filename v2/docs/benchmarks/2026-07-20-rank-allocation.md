# Rank-allocation benchmark: 2026-07-20

## Workload

One atomic batch creates 5,000 root notes with `last` placement in an in-memory SQLite workspace. Each create includes its canonical document, FTS projection, history-outbox row, revision acknowledgement, and rank-change acknowledgement. The workload runs in an optimized build and remains outside renderer navigation paths.

Command:

```bash
cargo test -q -p skriuw-sqlite --release --locked benchmarks_5000_sibling_placements -- --ignored --nocapture
```

## Environment

- Linux 7.1.2-arch3-1 x86_64.
- Intel Core i7-10700F at 2.90 GHz; 16 logical processors.
- 23 GiB memory.
- rustc 1.95.0 and cargo 1.95.0.
- Bundled SQLite through rusqlite 0.40.1.

## Results

The initial implementation loaded and sorted the complete sibling set for every placement. Its first optimized-build sample was 4.369159004 seconds.

After limiting ordinary first, last, before, and after allocation to immediate-neighbor reads, five samples were:

| Sample | Duration |
| --- | ---: |
| 1 | 1.715252348 s |
| 2 | 1.805118108 s |
| 3 | 1.755672394 s |
| 4 | 1.835859893 s |
| 5 | 1.852831207 s |

Median was 1.805118108 seconds. The separate post-change smoke sample was 1.700655577 seconds. The measured improvement from the initial sample to the five-sample median was 58.7%.

No interaction budget is assigned to this bulk persistence workload. Individual tree actions still update renderer state synchronously and submit persistence outside the same-frame path. Full sibling loading now occurs only when midpoint allocation proves compaction is necessary.
