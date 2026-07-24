# Save-batching benchmark: 2026-07-20

## Workload

Two file-backed SQLite workspaces each contain one note at revision 1. Both persist 1,000 consecutive document saves with independent expected revisions, FTS replacements, history-outbox rows, and acknowledgements. The grouped path mirrors the runtime cap with 64 request groups per outer transaction; the sequential path opens and commits one transaction per save.

The comparison runs in an optimized build and excludes runtime queue setup, fixture creation, and final snapshot verification. It does not drop, overwrite, or debounce any revision.

Command:

```bash
cargo test -p skriuw-sqlite benchmarks_1000_lossless_save_requests --release --locked -- --ignored --nocapture
```

## Environment

- Linux 7.1.2-arch3-1 x86_64.
- Intel Core i7-10700F at 2.90 GHz; 16 logical processors.
- 23 GiB memory.
- rustc 1.95.0 and cargo 1.95.0.
- Bundled SQLite through rusqlite 0.40.1, WAL journal mode, and `synchronous=NORMAL`.

## Results

| Sample | Grouped, 64 maximum | Sequential |
| --- | ---: | ---: |
| 1 | 76.595009 ms | 102.175163 ms |
| 2 | 81.788340 ms | 107.097642 ms |
| 3 | 85.110739 ms | 109.202939 ms |
| 4 | 76.882052 ms | 100.990738 ms |
| 5 | 79.964638 ms | 108.061580 ms |

The grouped median was 79.964638 milliseconds and the sequential median was 107.097642 milliseconds. The grouped workload reduced median elapsed time by 25.3% while both workspaces reached revision 1,001 and every grouped request returned a successful result.

This is a backend throughput measurement, not an editor interaction budget. The renderer still updates synchronously, the runtime never waits to form a batch, and persistence acknowledgements arrive asynchronously after durable commit.
