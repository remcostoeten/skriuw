# Archive import linearization follow-up

## Change

Two quadratic paths were removed from `replace_from_archive` without changing validation, transaction, search, or history-baseline behavior:

- One note projection replaces two full archive-node scans per document.
- The freshly emptied FTS projection uses direct insertion. Calling the ordinary replace path first performed `DELETE WHERE note_id = ?` against an unindexed FTS column, scanning the growing FTS table once per document.

## Command

```bash
cargo test -p skriuw-fixtures --test backend_workloads --release --locked \
  benchmarks_import_workloads -- --ignored --nocapture
```

## Environment

- Linux 7.1.2, x86-64
- Intel Core i7-10700F, 8 cores / 16 threads
- 23 GiB memory
- Warm page-cache state; five fresh target databases per fixture

## Results

| Fixture | Previous median | Note index only | Index + fresh FTS insertion |
| --- | ---: | ---: | ---: |
| mixed-1000 | 122 ms | 122.667 ms | 39.717 ms |
| mixed-5000 | 1,962 ms | 1,872.313 ms | 201.504 ms |

The final 5,000-note result is 89.7% lower than the prior measurement. Growth from 1,000 to 5,000 notes is now 5.07×, matching the 5× workload increase closely enough that no additional import optimization is justified by this evidence. Import remains an explicit maintenance path and does not affect editing or navigation budgets.
