# Progressive bounded window

Date: 2026-11-06

Decision: [ADR-0060](../adr/0060-progressive-bounded-editor-window.md)

Revision: `7c7db217db05175521013da4ddb87a322983a63e` on
`perf/progressive-editor-window`, branched from `origin/daddy` at
`2c8122715`.

Reference machine: `remcostoeten`, Intel Core i7-10700F, 16 logical CPUs,
15.5 GiB RAM, Arch Linux 7.2.9, Node 26.13.0, Chrome 155.0.8059.79, headless.

Commands:

```bash
node apps/workspace/performance/run.mjs \
  --output docs/benchmarks/raw/2026-11-06-progressive-bounded-window.json

git checkout 2c8122715 -- apps/workspace/src   # product code before this change
node apps/workspace/performance/run.mjs \
  --output docs/benchmarks/raw/2026-11-06-progressive-bounded-window-before.json
git checkout HEAD -- apps/workspace/src
```

The "before" run uses this branch's harness with the product code of
`2c8122715`, so both columns measure the same thing. Its raw file records the
branch revision because the harness reads `git rev-parse HEAD`.

## Load conditions

Several agents were building on this machine during the day. Runs taken
between 11:15 and 11:40 had a load average of 5 to 17 and moved by several
milliseconds between identical runs, so they are not used below. The recorded
runs were taken back to back between 12:01 and 12:05 at a load average of 0.8
to 3.0. A second after/before pair taken right after them is quoted as
"run 2". Chrome composited at about 60 Hz, so the 120 Hz budget is N/A.

## Re-measure on origin/daddy

The first run on unmodified `origin/daddy` (load average about 6.5) failed
`coldEditorRevisit` and `navigationMainThreadTask` in all three fixtures and
`selectionDispatch`, `cachedEditorSwap` and `noBlockingAnimationFrames` on
the 500-block fixture. The failures from 2026-10-18 still held, so the work
went ahead.

## What the trace showed

A Chrome trace of the 2,000-block keyboard switches (99 Enter keydowns,
mean 10.0 ms) attributed per keydown:

| Cost | ms per keydown |
| --- | ---: |
| `console.timeStamp` calls from `react-dom/profiling` | about 4.5 |
| Layout of the 192-block window | 3.7 |
| Style recalculation (two passes of about 100 and 200 elements) | 1.6 |

The first row is not product work. The harness aliases `react-dom/client` to
`react-dom/profiling` to count commits, and that build logs one
`console.timeStamp` per component and commit while a trace records. The
production `react-dom` build contains no `console.timeStamp` call. The
harness now removes `console.timeStamp` before `react-dom` loads. Budgets are
unchanged.

The 50-block fixture's keydown, with no window at all, spent 1.5 ms in layout
and 1.3 ms in style, so about 2.2 ms of the 2,000-block layout was the window.

## Results

P95 / max in milliseconds. Budgets are below 8 ms unless stated.

### 5,000 notes / 2,000 blocks

| Budget | Before | After | Run 2 before / after | Verdict after |
| --- | ---: | ---: | ---: | --- |
| Selection dispatch (P95) | 10.60 / 11.10 | 7.70 / 8.70 | 7.40 / 6.00 | PASS |
| Cold editor revisit | 12.40 | 8.50 | 11.40 / 9.30 | FAIL |
| Navigation keydown (max) | 11.29 / 24.67 | 8.20 / 9.91 | 14.28 / 11.13 | FAIL |
| Cached editor swap | 7.80 / 8.50 | 4.00 / 4.70 | 5.00 / 3.10 (P95) | PASS |
| Keystroke to paint | 7.10 / 7.90 | 7.20 / 8.10 | | PASS |
| Dropped frames, 100 switches | 0 | 0 | | PASS |

### 5,000 notes / 500 blocks

| Budget | Before | After | Run 2 before / after | Verdict after |
| --- | ---: | ---: | ---: | --- |
| Selection dispatch (P95) | 7.70 / 10.50 | 6.60 / 7.90 | 9.00 / 6.40 | PASS |
| Cold editor revisit | 11.70 | 9.90 | 11.40 / 10.40 | FAIL |
| Navigation keydown (max) | 12.20 / 14.19 | 8.67 / 10.99 | 10.64 / 15.96 | FAIL |
| Cached editor swap | 5.00 / 7.40 | 3.20 / 4.50 | 5.40 / 3.40 (P95) | PASS |
| Keystroke to paint | 7.10 / 7.20 | 7.10 / 7.10 | | PASS |
| Dropped frames, 100 switches | 0 | 0 | | PASS |

### 1,000 notes / 50 blocks (unaffected path)

| Budget | Before | After | Run 2 before / after | Verdict after |
| --- | ---: | ---: | ---: | --- |
| Selection dispatch (P95) | 4.60 / 5.80 | 4.80 / 5.80 | 5.30 / 5.60 | PASS |
| Cold editor revisit | 7.90 | 8.20 | 7.60 / 9.70 | FAIL |
| Navigation keydown (max) | 7.09 / 8.79 | 5.69 / 15.31 | 7.54 / 7.30 | FAIL |

The keydown column shows P95 / max for the recorded runs and the max for run
2. `navigationMainThreadTask` is judged on the max.

### Growth

| Fixture | Idle callbacks in the keyboard trace | Longest idle callback | Longest growth `updateState` |
| --- | ---: | ---: | ---: |
| 5,000 / 500 | 134 | 0.79 ms | 0.60 ms |
| 5,000 / 2,000 | 131 | 0.76 ms | 0.60 ms |

The new correctness check `large-editor-window-grows-to-full` passed in both
large fixtures: after typing, the editor held blocks 1 through 192 in order.
Typing produced zero React commits and no phase recorded a long task or a
blocking Long Animation Frame.

A separate browser check against the same build scrolled a 2,000-block note
to block 89 and to block 443, switched away and back, and read the top block
every frame. The first frame rendered 48 blocks with the same block at the
same offset (within 1 px), and that block stayed in place while growth added
blocks below and above until 192 were rendered. A caret left at block 151,
outside the first window, was back at block 151 offset 5 after growth.

## Caret colour

The `caret-color` rule now applies only on WebKit, so Chrome no longer
restyles every rendered block when focus moves between the sidebar and the
editor. This change was not measured on its own. A trace taken with the
progressive window but before this change, under load, showed style passes of
55 to 90 elements per 2,000-block keydown instead of about 100 and 200. On
WebKitGTK the rule still restyles the rendered blocks, because the lingering
caret it hides is a WebKit bug.

## Remaining failures

- `selectionDispatch` passes on both large fixtures.
- `coldEditorRevisit` and `navigationMainThreadTask` still fail. The large
  fixtures now sit at the level of the 50-block fixture, which fails the same
  two budgets without any window: about 8 to 10 ms for a cold revisit and an
  occasional keydown above 8 ms. That remaining cost is the fixed note-switch
  path (React commit of the selected-note consumers, editor state creation
  with every plugin, focus and the first layout of the visible blocks), not
  the bounded window, and needs its own change.

Raw evidence:

- `docs/benchmarks/raw/2026-11-06-progressive-bounded-window.json`
- `docs/benchmarks/raw/2026-11-06-progressive-bounded-window-before.json`
