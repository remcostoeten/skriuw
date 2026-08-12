# Browser runtime scale and cross-browser durability: 2026-08-05

## Workload

The measurements exercise the production browser storage path end to end: the
renderer bridge (`app/src/bridge/commands.ts`) speaks the versioned worker
protocol to the dedicated storage worker, which owns one
`skriuw-sqlite::SqliteWorkspace` over the `opfs-sahpool` VFS (ADR-0027). A dev
Vite server serves the real application bridge; nothing is mocked.

Two commands, both wired as `app` package scripts:

```bash
bun --cwd=app run e2e:browser-scale                       # 1,000 notes
SKRIUW_SCALE_NOTES=5000 bun --cwd=app run e2e:browser-scale
bun --cwd=app run e2e:browser-storage:firefox             # Firefox durability
```

The scale run seeds folders plus notes through `apply_operations` in
64-operation batches (the native runtime cap), closes the worker, reloads the
page against the populated OPFS database, then measures bootstrap hydration and
FTS search through the same protocol. Raw reports are written to
`app/e2e/results/browser-scale-<n>.json`.

## Environment

- Linux 7.1.2-arch3-1 x86_64; Intel Core i7-10700F at 2.90 GHz; 23 GiB memory.
- Chrome 150.0.7871.46 (`--headless=new`), fresh profile and origin per run.
- Firefox 152.0 (`-headless`, WebDriver BiDi), fresh profile per run.
- Vite dev server on 127.0.0.1; unoptimized WASM asset from
  `scripts/build-browser-wasm.sh`.

## Results

Chrome 150, single samples per run:

| Measurement | 1,000 notes | 5,000 notes |
| --- | --- | --- |
| First open on empty database (worker spawn, WASM load, OPFS install, migrations, bootstrap) | 239.7 ms | 255.0 ms |
| Seed apply throughput (create folders + notes, batched) | 440.4 ms / 1,010 ops | 4,345.3 ms / 5,050 ops |
| Seeded reload bootstrap (worker init + open + full snapshot hydrate) | 55.3 ms | 139.0 ms |
| Warm bootstrap (open worker, full snapshot re-read) | 15.2 ms | 49.7 ms |
| FTS search, limit 20 | 5.0 ms | 6.7 ms |

Every run verifies the exact durable node count after reload and at least one
search hit before reporting.

Firefox 152.0 durability: a folder created through the worker protocol survives
explicit worker close plus page reload on the same OPFS database, with exactly
one durable copy — the same assertion the Chromium gate in `check-wasm.sh`
makes.

## Interpretation

- Startup-path hydration is bounded: even the 5,000-note workspace reaches a
  fully hydrated snapshot in under 140 ms from a cold page load, and under
  50 ms once the worker is warm. Renderer navigation reads the hydrated store
  and never waits on the worker, so these costs sit entirely at startup, per
  the performance contract's hard invariants.
- Seed throughput (~1.2 ms per operation at 5,000 notes, including document,
  FTS, history-outbox, and rank writes through OPFS) is a bulk-import figure,
  not an interaction-path figure.
- Renderer interaction budgets (8 ms keystroke/selection targets) are measured
  by the renderer harness on reference hardware and are not restated here;
  this document covers the storage runtime only.
- These are dev-server, unoptimized-WASM, single-sample numbers on shared
  hardware — adequate as bounding release evidence for the browser runtime,
  not as a regression baseline. A production-build multi-sample pass on the
  reference runner remains the release gate for renderer interactions.
