# Product bounded-editor fallback

Date: 2026-07-22

## Result

The product editor now keeps the whole-document path through 192 top-level blocks and activates a 192-block canonical window above that threshold. This is the conservative measured boundary between C1's passing 50-block fixture and failing 500-block fixture.

The production runner confirmed that both large fixtures retain one editor host and one ProseMirror view, render exactly 192 top-level editor blocks, perform no navigation bridge calls or resource loads, and cause no React commits while typing.

| Fixture | Selection dispatch P95 | Editor install P95 / max | Keystroke-to-paint P95 / max | Editor blocks | Selection / keyboard dropped gaps |
| --- | ---: | ---: | ---: | ---: | ---: |
| wide-1000 / 50 blocks | 4.4 ms | 1.5 / 1.6 ms | 7.0 / 7.8 ms | 50 | 0 / 0 |
| wide-5000 / 500 blocks | 10.1 ms | 3.3 / 4.9 ms | 6.8 / 7.0 ms | 192 | 2 / 2 |
| wide-5000 / 2,000 blocks | 10.9 ms | 3.7 / 4.5 ms | 6.9 / 7.0 ms | 192 | 32 / 22 |

The bounded editor meets the cached editor-install and keystroke budgets at 2,000 blocks. Integrated selection dispatch remains above 8 ms and frame-gap counts remain non-zero with the product's unbounded 5,000-row sidebar: both 500- and 2,000-block runs still mount 5,000 tree items and 25,309 total elements. N4 owns the bounded product tree integration, and C3 owns the resulting fixed-runner end-to-end sign-off.

## Correctness

The bounded path preserves structured top-level ProseMirror nodes in one canonical document while recycling the active window. Window edits splice only the changed canonical range. Undo history retains changed ranges rather than document snapshots, groups edits within 500 milliseconds, caps at 200 entries, and survives window movement.

Search and replace run against the full canonical editor state. Match navigation reveals an off-window block before installing its local projection, and replacements reconcile back into the canonical document. Whole-note select-all and copy emit the full canonical plain-text and HTML representations. Replacing a whole-note selection replaces the canonical document rather than only the visible window.

Scroll and arrow-key movement use overlapping windows. Selection, focus, per-note scroll position, and external document replacement are restored without remounting the editor. Window movement is deferred during IME composition and applied after composition ends. A focusable screen-reader-only full-note text surface materializes the canonical text only when requested, keeping navigation free from large accessibility-tree writes.

## Method

Command:

```bash
node app/performance/run.mjs --output docs/benchmarks/raw/2026-07-22-product-renderer-c2.json
```

The runner built the production profiling entry and used fresh Google Chrome contexts with trusted keyboard input. Raw samples, fixture digests, correctness assertions, revision, and machine metadata are committed in `docs/benchmarks/raw/2026-07-22-product-renderer-c2.json`.

A separate browser pass loaded the performance application, found one ProseMirror view, confirmed meaningful content with no Vite overlay or recorded console errors, and found no page-level horizontal overflow.

## Limitations

The measurements come from the named Linux development machine rather than a dedicated fixed runner. Timing values are evidence, not shared-CI gates. The final release claim still requires C3 after N2, N3, and N4 are integrated. Clipboard contents and platform IME behavior require the C3 native end-to-end matrix even though their canonical state transitions are implemented here.
