# Product renderer baseline

Date: 2026-07-22

## Result

The real product renderer meets the current interaction budgets at 50 blocks. The whole-document path crosses the measured fallback boundary by 500 blocks and fails decisively at 2,000 blocks. C2 must therefore retain the whole-document path for short notes and activate the validated bounded editor before the 500-block case.

| Fixture | Selection dispatch P95 / max | Editor install P95 / max | Keystroke to next-paint P95 / max | Dropped gaps in 100 switches | Long tasks / LoAF |
| --- | ---: | ---: | ---: | ---: | ---: |
| wide-1000, 50 blocks | 3.8 / 4.6 ms | 2.0 / 2.4 ms | 7.1 / 7.1 ms | 0 | 0 / 0 |
| wide-5000, 500 blocks | 15.0 / 16.4 ms | 9.0 / 9.8 ms | 7.8 / 8.0 ms | 2 | 0 / 0 |
| wide-5000, 2,000 blocks | 56.2 / 63.1 ms | 44.3 / 55.8 ms | 7.2 / 7.7 ms | 102 | 5 / 95 |

The 50-block context passes cached swap, selection dispatch, keystroke-to-next-paint, and zero-dropped-switch budgets. The 500-block context is the first required fixture that fails cached swap and selection dispatch. The 2,000-block context spends most navigation time installing the whole document and produces sustained long-frame evidence.

All three contexts completed exact trusted-input counts, retained one editor host and one ProseMirror view, loaded no navigation resources, and issued zero navigation bridge commands. Editor typing produced zero React commits. The browser reported no console or page errors. React Scan remains uninstalled.

## Runner

Run the complete production fixture and write raw evidence with:

```bash
node app/performance/run.mjs --output .build/product-renderer/latest.json
```

The command generates the canonical Rust tree projections, type-checks the harness, builds a production profiling renderer, starts an isolated preview, and launches a fresh headless Chrome profile for each context. Correctness failures exit nonzero. Timing results are recorded but do not gate shared CI.

The harness renders the actual `App`, external renderer store, sidebar, metadata panel, and persistent product ProseMirror editor. Only the performance entry aliases the Tauri bridge/window and React DOM profiling exports; the ordinary product entry contains no profiling instrumentation. The bridge replacement records every command and returns a deterministic acknowledgement if a non-navigation action intentionally submits work.

Eight deterministic measured notes are prepared before timing. One hundred direct cached selections record store dispatch, editor installation, the next frame boundary, frame gaps, React commits, long tasks, and Long Animation Frames. A second scenario drives 100 trusted Enter selections through the real sidebar keyboard handler. Thirty trusted editor keystrokes record the next paint opportunity and prove editor-owned typing produces no React commit. Chrome tracing independently records keydown and input event-dispatch work.

Input is aligned to a known animation frame and dispatched nine milliseconds later. The next `requestAnimationFrame` is treated as the next-paint opportunity; it remains a browser presentation boundary rather than proof of physical display scan-out. C3 still owns fixed-runner and release-platform sign-off.

## Environment and evidence

- Revision: `57dfb4d815a13ad764a8137ed40afd92745f9bb4`
- Browser: Google Chrome Stable, fresh profile per context
- Operating system: Linux 7.1.2-arch3-1, x86_64
- Processor: Intel Core i7-10700F, 16 logical CPUs
- Memory: 25,106,788,352 bytes
- Node: v24.15.0
- Raw samples: [`raw/2026-07-22-product-renderer-c1.json`](raw/2026-07-22-product-renderer-c1.json)

The raw file includes P50, P95, P99, maximum, every timing sample, dropped-frame counts, long tasks, Long Animation Frames, React commit durations/counts, host mounts, DOM counts, bridge calls, fixture names and operation digests, revision, browser version, and machine metadata.

## Follow-through

The product sidebar currently mounts all 1,000 or 5,000 tree items, producing 5,164 and 25,614 total elements before the 500-block editor is installed. The isolated tree spike's bounded row pool has not entered the product sidebar. This is now explicit product evidence: N4 or C3 must restore the 5,000-node tree bound before final sign-off.

Ordinary note activation is now renderer-only, which closes the measured navigation IPC violation. The previous implementation used that command to persist the active note, so restart continuity must move to a shutdown or other explicitly non-navigation lifecycle boundary. It may not be reintroduced as per-selection IPC.

The measured editor crossover is between the passing 50-block fixture and the failing 500-block fixture. C2 should choose a conservative activation threshold inside that interval and rerun this same product suite after the bounded path is wired. The 500- and 2,000-block timing failures are evidence, not suppressed runner failures.
