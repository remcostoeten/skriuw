# Editor working-set production measurement

Date: 2026-08-02

Command:

```bash
node app/performance/run.mjs \
  --output /tmp/skriuw-v2-working-set-performance.json
```

The production renderer harness visited 100 distinct notes and revisited the
first evicted note. It observed the editor-state cache after every prune. No
production profiling hook is shipped; the harness instruments the cache class
only inside the dedicated performance build.

| Fixture | Maximum/final states | Evictions | Cold revisit dispatch | Bridge calls |
| --- | ---: | ---: | ---: | ---: |
| 1,000 notes / 50 blocks | 32 / 32 | 69 | 15.3 ms | 0 |
| 5,000 notes / 500 blocks | 32 / 32 | 69 | 30.5 ms | 0 |
| 5,000 notes / 2,000 blocks | 32 / 32 | 69 | 31.6 ms | 0 |

The bounded working-set invariant passes: 100 distinct visits never retained
more than 32 clean editor states and navigation performed no bridge calls.
Cached editor installation also remained inside its 8 ms P95 and 16.67 ms
maximum budgets in all three fixtures (P95 1.9, 4.3, and 3.3 ms; maximum 2.5,
4.9, and 5.0 ms).

Cold revisits do not yet meet the 8 ms main-thread navigation budget. The
current cold path reconstructs ProseMirror state synchronously from the
in-memory workspace document, with larger bounded documents taking about
30 ms on this host. This is now a separately reported failed budget in the
performance result instead of being hidden by an unbounded cache. Moving
document parsing/state preparation out of navigation remains required.

This run also reported dropped-frame noise in the 500- and 2,000-block
keyboard phases (10 and 6 frames respectively), while all 100 keyboard
selections completed and cached editor installation stayed within budget. A
repeat on the reference performance host is required before treating those
frame counts as a regression.

## Prepared-document follow-up

The renderer now prepares immutable ProseMirror documents once during initial
hydration and shares them across visible editors. The 32-entry LRU still owns
the heavier plugin/editor states. Optimistic editor saves stage their already
parsed node before publishing JSON, so the prepared projection stays current
without reparsing the edit. Bounded full-document search state is also created
only when search opens instead of on every cold editor-state reconstruction.

Four production runs used the same Linux 7.1.2 / Intel i7-10700F / 24 GiB host.
The final run recorded these startup and navigation values:

| Fixture | Startup render | Heap delta | Prepared docs / blocks | Cold revisit | Selection P95 | Dropped frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 / 50 | 142–251 ms across repeats | 6.2 MiB | 1,000 / 1,392 | 20.5 ms | 20.6 ms | 1 |
| 5,000 / 500 | 196–279 ms across repeats | 15.2 MiB | 5,000 / 8,992 | 47.1 ms | 58.6 ms | 96 |
| 5,000 / 2,000 | 211–268 ms across repeats | 18.8 MiB | 5,000 / 20,992 | 42.7 ms | 57.8 ms | 97 |

Correctness passed in every repeat: no more than 32 clean editor states, 69
evictions, zero navigation bridge calls, zero new resources, and no editor
remount. Cached `EditorView.updateState` remained within its isolated budget
(final-run P95 2.2, 5.5, and 5.7 ms; max 3.5, 5.9, and 6.2 ms).

The overall navigation budget does **not** pass. Repeated large-fixture results
reported 69–104 dropped frames, so the earlier 10/6 observation cannot be
classified as one-off noise on this host. Correctness and isolated editor
installation remain separate from the failed selection/cold-revisit verdict.
No budget is relaxed. Raw repeat outputs remain local scratch evidence at
`/tmp/skriuw-v2-performance-prepared-documents-{1,2,3}.json` and
`/tmp/skriuw-v2-performance-precomputed-raw-mode.json`; they are not repository
artifacts or a dedicated-runner release sign-off.
