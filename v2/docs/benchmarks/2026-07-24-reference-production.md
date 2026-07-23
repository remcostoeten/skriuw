# Reference production performance gate

Date: 2026-07-24

Revision: `2d10a65a6ff2016650bb67c1f53b768c420a68fc` plus the uncommitted
integration measurement slice.

Command:

```bash
node app/performance/run.mjs \
  --output docs/benchmarks/2026-07-24-reference-production-raw.json
```

The production renderer fixture hydrates 1,000 workspace tags, 1,000 people,
and reverse-reference projections before the shell mounts. The real suggestion
index is queried in the production browser process with four representative
queries over 80 samples: empty, prefix, exact tail match, and no match.

| Fixture | Suggestion P95 | Suggestion max | Suggestion bridge calls |
| --- | ---: | ---: | ---: |
| 1,000 notes / 50 blocks | 0.2 ms | 1.8 ms | 0 |
| 5,000 notes / 500 blocks | 0.4 ms | 2.1 ms | 0 |
| 5,000 notes / 2,000 blocks | 0.7 ms | 2.4 ms | 0 |

Every result remains below the 8 ms P95 and 16.67 ms maximum budgets. The
same run retained the existing 300 cached-switch proof: no dropped frames,
navigation bridge calls, resource loads, editor remounts, or typing React
commits. Raw samples and machine metadata are committed in
`docs/benchmarks/2026-07-24-reference-production-raw.json`.

This is renderer performance evidence only. The current reference branches
provide an in-memory renderer bridge; canonical Rust operations, archive
entities, SQLite projections, and native persistence remain required before a
durable tags/people/mentions release can be claimed.
