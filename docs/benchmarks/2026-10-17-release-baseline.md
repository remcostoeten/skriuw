# Release baseline

Date: 2026-10-17

Revision: `ff6ce305cb756f3a0fe5248d0246bbd3a10b9a00` (harness changes from this
commit applied on top, no product code changed except exporting the unlinked
mention search delay)

Reference machine: `remcostoeten`, Intel Core i7-10700F, 16 logical CPUs,
15.5 GiB RAM, Arch Linux 7.2.9, Node 24.22.0, Chrome 155.0.8059.79.

Commands:

```bash
node apps/workspace/performance/run.mjs \
  --output docs/benchmarks/raw/2026-10-17-release-baseline.json
node apps/workspace/performance/run.mjs --headed \
  --output docs/benchmarks/raw/2026-10-17-release-baseline-headed.json
```

Both runs exited 1 with a `budget failures:` list. Every correctness check
passed. Other build jobs were serialized behind a shared lock during the runs,
but the desktop was in normal use.

## Harness changes in this revision

The harness now exits non-zero on any budget miss and prints a verdict per
budget. It adds three budgets from `docs/performance-contract.md`:
`navigationMainThreadTask` (keydown `EventDispatch` maximum below 8 ms),
`noBlockingAnimationFrames` (no Long Animation Frame with blocking time in the
selection, keyboard and typing phases) and `hundredSwitchesNoFrameMissAt120Hz`
(no frame gap above 12.5 ms during the 100 keyboard switches, measured only
when the browser composites at 9 ms per frame or faster).

The performance bridge mock now answers `search_index_status` with a current
index and `search_workspace` with no hits. Both calls were added to the product
after the 2026-08-03 run and were rejected by the mock, which failed the
console correctness check.

A settle window now separates the keyboard switches from typing. It waits for
the unlinked mention search delay (250 ms) plus 100 ms, then one idle callback
and two frames. The React commits and bridge calls in that window are reported
as `navigationTail` and are not a budget. Without the window, the unlinked
mention search started by the last switch committed once during typing and
failed `editor-keystrokes-skip-react`.

## Headless run

Chrome composited at about 60 Hz, so the 120 Hz budget is not measurable and
reports N/A. At this rate every frame gap exceeds 12.5 ms, which is why the
120 Hz miss counts below equal the number of frames.

### 1,000 notes / 50 blocks

| Budget | P95 | Max | Verdict |
| --- | ---: | ---: | --- |
| Cached editor swap | 1.30 ms | 1.80 ms | PASS |
| Bounded editor working set | | 32 of 32, 69 evictions | PASS |
| Cold editor revisit dispatch | | 13.00 ms | FAIL |
| Selection dispatch | 12.80 ms | 17.00 ms | FAIL |
| Keystroke to paint | 7.00 ms | 7.00 ms | PASS |
| Dropped frames, 100 switches | | 0 | PASS |
| Reference suggestions | 0.20 ms | 2.20 ms | PASS |
| Navigation main-thread task (keydown) | 11.25 ms | 14.32 ms | FAIL |
| Blocking animation frames | | 0 | PASS |
| Frame misses at 120 Hz, 100 switches | | | N/A |

### 5,000 notes / 500 blocks

| Budget | P95 | Max | Verdict |
| --- | ---: | ---: | --- |
| Cached editor swap | 3.80 ms | 4.30 ms | PASS |
| Bounded editor working set | | 32 of 32, 69 evictions | PASS |
| Cold editor revisit dispatch | | 15.00 ms | FAIL |
| Selection dispatch | 14.50 ms | 16.70 ms | FAIL |
| Keystroke to paint | 6.90 ms | 6.90 ms | PASS |
| Dropped frames, 100 switches | | 0 | PASS |
| Reference suggestions | 0.30 ms | 2.80 ms | PASS |
| Navigation main-thread task (keydown) | 15.24 ms | 21.24 ms | FAIL |
| Blocking animation frames | | 0 | PASS |
| Frame misses at 120 Hz, 100 switches | | | N/A |

### 5,000 notes / 2,000 blocks

| Budget | P95 | Max | Verdict |
| --- | ---: | ---: | --- |
| Cached editor swap | 2.70 ms | 3.50 ms | PASS |
| Bounded editor working set | | 32 of 32, 69 evictions | PASS |
| Cold editor revisit dispatch | | 14.50 ms | FAIL |
| Selection dispatch | 12.90 ms | 15.10 ms | FAIL |
| Keystroke to paint | 7.10 ms | 7.10 ms | PASS |
| Dropped frames, 100 switches | | 0 | PASS |
| Reference suggestions | 0.30 ms | 2.60 ms | PASS |
| Navigation main-thread task (keydown) | 14.93 ms | 19.26 ms | FAIL |
| Blocking animation frames | | 0 | PASS |
| Frame misses at 120 Hz, 100 switches | | | N/A |

### Frames and navigation tail

| Fixture | Estimated frame | Switch misses 60 / 120 Hz | Typing misses 60 / 120 Hz | Navigation tail |
| --- | ---: | ---: | ---: | --- |
| 1,000 / 50 | 16.67 ms | 0 / 208 | 0 / 32 | 2 commits, `search_workspace` |
| 5,000 / 500 | 16.60 ms | 0 / 269 | 0 / 32 | 2 commits, `search_workspace` |
| 5,000 / 2,000 | 16.70 ms | 0 / 263 | 0 / 32 | 2 commits, `search_workspace` |

In every fixture, 99 of the 100 Enter keydowns took 8 ms or more in the trace.
The 30 typing keydowns stayed below 1 ms. Typing produced zero React commits.
No phase recorded a long task or a Long Animation Frame.

## Headed run

The headed run used the attached 3840 x 2160 display at 144 Hz, where Chrome
measured an estimated frame of 6.9 to 7.0 ms. The 120 Hz budget is measurable
there and failed.

| Fixture | Selection dispatch P95 / max | Keydown max | Dropped switch frames | Switch misses 60 / 120 Hz | Typing misses 60 / 120 Hz |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 / 50 | 15.10 / 23.50 ms | 28.53 ms | 64 | 1 / 52 | 0 / 1 |
| 5,000 / 500 | 19.70 / 27.60 ms | 23.14 ms | 55 | 1 / 29 | 0 / 0 |
| 5,000 / 2,000 | 14.50 / 21.40 ms | 26.45 ms | 62 | 1 / 51 | 0 / 0 |

`hundredSwitchesDroppedNoFrames` counts gaps above 1.5 estimated frames, so at
144 Hz it fails on gaps above about 10.4 ms. Keystroke to paint, cached editor
swap and reference suggestions passed in every headed fixture. The navigation
tail was 1 commit and one `search_workspace` call per fixture.

## Failed budgets

Headless:

- `coldEditorRevisit` in all three fixtures
- `selectionDispatch` in all three fixtures
- `navigationMainThreadTask` in all three fixtures

Headed, in addition to the three above:

- `hundredSwitchesDroppedNoFrames` in all three fixtures
- `hundredSwitchesNoFrameMissAt120Hz` in all three fixtures

Raw evidence:

- `docs/benchmarks/raw/2026-10-17-release-baseline.json`
- `docs/benchmarks/raw/2026-10-17-release-baseline-headed.json`
