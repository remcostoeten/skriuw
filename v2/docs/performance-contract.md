# Performance contract

## Meaning of instant

Instant means same-frame feedback with no visible intermediate loading state. Physics prevents literal zero duration. Architecture must remove asynchronous dependencies from interaction paths.

## Budgets

Reference hardware will be fixed before implementation benchmarks begin.

| Interaction | Target |
| --- | --- |
| Note selection feedback | Same event task; no async boundary |
| Cached editor-state swap | P95 below 8 ms; max below 16.67 ms |
| Command palette open | P95 below 8 ms |
| Tree create, move, reorder | P95 below 8 ms |
| Keystroke to paint | P95 below 8 ms; max below 16.67 ms |
| Main-thread task during navigation | None above 8 ms |
| Dropped frames during 100 cached note switches | Zero on reference hardware |

## Hard invariants

- No IPC during note navigation.
- No database read during note navigation.
- No Markdown parse during note navigation.
- No Git operation during editing or navigation.
- No route or editor chunk loading after startup.
- No editor component remount during note navigation.
- No post-startup skeleton for cached workspace content.
- No application-shell render from editor keystrokes.
- No broad store subscription where a selector can express the dependency.
- No production React Scan or profiling instrumentation.

## Fixtures

- 1,000 and 5,000-note workspaces.
- 50, 500, and 2,000-block documents.
- 100 rapid note switches by keyboard.
- 10,000 command-palette entries.
- Continuous typing while search and history projections update.

## Enforcement

Performance marks surround selection dispatch, editor-state installation, command opening, keystroke handling, and next paint. Long Animation Frame observations capture blocking work. React profiling records commits and affected component names. React Scan exposes avoidable renders during development but is not treated as proof of performance.

The benchmark harness runs a production build on fixed reference hardware. It stores raw samples, P50, P95, P99, maximum duration, dropped frames, long tasks, React commit counts, and editor-host mount counts. CI uses a stable dedicated performance runner; ordinary shared CI runs functional checks without pretending timing is deterministic.

Architecture changes failing budgets do not merge without an explicit ADR and a replacement measurement.

## Render invariants

| Interaction | Allowed React work |
| --- | --- |
| Editor keystroke | Editor-owned view only |
| Note selection | Selected-note consumers only; editor host stays mounted |
| Tree selection | Previous row, next row, and direct selection consumers |
| Metadata edit | Changed field consumers only |
| Command palette query | Palette result surface only |

Component counts are finalized after the UI decomposition exists. Any component rendering identical output is a regression regardless of whether the frame budget still passes.
