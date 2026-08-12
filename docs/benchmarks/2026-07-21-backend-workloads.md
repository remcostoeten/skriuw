# Backend workload benchmark: 2026-07-21

## Workloads

Three manual optimized-build workloads run over the deterministic `mixed-1000` and `mixed-5000` fixtures from `skriuw-fixtures` (digests `a8be5c75…` and `debfb699…`, 1,018 and 5,018 operations, applied in batches of 512). Fixture generation, source materialization, archive export, and every count, search, and integrity assertion run outside the timed intervals. All databases and Git repositories live in per-sample temporary directories. No timing assertion exists in any test.

- **Import** measures `SqliteWorkspace::open` on a fresh file path and `replace_from_archive` of a pre-exported, pre-validated archive as two separate numbers. Each sample uses a fresh temporary directory and a fresh database file.
- **Bootstrap** measures `SqliteWorkspace::open` on one fully materialized file-backed database and `bootstrap()` as two separate numbers. The database is materialized once through the operation protocol before sampling.
- **History** measures two separate numbers: the outbox-to-Git drain (a `HistoryWorker` claiming and materializing every pending outbox item through the native `GitHistoryMaterializer` until idle) and the validated cache rebuild (`GitHistoryReader` full-history validation plus one transactional `replace_history_headers`). Each drain sample starts from a fresh imported database with a full outbox and a fresh Git repository; rebuild samples reuse the final drained repository. Historical Markdown bodies are never loaded; only headers and commit metadata are read.

Commands:

```bash
cargo test -p skriuw-fixtures --release --locked benchmarks_import_workloads -- --ignored --nocapture
cargo test -p skriuw-fixtures --release --locked benchmarks_bootstrap_workloads -- --ignored --nocapture
cargo test -p skriuw-fixtures --release --locked benchmarks_history_workloads -- --ignored --nocapture
```

## Environment

- Date: 2026-07-21.
- Linux 7.1.2-arch3-1 x86_64.
- Intel Core i7-10700F at 2.90 GHz; 16 logical processors.
- 23.4 GiB memory.
- rustc 1.95.0 and cargo 1.95.0.
- Bundled SQLite through rusqlite 0.40.1, WAL journal mode, `synchronous=NORMAL`; vendored libgit2 through git2 0.21.
- Git commit `a3f15c5` plus this harness.

## Import results

`mixed-1000` (1,016 nodes, 1,000 documents):

| Sample | open | replace_from_archive |
| --- | ---: | ---: |
| 1 | 1.020 ms | 133.457 ms |
| 2 | 0.831 ms | 122.090 ms |
| 3 | 0.950 ms | 120.650 ms |
| 4 | 0.870 ms | 121.606 ms |
| 5 | 0.839 ms | 123.352 ms |

Medians: open 0.870 ms, replace_from_archive 122.090 ms.

`mixed-5000` (5,016 nodes, 5,000 documents):

| Sample | open | replace_from_archive |
| --- | ---: | ---: |
| 1 | 0.877 ms | 1962.093 ms |
| 2 | 0.847 ms | 1971.271 ms |
| 3 | 0.850 ms | 1958.979 ms |
| 4 | 0.866 ms | 1914.952 ms |
| 5 | 0.863 ms | 1967.682 ms |

Medians: open 0.863 ms, replace_from_archive 1962.093 ms.

## Bootstrap results

`mixed-1000`:

| Sample | open | bootstrap |
| --- | ---: | ---: |
| 1 | 0.220 ms | 3.362 ms |
| 2 | 0.210 ms | 2.689 ms |
| 3 | 0.183 ms | 2.618 ms |
| 4 | 0.180 ms | 3.094 ms |
| 5 | 0.205 ms | 2.720 ms |

Medians: open 0.205 ms, bootstrap 2.720 ms.

`mixed-5000`:

| Sample | open | bootstrap |
| --- | ---: | ---: |
| 1 | 0.244 ms | 13.300 ms |
| 2 | 0.241 ms | 13.350 ms |
| 3 | 0.221 ms | 16.202 ms |
| 4 | 0.266 ms | 15.253 ms |
| 5 | 0.258 ms | 13.409 ms |

Medians: open 0.244 ms, bootstrap 13.409 ms.

## History results

`mixed-1000`, five samples per number:

| Sample | outbox-to-Git drain | validated cache rebuild |
| --- | ---: | ---: |
| 1 | 4159.794 ms | 140.193 ms |
| 2 | 4137.067 ms | 138.622 ms |
| 3 | 4146.040 ms | 138.738 ms |
| 4 | 4176.056 ms | 141.561 ms |
| 5 | 4185.188 ms | 143.647 ms |

Medians: drain 4159.794 ms for 1,000 commits, rebuild 140.193 ms for 1,000 headers.

`mixed-5000`: an initial probe run measured one drain sample at 96117.529 ms, so the drain repeat count was reduced to a documented three samples instead of five. Rebuild kept five samples.

| Sample | outbox-to-Git drain | validated cache rebuild |
| --- | ---: | ---: |
| 1 | 94370.561 ms | 2770.555 ms |
| 2 | 96283.068 ms | 2782.637 ms |
| 3 | 98823.905 ms | 2842.012 ms |
| 4 | — | 2773.599 ms |
| 5 | — | 2717.436 ms |

Medians: drain 96283.068 ms for 5,000 commits, rebuild 2773.599 ms for 5,000 headers.

## Interpretation

- Bootstrap of a fully materialized 5,000-note workspace is 13.4 ms at the median, well below the startup-scale cost of any other workload; hydrating the full snapshot from SQLite is not a scaling concern at these sizes.
- Import scales worse than linearly: 122 ms at 1,000 notes versus 1962 ms at 5,000 notes (≈16× for 5× the data). `replace_from_archive` performs a linear scan of `archive.nodes` for every document (twice per document, for the FTS title and the history timestamp), giving quadratic work in note count. This is an observation about a maintenance-path operation, not a defect on any interaction path; no production code was changed in this slice.
- Follow-up (2026-08-02): archive replacement now builds one note projection before the transaction and performs constant-time title/timestamp lookup per document. The representative rerun and its remaining scaling gap are recorded in [2026-08-02-archive-import-index.md](2026-08-02-archive-import-index.md).
- Outbox-to-Git materialization dominates everything: ~4.2 s for 1,000 commits and ~96 s for 5,000 commits (≈23× for 5× the commits). Each commit rewrites the Git index and tree, whose sizes grow with the number of accumulated notes, so per-commit cost grows with history length. This work runs on the background history worker outside editing and navigation paths. A complete archive import creates a backlog of this size; extended worker downtime could also accumulate one.
- Validated cache rebuild is comparatively cheap (140 ms / 2.8 s) and is an explicit maintenance command, never a startup or interaction cost.

## Limitations

- Development-machine observations, not product budgets, fixed-runner numbers, or universal claims.
- Page-cache state is warm and uncontrolled: samples reuse recently written files and no OS cache eviction is performed, so no cold-start behavior is claimed.
- Database open is timed separately; medians above exclude it from the import/bootstrap numbers.
- The 5,000-note drain uses three samples because one sample costs ~96 s; correctness assertions still cover all 5,000 commits, headers, and outbox emptiness in every sample.
- No UI, IPC, web-runtime, or editor claims follow from these numbers. Historical Markdown reads stay lazy and were not benchmarked; a body-loading workload would be a separate optional measurement.
